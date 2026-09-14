'use client';
import { useState } from 'react';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { CompiledField, evalDependsOn, isTruthyDocValue } from '@/lib/meta-compiler';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LinkField } from '@/components/fields/link-field';
import { AttachField } from '@/components/fields/attach-field';
import { ItemPickerDialog, PickedItem } from './item-picker-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { frappe } from '@/lib/frappe';
import { SlidersHorizontal } from 'lucide-react';

interface Row {
  [key: string]: unknown;
  idx?: number;
}

interface Props {
  childDoctype: string;
  rows: Row[];
  readOnly?: boolean;
  onChange: (rows: Row[]) => void;
  // The parent transaction's doc — used as a fallback context when
  // evaluating a child field's depends_on for fields not present on the
  // row itself (Frappe's own grid does the same: row context first, doc
  // context second).
  parentDoc?: Record<string, unknown>;
}

// Builds a doc-like object for depends_on evaluation: row fields take
// precedence, falling back to the parent doc's fields for anything the row
// doesn't define itself.
function rowEvalContext(row: Row, parentDoc?: Record<string, unknown>): Record<string, unknown> {
  return { ...(parentDoc || {}), ...row };
}

const CHILD_AUTO = new Set(['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx', 'parent', 'parentfield', 'parenttype', 'doctype']);

// Field-name conventions ERPNext's own item transaction tables (Sales/
// Purchase Order/Invoice, Delivery Note, Quotation, Material Request Items,
// etc.) all share. Used to auto-populate a row from the Item master once
// item_code is set — the same UX gap "Blue Pen" not visibly landing in a
// Sales Order line came from (the row picked up the code but nothing else,
// so it looked broken/half-added).
const ITEM_FIELD_MAP: Record<string, string> = {
  item_name: 'item_name',
  description: 'description',
  uom: 'stock_uom',
  stock_uom: 'stock_uom',
  brand: 'brand',
  item_group: 'item_group',
};

function pickerContextFor(childDoctype: string): 'sales' | 'purchase' | undefined {
  const d = childDoctype.toLowerCase();
  if (d.includes('sales') || d.includes('quotation') || d.includes('delivery')) return 'sales';
  if (d.includes('purchase') || d.includes('material request')) return 'purchase';
  return undefined;
}

export function ChildTable({ childDoctype, rows, readOnly, onChange, parentDoc }: Props) {
  const { schema, loading } = useDocTypeSchema(childDoctype);
  const [localRows, setLocalRows] = useState<Row[]>(rows.length ? rows : []);
  const [pickerRow, setPickerRow] = useState<number | null>(null);
  const [detailRow, setDetailRow] = useState<number | null>(null);

  if (loading) return <p className="text-sm text-muted-foreground">Loading {childDoctype}…</p>;
  if (!schema) return null;

  const allFields = schema.fields.filter(
    (f) => f.component !== 'hidden' && (!f.hidden || f.depends_on) && !CHILD_AUTO.has(f.fieldname)
  );
  // ERPNext's own grid only shows in_list_view fields as columns (Sales
  // Order Item has ~30 fields; the grid shows 6) — everything else is
  // edited via the row's expanded detail view, not crammed into the table.
  const compactFields = allFields.filter((f) => f.in_list_view || f.reqd);
  const visibleFields = compactFields.length > 0 ? compactFields : allFields;
  const hasMoreFields = allFields.length > visibleFields.length;

  const hasItemCode = allFields.some((f) => f.fieldname === 'item_code');

  const updateRow = (idx: number, fieldname: string, val: unknown) => {
    const updated = localRows.map((r, i) => i === idx ? { ...r, [fieldname]: val } : r);
    setLocalRows(updated);
    onChange(updated);
  };

  const updateRowFields = (idx: number, patch: Record<string, unknown>) => {
    const updated = localRows.map((r, i) => i === idx ? { ...r, ...patch } : r);
    setLocalRows(updated);
    onChange(updated);
  };

  // Populates the sibling fields ERPNext transaction lines expect once an
  // item is picked. Deliberately simple — the Item master's own defaults
  // (name/description/UOM/standard rate), not ERPNext's full pricing
  // engine (price lists, tax templates, party-specific rates). Good enough
  // for a line to actually look populated; a price-list-specific rate
  // should still be double-checked before submitting.
  const applyItem = (idx: number, item: PickedItem) => {
    const row = localRows[idx] || {};
    const patch: Record<string, unknown> = { item_code: item.item_code };
    for (const [rowField, itemField] of Object.entries(ITEM_FIELD_MAP)) {
      if (!(rowField in row) && !allFields.some((f) => f.fieldname === rowField)) continue;
      const v = (item as unknown as Record<string, unknown>)[itemField];
      if (v !== undefined && v !== null && v !== '') patch[rowField] = v;
    }
    const rateField = allFields.find((f) => f.fieldname === 'rate');
    if (rateField && !row.rate && item.standard_rate) patch.rate = item.standard_rate;
    const qty = Number(row.qty ?? patch.qty ?? 0);
    const rate = Number(patch.rate ?? row.rate ?? 0);
    if (allFields.some((f) => f.fieldname === 'amount') && qty && rate) {
      patch.amount = qty * rate;
    }
    updateRowFields(idx, patch);
  };

  const onItemCodeChanged = async (idx: number, code: string) => {
    updateRow(idx, 'item_code', code);
    if (!code) return;
    try {
      const item = await frappe.getDoc('Item', code);
      applyItem(idx, {
        item_code: item.name,
        item_name: item.item_name,
        description: item.description,
        stock_uom: item.stock_uom,
        standard_rate: item.standard_rate,
        brand: item.brand,
        item_group: item.item_group,
      });
    } catch {
      // Typed a code that doesn't (yet) resolve to a real Item — leave the
      // raw value in place, backend validation is the real gate on save.
    }
  };

  // Recompute amount client-side when qty/rate change directly, for
  // immediate visual feedback (ERPNext's own server-side validate() is
  // still the authoritative calculation on save).
  const onQtyOrRateChanged = (idx: number, fieldname: 'qty' | 'rate', value: string) => {
    const row = localRows[idx] || {};
    const patch: Record<string, unknown> = { [fieldname]: value };
    if (allFields.some((f) => f.fieldname === 'amount')) {
      const qty = Number(fieldname === 'qty' ? value : row.qty ?? 0);
      const rate = Number(fieldname === 'rate' ? value : row.rate ?? 0);
      if (qty && rate) patch.amount = qty * rate;
    }
    updateRowFields(idx, patch);
  };

  const addRow = () => {
    const newRow: Row = { doctype: childDoctype, idx: localRows.length + 1 };
    allFields.forEach((f) => {
      if (!f.default) return;
      newRow[f.fieldname] = f.component === 'check' ? (f.default === '1' ? 1 : 0) : f.default;
    });
    const updated = [...localRows, newRow];
    setLocalRows(updated);
    onChange(updated);
  };

  const removeRow = (idx: number) => {
    const updated = localRows.filter((_, i) => i !== idx);
    setLocalRows(updated);
    onChange(updated);
  };

  const renderControl = (f: CompiledField, row: Row, rowIdx: number, compact: boolean) => {
    const val = row[f.fieldname];
    const sizeCls = compact ? 'h-8 text-sm' : 'text-sm';

    if (!evalDependsOn(f.depends_on, rowEvalContext(row, parentDoc))) {
      return <span className="text-sm text-muted-foreground">—</span>;
    }
    if (readOnly) return <span className="text-sm">{String(val ?? '')}</span>;

    switch (f.component) {
      case 'number':
        return (
          <Input
            type="number"
            className={sizeCls}
            value={String(val ?? '')}
            onChange={(e) =>
              f.fieldname === 'qty' || f.fieldname === 'rate'
                ? onQtyOrRateChanged(rowIdx, f.fieldname, e.target.value)
                : updateRow(rowIdx, f.fieldname, e.target.value)
            }
          />
        );
      case 'date':
        return (
          <Input type="date" className={sizeCls} value={String(val ?? '')}
            onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.value)} />
        );
      case 'check':
        return (
          <input type="checkbox" checked={isTruthyDocValue(val)}
            onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.checked ? 1 : 0)} />
        );
      case 'link': {
        const linkTarget = f.fieldtype === 'Dynamic Link'
          ? (row[f.options || ''] as string) || ''
          : f.options || '';
        const isItemCode = f.fieldname === 'item_code' && linkTarget === 'Item';
        return (
          <div>
            <LinkField
              target={linkTarget}
              value={String(val ?? '')}
              onChange={(v) => (isItemCode ? onItemCodeChanged(rowIdx, v) : updateRow(rowIdx, f.fieldname, v))}
              onOpenPicker={isItemCode ? () => setPickerRow(rowIdx) : undefined}
            />
            {isItemCode && row.item_name ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{String(row.item_name)}</p>
            ) : null}
          </div>
        );
      }
      case 'select': {
        const opts = (f.options || '').split('\n').filter(Boolean);
        return (
          <select className={`w-full border rounded px-1 bg-background ${sizeCls}`}
            value={String(val ?? '')} onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.value)}>
            <option value="">—</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      }
      case 'attach':
        return (
          <AttachField
            value={String(val ?? '')}
            onChange={(v) => updateRow(rowIdx, f.fieldname, v)}
            isImage={f.fieldtype === 'Attach Image'}
          />
        );
      default:
        return (
          <Input className={sizeCls} value={String(val ?? '')}
            onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.value)} />
        );
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted">
            {visibleFields.map((f) => (
              <th key={f.fieldname} className="px-2 py-1.5 text-left border border-border font-medium whitespace-nowrap min-w-[120px]">
                {f.label}{f.reqd && <span className="text-destructive ml-0.5">*</span>}
              </th>
            ))}
            {hasMoreFields && <th className="w-8 border border-border" />}
            {!readOnly && <th className="w-8 border border-border" />}
          </tr>
        </thead>
        <tbody>
          {localRows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-accent/30">
              {visibleFields.map((f) => (
                <td key={f.fieldname} className="px-2 py-1 border border-border min-w-[120px] align-top">
                  {renderControl(f, row, rowIdx, true)}
                </td>
              ))}
              {hasMoreFields && (
                <td className="border border-border text-center">
                  <button
                    onClick={() => setDetailRow(rowIdx)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    title="More fields"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
              {!readOnly && (
                <td className="border border-border text-center">
                  <button onClick={() => removeRow(rowIdx)} className="text-destructive hover:opacity-80 px-1">✕</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <Button variant="outline" size="sm" className="mt-2" onClick={addRow}>
          + Add Row
        </Button>
      )}

      {hasItemCode && pickerRow !== null && (
        <ItemPickerDialog
          open={pickerRow !== null}
          onOpenChange={(o) => !o && setPickerRow(null)}
          context={pickerContextFor(childDoctype)}
          onSelect={(item) => {
            if (pickerRow !== null) applyItem(pickerRow, item);
            setPickerRow(null);
          }}
        />
      )}

      {detailRow !== null && (
        <Dialog open onOpenChange={(o) => !o && setDetailRow(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Row details</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {allFields.map((f) => (
                <div key={f.fieldname}>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {f.label}
                    {f.reqd && <span className="ml-0.5 text-destructive">*</span>}
                  </label>
                  {renderControl(f, localRows[detailRow], detailRow, false)}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
