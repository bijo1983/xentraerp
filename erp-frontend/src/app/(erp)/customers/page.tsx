'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';

export default function CustomersPage() {
  return (
    <DoctypeList
      title="Customers"
      doctype="Customer"
      newLabel="New Customer"
      searchField="customer_name"
      searchPlaceholder="Search customers…"
      fields={['name', 'customer_name', 'customer_group', 'territory']}
      cols={[
        { key: 'name', header: 'ID', type: 'link' },
        { key: 'customer_name', header: 'Name' },
        { key: 'customer_group', header: 'Group' },
        { key: 'territory', header: 'Territory' },
      ]}
    />
  );
}
