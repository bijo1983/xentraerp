'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
import { STATUS_TONE } from '@/lib/utils';

const STATUSES = ['Draft', 'To Bill', 'Completed', 'Return Issued', 'Cancelled', 'Closed'];

const COLORS: Record<string, string> = {
  Draft: STATUS_TONE.neutral,
  'To Bill': STATUS_TONE.warning,
  Completed: STATUS_TONE.success,
  'Return Issued': STATUS_TONE.warning,
  Cancelled: STATUS_TONE.danger,
  Closed: STATUS_TONE.neutral,
};

export default function DeliveryNotesPage() {
  return (
    <DoctypeList
      title="Delivery Notes"
      doctype="Delivery Note"
      newLabel="New Delivery Note"
      searchField="customer"
      searchPlaceholder="Search by customer…"
      fields={['name', 'customer', 'posting_date', 'grand_total', 'status']}
      cols={[
        { key: 'name', header: 'ID', type: 'link' },
        { key: 'customer', header: 'Customer' },
        { key: 'posting_date', header: 'Date', type: 'date' },
        { key: 'grand_total', header: 'Total', type: 'currency', align: 'right' },
        { key: 'status', header: 'Status', type: 'badge', badgeColors: COLORS },
      ]}
      filters={[{ key: 'status', label: 'Status', options: STATUSES }]}
    />
  );
}
