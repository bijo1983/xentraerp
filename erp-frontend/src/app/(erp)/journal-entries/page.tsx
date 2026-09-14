'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
import { STATUS_TONE } from '@/lib/utils';

// docstatus is a fixed Frappe-wide enum: 0 Draft, 1 Submitted, 2 Cancelled.
const DOCSTATUS_COLORS: Record<string, string> = {
  '0': STATUS_TONE.neutral,
  '1': STATUS_TONE.success,
  '2': STATUS_TONE.danger,
};
const DOCSTATUS_LABELS: Record<string, string> = { '0': 'Draft', '1': 'Submitted', '2': 'Cancelled' };

export default function JournalEntriesPage() {
  return (
    <DoctypeList
      title="Journal Entries"
      doctype="Journal Entry"
      newLabel="New Journal Entry"
      searchField="name"
      searchPlaceholder="Search journal entries…"
      fields={['name', 'voucher_type', 'posting_date', 'total_debit', 'docstatus']}
      cols={[
        { key: 'name', header: 'ID', type: 'link' },
        { key: 'voucher_type', header: 'Type' },
        { key: 'posting_date', header: 'Date', type: 'date' },
        { key: 'total_debit', header: 'Amount', type: 'currency', align: 'right' },
        { key: 'docstatus', header: 'Status', type: 'badge', badgeColors: DOCSTATUS_COLORS },
      ]}
      filters={[
        {
          key: 'docstatus',
          label: 'Status',
          options: Object.entries(DOCSTATUS_LABELS).map(([value, label]) => ({ value, label })),
        },
      ]}
    />
  );
}
