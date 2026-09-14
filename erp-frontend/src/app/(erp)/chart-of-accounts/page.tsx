'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
import { STATUS_TONE } from '@/lib/utils';

const GROUP_COLORS: Record<string, string> = { '1': STATUS_TONE.progress, '0': STATUS_TONE.neutral };
const GROUP_LABELS: Record<string, string> = { '1': 'Group', '0': 'Ledger' };

export default function ChartOfAccountsPage() {
  return (
    <DoctypeList
      title="Chart of Accounts"
      doctype="Account"
      newLabel="New Account"
      searchField="name"
      searchPlaceholder="Search accounts…"
      fields={['name', 'account_type', 'root_type', 'account_currency', 'is_group']}
      cols={[
        { key: 'name', header: 'Account', type: 'link' },
        { key: 'root_type', header: 'Root Type' },
        { key: 'account_type', header: 'Account Type' },
        { key: 'account_currency', header: 'Currency' },
        { key: 'is_group', header: 'Kind', type: 'badge', badgeColors: GROUP_COLORS },
      ]}
      filters={[
        { key: 'root_type', label: 'Root Type', options: ['Asset', 'Liability', 'Equity', 'Income', 'Expense'] },
        {
          key: 'is_group',
          label: 'Kind',
          options: Object.entries(GROUP_LABELS).map(([value, label]) => ({ value, label })),
        },
      ]}
    />
  );
}
