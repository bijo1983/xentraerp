'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { frappe } from '@/lib/frappe';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useTenantCode, withTenant } from '@/lib/tenant';
import type { ColDef } from './doctype-list';

interface Props {
  doctype: string;
  fields: string[];
  cols: ColDef[];
  kanbanField: string;
  columns: Array<{ value: string; label: string }>;
  /** Extra Frappe filter triples already active in the parent (search, other dropdown filters) — applied on top of the per-column grouping. */
  baseFilters?: Array<[string, string, unknown]>;
  titleField: string;
  subtitleField?: string;
  amountField?: string;
}

interface Row {
  name: string;
  [key: string]: unknown;
}

const MAX_CARDS = 200;

export function KanbanBoard({ doctype, fields, kanbanField, columns, baseFilters, titleField, subtitleField, amountField }: Props) {
  const router = useRouter();
  const tenantCode = useTenantCode();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingName, setMovingName] = useState<string | null>(null);
  const [dragName, setDragName] = useState<string | null>(null);

  const filtersKey = JSON.stringify(baseFilters ?? null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await frappe.getList(doctype, {
        fields: JSON.stringify(Array.from(new Set([...fields, kanbanField]))),
        filters: baseFilters ? JSON.stringify(baseFilters) : undefined,
        order_by: 'modified desc',
        limit_page_length: MAX_CARDS,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to load ${doctype}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, filtersKey]);

  const buckets = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const c of columns) map.set(c.value, []);
    for (const row of rows) {
      const v = String(row[kanbanField] ?? '');
      if (!map.has(v)) map.set(v, []);
      map.get(v)!.push(row);
    }
    return map;
  }, [rows, columns, kanbanField]);

  const moveCard = async (row: Row, newValue: string) => {
    if (row[kanbanField] === newValue) return;
    setMovingName(row.name);
    const prev = row[kanbanField];
    setRows((r) => r.map((x) => (x.name === row.name ? { ...x, [kanbanField]: newValue } : x)));
    try {
      await frappe.updateDoc(doctype, row.name, { [kanbanField]: newValue });
    } catch {
      // Revert on failure — the backend's own validation (status transition
      // rules etc.) is the source of truth, not an optimistic client guess.
      setRows((r) => r.map((x) => (x.name === row.name ? { ...x, [kanbanField]: prev } : x)));
    } finally {
      setMovingName(null);
    }
  };

  const goToRecord = (name: string) => router.push(withTenant(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, tenantCode));

  if (loading) return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const cardsInCol = buckets.get(col.value) || [];
        return (
          <div
            key={col.value}
            className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const row = rows.find((r) => r.name === dragName);
              if (row) moveCard(row, col.value);
              setDragName(null);
            }}
          >
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <span className="text-sm font-semibold">{col.label}</span>
              <Badge variant="default">{cardsInCol.length}</Badge>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2" style={{ minHeight: 80 }}>
              {cardsInCol.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">No records</p>
              )}
              {cardsInCol.map((row) => (
                <div
                  key={row.name}
                  draggable
                  onDragStart={() => setDragName(row.name)}
                  onDragEnd={() => setDragName(null)}
                  onClick={() => goToRecord(row.name)}
                  className="cursor-pointer rounded-md border bg-card p-3 text-sm shadow-elevation-xs transition-smooth hover:-translate-y-0.5 hover:shadow-elevation-sm"
                  style={{ opacity: movingName === row.name ? 0.5 : 1 }}
                >
                  <p className="font-medium leading-snug text-primary">{row.name}</p>
                  {titleField && row[titleField] ? (
                    <p className="mt-0.5 truncate text-foreground">{String(row[titleField])}</p>
                  ) : null}
                  {subtitleField && row[subtitleField] ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{String(row[subtitleField])}</p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between">
                    {amountField && row[amountField] != null ? (
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        {formatCurrency(Number(row[amountField]))}
                      </span>
                    ) : (
                      <span />
                    )}
                    {row.modified ? (
                      <span className="text-[11px] text-muted-foreground">{formatDate(String(row.modified))}</span>
                    ) : null}
                  </div>
                  <select
                    className="mt-2 w-full rounded border border-input bg-background px-1.5 py-1 text-xs"
                    value={String(row[kanbanField] ?? '')}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => moveCard(row, e.target.value)}
                    disabled={movingName === row.name}
                  >
                    {columns.map((c) => (
                      <option key={c.value} value={c.value}>
                        Move to: {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
