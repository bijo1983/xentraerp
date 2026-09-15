'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';

export default function PaymentsPage() {
  return (
    <DoctypeList
      title="Payments"
      doctype="Payment Entry"
      newLabel="New Payment"
      searchField="party"
      searchPlaceholder="Search by party…"
      fields={['name', 'payment_type', 'party_type', 'party', 'posting_date', 'paid_amount']}
      cols={[
        { key: 'name', header: 'ID', type: 'link' },
        { key: 'payment_type', header: 'Type' },
        { key: 'party_type', header: 'Party Type' },
        { key: 'party', header: 'Party' },
        { key: 'posting_date', header: 'Date', type: 'date' },
        { key: 'paid_amount', header: 'Amount', type: 'currency', align: 'right' },
      ]}
      filters={[
        { key: 'payment_type', label: 'Type', options: ['Receive', 'Pay', 'Internal Transfer'] },
      ]}
    />
  );
}
