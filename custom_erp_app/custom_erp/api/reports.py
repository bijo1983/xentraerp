"""Backing for the ERP frontend's Reports pages.

The standard report list and each report's filters come from a catalog that
is generated offline from ERPNext's own report scripts
(`scripts/generate-report-catalog.mjs`). Defaults in that catalog that depend
on the session (today, the company, the fiscal year) are tokens; this module
supplies their values and says which reports the user may open. Reports
themselves are run through Frappe's own `frappe.desk.query_report.run`.
"""

import frappe
from frappe.utils import getdate, today


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
	permitted = []
	can_report = {}
	for name in frappe.get_all("Report", filters={"disabled": 0, "is_standard": "Yes"}, pluck="name"):
		doc = frappe.get_cached_doc("Report", name)
		if doc.ref_doctype not in can_report:
			can_report[doc.ref_doctype] = bool(doc.ref_doctype) and frappe.has_permission(doc.ref_doctype, "report")
		if can_report[doc.ref_doctype] and doc.is_permitted():
			permitted.append(name)
	ctx["permitted"] = permitted
	return ctx
