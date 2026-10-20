"""Backing for the ERP frontend's document forms.

Frappe Desk gets most of its form behaviour from per-doctype client scripts:
defaults on a new document, a customer's address/price list/taxes landing on
the form when the customer is picked, an item's rate/UOM/warehouse when the
item is picked, fetch_from values, and totals that update as lines change.
The ERP frontend renders forms generically from the doctype meta and can't run
those scripts, so it asks the server instead: the same ERPNext controller code
those scripts end up calling (`get_party_details`, `set_missing_values`,
`calculate_taxes_and_totals`, ...) runs on an unsaved copy of the document and
the filled-in copy is sent back. Nothing is written — every refresh runs
inside a savepoint that is always rolled back.
"""

import inspect
import json

import frappe
from frappe import _

# Header fields that, when changed, re-pull party details (address, contact,
# currency, price list, taxes template, payment terms) the way Desk does.
PARTY_FIELDS = {
	"customer": "Customer",
	"supplier": "Supplier",
}

# Changing one of these re-prices every line from the (new) price list.
PRICE_FIELDS = {"selling_price_list", "buying_price_list", "currency", "price_list_currency"}

# Line fields derived from the item; cleared when a line's item changes so
# ERPNext fills them for the new item instead of keeping the old item's values.
ITEM_DERIVED = (
	"item_name", "description", "image", "item_group", "brand", "uom", "stock_uom",
	"conversion_factor", "price_list_rate", "base_price_list_rate", "rate", "base_rate",
	"amount", "base_amount", "net_rate", "net_amount", "discount_percentage", "discount_amount",
	"margin_type", "margin_rate_or_amount", "rate_with_margin", "pricing_rules",
	"item_tax_template", "item_tax_rate", "income_account", "expense_account",
	"warehouse", "cost_center", "weight_per_unit", "weight_uom", "barcode",
)

# Totals methods for doctypes that don't go through calculate_taxes_and_totals.
EXTRA_METHODS = {
	"Journal Entry": ("set_total_debit_credit",),
	"Payment Entry": ("set_missing_ref_details", "set_amounts"),
}


@frappe.whitelist()
def get_new_doc(doctype):
	"""A new, unsaved document with Desk's defaults (user defaults, Global
	Defaults, static defaults) and whatever the controller fills by itself."""
	if not frappe.has_permission(doctype, "create"):
		frappe.throw(_("Not permitted to create {0}").format(_(doctype)), frappe.PermissionError)
	doc = frappe.new_doc(doctype)
	# Until a party is picked a transaction is in the company's own currency
	# (the site-wide default can still be the install currency).
	if doc.meta.get_field("currency") and doc.get("company") and doc.meta.get_field("conversion_rate"):
		from erpnext import get_company_currency

		company_currency = get_company_currency(doc.company)
		if company_currency and doc.get("currency") != company_currency:
			doc.currency = company_currency
			doc.conversion_rate = None
	_refresh(doc)
	return _out(doc)


@frappe.whitelist()
def refresh_doc(doc, changed=None, table=None, row=None):
	"""Recalculate an unsaved form after a field changed.

	`changed` is the fieldname the user just edited; for a line field, `table`
	is the child table's fieldname and `row` the line's idx (1-based).
	"""
	data = json.loads(doc) if isinstance(doc, str) else doc
	doctype = data.get("doctype")
	if not doctype:
		frappe.throw(_("Document type missing"))

	existing = data.get("name") and frappe.db.exists(doctype, data["name"])
	if existing:
		frappe.get_doc(doctype, data["name"]).check_permission("write")
	elif not frappe.has_permission(doctype, "create"):
		frappe.throw(_("Not permitted to create {0}").format(_(doctype)), frappe.PermissionError)

	if not existing:
		data["__islocal"] = 1
	doc = frappe.get_doc(data)

	frappe.db.savepoint("xentra_form_refresh")
	try:
		_apply_change(doc, changed, table, cint_or_none(row))
		_refresh(doc)
	finally:
		frappe.db.rollback(save_point="xentra_form_refresh")
	return _out(doc)


def cint_or_none(v):
	try:
		return int(v) if v not in (None, "") else None
	except (TypeError, ValueError):
		return None


def _apply_change(doc, changed, table, row):
	"""What Desk's per-field triggers do before the generic refill."""
	if not changed:
		return

	if table and row:
		line = next((d for d in doc.get(table) or [] if d.idx == row), None)
		if line and changed == "item_code":
			for f in ITEM_DERIVED:
				if line.meta.get_field(f):
					line.set(f, None)
		elif line and changed in ("uom", "conversion_factor"):
			# A different unit has a different price.
			for f in ("price_list_rate", "rate", "conversion_factor" if changed == "uom" else None):
				if f and line.meta.get_field(f):
					line.set(f, None)
		return

	if changed in PARTY_FIELDS and doc.get(changed):
		_set_party_details(doc, changed)
	elif changed == "party_name" and doc.doctype in ("Quotation", "Opportunity") and doc.get("party_name"):
		target = doc.get("quotation_to") or doc.get("opportunity_from")
		if target == "Customer":
			_set_party_details(doc, "party_name", party_type="Customer")
	elif changed == "taxes_and_charges" and doc.meta.get_field("taxes"):
		doc.set("taxes", [])
		if doc.get("taxes_and_charges"):
			from erpnext.controllers.accounts_controller import get_taxes_and_charges

			master = doc.meta.get_field("taxes_and_charges").options
			for tax in get_taxes_and_charges(master, doc.taxes_and_charges) or []:
				doc.append("taxes", tax)
	elif changed in PRICE_FIELDS or changed in ("company", "ignore_pricing_rule"):
		cleared = ["price_list_rate", "rate", "discount_percentage", "discount_amount"]
		if changed == "company":
			# Accounts, cost centres and warehouses belong to a company.
			cleared += ["cost_center", "income_account", "expense_account", "warehouse"]
		for line in doc.get("items") or []:
			for f in cleared:
				if line.meta.get_field(f):
					line.set(f, None)


def _set_party_details(doc, fieldname, party_type=None):
	from erpnext.accounts.party import get_party_details

	party_type = party_type or PARTY_FIELDS[fieldname]
	details = get_party_details(
		party=doc.get(fieldname),
		party_type=party_type,
		company=doc.get("company"),
		posting_date=doc.get("posting_date") or doc.get("transaction_date"),
		doctype=doc.doctype,
		currency=None,
		price_list=None,
		fetch_payment_terms_template=not doc.get("ignore_default_payment_terms_template"),
	)
	# A new party replaces the old one's address/contact/price list/taxes.
	for key, value in (details or {}).items():
		if key in ("sales_team",) and not doc.meta.get_field("sales_team"):
			continue
		if doc.meta.get_field(key) and value is not None:
			doc.set(key, value)
	if details and details.get("taxes_and_charges") and doc.meta.get_field("taxes"):
		doc.set("taxes", [])
	# The lines are re-priced for the party's price list.
	if details and (details.get("selling_price_list") or details.get("buying_price_list")):
		for line in doc.get("items") or []:
			for f in ("price_list_rate", "rate"):
				if line.meta.get_field(f):
					line.set(f, None)


def _refresh(doc):
	"""fetch_from values, the controller's own missing-value fill, then totals.
	Each step is best effort: a half-filled form (no customer yet, no items)
	makes some of these throw, and that must not stop the others or reach the
	user as an error while they're still typing."""
	_quietly(lambda: doc.get_invalid_links(doc.meta.is_submittable))
	for child in doc.get_all_children():
		_quietly(lambda child=child: child.get_invalid_links(doc.meta.is_submittable))

	if hasattr(doc, "set_missing_values"):
		takes_flag = "for_validate" in inspect.signature(doc.set_missing_values).parameters
		_quietly(lambda: doc.set_missing_values(for_validate=False) if takes_flag else doc.set_missing_values())

	if hasattr(doc, "calculate_taxes_and_totals") and doc.get("items"):
		_quietly(doc.calculate_taxes_and_totals)
	for method in EXTRA_METHODS.get(doc.doctype, ()):
		if hasattr(doc, method):
			_quietly(getattr(doc, method))


def _quietly(fn):
	log = list(frappe.local.message_log or [])
	try:
		fn()
	except Exception:
		pass
	finally:
		# Messages raised mid-calculation would otherwise surface as popups
		# on the next response.
		frappe.local.message_log = log


def _out(doc):
	out = doc.as_dict(convert_dates_to_str=True, no_nulls=True)
	out.pop("__onload", None)
	for key in ("__unsaved",):
		out.pop(key, None)
	return out
