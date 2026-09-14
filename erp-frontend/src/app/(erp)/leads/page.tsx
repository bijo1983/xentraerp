'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
import { STATUS_TONE } from '@/lib/utils';

const STATUSES = ['Lead', 'Open', 'Replied', 'Opportunity', 'Quotation', 'Lost Quotation', 'Interested', 'Converted', 'Do Not Contact'];

const COLORS: Record<string, string> = {
  Lead: STATUS_TONE.neutral,
  Open: STATUS_TONE.progress,
  Replied: STATUS_TONE.progress,
  Opportunity: STATUS_TONE.progress,
  Quotation: STATUS_TONE.progress,
  'Lost Quotation': STATUS_TONE.danger,
  Interested: STATUS_TONE.success,
  Converted: STATUS_TONE.success,
  'Do Not Contact': STATUS_TONE.danger,
};

export default function LeadsPage() {
  return (
    <DoctypeList
      title="Leads"
      doctype="Lead"
      newLabel="New Lead"
      searchField="lead_name"
      searchPlaceholder="Search leads…"
      fields={['name', 'lead_name', 'company_name', 'status', 'lead_owner']}
      cols={[
        { key: 'name', header: 'ID', type: 'link' },
        { key: 'lead_name', header: 'Name' },
        { key: 'company_name', header: 'Company' },
        { key: 'status', header: 'Status', type: 'badge', badgeColors: COLORS },
        { key: 'lead_owner', header: 'Owner' },
      ]}
      filters={[{ key: 'status', label: 'Status', options: STATUSES }]}
    />
  );
}
