'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
import { STATUS_TONE } from '@/lib/utils';

const STATUSES = [
  'Draft', 'Return', 'Debit Note Issued', 'Submitted', 'Paid', 'Partly Paid',
  'Unpaid', 'Overdue', 'Cancelled', 'Internal Transfer',
];

const COLORS: Record<string, string> = {
  Draft: STATUS_TONE.neutral,
  Submitted: STATUS_TONE.progress,
  Paid: STATUS_TONE.success,
  'Partly Paid': STATUS_TONE.warning,
  Unpaid: STATUS_TONE.warning,
  Overdue: STATUS_TONE.danger,
  Cancelled: STATUS_TONE.danger,
  Return: STATUS_TONE.neutral,
  'Debit Note Issued': STATUS_TONE.neutral,
  'Internal Transfer': STATUS_TONE.progress,
};

export default function PurchaseInvoicesPage() {
  return (
    <DoctypeList
      title="Purchase Invoices"
      doctype="Purchase Invoice"
      newLabel="New Purchase Invoice"
      searchField="supplier"
      searchPlaceholder="Search by supplier…"
      fields={['name', 'supplier', 'posting_date', 'grand_total', 'outstanding_amount', 'status']}
      cols={[
        { key: 'name', header: 'Invoice', type: 'link' },
        { key: 'supplier', header: 'Supplier' },
        { key: 'posting_date', header: 'Date', type: 'date' },
        { key: 'grand_total', header: 'Total', type: 'currency', align: 'right' },
        { key: 'outstanding_amount', header: 'Outstanding', type: 'currency', align: 'right' },
        { key: 'status', header: 'Status', type: 'badge', badgeColors: COLORS },
      ]}
      filters={[{ key: 'status', label: 'Status', options: STATUSES }]}
    />
  );
}
