"""Backing for the ERP frontend's Reports pages.

The standard report list and each report's filters come from a catalog that
is generated offline from ERPNext's own report scripts
(`scripts/generate-report-catalog.mjs`). Defaults in that catalog that depend
on the session (today, the company, the fiscal year) are tokens; this module
supplies their values and says which reports the user may open. Reports
themselves are run through Frappe's own `frappe.desk.query_report.run`.
"""

import json

import frappe
from frappe.utils import getdate, today

from custom_erp.api.pos import tenant_modules

# ERPNext report module -> the subscription module (XentraERP Tenant.enabled_modules)
# that includes it. A report whose module isn't listed isn't offered.
MODULE_OF = {
	"Accounts": ("accounting",),
	"Selling": ("selling",),
	"CRM": ("selling",),
	"Buying": ("buying",),
	"Stock": ("inventory", "stock"),
	"Manufacturing": ("manufacturing",),
	"Projects": ("projects",),
	"Assets": ("assets",),
	"Quality Management": ("quality",),
	"Support": ("support", "maintenance"),
	"Regional": ("accounting",),  # country tax/VAT reports
	"Website": ("website",),
}
# Reports that belong to a different package than their ERPNext module.
REPORT_MODULE = {"POS Register": ("pos",), "Sales Payment Summary": ("pos",)}


def _report_in_package(name: str, module: str | None, enabled: list[str] | None) -> bool:
	if enabled is None:  # entitlement unknown: fail open, like the POS login gate
		return True
	needs = REPORT_MODULE.get(name) or MODULE_OF.get(module or "")
	return bool(needs) and any(m in enabled for m in needs)


@frappe.whitelist()
def report_context():
	"""Values for the catalog's default tokens, and the standard reports this user can run."""
	company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
	ctx = {
		"today": today(),
		"company": company or "",
		"currency": (company and frappe.get_cached_value("Company", company, "default_currency")) or "",
		"company_bank_account": (company and frappe.get_cached_value("Company", company, "default_bank_account")) or "",
		"fiscal_year": "",
		"year_start": "",
		"year_end": "",
	}
	try:
		from erpnext.accounts.utils import get_fiscal_year

		fy = get_fiscal_year(today(), company=company, verbose=0, as_dict=True)
		ctx.update(fiscal_year=fy.name, year_start=str(getdate(fy.year_start_date)), year_end=str(getdate(fy.year_end_date)))
	except Exception:
		# No fiscal year covering today: leave the fiscal-year defaults blank for the user to pick.
		pass

	# The same two checks frappe.desk.query_report.get_report_doc makes before running one.
	enabled = tenant_modules()
	permitted = []
	can_report = {}
	for name in frappe.get_all("Report", filters={"disabled": 0, "is_standard": "Yes"}, pluck="name"):
		doc = frappe.get_cached_doc("Report", name)
		if not _report_in_package(name, doc.module, enabled):
			continue
		if doc.ref_doctype not in can_report:
			can_report[doc.ref_doctype] = bool(doc.ref_doctype) and frappe.has_permission(doc.ref_doctype, "report")
		if can_report[doc.ref_doctype] and doc.is_permitted():
			permitted.append(name)
	ctx["permitted"] = permitted
	ctx["modules"] = enabled  # None = not known (everything offered)
	return ctx


@frappe.whitelist()
def run_report(report_name: str, filters=None):
	"""Run a standard report if the tenant's subscription includes its module, through
	Frappe's own query_report.run (which applies the user's report permissions)."""
	module = frappe.db.get_value("Report", report_name, "module")
	if not _report_in_package(report_name, module, tenant_modules()):
		frappe.throw("This report isn't part of your subscription.", frappe.PermissionError)
	from frappe.desk.query_report import run

	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	return run(report_name, filters=filters, ignore_prepared_report=True)
