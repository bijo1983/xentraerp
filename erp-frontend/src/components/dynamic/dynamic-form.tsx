'use client';

import { useMemo, useState } from 'react';
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
  initial?: DocModel;
  onSaved?: (name: string) => void;
}

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function DynamicForm({ doctype, initial, onSaved }: DynamicFormProps) {
  const { schema, loading, error } = useDocTypeSchema(doctype);
  const [doc, setDoc] = useState<DocModel>(initial || {});
  const [activeTab, setActiveTab] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const setField = (name: string, value: unknown) => setDoc((d) => ({ ...d, [name]: value }));

  const isVisible = (f: RenderField) => evalDepends(f.dependsOn, doc, true);
  const isReadOnly = (f: RenderField) =>
    f.readOnly || evalDepends(f.readOnlyDependsOn, doc, false);
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

  const handleSave = async (submitAfter: boolean) => {
    setFormError(null);
    const err = validate();
    if (err) return setFormError(err);
    setSubmitting(true);
    try {
      const saved = await frappe.createDoc(doctype, doc);
      if (submitAfter && saved?.name) await frappe.submitDoc(doctype, saved.name);
      onSaved?.(saved?.name);
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { exception?: string } } })?.response?.data?.exception ||
        (e instanceof Error ? e.message : 'Failed to save.');
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
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

      <div className="flex justify-end gap-3">
        <Button variant="outline" type="button" disabled={submitting} onClick={() => handleSave(false)}>
          {submitting ? 'Saving…' : 'Save as Draft'}
        </Button>
        {schema.isSubmittable && (
          <Button type="button" disabled={submitting} onClick={() => handleSave(true)}>
            {submitting ? 'Submitting…' : 'Save & Submit'}
          </Button>
        )}
      </div>
    </div>
  );
}
