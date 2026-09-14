'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground',
  'On Hold': 'bg-warning/10 text-warning',
  'To Deliver and Bill': 'bg-accent text-accent-foreground',
  'To Bill': 'bg-accent text-accent-foreground',
  'To Deliver': 'bg-accent text-accent-foreground',
  Completed: 'bg-success/10 text-success',
  Cancelled: 'bg-destructive/10 text-destructive',
  Closed: 'bg-muted text-muted-foreground',
};

export default function SalesPage() {
  return (
    <DoctypeList
      title="Sales Orders"
      doctype="Sales Order"
      newLabel="New Sales Order"
      searchField="customer"
      searchPlaceholder="Search by customer…"
      fields={['name', 'customer', 'transaction_date', 'grand_total', 'status']}
      cols={[
        { key: 'name', header: 'Order ID', type: 'link' },
        { key: 'customer', header: 'Customer' },
        { key: 'transaction_date', header: 'Date', type: 'date' },
        { key: 'grand_total', header: 'Total', type: 'currency', align: 'right' },
        { key: 'status', header: 'Status', type: 'badge', badgeColors: STATUS_COLORS },
      ]}
      filters={[
        {
          key: 'status',
          label: 'Status',
          options: ['Draft', 'On Hold', 'To Deliver and Bill', 'To Bill', 'To Deliver', 'Completed', 'Cancelled', 'Closed'],
        },
      ]}
    />
  );
}
