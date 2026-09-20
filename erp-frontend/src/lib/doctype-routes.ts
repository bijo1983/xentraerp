// Maps a doctype to the curated top-level list page for it, where one
// exists (nicer columns, status filters, kanban, ...) — kept in sync with
// each page's own `doctype="..."` prop (see the `(erp)/*/page.tsx` files).
// Anything not listed here still has a working list at the generic
// `/app/<doctype>` route (`(erp)/app/[doctype]/page.tsx`), just without the
// hand-curated column set. Used for deep-linking into a filtered list (e.g.
// "the 3 Sales Invoices against this Sales Order") from anywhere in the
// app without hardcoding the target path at every call site.
export const DOCTYPE_LIST_ROUTES: Record<string, string> = {
  Account: '/chart-of-accounts',
  Customer: '/customers',
  'Cost Center': '/cost-centers',
  'Delivery Note': '/delivery-notes',
  Item: '/items',
  'Journal Entry': '/journal-entries',
  Lead: '/leads',
  'Material Request': '/material-requests',
  Opportunity: '/opportunities',
  'Payment Entry': '/payments',
  'Purchase Invoice': '/purchase-invoices',
  'Purchase Receipt': '/purchase-receipts',
  'Purchase Order': '/purchase',
  Quotation: '/quotations',
  'Sales Order': '/sales',
  'Sales Invoice': '/sales-invoices',
  Supplier: '/suppliers',
};

/** The list route for `doctype` — a curated page if one exists, else the generic `/app/<doctype>` fallback. */
export function doctypeListRoute(doctype: string): string {
  return DOCTYPE_LIST_ROUTES[doctype] || `/app/${encodeURIComponent(doctype)}`;
}
