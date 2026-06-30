'use client';

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { useFrappeList } from '@/hooks/use-frappe-list';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PurchaseOrderRow {
  name: string;
  supplier: string;
  transaction_date: string;
  grand_total: number;
  status: string;
}

const columnHelper = createColumnHelper<PurchaseOrderRow>();

export default function PurchasePage() {
  const { data, loading, total, page, setPage, pageSize } = useFrappeList<PurchaseOrderRow>({
    doctype: 'Purchase Order',
    fields: ['name', 'supplier', 'transaction_date', 'grand_total', 'status'],
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', { header: 'Order ID' }),
      columnHelper.accessor('supplier', { header: 'Supplier' }),
      columnHelper.accessor('transaction_date', {
        header: 'Date',
        cell: (info) => formatDate(info.getValue()),
      }),
      columnHelper.accessor('grand_total', {
        header: 'Total',
        cell: (info) => formatCurrency(info.getValue()),
      }),
      columnHelper.accessor('status', { header: 'Status' }),
    ],
    []
  );

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Purchase Orders</h2>
        <Button>New Purchase Order</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {total} order{total !== 1 ? 's' : ''}
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
                  <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 0}>
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={(page + 1) * pageSize >= total}
                  >
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
