"""CLINZA tenant configuration: apply a clinic type to a tenant site and keep its
VAT / GST set-up in ERPNext in step with Clinza Settings.

`apply_clinic_type` runs at provisioning (via `bench --site <site> execute`, see
provisioning._apply_clinic_type_on_site) and from the CLINZA app's Setup screen. It is
idempotent and only ever *adds*: re-running never removes a template, service or tax
account the clinic already uses, and never overwrites a tax registration number or rate
the clinic has edited.

ERPNext objects it creates (company abbreviation appended by ERPNext as usual):
  Customer Groups  "Patients", "Insurance Payers"
  Item Groups      "Clinic Services", "Medicines"
  Items            one non-stock item per starter service (+ Item Price on Standard Selling)
  Accounts         VAT: "Output VAT" · GST: "Output CGST", "Output SGST", "Output IGST"
                   (under the company's "Duties and Taxes" group)
  Item Tax Templates  "CLINZA <class>" per tax class (healthcare/cosmetic/medicine/goods)
  Sales Taxes and Charges Templates  "CLINZA VAT" | "CLINZA GST In-State" + "CLINZA GST Out-of-State"
"""

from __future__ import annotations

import json

import frappe
from frappe.utils import cint, flt

from custom_erp.api import clinic_catalog as cat

SETTINGS = "Clinza Settings"
ROLES = ["Clinic Manager", "Clinic Practitioner", "Clinic Receptionist", "Clinic Billing"]
TAX_CLASSES = ["healthcare", "cosmetic", "medicine", "goods"]
CLASS_LABEL = {"healthcare": "Healthcare", "cosmetic": "Cosmetic", "medicine": "Medicines", "goods": "Goods"}


def _json(value, default):
	if not value:
		return default
	if isinstance(value, (list, dict)):
		return value
	try:
		return json.loads(value)
	except (TypeError, ValueError):
		return default


def ensure_roles():
	for role in ROLES:
		if not frappe.db.exists("Role", role):
			# desk_access=1 so staff with only a clinic role stay "System Users" (counted by the user limit).
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(ignore_permissions=True)


def _ensure_group(doctype: str, name: str, parent: str, parent_field: str):
	if frappe.db.exists(doctype, name):
		return name
	if not frappe.db.exists(doctype, parent):
		parent = frappe.db.get_value(doctype, {"is_group": 1}, "name")
	frappe.get_doc({"doctype": doctype, f"{doctype.lower().replace(' ', '_')}_name": name, parent_field: parent, "is_group": 0}).insert(
		ignore_permissions=True
	)
	return name


def _default_company() -> str | None:
	return frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value("Company", {}, "name")


def _abbr(company: str) -> str:
	return frappe.db.get_value("Company", company, "abbr")


# ---------------------------------------------------------------------------
# Tax set-up
# ---------------------------------------------------------------------------

def _tax_parent(company: str) -> str | None:
	return frappe.db.get_value("Account", {"company": company, "is_group": 1, "account_name": "Duties and Taxes"}, "name") or frappe.db.get_value(
		"Account", {"company": company, "is_group": 1, "account_type": "Tax"}, "name"
	) or frappe.db.get_value("Account", {"company": company, "is_group": 1, "root_type": "Liability"}, "name")


def _tax_account(company: str, account_name: str, rate: float) -> str:
	name = f"{account_name} - {_abbr(company)}"
	if frappe.db.exists("Account", name):
		return name
	parent = _tax_parent(company)
	if not parent:
		frappe.throw(f"Company {company} has no tax account group to put {account_name} under.")
	return frappe.get_doc({
		"doctype": "Account", "account_name": account_name, "parent_account": parent, "company": company,
		"account_type": "Tax", "tax_rate": rate, "is_group": 0,
	}).insert(ignore_permissions=True).name


def _upsert_item_tax_template(company: str, title: str, rows: list[tuple[str, float]]) -> str:
	name = f"{title} - {_abbr(company)}"
	if frappe.db.exists("Item Tax Template", name):
		doc = frappe.get_doc("Item Tax Template", name)
		doc.set("taxes", [])
	else:
		doc = frappe.get_doc({"doctype": "Item Tax Template", "title": title, "company": company})
	for account, rate in rows:
		doc.append("taxes", {"tax_type": account, "tax_rate": rate})
	doc.save(ignore_permissions=True)
	return doc.name


def _upsert_sales_tax_template(company: str, title: str, rows: list[tuple[str, str, float]], default: bool = False) -> str:
	name = f"{title} - {_abbr(company)}"
	if frappe.db.exists("Sales Taxes and Charges Template", name):
		doc = frappe.get_doc("Sales Taxes and Charges Template", name)
		doc.set("taxes", [])
	else:
		doc = frappe.get_doc({"doctype": "Sales Taxes and Charges Template", "title": title, "company": company})
	if default and not frappe.db.exists("Sales Taxes and Charges Template", {"company": company, "is_default": 1, "name": ["!=", name]}):
		doc.is_default = 1
	for account, description, rate in rows:
		doc.append("taxes", {"charge_type": "On Net Total", "account_head": account, "description": description, "rate": rate})
	doc.save(ignore_permissions=True)
	return doc.name


def item_tax_template_name(settings, tax_class: str) -> str | None:
	if settings.tax_regime not in ("VAT", "GST") or not settings.company:
		return None
	name = f"CLINZA {CLASS_LABEL.get(tax_class, 'Healthcare')} - {_abbr(settings.company)}"
	return name if frappe.db.exists("Item Tax Template", name) else None


def class_of_template(settings, template: str | None) -> str:
	for c in TAX_CLASSES:
		if template and template == item_tax_template_name(settings, c):
			return c
	return "healthcare"


def sync_tax(settings=None):
	"""Create / update the accounts and templates for the clinic's current tax settings."""
	settings = settings or frappe.get_single(SETTINGS)
	company = settings.company
	if not company or settings.tax_regime not in ("VAT", "GST"):
		settings.tax_template_main = ""
		settings.tax_template_inter = ""
		return
	classes = _json(settings.tax_classes, {})
	std = flt(settings.standard_rate)

	def rate_of(c):
		v = classes.get(c, "exempt")
		return 0.0 if v == "exempt" else flt(v)

	if settings.tax_regime == "VAT":
		acc = _tax_account(company, "Output VAT", std)
		for c in TAX_CLASSES:
			_upsert_item_tax_template(company, f"CLINZA {CLASS_LABEL[c]}", [(acc, rate_of(c))])
		settings.tax_template_main = _upsert_sales_tax_template(company, "CLINZA VAT", [(acc, f"VAT {std:g}%", std)], default=True)
		settings.tax_template_inter = ""
	else:
		cg = _tax_account(company, "Output CGST", std / 2)
		sg = _tax_account(company, "Output SGST", std / 2)
		ig = _tax_account(company, "Output IGST", std)
		for c in TAX_CLASSES:
			r = rate_of(c)
			_upsert_item_tax_template(company, f"CLINZA {CLASS_LABEL[c]}", [(cg, r / 2), (sg, r / 2), (ig, r)])
		settings.tax_template_main = _upsert_sales_tax_template(
			company, "CLINZA GST In-State", [(cg, "CGST", std / 2), (sg, "SGST", std / 2)], default=True
		)
		settings.tax_template_inter = _upsert_sales_tax_template(company, "CLINZA GST Out-of-State", [(ig, "IGST", std)])
	# Every billing item follows its tax class.
	for svc in frappe.get_all("Clinza Service", fields=["item", "tax_class"], filters={"item": ["is", "set"]}):
		_set_item_tax(svc.item, item_tax_template_name(settings, svc.tax_class))


def _set_item_tax(item_code: str, template: str | None):
	item = frappe.get_doc("Item", item_code)
	item.set("taxes", [])
	if template:
		item.append("taxes", {"item_tax_template": template})
	item.save(ignore_permissions=True)


# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------

def ensure_service(settings, svc: dict, category: str = "Service") -> str:
	"""A Clinza Service + its non-stock ERPNext Item and selling price. Returns the service name."""
	name = svc["name"]
	if frappe.db.exists("Clinza Service", name):
		return name
	group = "Medicines" if category == "Medicine" else "Clinic Services"
	item_code = name[:140]
	if not frappe.db.exists("Item", item_code):
		frappe.get_doc({
			"doctype": "Item", "item_code": item_code, "item_name": name, "item_group": group, "stock_uom": "Nos",
			"is_stock_item": 0, "is_sales_item": 1, "is_purchase_item": 0, "include_item_in_manufacturing": 0,
			"description": name,
		}).insert(ignore_permissions=True)
	_set_item_tax(item_code, item_tax_template_name(settings, svc.get("tax_class") or "healthcare"))
	rate = flt(svc.get("rate"))
	if rate and frappe.db.exists("Price List", "Standard Selling") and not frappe.db.exists(
		"Item Price", {"item_code": item_code, "price_list": "Standard Selling"}
	):
		frappe.get_doc({"doctype": "Item Price", "item_code": item_code, "price_list": "Standard Selling", "price_list_rate": rate}).insert(
			ignore_permissions=True
		)
	frappe.get_doc({
		"doctype": "Clinza Service", "service_name": name, "category": category, "item": item_code, "rate": rate,
		"tax_class": svc.get("tax_class") or "healthcare", "code": svc.get("code") or "",
	}).insert(ignore_permissions=True)
	return name


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def apply_clinic_type(clinic_type: str, clinic_name: str | None = None, admin_user: str | None = None, country: str | None = None):
	"""Configure this site as a CLINZA clinic of `clinic_type` (see clinic_catalog.CLINIC_TYPES)."""
	if clinic_type not in cat.CLINIC_TYPES:
		frappe.throw("Unknown clinic type.")
	spec = cat.CLINIC_TYPES[clinic_type]
	ensure_roles()
	_ensure_group("Customer Group", "Patients", "All Customer Groups", "parent_customer_group")
	_ensure_group("Customer Group", "Insurance Payers", "All Customer Groups", "parent_customer_group")
	_ensure_group("Item Group", "Clinic Services", "All Item Groups", "parent_item_group")
	_ensure_group("Item Group", "Medicines", "All Item Groups", "parent_item_group")

	s = frappe.get_single(SETTINGS)
	first_time = not cint(s.configured)
	s.clinic_type = clinic_type
	s.clinic_name = s.clinic_name or clinic_name or frappe.db.get_single_value("System Settings", "app_name") or "Clinic"
	s.company = s.company or _default_company()
	if s.company:
		s.currency = s.currency or frappe.db.get_value("Company", s.company, "default_currency")
	country = country or s.country or frappe.db.get_single_value("System Settings", "country") or (
		frappe.db.get_value("Company", s.company, "country") if s.company else None
	)
	s.country = country
	preset = cat.tax_preset(country)
	s.region = preset["region"]
	if first_time or not s.tax_regime:
		s.tax_regime = preset["regime"]
		s.standard_rate = preset["standard_rate"]
		s.tax_classes = json.dumps(preset["classes"])
		s.tax_id_label = preset["tax_id_label"]
		s.arabic_invoice = 1 if preset.get("arabic") else 0
	s.patient_customer_group = "Patients"
	s.insurer_customer_group = "Insurance Payers"

	templates = _json(s.enabled_templates, [])
	for t in spec["templates"]:
		if t not in templates:
			templates.append(t)
	s.enabled_templates = json.dumps(templates)
	types = _json(s.appointment_types, [])
	have = {a.get("name") for a in types}
	for n, m in spec["appointment_types"]:
		if n not in have:
			types.append({"name": n, "minutes": m})
	s.appointment_types = json.dumps(types)
	s.slot_minutes = s.slot_minutes or 15

	sync_tax(s)
	s.configured = 1
	s.save(ignore_permissions=True)

	for svc in spec["services"]:
		ensure_service(s, svc)
	for svc in cat.COMMON_SERVICES:
		ensure_service(s, svc, "Medicine" if svc["tax_class"] == "medicine" else "Consumable")

	if admin_user and frappe.db.exists("User", admin_user):
		user = frappe.get_doc("User", admin_user)
		have_roles = {r.role for r in user.roles}
		for role in ROLES:
			if role not in have_roles:
				user.append("roles", {"role": role})
		user.save(ignore_permissions=True)

	frappe.db.commit()
	return {"clinic_type": clinic_type, "templates": templates, "region": s.region, "tax_regime": s.tax_regime}
