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
  name?: string;          // undefined = new doc
  initialDoc?: Record<string, unknown>;
  initial?: Record<string, unknown>;   // alias for initialDoc (used by quick-create)
  onSave?: (doc: Record<string, unknown>) => void;
  onSaved?: (name: string) => void;    // alias called with doc name after save
  onCancel?: () => void;
  onClose?: () => void;                // alias for onCancel
}

// Fields controlled by Frappe automatically — skip rendering
const AUTO_FIELDS = new Set([
  'name', 'owner', 'creation', 'modified', 'modified_by',
  'docstatus', 'idx', 'parent', 'parentfield', 'parenttype',
]);

export default function DynamicForm({ doctype, name, initialDoc, initial, onSave, onSaved, onCancel, onClose }: Props) {
  const { schema, loading, error } = useDocTypeSchema(doctype);
  const [doc, setDoc] = useState<Record<string, unknown>>(initialDoc || initial || {});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // When schema loads, set defaults for unset fields
  useEffect(() => {
    if (!schema) return;
    setDoc((prev) => {
      const patched = { ...prev };
      for (const f of schema.fields) {
        if (patched[f.fieldname] === undefined && f.default !== undefined) {
          const dv = f.default as string;
          if (f.component === 'link') {
            // Skip link defaults — referenced records may not exist in this instance
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

      // When a Dynamic Link type-selector changes, clear the linked value
      // to avoid pointing to a doc in the wrong doctype
      if (schema) {
        for (const f of schema.fields) {
          if (f.fieldtype === 'Dynamic Link' && f.options === fieldname) {
            // fieldname is the type-selector for this Dynamic Link
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

      // Replace __user placeholder (belt-and-suspenders; backend also handles it)
      for (const key of Object.keys(payload)) {
        if (payload[key] === '__user') {
          // will be replaced server-side; send blank to avoid validation error
          payload[key] = '';
        }
      }

      const url = name
        ? `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
        : `/api/resource/${encodeURIComponent(doctype)}`;
      const method = name ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data?.exception || data?.message || res.statusText;
        throw new Error(msg);
      }
      onSave?.(data.data);
      onSaved?.((data.data as Record<string, unknown>)?.name as string);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground p-4">Loading form…</p>;
  if (error) return <p className="text-destructive p-4">Error loading form: {error}</p>;
  if (!schema) return null;

  const visibleFields = schema.fields.filter(
    (f) => !AUTO_FIELDS.has(f.fieldname) && f.component !== 'hidden' && !f.hidden
  );

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleFields.map((f) => (
          <div key={f.fieldname} className={f.component === 'table' || f.component === 'textarea' ? 'col-span-full' : ''}>
            <label className="block text-sm font-medium mb-1">
              {f.label}
              {f.reqd && <span className="text-destructive ml-1">*</span>}
            </label>
            {renderField(f, doc, setField)}
            {f.description && <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>}
          </div>
        ))}
      </div>

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
        // f.options is the fieldname whose value contains the actual target doctype
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
      // ERPNext stores "YYYY-MM-DD HH:MM:SS"; browser needs "YYYY-MM-DDTHH:MM"
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
