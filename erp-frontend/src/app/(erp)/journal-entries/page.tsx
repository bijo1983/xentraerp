'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function JournalEntriesPage() {
  return <DoctypeList title="Journal Entries" doctype="Journal Entry" newLabel="New Journal Entry"
    fields={['name', 'voucher_type', 'posting_date', 'total_debit', 'docstatus']}
    cols={[
      { key: 'name', header: 'ID', type: 'link' },
      { key: 'voucher_type', header: 'Type' },
      { key: 'posting_date', header: 'Date', type: 'date' },
      { key: 'total_debit', header: 'Amount', type: 'currency' },
      { key: 'docstatus', header: 'Status', type: 'badge', badgeColors: { '0': 'bg-gray-100 text-gray-800', '1': 'bg-green-100 text-green-800', '2': 'bg-red-100 text-red-800' } },
    ]} />;
}
