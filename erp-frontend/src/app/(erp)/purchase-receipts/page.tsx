'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function PurchaseReceiptsPage() {
  return <DoctypeList title="Purchase Receipts" doctype="Purchase Receipt" newLabel="New Purchase Receipt"
    fields={['name', 'supplier', 'posting_date', 'grand_total', 'status']}
    cols={[
      { key: 'name', header: 'ID', type: 'link' },
      { key: 'supplier', header: 'Supplier' },
      { key: 'posting_date', header: 'Date', type: 'date' },
      { key: 'grand_total', header: 'Total', type: 'currency' },
      { key: 'status', header: 'Status', type: 'badge', badgeColors: { Draft: 'bg-gray-100 text-gray-800', 'To Bill': 'bg-yellow-100 text-yellow-800', Completed: 'bg-green-100 text-green-800', Cancelled: 'bg-red-100 text-red-800' } },
    ]} />;
}
