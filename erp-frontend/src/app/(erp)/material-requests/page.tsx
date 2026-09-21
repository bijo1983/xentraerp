'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
import { STATUS_TONE } from '@/lib/utils';

const STATUSES = ['Draft', 'Submitted', 'Stopped', 'Cancelled', 'Pending', 'Partially Ordered', 'Ordered', 'Issued', 'Transferred', 'Received'];

const COLORS: Record<string, string> = {
  Draft: STATUS_TONE.neutral,
  Submitted: STATUS_TONE.progress,
  Pending: STATUS_TONE.warning,
  'Partially Ordered': STATUS_TONE.warning,
  Ordered: STATUS_TONE.progress,
  Issued: STATUS_TONE.progress,
  Transferred: STATUS_TONE.success,
  Received: STATUS_TONE.success,
  Stopped: STATUS_TONE.danger,
  Cancelled: STATUS_TONE.danger,
};

export default function MaterialRequestsPage() {
  return (
    <DoctypeList
      title="Material Requests"
      doctype="Material Request"
      newLabel="New Material Request"
      searchField="name"
      searchPlaceholder="Search material requests…"
      fields={['name', 'material_request_type', 'transaction_date', 'status']}
      cols={[
        { key: 'name', header: 'ID', type: 'link' },
        { key: 'material_request_type', header: 'Type' },
        { key: 'transaction_date', header: 'Date', type: 'date' },
        { key: 'status', header: 'Status', type: 'badge', badgeColors: COLORS },
      ]}
      filters={[{ key: 'status', label: 'Status', options: STATUSES }]}
    />
  );
}
