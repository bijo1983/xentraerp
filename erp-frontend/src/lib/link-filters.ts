// Desk narrows most link fields with per-doctype set_query scripts. The
// generic part of that: records belonging to another company, and group
// (non-leaf) nodes of tree masters, can't be used on a transaction.
const COMPANY_SCOPED = new Set([
  'Account', 'Cost Center', 'Warehouse', 'Bank Account', 'Sales Taxes and Charges Template',
  'Purchase Taxes and Charges Template', 'Item Tax Template', 'POS Profile', 'Asset',
]);
const LEAF_ONLY = new Set(['Account', 'Cost Center', 'Warehouse', 'Customer Group', 'Supplier Group', 'Territory', 'Sales Person']);
const TREE_EDITORS = new Set(['Account', 'Cost Center', 'Warehouse', 'Customer Group', 'Supplier Group', 'Territory', 'Sales Person', 'Item Group']);

export function linkFilters(target: string, doc: Record<string, unknown>): Record<string, unknown> | undefined {
  // A tree master's own form picks its parent, which must be a group.
  if (TREE_EDITORS.has(String(doc.doctype || '')) && String(doc.doctype) === target) return { is_group: 1 };
  const filters: Record<string, unknown> = {};
  if (COMPANY_SCOPED.has(target) && typeof doc.company === 'string' && doc.company) filters.company = doc.company;
  if (LEAF_ONLY.has(target)) filters.is_group = 0;
  return Object.keys(filters).length ? filters : undefined;
}
