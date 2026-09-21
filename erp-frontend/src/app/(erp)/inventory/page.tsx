'use client';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { useFrappeList } from '@/hooks/use-frappe-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTenantCode, withTenant } from '@/lib/tenant';

interface Row { name: string; item_code: string; warehouse: string; actual_qty: number; }
const col = createColumnHelper<Row>();

export default function InventoryPage() {
  const router = useRouter();
  const tenantCode = useTenantCode();
  const { data, loading, error, total, page, setPage, pageSize } = useFrappeList<Row>({
    doctype: 'Bin',
    fields: ['name', 'item_code', 'warehouse', 'actual_qty'],
  });

  const columns = useMemo(() => [
    col.accessor('item_code', { header: 'Item', cell: (i) => <button className="text-primary hover:underline" onClick={() => router.push(withTenant(`/app/Item/${encodeURIComponent(i.getValue())}`, tenantCode))}>{i.getValue()}</button> }),
    col.accessor('warehouse', { header: 'Warehouse' }),
    col.accessor('actual_qty', { header: 'Qty on Hand', cell: (i) => i.getValue()?.toLocaleString() ?? '0' }),
  ], [router, tenantCode]);

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Inventory</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Live stock on hand across warehouses</p>
        </div>
        <Button className="shadow-elevation-xs" onClick={() => router.push(withTenant('/app/Stock%20Entry/new', tenantCode))}>
          New Stock Entry
        </Button>
      </div>
      <Card className="overflow-hidden">
        <CardHeader className="border-b py-3.5"><CardTitle className="text-sm font-medium text-muted-foreground">{total} bin{total !== 1 ? 's' : ''}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="m-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          {loading ? <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading…</div> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>{table.getHeaderGroups().map(hg => <tr key={hg.id} className="border-b bg-muted/20">{hg.headers.map(h => <th key={h.id} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
                  <tbody>{table.getRowModel().rows.map(row => <tr key={row.id} className="border-b border-border/70 last:border-0 transition-smooth transition-colors hover:bg-accent/40">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-4 py-2.5">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-3">
                <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</span>
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
