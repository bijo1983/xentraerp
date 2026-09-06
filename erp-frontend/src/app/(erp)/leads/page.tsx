'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function LeadsPage() {
  return <DoctypeList title="Leads" doctype="Lead" newLabel="New Lead"
    fields={['name', 'lead_name', 'company_name', 'status', 'lead_owner']}
    cols={[
      { key: 'name', header: 'ID', type: 'link' },
      { key: 'lead_name', header: 'Name' },
      { key: 'company_name', header: 'Company' },
      { key: 'status', header: 'Status', type: 'badge', badgeColors: { Open: 'bg-blue-100 text-blue-800', Converted: 'bg-green-100 text-green-800', 'Do Not Contact': 'bg-red-100 text-red-800' } },
      { key: 'lead_owner', header: 'Owner' },
    ]} />;
}
