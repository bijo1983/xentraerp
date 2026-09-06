'use client';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { useFrappeList } from '@/hooks/use-frappe-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Row { name: string; item_code: string; warehouse: string; actual_qty: number; }
const col = createColumnHelper<Row>();

export default function InventoryPage() {
  const router = useRouter();
  const { data, loading, total, page, setPage, pageSize } = useFrappeList<Row>({
    doctype: 'Bin',
    fields: ['name', 'item_code', 'warehouse', 'actual_qty'],
  });

  const columns = useMemo(() => [
    col.accessor('item_code', { header: 'Item', cell: (i) => <button className="text-primary hover:underline" onClick={() => router.push(`/app/Item/${encodeURIComponent(i.getValue())}`)}>{i.getValue()}</button> }),
    col.accessor('warehouse', { header: 'Warehouse' }),
    col.accessor('actual_qty', { header: 'Qty on Hand', cell: (i) => i.getValue()?.toLocaleString() ?? '0' }),
  ], [router]);

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Inventory</h2>
        <Button onClick={() => router.push('/app/Stock%20Entry/new')}>New Stock Entry</Button>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{total} bin{total !== 1 ? 's' : ''}</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="flex h-32 items-center justify-center">Loading…</div> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>{table.getHeaderGroups().map(hg => <tr key={hg.id} className="border-b">{hg.headers.map(h => <th key={h.id} className="px-4 py-3 text-left font-medium text-muted-foreground">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
                  <tbody>{table.getRowModel().rows.map(row => <tr key={row.id} className="border-b hover:bg-muted/50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-4 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
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
