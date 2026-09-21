'use client';
import { DoctypeList } from '@/components/dynamic/doctype-list';

export default function ItemsPage() {
  return (
    <DoctypeList
      title="Items"
      doctype="Item"
      newLabel="New Item"
      searchField="item_name"
      searchPlaceholder="Search items…"
      fields={['name', 'item_name', 'item_group', 'stock_uom', 'standard_rate']}
      cols={[
        { key: 'name', header: 'Item Code', type: 'link' },
        { key: 'item_name', header: 'Name' },
        { key: 'item_group', header: 'Group' },
        { key: 'stock_uom', header: 'UOM' },
        { key: 'standard_rate', header: 'Rate', type: 'currency', align: 'right' },
      ]}
    />
  );
}
