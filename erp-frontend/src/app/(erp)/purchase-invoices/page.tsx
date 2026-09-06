'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function PurchaseInvoicesPage() {
  return <DoctypeList title="Purchase Invoices" doctype="Purchase Invoice" newLabel="New Purchase Invoice"
    fields={['name', 'supplier', 'posting_date', 'grand_total', 'outstanding_amount', 'status']}
    cols={[
      { key: 'name', header: 'Invoice', type: 'link' },
      { key: 'supplier', header: 'Supplier' },
      { key: 'posting_date', header: 'Date', type: 'date' },
      { key: 'grand_total', header: 'Total', type: 'currency' },
      { key: 'outstanding_amount', header: 'Outstanding', type: 'currency' },
      { key: 'status', header: 'Status', type: 'badge', badgeColors: { Draft: 'bg-gray-100 text-gray-800', Unpaid: 'bg-yellow-100 text-yellow-800', Paid: 'bg-green-100 text-green-800', Overdue: 'bg-red-100 text-red-800', Cancelled: 'bg-red-100 text-red-800' } },
    ]} />;
}
