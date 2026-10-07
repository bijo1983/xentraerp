"""Bill rounding — one tenant-wide switch for ERPNext's rounded totals.

ERPNext rounds a document's grand total into `rounded_total` unless rounding is
disabled, and it rounds to the currency's `smallest_currency_fraction_value` —
or to a whole unit when that is 0 (so with BHD a 2.500 bill became 2.000). The
switch lives in three places, all kept in step here:

* Global Defaults `disable_rounded_total` — the default for every new sales /
  purchase document (its on_update writes the per-doctype default);
* each POS Profile's `disable_rounded_total` — what a POS Invoice follows;
* the company currency's `smallest_currency_fraction_value` — the step.

The POS also stamps the setting on every invoice it builds (`apply_to`), so a
bill never depends on which of those an ERPNext code path happens to read.
"""

import frappe
from frappe.utils import cint, flt

# Offered steps, in the company currency's main unit (1 = whole unit).
STEPS = (0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0)


def _company_currency() -> str:
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	return (company and frappe.get_cached_value("Company", company, "default_currency")) or frappe.db.get_single_value("Global Defaults", "default_currency") or ""


def is_enabled() -> bool:
	return not cint(frappe.db.get_single_value("Global Defaults", "disable_rounded_total"))


def apply_to(doc: dict, doctype: str):
	"""Stamp the tenant's rounding switch on an invoice dict about to be inserted."""
	if frappe.get_meta(doctype).has_field("disable_rounded_total"):
		doc["disable_rounded_total"] = 0 if is_enabled() else 1


@frappe.whitelist()
def get_rounding():
	currency = _company_currency()
	step = flt(frappe.db.get_value("Currency", currency, "smallest_currency_fraction_value")) if currency else 0.0
	return {
		"enabled": is_enabled(),
		"currency": currency,
		# 0 in ERPNext means "round to a whole unit"
		"step": step or 1.0,
		"steps": list(STEPS),
	}


@frappe.whitelist()
def set_rounding(enabled, step=None):
	"""System Manager: turn bill rounding on (to `step`) or off for the whole tenant."""
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Only an administrator can change bill rounding.", frappe.PermissionError)
	enabled = cint(enabled)
	currency = _company_currency()
	if enabled:
		step = flt(step or 0)
		if step not in STEPS:
			frappe.throw(f"Rounding step must be one of: {', '.join(f'{s:g}' for s in STEPS)}")
		if not currency:
			frappe.throw("Set a default company with a currency first.")
		# 1 is stored as 0: ERPNext's own "whole unit" value
		frappe.db.set_value("Currency", currency, "smallest_currency_fraction_value", 0 if step == 1.0 else step)

	# Not gd.save(): that re-validates the whole form, and tenants provisioned without
	# ERPNext's setup wizard have no Current Fiscal Year, so it fails as mandatory.
	# Set the switch and run the same per-doctype default update its on_update does.
	disabled = 0 if enabled else 1
	frappe.db.set_single_value("Global Defaults", "disable_rounded_total", disabled)
	frappe.db.set_default("disable_rounded_total", disabled)
	gd = frappe.get_single("Global Defaults")
	gd.disable_rounded_total = disabled
	gd.toggle_rounded_total()
	for profile in frappe.get_all("POS Profile", pluck="name"):
		frappe.db.set_value("POS Profile", profile, "disable_rounded_total", 0 if enabled else 1)
	frappe.db.commit()
	frappe.clear_cache()
	return get_rounding()
