import type { RenderField, RenderSchema } from '@/types/meta';

// ── AI Agent deterministic core (Phase 0) ───────────────────────
// Produces SUGGESTIONS only — nothing here writes. The UI reviews and
// the user approves before anything is saved. An optional LLM layer
// (server-side) can enrich these results later; this core guarantees the
// baseline behavior with no external dependency.

export type FieldSource = 'default' | 'generated' | 'inferred' | 'company';

export interface MasterSuggestion {
  fieldname: string;
  label: string;
  value: unknown;
  source: FieldSource;
}
export interface MasterPlan {
  suggestions: MasterSuggestion[]; // fields the agent can auto-fill
  missing: { fieldname: string; label: string }[]; // mandatory gaps the user must answer
  summary: { label: string; value: string }[]; // review summary of the resulting record
}

export type Severity = 'Block' | 'Warn' | 'Info';
export interface TxnIssue {
  field: string;
  label: string;
  severity: Severity;
  message: string;
  current?: unknown;
  suggested?: unknown;
  fixable: boolean;
  ruleId: string;
}

export interface AiContext {
  company?: string | null;
  currency?: string | null;
  country?: string | null;
}

const flat = (schema: RenderSchema): RenderField[] =>
  schema.tabs.flatMap((t) => t.sections.flatMap((s) => s.columns.flatMap((c) => c.fields)));

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

// Auto-generate a system code, e.g. "CUST-2026-00042".
export function generateCode(prefix: string, seq = 1): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
}

/**
 * Master Auto-Fill plan: infer company-aware defaults, flag mandatory
 * gaps, and build a review summary — all as suggestions.
 */
export function planMaster(schema: RenderSchema, doc: Record<string, unknown>, ctx: AiContext): MasterPlan {
  const fields = flat(schema);
  const has = (fn: string) => fields.some((f) => f.fieldname === fn);
  const suggestions: MasterSuggestion[] = [];

  const propose = (fieldname: string, value: unknown, source: FieldSource) => {
    if (!has(fieldname) || !isEmpty(doc[fieldname]) || isEmpty(value)) return;
    const f = fields.find((x) => x.fieldname === fieldname)!;
    suggestions.push({ fieldname, label: f.label, value, source });
  };

  // Company-aware inferences.
  propose('company', ctx.company, 'company');
  propose('currency', ctx.currency, 'company');
  propose('default_currency', ctx.currency, 'company');
  if (ctx.country) {
    propose('territory', ctx.country, 'inferred');
    propose('country', ctx.country, 'inferred');
  }
  // Metadata defaults for still-empty fields.
  for (const f of fields) {
    if (!isEmpty(f.default) && isEmpty(doc[f.fieldname]) && !suggestions.some((s) => s.fieldname === f.fieldname)) {
      suggestions.push({ fieldname: f.fieldname, label: f.label, value: f.default, source: 'default' });
    }
  }

  // Mandatory gaps that remain unfilled and unsuggested → guided questions.
  const missing = fields
    .filter(
      (f) =>
        f.reqd &&
        f.component !== 'child_table' &&
        isEmpty(doc[f.fieldname]) &&
        !suggestions.some((s) => s.fieldname === f.fieldname)
    )
    .map((f) => ({ fieldname: f.fieldname, label: f.label }));

  // Review summary = resulting record (current + suggested).
  const merged: Record<string, unknown> = { ...doc };
  suggestions.forEach((s) => (merged[s.fieldname] = s.value));
  const summary = fields
    .filter((f) => f.component !== 'child_table' && !isEmpty(merged[f.fieldname]))
    .slice(0, 24)
    .map((f) => ({ label: f.label, value: String(merged[f.fieldname]) }));

  return { suggestions, missing, summary };
}

/**
 * Transaction Validation: deterministic checks over a draft document.
 * Returns issues with explanations and (where safe) suggested fixes.
 */
export function reviewTransaction(schema: RenderSchema, doc: Record<string, unknown>, ctx: AiContext): TxnIssue[] {
  const fields = flat(schema);
  const issues: TxnIssue[] = [];

  // 1. Missing mandatory fields.
  for (const f of fields) {
    if (f.reqd && f.component !== 'child_table' && isEmpty(doc[f.fieldname])) {
      issues.push({
        field: f.fieldname,
        label: f.label,
        severity: 'Block',
        message: `“${f.label}” is required but empty.`,
        current: doc[f.fieldname],
        fixable: false,
        ruleId: 'mandatory',
      });
    }
  }

  // 2. Item row arithmetic: amount should equal qty × rate.
  const itemsField = fields.find((f) => f.component === 'child_table' && /items?$/i.test(f.fieldname));
  if (itemsField) {
    const rows = (doc[itemsField.fieldname] as Record<string, unknown>[]) || [];
    let netFromRows = 0;
    rows.forEach((row, i) => {
      const qty = Number(row.qty);
      const rate = Number(row.rate);
      const amount = Number(row.amount);
      if (!isNaN(qty) && !isNaN(rate)) {
        const expected = +(qty * rate).toFixed(2);
        netFromRows += expected;
        if (!isNaN(amount) && Math.abs(amount - expected) > 0.01) {
          issues.push({
            field: `${itemsField.fieldname}[${i}].amount`,
            label: `Row ${i + 1} amount`,
            severity: 'Warn',
            message: `Row ${i + 1}: amount ${amount} ≠ qty × rate (${expected}).`,
            current: amount,
            suggested: expected,
            fixable: false,
            ruleId: 'row-amount',
          });
        }
      }
    });
    // 3. Net total consistency (excludes tax; use 'total' / 'net_total' if present).
    for (const tf of ['net_total', 'total']) {
      if (fields.some((f) => f.fieldname === tf) && !isEmpty(doc[tf])) {
        const t = Number(doc[tf]);
        if (!isNaN(t) && netFromRows > 0 && Math.abs(t - netFromRows) > 0.01) {
          issues.push({
            field: tf,
            label: tf,
            severity: 'Warn',
            message: `${tf} (${t}) doesn't match the sum of item amounts (${netFromRows.toFixed(2)}).`,
            current: t,
            suggested: +netFromRows.toFixed(2),
            fixable: true,
            ruleId: 'net-total',
          });
          break;
        }
      }
    }
  }

  // 3b. Item rows: non-positive quantities.
  if (itemsField) {
    const rows = (doc[itemsField.fieldname] as Record<string, unknown>[]) || [];
    rows.forEach((row, i) => {
      const qty = Number(row.qty);
      if (row.qty !== undefined && row.qty !== '' && (isNaN(qty) || qty <= 0)) {
        issues.push({
          field: `${itemsField.fieldname}[${i}].qty`,
          label: `Row ${i + 1} qty`,
          severity: 'Block',
          message: `Row ${i + 1}: quantity must be greater than zero.`,
          current: row.qty,
          fixable: false,
          ruleId: 'qty-positive',
        });
      }
    });
  }

  // 3c. Date order: delivery/schedule date should not precede the doc date.
  const baseDate = (doc.transaction_date || doc.posting_date) as string | undefined;
  for (const df of ['delivery_date', 'schedule_date', 'due_date']) {
    const d = doc[df] as string | undefined;
    if (baseDate && d && d < baseDate) {
      issues.push({
        field: df,
        label: df,
        severity: 'Warn',
        message: `${df} (${d}) is before the document date (${baseDate}).`,
        current: d,
        suggested: baseDate,
        fixable: true,
        ruleId: 'date-order',
      });
    }
  }

  // 4. Currency / exchange-rate sanity.
  if (fields.some((f) => f.fieldname === 'currency') && ctx.currency) {
    const cur = doc.currency as string | undefined;
    const rate = Number(doc.conversion_rate);
    if (cur && cur !== ctx.currency && (isEmpty(doc.conversion_rate) || rate === 1)) {
      issues.push({
        field: 'conversion_rate',
        label: 'Exchange Rate',
        severity: 'Warn',
        message: `Transaction currency ${cur} differs from company ${ctx.currency}, but the exchange rate is ${rate || 'empty'}. Verify the rate.`,
        current: doc.conversion_rate,
        fixable: false,
        ruleId: 'fx-rate',
      });
    }
  }

  return issues;
}
