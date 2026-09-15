'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { CompiledField, isTruthyDocValue } from '@/lib/meta-compiler';
import { frappe } from '@/lib/frappe';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LinkField } from '@/components/fields/link-field';

interface Props {
  doctype: string;
  /** The text the user typed in the Link field that had no match — prefilled into the first Data field, a reasonable generic guess at the "name" field (customer_name, supplier_name, item_code, ...). */
  initialText?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
}

const AUTO = new Set(['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx']);

// Generic "create the missing master record without leaving the
// transaction" dialog — only asks for the doctype's own mandatory fields,
// not the full form. Works for any doctype via its own schema, so wiring
// it into LinkField (once) covers Customer/Supplier/Item/every other
// master the app has, not just one hardcoded case.
export function QuickCreateDialog({ doctype, initialText, open, onOpenChange, onCreated }: Props) {
  // Only fetch the target doctype's schema once the dialog is actually
  // opened — every LinkField renders one of these (closed) for its "+
  // Create new" affordance, and eagerly fetching meta for every distinct
  // link target on the page (e.g. every row in a child table) on mount
  // would be wasteful.
  const { schema, loading } = useDocTypeSchema(open ? doctype : '');
  const [doc, setDoc] = useState<Record<string, unknown>>({});
  const [primed, setPrimed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (open && schema && !primed) {
    const firstDataField = schema.fields.find((f) => f.fieldtype === 'Data' && f.reqd);
    setPrimed(true);
    if (firstDataField && initialText) {
      setDoc((d) => ({ ...d, [firstDataField.fieldname]: initialText }));
    }
  }
  if (!open && primed) setPrimed(false);

  if (!schema) {
    return loading && open ? (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    ) : null;
  }

  const requiredFields = schema.fields.filter((f) => f.reqd && !AUTO.has(f.fieldname) && f.component !== 'table');

  const setField = (fieldname: string, value: unknown) => setDoc((d) => ({ ...d, [fieldname]: value }));

  const renderField = (f: CompiledField) => {
    const val = doc[f.fieldname];
    switch (f.component) {
      case 'link': {
        const target = f.fieldtype === 'Dynamic Link' ? (doc[f.options || ''] as string) || '' : f.options || '';
        return <LinkField target={target} value={String(val ?? '')} onChange={(v) => setField(f.fieldname, v)} allowCreate={false} />;
      }
      case 'select': {
        const opts = (f.options || '').split('\n').filter(Boolean);
        return (
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={String(val ?? '')}
            onChange={(e) => setField(f.fieldname, e.target.value)}
          >
            <option value="">—</option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      }
      case 'check':
        return (
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={isTruthyDocValue(val)}
            onChange={(e) => setField(f.fieldname, e.target.checked ? 1 : 0)}
          />
        );
      case 'date':
        return <Input type="date" value={String(val ?? '')} onChange={(e) => setField(f.fieldname, e.target.value)} />;
      case 'number':
        return <Input type="number" value={String(val ?? '')} onChange={(e) => setField(f.fieldname, e.target.value)} />;
      default:
        return <Input value={String(val ?? '')} onChange={(e) => setField(f.fieldname, e.target.value)} />;
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await frappe.createDoc(doctype, doc);
      onCreated(created.name as string);
      onOpenChange(false);
      setDoc({});
    } catch (e) {
      const err = e as { response?: { data?: { exception?: string; message?: string; _server_messages?: string } } };
      setError(err?.response?.data?.exception || err?.response?.data?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New {doctype}</DialogTitle>
          <DialogDescription>Only the mandatory fields — open the full form afterward to fill in the rest.</DialogDescription>
        </DialogHeader>

        {error && <div className="mb-3 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">{error}</div>}

        <div className="space-y-3">
          {requiredFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">This doctype has no mandatory fields — creating directly.</p>
          ) : (
            requiredFields.map((f) => (
              <div key={f.fieldname}>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {f.label}
                  <span className="ml-0.5 text-destructive">*</span>
                </label>
                {renderField(f)}
              </div>
            ))
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5 shadow-elevation-xs" onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create {doctype}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
