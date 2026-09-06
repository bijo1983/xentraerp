'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function QuotationsPage() {
  return <DoctypeList title="Quotations" doctype="Quotation" newLabel="New Quotation"
    fields={['name', 'party_name', 'transaction_date', 'grand_total', 'status']}
    cols={[
      { key: 'name', header: 'ID', type: 'link' },
      { key: 'party_name', header: 'Customer/Lead' },
      { key: 'transaction_date', header: 'Date', type: 'date' },
      { key: 'grand_total', header: 'Total', type: 'currency' },
      { key: 'status', header: 'Status', type: 'badge', badgeColors: { Draft: 'bg-gray-100 text-gray-800', Open: 'bg-blue-100 text-blue-800', Ordered: 'bg-green-100 text-green-800', Cancelled: 'bg-red-100 text-red-800' } },
    ]} />;
}
