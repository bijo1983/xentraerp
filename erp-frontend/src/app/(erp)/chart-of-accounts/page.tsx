'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function ChartOfAccountsPage() {
  return <DoctypeList title="Chart of Accounts" doctype="Account" newLabel="New Account"
    fields={['name', 'account_type', 'root_type', 'account_currency', 'is_group']}
    cols={[
      { key: 'name', header: 'Account', type: 'link' },
      { key: 'root_type', header: 'Root Type' },
      { key: 'account_type', header: 'Account Type' },
      { key: 'account_currency', header: 'Currency' },
      { key: 'is_group', header: 'Group', type: 'badge', badgeColors: { '1': 'bg-blue-100 text-blue-800', '0': 'bg-gray-100 text-gray-700' } },
    ]} />;
}
