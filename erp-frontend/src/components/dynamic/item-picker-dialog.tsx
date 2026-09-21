'use client';
import { useEffect, useState } from 'react';
import { frappe } from '@/lib/frappe';
import { formatCurrency } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2 } from 'lucide-react';

export interface PickedItem {
  item_code: string;
  item_name?: string;
  description?: string;
  stock_uom?: string;
  standard_rate?: number;
  brand?: string;
  item_group?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: PickedItem) => void;
  /** 'sales' filters to is_sales_item, 'purchase' to is_purchase_item — matches ERPNext's own item picker per transaction type. */
  context?: 'sales' | 'purchase';
}

const FIELDS = ['name', 'item_name', 'item_group', 'brand', 'stock_uom', 'standard_rate', 'description'];
const PAGE_SIZE = 30;

export function ItemPickerDialog({ open, onOpenChange, onSelect, context }: Props) {
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('');
  const [itemGroup, setItemGroup] = useState('');
  const [attribute, setAttribute] = useState('');
  const [attributeValue, setAttributeValue] = useState('');

  const [brands, setBrands] = useState<string[]>([]);
  const [itemGroups, setItemGroups] = useState<string[]>([]);
  const [attributes, setAttributes] = useState<string[]>([]);

  const [rows, setRows] = useState<PickedItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    frappe.getList('Brand', { fields: JSON.stringify(['name']), limit_page_length: 0 }).then((r) =>
      setBrands((r as Array<{ name: string }>).map((x) => x.name))
    ).catch(() => {});
    frappe.getList('Item Group', { fields: JSON.stringify(['name']), limit_page_length: 0 }).then((r) =>
      setItemGroups((r as Array<{ name: string }>).map((x) => x.name))
    ).catch(() => {});
    frappe.getList('Item Attribute', { fields: JSON.stringify(['name']), limit_page_length: 0 }).then((r) =>
      setAttributes((r as Array<{ name: string }>).map((x) => x.name))
    ).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const filters: Array<[string, string, unknown]> = [['disabled', '=', 0]];
        if (context === 'sales') filters.push(['is_sales_item', '=', 1]);
        if (context === 'purchase') filters.push(['is_purchase_item', '=', 1]);
        if (brand) filters.push(['brand', '=', brand]);
        if (itemGroup) filters.push(['item_group', '=', itemGroup]);

        // Attribute-wise search: Item doesn't carry variant attribute
        // values on itself — they live in the Item Variant Attribute
        // child table (parent = the variant's item code). Resolve
        // matching item codes there first, then intersect via `name in`.
        if (attribute && attributeValue) {
          const attrRows = await frappe.getList('Item Variant Attribute', {
            fields: JSON.stringify(['parent']),
            filters: JSON.stringify([
              ['attribute', '=', attribute],
              ['attribute_value', 'like', `%${attributeValue}%`],
              ['parenttype', '=', 'Item'],
            ]),
            limit_page_length: 0,
          });
          const codes = Array.from(new Set((attrRows as Array<{ parent: string }>).map((r) => r.parent)));
          if (codes.length === 0) {
            if (!cancelled) {
              setRows([]);
              setLoading(false);
            }
            return;
          }
          filters.push(['name', 'in', codes]);
        }

        const params: Record<string, unknown> = {
          fields: JSON.stringify(FIELDS),
          filters: JSON.stringify(filters),
          limit_page_length: PAGE_SIZE,
          order_by: 'modified desc',
        };
        if (q.trim()) {
          params.or_filters = JSON.stringify([
            ['name', 'like', `%${q}%`],
            ['item_name', 'like', `%${q}%`],
            ['description', 'like', `%${q}%`],
          ]);
        }
        const data = await frappe.getList('Item', params);
        if (!cancelled) {
          setRows(
            (data as Array<Record<string, unknown>>).map((r) => ({
              item_code: r.name as string,
              item_name: r.item_name as string,
              description: r.description as string,
              stock_uom: r.stock_uom as string,
              standard_rate: r.standard_rate as number,
              brand: r.brand as string,
              item_group: r.item_group as string,
            }))
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, q, brand, itemGroup, attribute, attributeValue, context]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Find Item</DialogTitle>
          <DialogDescription>Search by code, name, description, brand, or variant attribute.</DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name, or description…" className="h-9 pl-8" />
          </div>
          {itemGroups.length > 0 && (
            <Select value={itemGroup || '__all__'} onValueChange={(v) => setItemGroup(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Item Group" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All groups</SelectItem>
                {itemGroups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {brands.length > 0 && (
            <Select value={brand || '__all__'} onValueChange={(v) => setBrand(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Brand" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All brands</SelectItem>
                {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        {attributes.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <Select value={attribute || '__none__'} onValueChange={(v) => { setAttribute(v === '__none__' ? '' : v); if (v === '__none__') setAttributeValue(''); }}>
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Attribute" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No attribute filter</SelectItem>
                {attributes.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            {attribute && (
              <Input value={attributeValue} onChange={(e) => setAttributeValue(e.target.value)} placeholder={`${attribute} value…`} className="h-9 w-40" />
            )}
          </div>
        )}

        <div className="max-h-96 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">UOM</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rate</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">No items found</td></tr>
              ) : (
                rows.map((item) => (
                  <tr
                    key={item.item_code}
                    onClick={() => { onSelect(item); onOpenChange(false); }}
                    className="cursor-pointer border-b last:border-0 transition-smooth hover:bg-accent/60"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-primary">{item.item_code}</div>
                      {item.item_name && item.item_name !== item.item_code && (
                        <div className="text-xs text-muted-foreground">{item.item_name}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{item.item_group || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.stock_uom || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.standard_rate ? formatCurrency(item.standard_rate) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
