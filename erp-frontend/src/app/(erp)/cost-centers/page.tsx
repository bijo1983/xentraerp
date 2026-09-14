'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
import { STATUS_TONE } from '@/lib/utils';

const GROUP_COLORS: Record<string, string> = { '1': STATUS_TONE.progress, '0': STATUS_TONE.neutral };
const GROUP_LABELS: Record<string, string> = { '1': 'Group', '0': 'Ledger' };

export default function CostCentersPage() {
  return (
    <DoctypeList
      title="Cost Centers"
      doctype="Cost Center"
      newLabel="New Cost Center"
      searchField="cost_center_name"
      searchPlaceholder="Search cost centers…"
      fields={['name', 'cost_center_name', 'parent_cost_center', 'is_group']}
      cols={[
        { key: 'name', header: 'Cost Center', type: 'link' },
        { key: 'parent_cost_center', header: 'Parent' },
        { key: 'is_group', header: 'Kind', type: 'badge', badgeColors: GROUP_COLORS },
      ]}
      filters={[
        {
          key: 'is_group',
          label: 'Kind',
          options: Object.entries(GROUP_LABELS).map(([value, label]) => ({ value, label })),
        },
      ]}
    />
  );
}
