// The standard report catalog and the helpers the Reports pages need around it.
//
// catalog.json is generated from the installed ERPNext's own report scripts by
// scripts/generate-report-catalog.mjs (re-run it after an ERPNext upgrade).
// Session-dependent filter defaults are stored there as tokens — `@today`,
// `@today|m-1` (a month earlier), `@company`, `@fiscal_year`, ... — and resolved
// here against custom_erp.api.reports.report_context.
import { useEffect, useState } from 'react';
import { frappe } from '@/lib/frappe';
import catalog from './catalog.json';

export type SelectOption = string | { value: string; label: string };

export interface ReportFilter {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string | SelectOption[];
  default?: string | number;
  reqd?: number;
  hidden?: number;
  depends_on?: string;
}

export interface ReportDef {
  name: string;
  slug: string;
  section: string;
  module: string;
  ref_doctype: string;
  report_type: string;
  add_total_row: number;
  filters: ReportFilter[];
}

export const REPORTS = catalog as ReportDef[];

/** Sections in display order (each maps to a tenant module). */
export const SECTIONS = [
  'Accounting', 'Selling', 'CRM', 'Buying', 'Stock', 'Point of Sale',
  'Manufacturing', 'Projects', 'Assets', 'Quality', 'Support',
] as const;

export function findReport(slug: string): ReportDef | undefined {
  return REPORTS.find((r) => r.slug === slug);
}

// ── Session context ───────────────────────────────────────────────

export interface ReportContext {
  today: string;
  company: string;
  currency: string;
  company_bank_account: string;
  fiscal_year: string;
  year_start: string;
  year_end: string;
  permitted: string[];
}

let contextPromise: Promise<ReportContext> | null = null;

export function loadReportContext(): Promise<ReportContext> {
  if (!contextPromise) {
    contextPromise = frappe.call('custom_erp.api.reports.report_context').catch((e) => {
      contextPromise = null;
      throw e;
    });
  }
  return contextPromise as Promise<ReportContext>;
}

export function useReportContext() {
  const [ctx, setCtx] = useState<ReportContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadReportContext().then(setCtx, (e) => setError(e?.message || 'Could not load report settings'));
  }, []);
  return { ctx, error };
}

// ── Defaults ──────────────────────────────────────────────────────

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addMonths(d: Date, n: number): Date {
  const day = d.getDate();
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, last));
  return out;
}

/** A catalog default with its token (if any) resolved for this session. */
export function resolveDefault(value: string | number | undefined, ctx: ReportContext): string | number | undefined {
  if (typeof value !== 'string' || !value.startsWith('@')) return value;
  const [base, ...shifts] = value.slice(1).split('|');
  const dateBases: Record<string, () => Date> = {
    today: () => parseDate(ctx.today),
    now: () => parseDate(ctx.today),
    month_start: () => { const t = parseDate(ctx.today); return new Date(t.getFullYear(), t.getMonth(), 1); },
    month_end: () => { const t = parseDate(ctx.today); return new Date(t.getFullYear(), t.getMonth() + 1, 0); },
    year_start: () => parseDate(ctx.year_start || ctx.today),
    year_end: () => parseDate(ctx.year_end || ctx.today),
  };
  if (dateBases[base]) {
    let d = dateBases[base]();
    for (const s of shifts) {
      const n = Number(s.slice(1));
      if (s[0] === 'm') d = addMonths(d, n);
      else d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    }
    return base === 'now' ? `${iso(d)} 00:00:00` : iso(d);
  }
  const v = (ctx as unknown as Record<string, unknown>)[base];
  return typeof v === 'string' ? v : '';
}

export type FilterValues = Record<string, unknown>;

export function initialFilterValues(report: ReportDef, ctx: ReportContext): FilterValues {
  const values: FilterValues = {};
  for (const f of report.filters) {
    const v = resolveDefault(f.default, ctx);
    if (f.fieldtype === 'MultiSelectList') values[f.fieldname] = v ? [v] : [];
    else if (f.fieldtype === 'Check') values[f.fieldname] = v ? 1 : 0;
    else if (v !== undefined && v !== '') values[f.fieldname] = v;
  }
  return values;
}

/** Report `depends_on`: `eval:doc.x == 'y'`, `!=`, `doc.x`, `!doc.x`, or a bare fieldname. */
export function filterActive(f: ReportFilter, values: FilterValues): boolean {
  const dep = (f.depends_on || '').trim();
  if (!dep) return true;
  const expr = dep.startsWith('eval:') ? dep.slice(5).trim() : `doc.${dep}`;
  const m = expr.match(/^(!?)doc\.(\w+)\s*(?:(==|!=)\s*['"](.*)['"])?$/);
  if (!m) return true;
  const [, neg, field, op, lit] = m;
  const val = values[field];
  if (op === '==') return String(val ?? '') === lit;
  if (op === '!=') return String(val ?? '') !== lit;
  const truthy = Array.isArray(val) ? val.length > 0 : !!val;
  return neg ? !truthy : truthy;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Required, visible filters that still have no value. */
export function missingRequired(report: ReportDef, values: FilterValues): ReportFilter[] {
  return report.filters.filter(
    (f) => f.reqd && !f.hidden && f.fieldtype !== 'Check' && filterActive(f, values) && isEmpty(values[f.fieldname]),
  );
}

/** The filters dict sent to the backend: only active, non-empty values. */
export function filtersForRun(report: ReportDef, values: FilterValues): FilterValues {
  const out: FilterValues = {};
  for (const f of report.filters) {
    const v = values[f.fieldname];
    if (!isEmpty(v) && filterActive(f, values)) out[f.fieldname] = v;
  }
  return out;
}

export function selectOptions(f: ReportFilter): { value: string; label: string }[] {
  const raw = Array.isArray(f.options) ? f.options : [];
  return raw
    .map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
    .filter((o) => o.value !== '');
}

// ── Results ───────────────────────────────────────────────────────

export interface ReportColumn {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string;
  width?: number;
}

/** Frappe columns come as dicts (Script Reports) or "Label:Type/Options:width" strings (Query Reports). */
export function normalizeColumns(cols: unknown[]): ReportColumn[] {
  return (cols || []).map((c, i) => {
    if (typeof c === 'string') {
      const [label, type = 'Data', width] = c.split(':');
      const [fieldtype, options] = type.split('/');
      return { fieldname: String(i), label, fieldtype: fieldtype || 'Data', options, width: Number(width) || undefined };
    }
    const d = c as Record<string, unknown>;
    return {
      fieldname: String(d.fieldname ?? d.id ?? i),
      label: String(d.label ?? d.fieldname ?? ''),
      fieldtype: String(d.fieldtype || 'Data'),
      options: d.options ? String(d.options) : undefined,
      width: Number(d.width) || undefined,
    };
  });
}

/** Rows as dicts keyed by column fieldname (Query Reports return arrays). */
export function normalizeRows(rows: unknown[], columns: ReportColumn[]): Record<string, unknown>[] {
  return (rows || []).map((r) => {
    if (Array.isArray(r)) {
      const out: Record<string, unknown> = {};
      columns.forEach((c, i) => { out[c.fieldname] = r[i]; });
      return out;
    }
    return (r || {}) as Record<string, unknown>;
  });
}

export const NUMERIC_TYPES = new Set(['Currency', 'Float', 'Int', 'Percent']);

export function formatCell(value: unknown, col: ReportColumn, row: Record<string, unknown>, fallbackCurrency: string): string {
  if (value === null || value === undefined || value === '') return '';
  switch (col.fieldtype) {
    case 'Currency': {
      const n = Number(value);
      if (Number.isNaN(n)) return String(value);
      const rowCcy = col.options && typeof row[col.options] === 'string' ? (row[col.options] as string) : '';
      const ccy = /^[A-Z]{3}$/.test(rowCcy) ? rowCcy : /^[A-Z]{3}$/.test(col.options || '') ? col.options! : fallbackCurrency;
      try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy || 'USD' }).format(n);
      } catch {
        return n.toFixed(2);
      }
    }
    case 'Float':
      return Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 });
    case 'Percent':
      return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
    case 'Int':
      return Number(value).toLocaleString('en-US');
    case 'Date': {
      const s = String(value);
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
      return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(parseDate(s));
    }
    case 'Check':
      return Number(value) ? 'Yes' : 'No';
    default:
      return String(value).replace(/<[^>]*>/g, '');
  }
}

/** The doctype a Link / Dynamic Link cell points at, if any. */
export function linkTarget(col: ReportColumn, row: Record<string, unknown>): string | null {
  if (col.fieldtype === 'Link' && col.options) return col.options;
  if (col.fieldtype === 'Dynamic Link' && col.options && typeof row[col.options] === 'string') return row[col.options] as string;
  return null;
}

// ── Drill-down ────────────────────────────────────────────────────

export interface Drill { label: string; slug: string; filters: FilterValues }

type DrillRule = { label: string; report: string; filters: (value: string) => FilterValues };

// For a value of a given doctype in a report cell: the reports that break it down,
// as Desk's own drill-downs do (account -> General Ledger, item -> Stock Ledger, ...).
const DRILL_RULES: Record<string, DrillRule[]> = {
  Account: [{ label: 'General Ledger', report: 'General Ledger', filters: (v) => ({ account: [v] }) }],
  Customer: [
    { label: 'General Ledger', report: 'General Ledger', filters: (v) => ({ party_type: 'Customer', party: [v] }) },
    { label: 'Accounts Receivable', report: 'Accounts Receivable', filters: (v) => ({ customer: v }) },
    { label: 'Sales Register', report: 'Sales Register', filters: (v) => ({ customer: v }) },
  ],
  Supplier: [
    { label: 'General Ledger', report: 'General Ledger', filters: (v) => ({ party_type: 'Supplier', party: [v] }) },
    { label: 'Accounts Payable', report: 'Accounts Payable', filters: (v) => ({ supplier: v }) },
    { label: 'Purchase Register', report: 'Purchase Register', filters: (v) => ({ supplier: v }) },
  ],
  Item: [
    { label: 'Stock Ledger', report: 'Stock Ledger', filters: (v) => ({ item_code: v }) },
    { label: 'Stock Balance', report: 'Stock Balance', filters: (v) => ({ item_code: v }) },
    { label: 'Item-wise Purchase Register', report: 'Item-wise Purchase Register', filters: (v) => ({ item_code: v }) },
  ],
  Warehouse: [
    { label: 'Stock Balance', report: 'Stock Balance', filters: (v) => ({ warehouse: v }) },
    { label: 'Stock Ledger', report: 'Stock Ledger', filters: (v) => ({ warehouse: v }) },
  ],
  'Cost Center': [{ label: 'General Ledger', report: 'General Ledger', filters: (v) => ({ cost_center: [v] }) }],
  Project: [{ label: 'General Ledger', report: 'General Ledger', filters: (v) => ({ project: [v] }) }],
};

/** Drill-downs for `value` (a `doctype` record), carrying over the company and date range. */
export function drillsFor(doctype: string, value: string, current: FilterValues, ctx: ReportContext | null): Drill[] {
  const from = current.from_date || current.period_start_date || ctx?.year_start;
  const to = current.to_date || current.period_end_date || current.report_date || ctx?.today;
  const company = current.company || ctx?.company;
  return (DRILL_RULES[doctype] || []).flatMap((rule) => {
    const target = REPORTS.find((r) => r.name === rule.report);
    if (!target) return [];
    const names = new Set(target.filters.map((f) => f.fieldname));
    const wanted: FilterValues = { company, from_date: from, to_date: to, report_date: to, ...rule.filters(value) };
    const filters = Object.fromEntries(Object.entries(wanted).filter(([k, v]) => names.has(k) && v !== undefined && v !== ''));
    return [{ label: rule.label, slug: target.slug, filters }];
  });
}

export function reportHref(slug: string, filters?: FilterValues): string {
  return `/reports/${slug}${filters && Object.keys(filters).length ? `?filters=${encodeURIComponent(JSON.stringify(filters))}` : ''}`;
}
