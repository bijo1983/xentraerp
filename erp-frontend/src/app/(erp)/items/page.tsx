'use client';

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { useFrappeList } from '@/hooks/use-frappe-list';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ItemRow {
  name: string;
  item_name: string;
  item_group: string;
  stock_uom: string;
  standard_rate: number;
}

const columnHelper = createColumnHelper<ItemRow>();

export default function ItemsPage() {
  const { data, loading, total, page, setPage, pageSize } = useFrappeList<ItemRow>({
    doctype: 'Item',
    fields: ['name', 'item_name', 'item_group', 'stock_uom', 'standard_rate'],
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', { header: 'Item Code' }),
      columnHelper.accessor('item_name', { header: 'Name' }),
      columnHelper.accessor('item_group', { header: 'Group' }),
      columnHelper.accessor('stock_uom', { header: 'UOM' }),
      columnHelper.accessor('standard_rate', {
        header: 'Rate',
        cell: (info) => formatCurrency(info.getValue()),
      }),
    ],
    []
  );

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Items</h2>
        <Button>New Item</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{total} item{total !== 1 ? 's' : ''}</CardTitle>
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
                  <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 0}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={(page + 1) * pageSize >= total}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
