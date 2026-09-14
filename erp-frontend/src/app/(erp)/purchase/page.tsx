'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground',
  'On Hold': 'bg-warning/10 text-warning',
  'To Receive and Bill': 'bg-accent text-accent-foreground',
  'To Bill': 'bg-accent text-accent-foreground',
  'To Receive': 'bg-accent text-accent-foreground',
  Completed: 'bg-success/10 text-success',
  Delivered: 'bg-success/10 text-success',
  Cancelled: 'bg-destructive/10 text-destructive',
  Closed: 'bg-muted text-muted-foreground',
};

export default function PurchasePage() {
  return (
    <DoctypeList
      title="Purchase Orders"
      doctype="Purchase Order"
      newLabel="New Purchase Order"
      searchField="supplier"
      searchPlaceholder="Search by supplier…"
      fields={['name', 'supplier', 'transaction_date', 'grand_total', 'status']}
      cols={[
        { key: 'name', header: 'Order ID', type: 'link' },
        { key: 'supplier', header: 'Supplier' },
        { key: 'transaction_date', header: 'Date', type: 'date' },
        { key: 'grand_total', header: 'Total', type: 'currency', align: 'right' },
        { key: 'status', header: 'Status', type: 'badge', badgeColors: STATUS_COLORS },
      ]}
      filters={[
        {
          key: 'status',
          label: 'Status',
          options: ['Draft', 'On Hold', 'To Receive and Bill', 'To Bill', 'To Receive', 'Completed', 'Cancelled', 'Closed', 'Delivered'],
        },
      ]}
      kanbanField="status"
      kanbanTitleField="supplier"
      kanbanAmountField="grand_total"
    />
  );
}
