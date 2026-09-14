'use client';
import { useState, useEffect } from 'react';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { CompiledField, evalDependsOn, isTruthyDocValue } from '@/lib/meta-compiler';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LinkField } from '@/components/fields/link-field';
import { AttachField } from '@/components/fields/attach-field';
import { ChildTable } from './child-table';
import { PrintPanel } from './print-panel';
import { Printer } from 'lucide-react';

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
  depends_on?: string;
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
      currentSection = { label: f.label || '', fields: [], depends_on: f.depends_on };
    } else if (
      !AUTO_FIELDS.has(f.fieldname) &&
      f.component !== 'hidden' &&
      // A field with `hidden: 1` in its DocType meta is usually not
      // permanently hidden — Frappe doctypes commonly author fields as
      // hidden-by-default-but-revealed-by-depends_on (e.g. Item's
      // "attributes" table, shown only once "Has Variants" is checked —
      // ERPNext's own item.js toggles it with the exact same condition
      // as its depends_on). Excluding it here unconditionally meant the
      // field could never appear no matter what the user did. Only treat
      // `hidden` as a hard veto when there's no depends_on to override it.
      (!f.hidden || f.depends_on)
    ) {
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
  const [transitioning, setTransitioning] = useState<'submit' | 'cancel' | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

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
          } else if (f.component === 'check') {
            // Frappe's `default` is always a string ("0"/"1"), but the
            // *backend's* own Python validate() hooks routinely do
            // `if self.some_check_field:` — and the non-empty string "0" is
            // truthy in Python too, not just JS. Sending the raw default
            // string through on save made every untouched, correctly-
            // unchecked Check field look checked to server-side validation
            // (e.g. Item's is_fixed_asset/is_customer_provided_item/
            // has_variants), causing spurious ValidationErrors on a plain
            // save with no field ever visibly wrong in the UI. Store real
            // 0/1 so it round-trips correctly no matter which side reads it.
            patched[f.fieldname] = dv === '1' ? 1 : 0;
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

  // Submit/Cancel a saved submittable document. Frappe's REST resource API
  // (used by handleSave above) never transitions docstatus — that requires
  // calling frappe.client.submit/cancel explicitly, same as Frappe Desk
  // does. Without this, every transaction created here stayed a Draft
  // forever: no GL entries, no stock impact, and nothing downstream (a
  // Delivery Note, a Purchase Invoice, ...) could properly reference it.
  const runTransition = async (action: 'submit' | 'cancel') => {
    if (!name) return;
    setTransitioning(action);
    setTransitionError(null);
    try {
      const res = await fetch(`/api/method/frappe.client.${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ doc: JSON.stringify({ ...doc, doctype, name }) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.exception || data?.message?.exception || data?.message || res.statusText);
      const updated = data.message as Record<string, unknown>;
      setDoc((prev) => ({ ...prev, ...updated }));
      onSave?.(updated);
    } catch (e) {
      setTransitionError(String(e instanceof Error ? e.message : e));
    } finally {
      setTransitioning(null);
    }
  };

  if (loading || docLoading) return <p className="text-muted-foreground p-4">Loading form…</p>;
  if (error) return <p className="text-destructive p-4">Error loading form: {error}</p>;
  if (docError) return <p className="text-destructive p-4">Error loading document: {docError}</p>;
  if (!schema) return null;

  const docstatus = Number(doc.docstatus ?? 0);
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
        {tabs[activeTab]?.sections
          .filter((section) => evalDependsOn(section.depends_on, doc))
          .map((section, si) => {
            const visibleFields = section.fields.filter((f) => evalDependsOn(f.depends_on, doc));
            if (!visibleFields.length) return null;
            return (
              <div key={si}>
                {section.label && (
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 pb-1 border-b border-border">
                    {section.label}
                  </h3>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleFields.map((f) => {
                    const isMandatory = f.reqd || (f.mandatory_depends_on ? evalDependsOn(f.mandatory_depends_on, doc) : false);
                    return (
                      <div
                        key={f.fieldname}
                        className={f.component === 'table' || f.component === 'textarea' ? 'col-span-full' : ''}
                      >
                        <label className="block text-sm font-medium mb-1">
                          {f.label}
                          {isMandatory && <span className="text-destructive ml-1">*</span>}
                        </label>
                        {renderField(f, doc, setField)}
                        {f.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        {saveError && (
          <p className="text-sm text-destructive border border-destructive/30 rounded p-2 bg-destructive/10">
            {saveError}
          </p>
        )}
        {transitionError && (
          <p className="text-sm text-destructive border border-destructive/30 rounded p-2 bg-destructive/10">
            {transitionError}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          {docstatus === 0 && (
            <Button onClick={handleSave} disabled={saving || !!transitioning}>
              {saving ? 'Saving…' : name ? 'Update' : 'Save'}
            </Button>
          )}
          {schema.is_submittable && name && docstatus === 0 && (
            <Button onClick={() => runTransition('submit')} disabled={saving || !!transitioning}>
              {transitioning === 'submit' ? 'Submitting…' : 'Submit'}
            </Button>
          )}
          {schema.is_submittable && name && docstatus === 1 && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => runTransition('cancel')}
              disabled={!!transitioning}
            >
              {transitioning === 'cancel' ? 'Cancelling…' : 'Cancel Document'}
            </Button>
          )}
          {name && (
            <Button variant="outline" className="gap-1.5" onClick={() => setPrintOpen(true)}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          )}
          {(onCancel || onClose) && (
            <Button variant="outline" onClick={onCancel ?? onClose} disabled={saving || !!transitioning}>
              Close
            </Button>
          )}
        </div>
      </div>
      {name && <PrintPanel doctype={doctype} name={name} open={printOpen} onOpenChange={setPrintOpen} />}
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
          checked={isTruthyDocValue(value)}
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

    case 'attach':
      return (
        <AttachField
          value={String(value ?? '')}
          onChange={(v) => setField(f.fieldname, v)}
          disabled={readOnly}
          isImage={f.fieldtype === 'Attach Image'}
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
          parentDoc={doc}
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
