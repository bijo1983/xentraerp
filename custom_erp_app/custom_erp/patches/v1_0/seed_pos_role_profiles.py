"""POS role profiles: seed the standard catalogue on every site, and link staff who already
hold one of the four plain POS roles to the standard profile with exactly the same rights
(Waiter, Cashier, Branch Manager for Supervisor, Kitchen) — nobody's access changes."""

import frappe


def execute():
	from custom_erp.api import pos_roles

	if not frappe.db.table_exists(pos_roles.DOCTYPE):
		return
	pos_roles.ensure_defaults(force=True)
	frappe.clear_cache(doctype="User")
	if not frappe.get_meta("User").has_field(pos_roles.USER_FIELD):
		return
	for role, key in pos_roles.LEGACY_ROLE_PROFILE.items():
		profile = frappe.db.get_value(pos_roles.DOCTYPE, {"standard_key": key}, "name")
		if not profile:
			continue
		for user in frappe.get_all("Has Role", filters={"role": role, "parenttype": "User"}, pluck="parent"):
			if not frappe.db.get_value("User", user, pos_roles.USER_FIELD):
				frappe.db.set_value("User", user, pos_roles.USER_FIELD, profile, update_modified=False)
