"""POS upgrade Phase 1: every existing PIN gets a staff number (identity before PIN)."""

import frappe


def execute():
	if not frappe.db.table_exists("XentraERP POS PIN") or not frappe.db.has_column("XentraERP POS PIN", "staff_code"):
		return
	from custom_erp.api.pos_auth import next_staff_code

	for user in frappe.get_all("XentraERP POS PIN", filters={"staff_code": ["is", "not set"]}, pluck="user"):
		frappe.db.set_value("XentraERP POS PIN", user, "staff_code", next_staff_code(), update_modified=False)
