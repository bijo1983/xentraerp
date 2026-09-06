'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function OpportunitiesPage() {
  return <DoctypeList title="Opportunities" doctype="Opportunity" newLabel="New Opportunity"
    fields={['name', 'opportunity_from', 'party_name', 'status', 'expected_closing', 'opportunity_amount']}
    cols={[
      { key: 'name', header: 'ID', type: 'link' },
      { key: 'party_name', header: 'Party' },
      { key: 'status', header: 'Status', type: 'badge', badgeColors: { Open: 'bg-blue-100 text-blue-800', Converted: 'bg-green-100 text-green-800', Lost: 'bg-red-100 text-red-800' } },
      { key: 'expected_closing', header: 'Closing Date', type: 'date' },
      { key: 'opportunity_amount', header: 'Amount', type: 'currency' },
    ]} />;
}
