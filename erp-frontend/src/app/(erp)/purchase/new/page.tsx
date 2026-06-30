'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { useCompanyDefaults } from '@/hooks/use-company-defaults';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LineItem {
  item_code: string;
  qty: number;
  rate: number;
}

interface ItemOption {
  name: string;
  item_name: string;
  standard_rate: number;
}

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { company, currency, loading: defaultsLoading } = useCompanyDefaults();

  const [suppliers, setSuppliers] = useState<{ name: string; supplier_name: string }[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);

  const [supplier, setSupplier] = useState('');
  const [requiredBy, setRequiredBy] = useState('');
  const [lines, setLines] = useState<LineItem[]>([{ item_code: '', qty: 1, rate: 0 }]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [sup, itm] = await Promise.all([
        frappe.getList('Supplier', {
          fields: JSON.stringify(['name', 'supplier_name']),
          limit_page_length: 0,
        }),
        frappe.getList('Item', {
          fields: JSON.stringify(['name', 'item_name', 'standard_rate']),
          filters: JSON.stringify([['is_purchase_item', '=', 1]]),
          limit_page_length: 0,
        }),
      ]);
      setSuppliers(sup || []);
      setItems(itm || []);
    })().catch(() => setError('Failed to load suppliers/items from ERPNext.'));
  }, []);

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const onSelectItem = (idx: number, code: string) => {
    const match = items.find((i) => i.name === code);
    updateLine(idx, { item_code: code, rate: match?.standard_rate ?? 0 });
  };

  const addLine = () => setLines((prev) => [...prev, { item_code: '', qty: 1, rate: 0 }]);
  const removeLine = (idx: number) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const total = lines.reduce((sum, l) => sum + l.qty * l.rate, 0);

  const handleSubmit = async (submitAfter: boolean) => {
    setError(null);
    if (!supplier) return setError('Please select a supplier.');
    if (!requiredBy) return setError('Please choose a required-by date.');
    const validLines = lines.filter((l) => l.item_code && l.qty > 0);
    if (validLines.length === 0) return setError('Add at least one item with a quantity.');

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        supplier,
        schedule_date: requiredBy,
        items: validLines.map((l) => ({
          item_code: l.item_code,
          qty: l.qty,
          rate: l.rate,
          schedule_date: requiredBy,
        })),
      };
      if (company) payload.company = company;
      if (currency) payload.currency = currency;

      const doc = await frappe.createDoc('Purchase Order', payload);
      if (submitAfter && doc?.name) {
        await frappe.submitDoc('Purchase Order', doc.name);
      }
      router.push('/purchase');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { exception?: string } } })?.response?.data?.exception ||
        (err instanceof Error ? err.message : 'Failed to create purchase order.');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded p-1.5 hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-2xl font-bold">New Purchase Order</h2>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Supplier</label>
            <select
              className={selectClass}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.supplier_name || s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Required By</label>
            <Input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Currency</label>
            <Input value={defaultsLoading ? 'Loading…' : currency || '—'} disabled readOnly />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Items</CardTitle>
          <Button variant="outline" size="sm" onClick={addLine} type="button">
            <Plus className="mr-1 h-4 w-4" /> Add Item
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-6 space-y-1.5">
                  {idx === 0 && <label className="text-xs text-muted-foreground">Item</label>}
                  <select
                    className={selectClass}
                    value={line.item_code}
                    onChange={(e) => onSelectItem(idx, e.target.value)}
                  >
                    <option value="">Select item…</option>
                    {items.map((i) => (
                      <option key={i.name} value={i.name}>
                        {i.item_name || i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  {idx === 0 && <label className="text-xs text-muted-foreground">Qty</label>}
                  <Input
                    type="number"
                    min={0}
                    value={line.qty}
                    onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  {idx === 0 && <label className="text-xs text-muted-foreground">Rate</label>}
                  <Input
                    type="number"
                    min={0}
                    value={line.rate}
                    onChange={(e) => updateLine(idx, { rate: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-2 flex items-center justify-end gap-2 pb-1">
                  <span className="text-sm font-medium">{(line.qty * line.rate).toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end border-t pt-4 text-sm font-semibold">
            Total: {currency || ''} {total.toFixed(2)}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()} type="button" disabled={submitting}>
          Cancel
        </Button>
        <Button variant="outline" onClick={() => handleSubmit(false)} type="button" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save as Draft'}
        </Button>
        <Button onClick={() => handleSubmit(true)} type="button" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Save & Submit'}
        </Button>
      </div>
    </div>
  );
}
