'use client';
import { useState, useEffect } from 'react';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { CompiledField } from '@/lib/meta-compiler';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LinkField } from '@/components/fields/link-field';
import { ChildTable } from './child-table';

interface Props {
  doctype: string;
  name?: string;
  initialDoc?: Record<string, unknown>;
  initial?: Record<string, unknown>;
  onSave?: (doc: Record<string, unknown>) => void;
  onSaved?: (name: string) => void;
  onCancel?: () => void;
  onClose?: () => void;
}

interface Tab {
  label: string;
  sections: Section[];
}

interface Section {
  label: string;
  fields: CompiledField[];
}

const AUTO_FIELDS = new Set([
  'name', 'owner', 'creation', 'modified', 'modified_by',
  'docstatus', 'idx', 'parent', 'parentfield', 'parenttype',
]);

function buildTabs(fields: CompiledField[]): Tab[] {
  const tabs: Tab[] = [];
  let currentTab: Tab = { label: 'Details', sections: [] };
  let currentSection: Section = { label: '', fields: [] };

  for (const f of fields) {
    if (f.component === 'tab_break') {
      if (currentSection.fields.length) currentTab.sections.push(currentSection);
      if (currentTab.sections.length) tabs.push(currentTab);
      currentTab = { label: f.label || 'Details', sections: [] };
      currentSection = { label: '', fields: [] };
    } else if (f.component === 'section_break') {
      if (currentSection.fields.length) currentTab.sections.push(currentSection);
      currentSection = { label: f.label || '', fields: [] };
    } else if (!AUTO_FIELDS.has(f.fieldname) && f.component !== 'hidden' && !f.hidden) {
      currentSection.fields.push(f);
    }
  }
  if (currentSection.fields.length) currentTab.sections.push(currentSection);
  if (currentTab.sections.length) tabs.push(currentTab);

  return tabs.length ? tabs : [{ label: 'Details', sections: [{ label: '', fields: [] }] }];
}

export default function DynamicForm({ doctype, name, initialDoc, initial, onSave, onSaved, onCancel, onClose }: Props) {
  const { schema, loading, error } = useDocTypeSchema(doctype);
  const [doc, setDoc] = useState<Record<string, unknown>>(initialDoc || initial || {});
  const [docLoading, setDocLoading] = useState(!!name && !initialDoc && !initial);
  const [docError, setDocError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Editing an existing document: the caller only passes doctype/name (no
  // initialDoc), so fetch the real saved record here — otherwise `doc`
  // never holds anything but schema defaults, and every field without a
  // default (e.g. Time Zone, Country) silently renders blank even though
  // it's saved correctly server-side.
  useEffect(() => {
    if (!name || initialDoc || initial) return;
    let cancelled = false;
    setDocLoading(true);
    setDocError(null);
    fetch(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.exception || data?.message || res.statusText);
        if (!cancelled) setDoc((prev) => ({ ...prev, ...data.data }));
      })
      .catch((e) => {
        if (!cancelled) setDocError(String(e instanceof Error ? e.message : e));
      })
      .finally(() => {
        if (!cancelled) setDocLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctype, name, initialDoc, initial]);

  useEffect(() => {
    if (!schema) return;
    setDoc((prev) => {
      const patched = { ...prev };
      for (const f of schema.fields) {
        if (patched[f.fieldname] === undefined && f.default !== undefined) {
          const dv = f.default as string;
          if (f.component === 'link') {
            // skip — referenced records may not exist
          } else if ((f.component === 'date' || f.component === 'datetime') && dv === 'Today') {
            patched[f.fieldname] = new Date().toISOString().slice(0, 10);
          } else {
            patched[f.fieldname] = dv;
          }
        }
      }
      return patched;
    });
  }, [schema]);

  const setField = (fieldname: string, value: unknown) => {
    setDoc((prev) => {
      const updated = { ...prev, [fieldname]: value };
      if (schema) {
        for (const f of schema.fields) {
          if (f.fieldtype === 'Dynamic Link' && f.options === fieldname) {
            updated[f.fieldname] = '';
          }
        }
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload: Record<string, unknown> = { ...doc, doctype };
      for (const key of Object.keys(payload)) {
        if (payload[key] === '__user') payload[key] = '';
      }
      const url = name
        ? `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
        : `/api/resource/${encodeURIComponent(doctype)}`;
      const res = await fetch(url, {
        method: name ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.exception || data?.message || res.statusText);
      onSave?.(data.data);
      onSaved?.((data.data as Record<string, unknown>)?.name as string);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading || docLoading) return <p className="text-muted-foreground p-4">Loading form…</p>;
  if (error) return <p className="text-destructive p-4">Error loading form: {error}</p>;
  if (docError) return <p className="text-destructive p-4">Error loading document: {docError}</p>;
  if (!schema) return null;

  const tabs = buildTabs(schema.fields);

  return (
    <div className="space-y-0">
      {/* Tab bar */}
      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`px-5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === i
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="p-4 space-y-6">
        {tabs[activeTab]?.sections.map((section, si) => (
          <div key={si}>
            {section.label && (
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 pb-1 border-b border-border">
                {section.label}
              </h3>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.fields.map((f) => (
                <div
                  key={f.fieldname}
                  className={f.component === 'table' || f.component === 'textarea' ? 'col-span-full' : ''}
                >
                  <label className="block text-sm font-medium mb-1">
                    {f.label}
                    {f.reqd && <span className="text-destructive ml-1">*</span>}
                  </label>
                  {renderField(f, doc, setField)}
                  {f.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {saveError && (
          <p className="text-sm text-destructive border border-destructive/30 rounded p-2 bg-destructive/10">
            {saveError}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : name ? 'Update' : 'Save'}
          </Button>
          {(onCancel || onClose) && (
            <Button variant="outline" onClick={onCancel ?? onClose} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function renderField(
  f: CompiledField,
  doc: Record<string, unknown>,
  setField: (k: string, v: unknown) => void,
) {
  const value = doc[f.fieldname];
  const readOnly = f.read_only;

  switch (f.component) {
    case 'readonly':
      return <Input value={String(value ?? '')} disabled />;

    case 'check':
      return (
        <input
          type="checkbox"
          checked={!!value}
          disabled={readOnly}
          className="h-4 w-4"
          onChange={(e) => setField(f.fieldname, e.target.checked ? 1 : 0)}
        />
      );

    case 'select': {
      const opts = (f.options || '').split('\n').filter(Boolean);
      return (
        <select
          className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          value={String(value ?? '')}
          disabled={readOnly}
          onChange={(e) => setField(f.fieldname, e.target.value)}
        >
          <option value="">— Select —</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }

    case 'link': {
      if (f.fieldtype === 'Dynamic Link') {
        const typeSelectorFieldname = f.options || '';
        const linkTarget = typeSelectorFieldname ? (doc[typeSelectorFieldname] as string) || '' : '';
        return (
          <LinkField
            target={linkTarget}
            value={(value as string) || ''}
            disabled={readOnly || !linkTarget}
            onChange={(v) => setField(f.fieldname, v)}
          />
        );
      }
      return (
        <LinkField
          target={f.options || ''}
          value={(value as string) || ''}
          disabled={readOnly}
          onChange={(v) => setField(f.fieldname, v)}
        />
      );
    }

    case 'date':
      return (
        <Input
          type="date"
          disabled={readOnly}
          value={String(value ?? '')}
          onChange={(e) => setField(f.fieldname, e.target.value)}
        />
      );

    case 'datetime': {
      const dtVal = ((value as string) || '').replace(' ', 'T').slice(0, 16);
      return (
        <Input
          type="datetime-local"
          disabled={readOnly}
          value={dtVal}
          onChange={(e) => setField(f.fieldname, e.target.value.replace('T', ' ') + ':00')}
        />
      );
    }

    case 'number':
      return (
        <Input
          type="number"
          disabled={readOnly}
          value={String(value ?? '')}
          onChange={(e) => setField(f.fieldname, e.target.value)}
        />
      );

    case 'textarea':
      return (
        <textarea
          className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-y"
          disabled={readOnly}
          value={String(value ?? '')}
          onChange={(e) => setField(f.fieldname, e.target.value)}
        />
      );

    case 'table': {
      const childDoctype = f.options || '';
      const rows = (value as Record<string, unknown>[]) || [];
      return (
        <ChildTable
          childDoctype={childDoctype}
          rows={rows}
          readOnly={readOnly}
          onChange={(updated) => setField(f.fieldname, updated)}
        />
      );
    }

    default:
      return (
        <Input
          disabled={readOnly}
          value={String(value ?? '')}
          onChange={(e) => setField(f.fieldname, e.target.value)}
        />
      );
  }
}

export { DynamicForm };
