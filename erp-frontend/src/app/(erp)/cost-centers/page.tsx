'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function CostCentersPage() {
  return <DoctypeList title="Cost Centers" doctype="Cost Center" newLabel="New Cost Center"
    fields={['name', 'cost_center_name', 'parent_cost_center', 'is_group']}
    cols={[
      { key: 'name', header: 'Cost Center', type: 'link' },
      { key: 'parent_cost_center', header: 'Parent' },
      { key: 'is_group', header: 'Group', type: 'badge', badgeColors: { '1': 'bg-blue-100 text-blue-800', '0': 'bg-gray-100 text-gray-700' } },
    ]} />;
}
