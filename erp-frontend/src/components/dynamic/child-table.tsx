'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LinkField } from './link-field';
import type { DocField, DocTypeMeta } from '@/types/meta';

type Row = Record<string, unknown>;

interface ChildTableProps {
  childDoctype: string;
  rows: Row[];
  onChange: (rows: Row[]) => void;
}

const inputTypeFor = (ft: string) =>
  ft === 'Int' || ft === 'Float' || ft === 'Currency' || ft === 'Percent'
    ? 'number'
    : ft === 'Date'
      ? 'date'
      : 'text';

/**
 * Editable grid for an ERPNext child table. Columns are the child DocType's
 * in_list_view fields (metadata-driven, same engine as the parent form).
 */
export function ChildTable({ childDoctype, rows, onChange }: ChildTableProps) {
  const [columns, setColumns] = useState<DocField[]>([]);

  useEffect(() => {
    (async () => {
      const meta = (await frappe.getDocTypeMeta(childDoctype)) as DocTypeMeta | undefined;
      const all = meta?.fields || [];
      const fields = all.filter(
        (f) => f.in_list_view === 1 && f.fieldtype !== 'Section Break' && f.fieldtype !== 'Column Break'
      );
      // Also surface description + UOM in item grids even if not flagged.
      const EXTRA = ['description', 'uom', 'stock_uom'];
      for (const fn of EXTRA) {
        const extra = all.find((f) => f.fieldname === fn);
        if (extra && !fields.some((f) => f.fieldname === fn)) fields.push(extra);
      }
      // Fall back to first few data-ish fields if none are flagged in_list_view.
      const cols =
        fields.length > 0
          ? fields
          : all
              .filter((f) => !['Section Break', 'Column Break', 'Tab Break', 'HTML'].includes(f.fieldtype))
              .slice(0, 5);
      setColumns(cols);
    })().catch(() => setColumns([]));
  }, [childDoctype]);

  // Recompute derived fields on an item row: amount = qty × rate.
  const recompute = (r: Row): Row => {
    if ('qty' in r || 'rate' in r || 'amount' in r) {
      const qty = Number(r.qty) || 0;
      const rate = Number(r.rate) || 0;
      return { ...r, amount: +(qty * rate).toFixed(2) };
    }
    return r;
  };

  const updateCell = (idx: number, fieldname: string, value: unknown) => {
    onChange(
      rows.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, [fieldname]: value };
        return fieldname === 'qty' || fieldname === 'rate' ? recompute(next) : next;
      })
    );
  };

  // When an Item link is chosen, fetch the item and fill row defaults
  // (name, description, UOM, stock UOM, and a starting rate) in one atomic
  // update so the qty/rate/amount stays consistent.
  const selectItem = async (idx: number, fieldname: string, code: string) => {
    const patch: Row = { [fieldname]: code };
    if (code) {
      try {
        const item = (await frappe.getDoc('Item', code)) as Record<string, unknown>;
        patch.item_name = item.item_name;
        patch.description = (item.description as string) || (item.item_name as string) || code;
        patch.uom = item.sales_uom || item.stock_uom;
        patch.stock_uom = item.stock_uom;
        if (item.standard_rate != null && Number(item.standard_rate) > 0) patch.rate = item.standard_rate;
      } catch {
        /* keep the code even if the item lookup fails */
      }
    }
    onChange(rows.map((r, i) => (i === idx ? recompute({ ...r, ...patch }) : r)));
  };

  const addRow = () => onChange([...rows, {}]);
  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  // Per-field minimum widths so the grid shows full details.
  const colWidth = (f: DocField): string => {
    if (f.fieldname === 'description' || f.fieldname === 'item_name') return 'min-w-[220px]';
    if (f.fieldtype === 'Link') return 'min-w-[170px]';
    if (f.fieldtype === 'Date') return 'min-w-[150px]';
    if (['Int', 'Float', 'Currency', 'Percent'].includes(f.fieldtype)) return 'min-w-[90px]';
    return 'min-w-[130px]';
  };
  const isAmount = (f: DocField) => f.fieldname === 'amount';

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((c) => (
                <th key={c.fieldname} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                  {c.label || c.fieldname}
                  {c.reqd === 1 && <span className="text-destructive"> *</span>}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No rows. Click “Add Row”.
                </td>
              </tr>
            )}
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b last:border-0">
                {columns.map((c) => (
                  <td key={c.fieldname} className={`px-2 py-1.5 ${colWidth(c)}`}>
                    {c.fieldtype === 'Link' ? (
                      <LinkField
                        target={c.options || ''}
                        value={(row[c.fieldname] as string) || ''}
                        onChange={(v) =>
                          c.options === 'Item'
                            ? selectItem(idx, c.fieldname, v)
                            : updateCell(idx, c.fieldname, v)
                        }
                      />
                    ) : c.fieldtype === 'Check' ? (
                      <input
                        type="checkbox"
                        checked={!!row[c.fieldname]}
                        onChange={(e) => updateCell(idx, c.fieldname, e.target.checked ? 1 : 0)}
                      />
                    ) : isAmount(c) ? (
                      // Amount is derived (qty × rate) — show read-only.
                      <Input
                        type="number"
                        readOnly
                        tabIndex={-1}
                        className="bg-muted/50"
                        value={(row[c.fieldname] as number) ?? 0}
                      />
                    ) : (
                      <Input
                        type={inputTypeFor(c.fieldtype)}
                        value={(row[c.fieldname] as string | number) ?? ''}
                        onChange={(e) =>
                          updateCell(
                            idx,
                            c.fieldname,
                            inputTypeFor(c.fieldtype) === 'number'
                              ? e.target.value === ''
                                ? ''
                                : Number(e.target.value)
                              : e.target.value
                          )
                        }
                      />
                    )}
                  </td>
                ))}
                <td className="px-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="mr-1 h-4 w-4" /> Add Row
      </Button>
    </div>
  );
}
