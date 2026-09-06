'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function DeliveryNotesPage() {
  return <DoctypeList title="Delivery Notes" doctype="Delivery Note" newLabel="New Delivery Note"
    fields={['name', 'customer', 'posting_date', 'grand_total', 'status']}
    cols={[
      { key: 'name', header: 'ID', type: 'link' },
      { key: 'customer', header: 'Customer' },
      { key: 'posting_date', header: 'Date', type: 'date' },
      { key: 'grand_total', header: 'Total', type: 'currency' },
      { key: 'status', header: 'Status', type: 'badge', badgeColors: { Draft: 'bg-gray-100 text-gray-800', 'To Bill': 'bg-yellow-100 text-yellow-800', Completed: 'bg-green-100 text-green-800', Cancelled: 'bg-red-100 text-red-800' } },
    ]} />;
}
