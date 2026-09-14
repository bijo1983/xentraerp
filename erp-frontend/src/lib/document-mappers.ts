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
}

export const DOCUMENT_MAPPERS: Record<string, DocumentMapper[]> = {
  Lead: [
    { label: 'Opportunity', targetDoctype: 'Opportunity', method: 'erpnext.crm.doctype.lead.lead.make_opportunity' },
    { label: 'Customer', targetDoctype: 'Customer', method: 'erpnext.crm.doctype.lead.lead.make_customer' },
  ],
  Opportunity: [
    { label: 'Quotation', targetDoctype: 'Quotation', method: 'erpnext.crm.doctype.opportunity.opportunity.make_quotation' },
  ],
  Quotation: [
    { label: 'Sales Order', targetDoctype: 'Sales Order', method: 'erpnext.selling.doctype.quotation.quotation.make_sales_order' },
  ],
  'Sales Order': [
    { label: 'Delivery Note', targetDoctype: 'Delivery Note', method: 'erpnext.selling.doctype.sales_order.sales_order.make_delivery_note' },
    { label: 'Sales Invoice', targetDoctype: 'Sales Invoice', method: 'erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice' },
  ],
  'Delivery Note': [
    { label: 'Sales Invoice', targetDoctype: 'Sales Invoice', method: 'erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice' },
  ],
  'Material Request': [
    { label: 'Purchase Order', targetDoctype: 'Purchase Order', method: 'erpnext.stock.doctype.material_request.material_request.make_purchase_order' },
    { label: 'Stock Entry', targetDoctype: 'Stock Entry', method: 'erpnext.stock.doctype.material_request.material_request.make_stock_entry' },
  ],
  'Purchase Order': [
    { label: 'Purchase Receipt', targetDoctype: 'Purchase Receipt', method: 'erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt' },
    { label: 'Purchase Invoice', targetDoctype: 'Purchase Invoice', method: 'erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice' },
  ],
  'Purchase Receipt': [
    { label: 'Purchase Invoice', targetDoctype: 'Purchase Invoice', method: 'erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice' },
  ],
};
