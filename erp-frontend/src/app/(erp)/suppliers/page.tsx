'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';
export default function SuppliersPage() {
  return <DoctypeList title="Suppliers" doctype="Supplier" newLabel="New Supplier"
    fields={['name', 'supplier_name', 'supplier_group', 'supplier_type', 'country']}
    cols={[
      { key: 'name', header: 'ID', type: 'link' },
      { key: 'supplier_name', header: 'Name' },
      { key: 'supplier_group', header: 'Group' },
      { key: 'supplier_type', header: 'Type' },
      { key: 'country', header: 'Country' },
    ]} />;
}
