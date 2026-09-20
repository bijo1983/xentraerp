'use client';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Tag } from 'lucide-react';
import {
  DefaultPriceLists,
  ItemPriceRow,
  PriceSide,
  getDefaultPriceLists,
  loadItemPrices,
  saveItemPrices,
} from '@/lib/item-prices';
import { Input } from '@/components/ui/input';

type Values = Record<PriceSide, string>;

const format = (n: number) => String(n);

// State for the Item form's price inputs. Always called by DynamicForm (hooks
// can't be conditional) but does nothing unless `enabled` — i.e. only for the
// Item doctype.
export function useItemPrices(enabled: boolean, itemName: string | undefined, stockUom: string | null | undefined) {
  const [lists, setLists] = useState<DefaultPriceLists | null>(null);
  const [existing, setExisting] = useState<Record<PriceSide, ItemPriceRow | null>>({ selling: null, buying: null });
  const [values, setValues] = useState<Values>({ selling: '', buying: '' });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const l = await getDefaultPriceLists();
        if (cancelled) return;
        setLists(l);
        if (itemName) {
          const rows = await loadItemPrices(itemName, l, stockUom);
          if (cancelled) return;
          setExisting(rows);
          setValues({ selling: rows.selling ? format(rows.selling.rate) : '', buying: rows.buying ? format(rows.buying.rate) : '' });
        }
      } catch (e) {
        if (!cancelled) setLoadError(String(e instanceof Error ? e.message : e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // stockUom is deliberately not a dependency: it changes as the user edits
    // the form, and the saved prices don't depend on what's typed there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, itemName]);

  const setValue = useCallback((side: PriceSide, v: string) => setValues((prev) => ({ ...prev, [side]: v })), []);

  // Persists whatever was typed. Throws with a readable message on failure.
  const save = useCallback(
    async (itemCode: string) => {
      if (!enabled) return;
      const l = lists || (await getDefaultPriceLists());
      const saved = await saveItemPrices(itemCode, {
        selling: { value: values.selling, existing: existing.selling, list: l.selling },
        buying: { value: values.buying, existing: existing.buying, list: l.buying },
      });
      setExisting(saved);
    },
    [enabled, lists, values, existing]
  );

  return { lists, values, setValue, loading, loadError, save };
}

interface PanelProps {
  state: ReturnType<typeof useItemPrices>;
  disabled?: boolean;
}

const ROWS: Array<{ side: PriceSide; label: string; hint: string }> = [
  { side: 'selling', label: 'Standard Selling Price', hint: 'Pre-fills the rate on sales documents' },
  { side: 'buying', label: 'Standard Purchase Price', hint: 'Pre-fills the rate on purchase documents' },
];

export function ItemPricePanel({ state, disabled }: PanelProps) {
  const { lists, values, setValue, loading, loadError } = state;
  return (
    <div className="mb-4 rounded-lg border bg-card p-4 shadow-elevation-xs">
      <div className="mb-3 flex items-center gap-2">
        <Tag className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Prices</h3>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ROWS.map(({ side, label, hint }) => {
          const list = lists?.[side] || null;
          const missing = !!lists && !list;
          return (
            <div key={side}>
              <label htmlFor={`item-price-${side}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                {label}
                {list?.currency ? <span className="ml-1 font-normal">({list.currency})</span> : null}
              </label>
              <Input
                id={`item-price-${side}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="0.00"
                value={values[side]}
                disabled={disabled || loading || missing}
                onChange={(e) => setValue(side, e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {missing ? `No default ${side} price list is set up.` : list ? `${hint} · ${list.name}` : hint}
              </p>
            </div>
          );
        })}
      </div>
      {loadError && <p className="mt-2 text-xs text-destructive">Couldn&apos;t load prices: {loadError}</p>}
    </div>
  );
}
