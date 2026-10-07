'use client';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ReportColumn } from '@/lib/reports/catalog';

/** A column taken from the record a report's Link column points at (e.g. Customer → Territory). */
export interface AddedColumn {
  key: string;        // `<link>__<field>`
  link: string;       // the report column holding the record name
  doctype: string;    // that record's doctype
  field: string;
  label: string;
  fieldtype: string;
  options?: string;
}

export interface Layout {
  order: string[];
  hidden: string[];
  added: AddedColumn[];
}

const NO_VALUE_TYPES = new Set(['Section Break', 'Column Break', 'Tab Break', 'Table', 'Table MultiSelect', 'HTML', 'Button', 'Image', 'Fold', 'Heading']);

export function ColumnsDialog({ open, onOpenChange, columns, baseColumns, layout, onChange }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  columns: ReportColumn[];       // current order, including added columns
  baseColumns: ReportColumn[];   // as the report returned them
  layout: Layout;
  onChange: (l: Layout) => void;
}) {
  const linkCols = baseColumns.filter((c) => c.fieldtype === 'Link' && c.options);
  const [link, setLink] = useState('');
  const [field, setField] = useState('');
  const linkCol = linkCols.find((c) => c.fieldname === link);

  const move = (i: number, d: -1 | 1) => {
    const order = columns.map((c) => c.fieldname);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    onChange({ ...layout, order });
  };
  const toggle = (f: string) =>
    onChange({ ...layout, hidden: layout.hidden.includes(f) ? layout.hidden.filter((x) => x !== f) : [...layout.hidden, f] });
  const remove = (key: string) =>
    onChange({ ...layout, added: layout.added.filter((a) => a.key !== key), order: layout.order.filter((f) => f !== key), hidden: layout.hidden.filter((f) => f !== key) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Columns</DialogTitle>
          <DialogDescription>Show, hide and reorder columns, or add one from a linked record. Saved for this report in this browser.</DialogDescription>
        </DialogHeader>

        <ul className="max-h-[45vh] divide-y overflow-y-auto rounded-md border">
          {columns.map((c, i) => {
            const added = layout.added.find((a) => a.key === c.fieldname);
            return (
              <li key={c.fieldname} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={!layout.hidden.includes(c.fieldname)} onChange={() => toggle(c.fieldname)} />
                <span className="flex-1 truncate">
                  {c.label}
                  {added && <span className="ml-1 text-xs text-muted-foreground">({added.doctype})</span>}
                </span>
                <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === columns.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                {added && (
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => remove(added.key)} aria-label="Remove column">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {linkCols.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Add a column from a linked record</p>
            <div className="flex flex-wrap gap-2">
              <Select value={link || undefined} onValueChange={(v) => { setLink(v); setField(''); }}>
                <SelectTrigger className="h-9 w-44 shadow-none"><SelectValue placeholder="From…" /></SelectTrigger>
                <SelectContent>
                  {linkCols.map((c) => <SelectItem key={c.fieldname} value={c.fieldname}>{c.label} ({c.options})</SelectItem>)}
                </SelectContent>
              </Select>
              {linkCol && <FieldPicker doctype={linkCol.options!} value={field} onChange={setField} exclude={layout.added.filter((a) => a.link === link).map((a) => a.field)} />}
              <AddButton
                disabled={!linkCol || !field}
                doctype={linkCol?.options || ''}
                field={field}
                onAdd={(label, fieldtype, options) => {
                  const key = `${link}__${field}`;
                  onChange({ ...layout, added: [...layout.added, { key, link, doctype: linkCol!.options!, field, label, fieldtype, options }] });
                  setField('');
                }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-between pt-1">
          <Button variant="ghost" size="sm" onClick={() => onChange({ order: [], hidden: [], added: [] })}>Reset to report default</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useFields(doctype: string) {
  const { schema } = useDocTypeSchema(doctype);
  return useMemo(
    () => (schema?.fields || []).filter((f) => !NO_VALUE_TYPES.has(f.fieldtype) && f.label && f.label !== f.fieldname).sort((a, b) => a.label.localeCompare(b.label)),
    [schema],
  );
}

function FieldPicker({ doctype, value, onChange, exclude }: { doctype: string; value: string; onChange: (v: string) => void; exclude: string[] }) {
  const fields = useFields(doctype).filter((f) => !exclude.includes(f.fieldname));
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-52 shadow-none"><SelectValue placeholder={fields.length ? 'Field…' : 'Loading…'} /></SelectTrigger>
      <SelectContent className="max-h-72">
        {fields.map((f) => <SelectItem key={f.fieldname} value={f.fieldname}>{f.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function AddButton({ disabled, doctype, field, onAdd }: { disabled: boolean; doctype: string; field: string; onAdd: (label: string, fieldtype: string, options?: string) => void }) {
  const fields = useFields(doctype);
  const f = fields.find((x) => x.fieldname === field);
  return (
    <Button size="sm" className="h-9" disabled={disabled || !f} onClick={() => f && onAdd(f.label, f.fieldtype, f.fieldtype === 'Link' ? f.options : undefined)}>
      <Plus className="mr-1 h-3.5 w-3.5" /> Add
    </Button>
  );
}
