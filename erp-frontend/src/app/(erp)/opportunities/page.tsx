'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
import { STATUS_TONE } from '@/lib/utils';

const STATUSES = ['Open', 'Quotation', 'Converted', 'Lost', 'Replied', 'Closed'];

const COLORS: Record<string, string> = {
  Open: STATUS_TONE.progress,
  Quotation: STATUS_TONE.progress,
  Replied: STATUS_TONE.progress,
  Converted: STATUS_TONE.success,
  Lost: STATUS_TONE.danger,
  Closed: STATUS_TONE.neutral,
};

export default function OpportunitiesPage() {
  return (
    <DoctypeList
      title="Opportunities"
      doctype="Opportunity"
      newLabel="New Opportunity"
      searchField="party_name"
      searchPlaceholder="Search by party…"
      fields={['name', 'opportunity_from', 'party_name', 'status', 'expected_closing', 'opportunity_amount']}
      cols={[
        { key: 'name', header: 'ID', type: 'link' },
        { key: 'party_name', header: 'Party' },
        { key: 'status', header: 'Status', type: 'badge', badgeColors: COLORS },
        { key: 'expected_closing', header: 'Closing Date', type: 'date' },
        { key: 'opportunity_amount', header: 'Amount', type: 'currency', align: 'right' },
      ]}
      filters={[{ key: 'status', label: 'Status', options: STATUSES }]}
      kanbanField="status"
      kanbanTitleField="party_name"
      kanbanAmountField="opportunity_amount"
    />
  );
}
