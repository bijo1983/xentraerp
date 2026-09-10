'use client';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { useFrappeList } from '@/hooks/use-frappe-list';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTenantCode, withTenant } from '@/lib/tenant';

export interface ColDef {
  key: string;
  header: string;
  type?: 'date' | 'currency' | 'badge' | 'link';
  badgeColors?: Record<string, string>;
}

interface Props {
  title: string;
  doctype: string;
  fields: string[];
  cols: ColDef[];
  newLabel?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const col = createColumnHelper<any>();

export function DoctypeList({ title, doctype, fields, cols, newLabel }: Props) {
  const router = useRouter();
  const tenantCode = useTenantCode();
  const { data, loading, error, total, page, setPage, pageSize } = useFrappeList<Record<string, unknown>>({ doctype, fields });

  const columns = useMemo(() =>
    cols.map((c) =>
      col.accessor(c.key, {
        header: c.header,
        cell: (info) => {
          const v = info.getValue() as string;
          if (c.type === 'date') return formatDate(v);
          if (c.type === 'currency') return formatCurrency(Number(v));
          if (c.type === 'badge') {
            const cls = c.badgeColors?.[v] || 'bg-muted text-muted-foreground';
            return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{v}</span>;
          }
          if (c.type === 'link') {
            return <button className="text-primary hover:underline text-left" onClick={() => router.push(withTenant(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(v)}`, tenantCode))}>{v}</button>;
          }
          return v ?? '';
        },
      })
    ),
  [cols, router, doctype, tenantCode]);

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        {newLabel && <Button onClick={() => router.push(withTenant(`/app/${encodeURIComponent(doctype)}/new`, tenantCode))}>+ {newLabel}</Button>}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{total} record{total !== 1 ? 's' : ''}</CardTitle></CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          {loading ? <div className="flex h-32 items-center justify-center">Loading…</div> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>{table.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="border-b">
                      {hg.headers.map(h => <th key={h.id} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}
                    </tr>
                  ))}</thead>
                  <tbody>{table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => { const n = row.original.name as string; router.push(withTenant(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(n)}`, tenantCode)); }}>
                      {row.getVisibleCells().map(cell => <td key={cell.id} className="px-4 py-3" onClick={(e) => e.stopPropagation()}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 0}>Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={(page + 1) * pageSize >= total}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
