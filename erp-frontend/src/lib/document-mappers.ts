// ERPNext's standard "Create >" document-chaining actions (Sales Order ->
// Delivery Note, Quotation -> Sales Order, Purchase Order -> Purchase
// Receipt, ...). Real Frappe Desk determines these from each doctype's own
// client script (.js), which calls a specific whitelisted Python mapper
// function per action — there's no doctype-meta-driven way to discover
// this generically over the REST API, so this table is deliberately
// hand-maintained, covering the core sales/buying/CRM flow. Each entry is
// verified to exist and be `@frappe.whitelist()`-decorated in this bench's
// installed ERPNext version (checked directly against the source, and
// make_delivery_note verified live end-to-end against a real Sales Order).
export interface DocumentMapper {
  label: string;
  targetDoctype: string;
  method: string;
  /**
   * How to call `method`. Most of ERPNext's chaining actions are
   * `get_mapped_doc`-based functions taking a single `source_name` kwarg
   * (the default). Advance/against-document payments instead go through
   * `payment_entry.get_payment_entry(dt, dn, ...)`, a different whitelisted
   * helper that isn't a mapper at all — it needs the source doctype+name as
   * two separate kwargs. Verified against this bench's installed erpnext
   * source (erpnext/accounts/doctype/payment_entry/payment_entry.py).
   */
  paramStyle?: 'source_name' | 'dt_dn' | 'selected_items';
}

export const DOCUMENT_MAPPERS: Record<string, DocumentMapper[]> = {
  Lead: [
    { label: 'Opportunity', targetDoctype: 'Opportunity', method: 'xentraerp.erp.crm.doctype.lead.lead.make_opportunity' },
    { label: 'Customer', targetDoctype: 'Customer', method: 'xentraerp.erp.crm.doctype.lead.lead.make_customer' },
  ],
  Opportunity: [
    { label: 'Quotation', targetDoctype: 'Quotation', method: 'xentraerp.erp.crm.doctype.opportunity.opportunity.make_quotation' },
  ],
  Quotation: [
    { label: 'Sales Order', targetDoctype: 'Sales Order', method: 'xentraerp.erp.selling.doctype.quotation.quotation.make_sales_order' },
  ],
  'Sales Order': [
    { label: 'Delivery Note', targetDoctype: 'Delivery Note', method: 'xentraerp.erp.selling.doctype.sales_order.sales_order.make_delivery_note' },
    { label: 'Sales Invoice', targetDoctype: 'Sales Invoice', method: 'xentraerp.erp.selling.doctype.sales_order.sales_order.make_sales_invoice' },
    { label: 'Material Request', targetDoctype: 'Material Request', method: 'xentraerp.erp.selling.doctype.sales_order.sales_order.make_material_request' },
    { label: 'Payment (Advance)', targetDoctype: 'Payment Entry', method: 'xentraerp.erp.accounts.doctype.payment_entry.payment_entry.get_payment_entry', paramStyle: 'dt_dn' },
    // Drop-ship/procure-for-order flow — unlike the mappers above, this one
    // (erpnext/selling/doctype/sales_order/sales_order.py) requires a
    // `selected_items` list of {item_code} and silently returns nothing
    // without it (see dynamic-form.tsx's createLinkedDocument, which builds
    // it from the Sales Order's own Items table rather than adding a
    // separate row-picker dialog).
    { label: 'Purchase Order', targetDoctype: 'Purchase Order', method: 'xentraerp.erp.selling.doctype.sales_order.sales_order.make_purchase_order', paramStyle: 'selected_items' },
  ],
  'Delivery Note': [
    { label: 'Sales Invoice', targetDoctype: 'Sales Invoice', method: 'xentraerp.erp.stock.doctype.delivery_note.delivery_note.make_sales_invoice' },
  ],
  'Sales Invoice': [
    { label: 'Payment Entry', targetDoctype: 'Payment Entry', method: 'xentraerp.erp.accounts.doctype.payment_entry.payment_entry.get_payment_entry', paramStyle: 'dt_dn' },
    { label: 'Credit Note (Return)', targetDoctype: 'Sales Invoice', method: 'xentraerp.erp.accounts.doctype.sales_invoice.sales_invoice.make_sales_return' },
  ],
  'Material Request': [
    { label: 'Purchase Order', targetDoctype: 'Purchase Order', method: 'xentraerp.erp.stock.doctype.material_request.material_request.make_purchase_order' },
    { label: 'Stock Entry', targetDoctype: 'Stock Entry', method: 'xentraerp.erp.stock.doctype.material_request.material_request.make_stock_entry' },
  ],
  'Purchase Order': [
    { label: 'Purchase Receipt', targetDoctype: 'Purchase Receipt', method: 'xentraerp.erp.buying.doctype.purchase_order.purchase_order.make_purchase_receipt' },
    { label: 'Purchase Invoice', targetDoctype: 'Purchase Invoice', method: 'xentraerp.erp.buying.doctype.purchase_order.purchase_order.make_purchase_invoice' },
    { label: 'Payment (Advance)', targetDoctype: 'Payment Entry', method: 'xentraerp.erp.accounts.doctype.payment_entry.payment_entry.get_payment_entry', paramStyle: 'dt_dn' },
  ],
  'Purchase Receipt': [
    { label: 'Purchase Invoice', targetDoctype: 'Purchase Invoice', method: 'xentraerp.erp.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice' },
  ],
  'Purchase Invoice': [
    { label: 'Payment Entry', targetDoctype: 'Payment Entry', method: 'xentraerp.erp.accounts.doctype.payment_entry.payment_entry.get_payment_entry', paramStyle: 'dt_dn' },
    { label: 'Debit Note (Return)', targetDoctype: 'Purchase Invoice', method: 'xentraerp.erp.accounts.doctype.purchase_invoice.purchase_invoice.make_debit_note' },
  ],
};
