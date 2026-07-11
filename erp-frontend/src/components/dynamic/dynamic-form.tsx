'use client';

import { useEffect, useMemo, useState } from 'react';
import { frappe } from '@/lib/frappe';
import { evalDepends } from '@/lib/eval-depends';
import { resolvePermissions } from '@/lib/meta-compiler';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { useAuthStore } from '@/store/auth-store';
import { useCompanyDefaults } from '@/hooks/use-company-defaults';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkField } from './link-field';
import { ChildTable } from './child-table';
import { WorkflowBar } from './workflow-bar';
import { SetupGuard } from '@/components/setup/setup-guard';
import { AiAssistant } from '@/components/ai/ai-assistant';
import { getAiSettings } from '@/lib/ai/settings';
import { Sparkles } from 'lucide-react';
import type { RenderField, WorkflowDef } from '@/types/meta';

type DocModel = Record<string, unknown>;

interface DynamicFormProps {
  doctype: string;
  name?: string; // when set, edit an existing document
  initial?: DocModel;
  onSaved?: (name: string) => void;
}

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function DynamicForm({ doctype, name, initial, onSaved }: DynamicFormProps) {
  const { schema, loading, error } = useDocTypeSchema(doctype);
  const { user } = useAuthStore();
  const { company, currency: companyCurrency, country } = useCompanyDefaults();
  const [aiOpen, setAiOpen] = useState(false);
  const aiSettings = getAiSettings();
  const [doc, setDoc] = useState<DocModel>(initial || {});
  const [activeTab, setActiveTab] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(!!name);
  const [workflow, setWorkflow] = useState<WorkflowDef | null>(null);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  // Effective permission matrix for the current user (§14). Fail closed.
  const perms = useMemo(
    () => resolvePermissions(schema?.permissions || [], user?.roles || []),
    [schema, user]
  );

  // Load the active workflow (if any) for this DocType (§15).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const wf = (await frappe.getWorkflow(doctype)) as WorkflowDef | null;
        if (active) setWorkflow(wf);
      } catch {
        /* no workflow → docstatus buttons */
      }
    })();
    return () => {
      active = false;
    };
  }, [doctype]);

  // Edit mode: load the existing document.
  useEffect(() => {
    if (!name) return;
    let active = true;
    setLoadingDoc(true);
    (async () => {
      try {
        const existing = await frappe.getDoc(doctype, name);
        if (active && existing) setDoc(existing);
      } catch {
        if (active) setFormError('Failed to load document.');
      } finally {
        if (active) setLoadingDoc(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [doctype, name]);

  const docstatus = Number(doc.docstatus ?? 0);
  const isNew = !name;

  const setField = (fname: string, value: unknown) => {
    setDoc((d) => ({ ...d, [fname]: value }));
    // When the transaction currency changes, refresh the exchange rate
    // against the company currency (fetched live by ERPNext).
    if (fname === 'currency' && companyCurrency) {
      if (!value || value === companyCurrency) {
        setDoc((d) => ({ ...d, conversion_rate: 1 }));
      } else {
        frappe.getExchangeRate(String(value), companyCurrency).then((rate) => {
          setDoc((d) => ({ ...d, conversion_rate: rate }));
        });
      }
    }
  };

  const isVisible = (f: RenderField) => evalDepends(f.dependsOn, doc, true);
  // Submitted (1) or cancelled (2) documents lock all fields.
  const isReadOnly = (f: RenderField) =>
    docstatus !== 0 || f.readOnly || evalDepends(f.readOnlyDependsOn, doc, false);
  const isRequired = (f: RenderField) =>
    f.reqd || evalDepends(f.mandatoryDependsOn, doc, false);

  const allFields = useMemo(() => {
    if (!schema) return [] as RenderField[];
    return schema.tabs.flatMap((t) => t.sections.flatMap((s) => s.columns.flatMap((c) => c.fields)));
  }, [schema]);

  // ── Smart defaults on a new document ────────────────────────────
  // Apply ERPNext field defaults + company-aware defaults (company,
  // currency, price list, order type, today's date, conversion rate).
  useEffect(() => {
    if (!isNew || !schema || defaultsApplied) return;
    const has = (fn: string) => allFields.some((f) => f.fieldname === fn);
    const today = new Date().toISOString().slice(0, 10);
    const d: DocModel = {};

    // 1. Field metadata defaults.
    for (const f of allFields) {
      if (f.default && f.default !== '') {
        d[f.fieldname] =
          /today|now/i.test(f.default) && (f.component === 'date' || f.component === 'datetime')
            ? today
            : f.default;
      }
    }
    // 2. Company-aware defaults.
    if (has('company') && company) d.company = company;
    if (has('currency') && companyCurrency) d.currency = companyCurrency;
    if (has('conversion_rate')) d.conversion_rate = 1;
    if (has('plc_conversion_rate')) d.plc_conversion_rate = 1;
    if (has('transaction_date')) d.transaction_date = today;
    if (has('posting_date')) d.posting_date = today;
    // Only default order_type to "Sales" when that is a valid option
    // (Purchase Order's order_type options differ).
    const orderTypeField = allFields.find((f) => f.fieldname === 'order_type');
    if (orderTypeField && (orderTypeField.options || '').split('\n').includes('Sales')) {
      d.order_type = 'Sales';
    }
    if (has('selling_price_list')) d.selling_price_list = 'Standard Selling';
    if (has('buying_price_list')) d.buying_price_list = 'Standard Buying';

    setDoc((prev) => ({ ...d, ...prev })); // never override user-entered values
    setDefaultsApplied(true);
  }, [isNew, schema, defaultsApplied, allFields, company, companyCurrency]);

  const validate = (): string | null => {
    for (const f of allFields) {
      if (!isVisible(f)) continue;
      if (!isRequired(f)) continue;
      const v = doc[f.fieldname];
      if (f.component === 'child_table') {
        if (!Array.isArray(v) || v.length === 0) return `Add at least one row to “${f.label}”.`;
      } else if (f.component === 'check') {
        if (!v) return `“${f.label}” must be checked.`;
      } else if (v === undefined || v === null || v === '') {
        return `“${f.label}” is required.`;
      }
    }
    return null;
  };

  const runAction = async (fn: () => Promise<{ name?: string } | unknown>) => {
    setFormError(null);
    setSubmitting(true);
    try {
      const res = (await fn()) as { name?: string } | undefined;
      onSaved?.(res?.name || name || '');
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { exception?: string } } })?.response?.data?.exception ||
        (e instanceof Error ? e.message : 'Action failed.');
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async (submitAfter: boolean) => {
    const err = validate();
    if (err) return setFormError(err);
    await runAction(async () => {
      const saved = isNew
        ? await frappe.createDoc(doctype, doc)
        : await frappe.updateDoc(doctype, name!, doc);
      if (submitAfter && saved?.name) await frappe.submitDoc(doctype, saved.name);
      return saved;
    });
  };

  const handleTransition = async (action: string) => {
    await runAction(() => frappe.applyWorkflow(doc, action));
  };

  const hasWorkflow = !!workflow && !isNew;

  if (loading || loadingDoc) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (error || !schema) {
    return <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">{error || 'No schema.'}</div>;
  }

  const renderControl = (f: RenderField) => {
    const readOnly = isReadOnly(f);
    const value = doc[f.fieldname];
    switch (f.component) {
      case 'link':
        return (
          <LinkField
            target={f.options || ''}
            value={(value as string) || ''}
            disabled={readOnly}
            onChange={(v) => setField(f.fieldname, v)}
          />
        );
      case 'select':
        return (
          <select
            className={selectClass}
            disabled={readOnly}
            value={(value as string) || ''}
            onChange={(e) => setField(f.fieldname, e.target.value)}
          >
            <option value="">Select…</option>
            {(f.options || '')
              .split('\n')
              .filter(Boolean)
              .map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
          </select>
        );
      case 'check':
        return (
          <label className="flex items-start gap-2 py-1">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0"
              disabled={readOnly}
              checked={!!value}
              onChange={(e) => setField(f.fieldname, e.target.checked ? 1 : 0)}
            />
            <span className="text-sm">
              <span className="font-medium">{f.label}</span>
              {f.description && (
                <span className="block text-xs text-muted-foreground">{f.description}</span>
              )}
            </span>
          </label>
        );
      case 'textarea':
        return (
          <textarea
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={readOnly}
            value={(value as string) || ''}
            onChange={(e) => setField(f.fieldname, e.target.value)}
          />
        );
      case 'child_table':
        return (
          <ChildTable
            childDoctype={f.options || ''}
            rows={(value as DocModel[]) || []}
            onChange={(rows) => setField(f.fieldname, rows)}
          />
        );
      case 'number':
      case 'currency':
      case 'percent':
        return (
          <Input
            type="number"
            disabled={readOnly}
            value={(value as number) ?? ''}
            onChange={(e) => setField(f.fieldname, e.target.value === '' ? '' : Number(e.target.value))}
          />
        );
      case 'date':
        return (
          <Input type="date" disabled={readOnly} value={(value as string) || ''} onChange={(e) => setField(f.fieldname, e.target.value)} />
        );
      case 'datetime':
        return (
          <Input type="datetime-local" disabled={readOnly} value={(value as string) || ''} onChange={(e) => setField(f.fieldname, e.target.value)} />
        );
      case 'time':
        return (
          <Input type="time" disabled={readOnly} value={(value as string) || ''} onChange={(e) => setField(f.fieldname, e.target.value)} />
        );
      case 'read_only':
        return <Input value={(value as string) || ''} disabled readOnly />;
      case 'unsupported':
        return (
          <Input
            value={(value as string) || ''}
            disabled={readOnly}
            placeholder={`(${f.fieldtype})`}
            onChange={(e) => setField(f.fieldname, e.target.value)}
          />
        );
      default:
        return (
          <Input
            disabled={readOnly}
            value={(value as string) || ''}
            onChange={(e) => setField(f.fieldname, e.target.value)}
          />
        );
    }
  };

  const tab = schema.tabs[activeTab] || schema.tabs[0];

  return (
    <div className="space-y-6">
      {isNew && <SetupGuard doctype={doctype} />}

      {aiSettings.enabled && ((isNew && aiSettings.masterAgent) || (!isNew && aiSettings.txnAgent)) && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" type="button" onClick={() => setAiOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4 text-primary" />
            AI Assist
          </Button>
        </div>
      )}

      {aiOpen && (
        <AiAssistant
          doctype={doctype}
          schema={schema}
          doc={doc}
          isNew={isNew}
          ctx={{ company, currency: companyCurrency, country }}
          onApply={(fields) => setDoc((d) => ({ ...d, ...fields }))}
          onSaveRequested={() => handleSave(false)}
          onClose={() => setAiOpen(false)}
        />
      )}

      {formError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>
      )}

      {schema.tabs.length > 1 && (
        <div className="flex gap-1 border-b">
          {schema.tabs.map((t, i) => (
            <button
              key={t.label + i}
              type="button"
              onClick={() => setActiveTab(i)}
              className={`-mb-px px-4 py-2 text-sm font-medium transition-colors ${
                i === activeTab
                  ? 'border-b-2 border-primary text-primary'
                  : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab.sections.map((section, si) => {
        const singleColumn = section.columns.length === 1;
        return (
          <Card key={si}>
            {section.label && (
              <CardHeader className="pb-4">
                <CardTitle className="text-base">{section.label}</CardTitle>
              </CardHeader>
            )}
            <CardContent className={section.label ? '' : 'pt-6'}>
              <div
                className="grid gap-x-6 gap-y-5"
                style={{ gridTemplateColumns: `repeat(${section.columns.length}, minmax(0, 1fr))` }}
              >
                {section.columns.map((col, ci) => (
                  <div key={ci} className="space-y-5">
                    {col.fields.map((f) => {
                      if (!isVisible(f)) return null;
                      const wide = f.component === 'child_table' || f.component === 'textarea';
                      // In a single-column section, cap plain inputs so they don't stretch
                      // awkwardly across the whole card; wide controls still fill the row.
                      const constrain = singleColumn && !wide && f.component !== 'check';
                      return (
                        <div
                          key={f.fieldname}
                          className={`space-y-1.5 ${constrain ? 'max-w-md' : ''}`}
                        >
                          {f.component !== 'check' && (
                            <label className="flex items-center gap-1 text-sm font-medium text-foreground">
                              {f.label}
                              {isRequired(f) && <span className="text-destructive">*</span>}
                            </label>
                          )}
                          {renderControl(f)}
                          {f.component !== 'check' && f.description && (
                            <p className="text-xs text-muted-foreground">{f.description}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Workflow state tracker + role-filtered transition buttons (§15) */}
      {hasWorkflow && (
        <WorkflowBar
          workflow={workflow!}
          currentState={String(doc[workflow!.workflow_state_field] || '')}
          roles={user?.roles || []}
          doc={doc}
          disabled={submitting}
          onTransition={handleTransition}
        />
      )}

      <div className="flex items-center justify-end gap-3">
        {docstatus === 1 && (
          <span className="mr-auto inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
            Submitted
          </span>
        )}
        {docstatus === 2 && (
          <span className="mr-auto inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
            Cancelled
          </span>
        )}

        {docstatus === 0 && (perms.write || (isNew && perms.create)) && (
          <>
            <Button variant="outline" type="button" disabled={submitting} onClick={() => handleSave(false)}>
              {submitting ? 'Saving…' : isNew ? 'Save as Draft' : 'Save'}
            </Button>
            {/* When a workflow governs the doc, submission happens via transitions. */}
            {schema.isSubmittable && !hasWorkflow && perms.submit && (
              <Button type="button" disabled={submitting} onClick={() => handleSave(true)}>
                {submitting ? 'Submitting…' : 'Save & Submit'}
              </Button>
            )}
          </>
        )}

        {docstatus === 1 && schema.isSubmittable && !hasWorkflow && perms.cancel && (
          <Button
            variant="destructive"
            type="button"
            disabled={submitting}
            onClick={() => runAction(() => frappe.cancelDoc(doctype, name!))}
          >
            {submitting ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}

        {docstatus === 2 && schema.isSubmittable && perms.amend && (
          <Button
            type="button"
            disabled={submitting}
            onClick={() => runAction(() => frappe.amendDoc(doctype, name!))}
          >
            {submitting ? 'Amending…' : 'Amend'}
          </Button>
        )}
      </div>
    </div>
  );
}
