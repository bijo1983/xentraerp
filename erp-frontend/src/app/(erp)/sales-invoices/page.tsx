'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
import { STATUS_TONE } from '@/lib/utils';

const STATUSES = [
  'Draft', 'Return', 'Credit Note Issued', 'Submitted', 'Paid', 'Partly Paid',
  'Unpaid', 'Unpaid and Discounted', 'Partly Paid and Discounted',
  'Overdue and Discounted', 'Overdue', 'Cancelled', 'Internal Transfer',
];

const COLORS: Record<string, string> = {
  Draft: STATUS_TONE.neutral,
  Submitted: STATUS_TONE.progress,
  Paid: STATUS_TONE.success,
  'Partly Paid': STATUS_TONE.warning,
  Unpaid: STATUS_TONE.warning,
  'Unpaid and Discounted': STATUS_TONE.warning,
  'Partly Paid and Discounted': STATUS_TONE.warning,
  'Overdue and Discounted': STATUS_TONE.danger,
  Overdue: STATUS_TONE.danger,
  Cancelled: STATUS_TONE.danger,
  Return: STATUS_TONE.neutral,
  'Credit Note Issued': STATUS_TONE.neutral,
  'Internal Transfer': STATUS_TONE.progress,
};

export default function SalesInvoicesPage() {
  return (
    <DoctypeList
      title="Sales Invoices"
      doctype="Sales Invoice"
      newLabel="New Sales Invoice"
      searchField="customer"
      searchPlaceholder="Search by customer…"
      fields={['name', 'customer', 'posting_date', 'grand_total', 'outstanding_amount', 'status']}
      cols={[
        { key: 'name', header: 'Invoice', type: 'link' },
        { key: 'customer', header: 'Customer' },
        { key: 'posting_date', header: 'Date', type: 'date' },
        { key: 'grand_total', header: 'Total', type: 'currency', align: 'right' },
        { key: 'outstanding_amount', header: 'Outstanding', type: 'currency', align: 'right' },
        { key: 'status', header: 'Status', type: 'badge', badgeColors: COLORS },
      ]}
      filters={[{ key: 'status', label: 'Status', options: STATUSES }]}
    />
  );
}
