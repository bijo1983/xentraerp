'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function MaterialRequestsPage() {
  return <DoctypeList title="Material Requests" doctype="Material Request" newLabel="New Material Request"
    fields={['name', 'material_request_type', 'transaction_date', 'status']}
    cols={[
      { key: 'name', header: 'ID', type: 'link' },
      { key: 'material_request_type', header: 'Type' },
      { key: 'transaction_date', header: 'Date', type: 'date' },
      { key: 'status', header: 'Status', type: 'badge', badgeColors: { Draft: 'bg-gray-100 text-gray-800', Submitted: 'bg-blue-100 text-blue-800', Ordered: 'bg-green-100 text-green-800', Cancelled: 'bg-red-100 text-red-800' } },
    ]} />;
}
