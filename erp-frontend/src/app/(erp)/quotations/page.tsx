'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
import { STATUS_TONE } from '@/lib/utils';

const STATUSES = ['Draft', 'Open', 'Replied', 'Partially Ordered', 'Ordered', 'Lost', 'Cancelled', 'Expired'];

const COLORS: Record<string, string> = {
  Draft: STATUS_TONE.neutral,
  Open: STATUS_TONE.progress,
  Replied: STATUS_TONE.progress,
  'Partially Ordered': STATUS_TONE.warning,
  Ordered: STATUS_TONE.success,
  Lost: STATUS_TONE.danger,
  Cancelled: STATUS_TONE.danger,
  Expired: STATUS_TONE.neutral,
};

export default function QuotationsPage() {
  return (
    <DoctypeList
      title="Quotations"
      doctype="Quotation"
      newLabel="New Quotation"
      searchField="party_name"
      searchPlaceholder="Search by customer/lead…"
      fields={['name', 'party_name', 'transaction_date', 'grand_total', 'status']}
      cols={[
        { key: 'name', header: 'ID', type: 'link' },
        { key: 'party_name', header: 'Customer/Lead' },
        { key: 'transaction_date', header: 'Date', type: 'date' },
        { key: 'grand_total', header: 'Total', type: 'currency', align: 'right' },
        { key: 'status', header: 'Status', type: 'badge', badgeColors: COLORS },
      ]}
      filters={[{ key: 'status', label: 'Status', options: STATUSES }]}
    />
  );
}
