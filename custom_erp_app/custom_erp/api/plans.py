"""Subscription plans for the Super Admin portal (control-plane site only).

A plan (XentraERP Plan) is a set of modules, each either with all of its reports
or with a hand-picked report bundle. Assigning a plan to a tenant copies the plan's
modules into the tenant's enabled_modules (what every module gate reads); the report
bundle is read live from the plan by tenants.get_entitlements.
"""

import json

import frappe

from custom_erp.api.reports import report_modules
from custom_erp.api.tenants import _require_system_manager
from custom_erp.xentraerp.doctype.xentraerp_plan.xentraerp_plan import (
	ANNUAL_MONTHS,
	apply_plan_to_tenant,
	custom_copy_for_tenant,
	module_prices,
)
from custom_erp.xentraerp.doctype.xentraerp_tenant.xentraerp_tenant import ALL_MODULES

MODULE_LABELS = {
	"accounting": "Accounting and Finance",
	"selling": "Selling and CRM",
	"buying": "Buying and Procurement",
	"inventory": "Inventory and Warehouse",
	"manufacturing": "Manufacturing",
	"projects": "Projects",
	"assets": "Assets",
	"hr": "Human Resources",
	"payroll": "Payroll",
	"quality": "Quality Management",
	"support": "Support and Helpdesk",
	"maintenance": "Maintenance",
	"pos": "Point of Sale",
	"website": "Website and E-Commerce",
	"contracts": "Contracts",
	"tenders": "Tenders",
	"budget": "Budget",
	"vendor": "Vendor Portal",
	"documents": "Documents",
	"lms": "Learning (LMS)",
}

PLAN_FIELDS = [
	"name", "plan_name", "is_active", "sort_order", "is_custom", "custom_for",
	"description", "price_monthly", "price_annual", "max_users",
]


def _plan_dict(doc) -> dict:
	out = {f: doc.get(f) for f in PLAN_FIELDS}
	out["modules"] = [{"module_code": m.module_code, "report_access": m.report_access} for m in doc.modules]
	out["reports"] = [{"module_code": r.module_code, "report": r.report} for r in doc.reports]
	return out


@frappe.whitelist()
def list_plans():
	"""Every plan with its modules, report bundle and tenant count."""
	_require_system_manager()
	counts = dict(
		frappe.db.sql("select plan, count(*) from `tabXentraERP Tenant` group by plan")  # noqa: S608
	)
	plans = []
	for name in frappe.get_all("XentraERP Plan", order_by="sort_order asc, creation asc", pluck="name"):
		p = _plan_dict(frappe.get_doc("XentraERP Plan", name))
		p["tenant_count"] = counts.get(name, 0)
		plans.append(p)
	return plans


@frappe.whitelist()
def module_catalog():
	"""Module codes and labels, and which subscription modules each standard report belongs to."""
	_require_system_manager()
	reports = []
	for r in frappe.get_all("Report", filters={"disabled": 0, "is_standard": "Yes"}, fields=["name", "module"]):
		codes = report_modules(r.name, r.module)
		if codes:
			reports.append({"report": r.name, "modules": list(codes)})
	prices = module_prices()
	return {
		"modules": [{"code": c, "label": MODULE_LABELS.get(c, c), "price_monthly": prices.get(c) or 0} for c in ALL_MODULES],
		"reports": reports,
		"annual_months": ANNUAL_MONTHS,
	}


@frappe.whitelist()
def save_module_prices(prices):
	"""Set the per-module monthly prices that customizable plans are charged by.
	Custom plans are re-priced so their charge always matches their modules."""
	_require_system_manager()
	data = json.loads(prices) if isinstance(prices, str) else prices
	for code, price in data.items():
		if code not in ALL_MODULES:
			frappe.throw(f"Unknown module '{code}'.")
		if frappe.db.exists("XentraERP Module Price", code):
			frappe.db.set_value("XentraERP Module Price", code, "price_monthly", float(price or 0))
		else:
			frappe.get_doc({"doctype": "XentraERP Module Price", "module_code": code, "price_monthly": float(price or 0)}).insert()
	for name in frappe.get_all("XentraERP Plan", filters=[["is_custom", "=", 1]], pluck="name") + frappe.get_all(
		"XentraERP Plan", filters=[["custom_for", "is", "set"]], pluck="name"
	):
		frappe.get_doc("XentraERP Plan", name).save()
	frappe.db.commit()
	return module_prices()


@frappe.whitelist()
def save_plan(plan):
	"""Create or update a plan from the admin editor. Tenants on it follow the change."""
	_require_system_manager()
	data = json.loads(plan) if isinstance(plan, str) else plan
	name = data.get("name")
	doc = frappe.get_doc("XentraERP Plan", name) if name else frappe.new_doc("XentraERP Plan")
	if not name:
		doc.plan_name = (data.get("plan_name") or "").strip()
	for f in ("is_active", "sort_order", "is_custom", "description", "price_monthly", "price_annual", "max_users"):
		if f in data:
			doc.set(f, data[f])
	doc.set("modules", [])
	for m in data.get("modules") or []:
		doc.append("modules", {"module_code": m.get("module_code"), "report_access": m.get("report_access") or "All Reports"})
	doc.set("reports", [])
	for r in data.get("reports") or []:
		doc.append("reports", {"module_code": r.get("module_code"), "report": r.get("report")})
	doc.save()
	frappe.db.commit()
	return _plan_dict(doc)


@frappe.whitelist()
def delete_plan(name: str):
	_require_system_manager()
	frappe.delete_doc("XentraERP Plan", name)
	frappe.db.commit()


@frappe.whitelist()
def assign_plan(tenant_name: str, plan: str):
	"""Move a tenant onto a plan: its modules and user limit become the plan's. A customizable
	plan isn't assigned itself: the tenant gets its own copy of it, to tailor on the Plans page."""
	_require_system_manager()
	plan_doc = frappe.get_doc("XentraERP Plan", plan)
	tenant = frappe.get_doc("XentraERP Tenant", tenant_name)
	if plan_doc.custom_for and plan_doc.custom_for != tenant.name:
		frappe.throw(f"Plan '{plan}' is another tenant's custom plan.")
	if plan_doc.is_custom:
		plan_doc = custom_copy_for_tenant(plan_doc, tenant)
	apply_plan_to_tenant(tenant, plan_doc)
	frappe.db.commit()
	return {"plan": tenant.plan, "enabled_modules": tenant.enabled_modules}
