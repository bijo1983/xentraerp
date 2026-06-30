'use client';

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { useFrappeList } from '@/hooks/use-frappe-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BinRow {
  name: string;
  item_code: string;
  warehouse: string;
  actual_qty: number;
  projected_qty: number;
}

const columnHelper = createColumnHelper<BinRow>();

export default function InventoryPage() {
  const { data, loading, total, page, setPage, pageSize } = useFrappeList<BinRow>({
    doctype: 'Bin',
    fields: ['name', 'item_code', 'warehouse', 'actual_qty', 'projected_qty'],
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('item_code', { header: 'Item' }),
      columnHelper.accessor('warehouse', { header: 'Warehouse' }),
      columnHelper.accessor('actual_qty', { header: 'Actual Qty' }),
      columnHelper.accessor('projected_qty', { header: 'Projected Qty' }),
    ],
    []
  );

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Inventory</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {total} stock entr{total !== 1 ? 'ies' : 'y'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">Loading...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b">
                        {hg.headers.map((h) => (
                          <th key={h.id} className="px-4 py-3 text-left font-medium text-muted-foreground">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="border-b hover:bg-muted/50">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {Math.ceil(total / pageSize)}
                </span>
                <div className="flex gap-2">
                  <button
                    className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 0}
                  >
                    Previous
                  </button>
                  <button
                    className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                    onClick={() => setPage(page + 1)}
                    disabled={(page + 1) * pageSize >= total}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
