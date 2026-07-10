'use client';

import { useEffect, useMemo, useState } from 'react';
import { frappe } from '@/lib/frappe';
import { evalDepends } from '@/lib/eval-depends';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkField } from './link-field';
import { ChildTable } from './child-table';
import type { RenderField } from '@/types/meta';

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
  const [doc, setDoc] = useState<DocModel>(initial || {});
  const [activeTab, setActiveTab] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(!!name);

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

  const setField = (fname: string, value: unknown) => setDoc((d) => ({ ...d, [fname]: value }));

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

  const validate = (): string | null => {
    for (const f of allFields) {
      if (!isVisible(f)) continue;
      if (isRequired(f) && f.component !== 'child_table') {
        const v = doc[f.fieldname];
        if (v === undefined || v === null || v === '') return `“${f.label}” is required.`;
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
          <label className="flex h-10 items-center gap-2">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={!!value}
              onChange={(e) => setField(f.fieldname, e.target.checked ? 1 : 0)}
            />
            <span className="text-sm text-muted-foreground">{f.description || ''}</span>
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
              className={`px-4 py-2 text-sm font-medium ${
                i === activeTab ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab.sections.map((section, si) => (
        <Card key={si}>
          {section.label && (
            <CardHeader>
              <CardTitle className="text-base">{section.label}</CardTitle>
            </CardHeader>
          )}
          <CardContent className="pt-6">
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${section.columns.length}, minmax(0, 1fr))` }}
            >
              {section.columns.map((col, ci) => (
                <div key={ci} className="space-y-4">
                  {col.fields.map((f) => {
                    if (!isVisible(f)) return null;
                    const fullWidth = f.component === 'child_table' || f.component === 'textarea';
                    return (
                      <div key={f.fieldname} className={`space-y-1.5 ${fullWidth ? 'col-span-full' : ''}`}>
                        {f.component !== 'check' && (
                          <label className="text-sm font-medium">
                            {f.label}
                            {isRequired(f) && <span className="text-destructive"> *</span>}
                          </label>
                        )}
                        {renderControl(f)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center justify-end gap-3">
        {docstatus === 1 && (
          <span className="mr-auto rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            Submitted
          </span>
        )}
        {docstatus === 2 && (
          <span className="mr-auto rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
            Cancelled
          </span>
        )}

        {docstatus === 0 && (
          <>
            <Button variant="outline" type="button" disabled={submitting} onClick={() => handleSave(false)}>
              {submitting ? 'Saving…' : isNew ? 'Save as Draft' : 'Save'}
            </Button>
            {schema.isSubmittable && (
              <Button type="button" disabled={submitting} onClick={() => handleSave(true)}>
                {submitting ? 'Submitting…' : 'Save & Submit'}
              </Button>
            )}
          </>
        )}

        {docstatus === 1 && schema.isSubmittable && (
          <Button
            variant="destructive"
            type="button"
            disabled={submitting}
            onClick={() => runAction(() => frappe.cancelDoc(doctype, name!))}
          >
            {submitting ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}

        {docstatus === 2 && schema.isSubmittable && (
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
