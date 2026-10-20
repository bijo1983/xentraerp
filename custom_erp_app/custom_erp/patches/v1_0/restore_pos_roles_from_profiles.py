"""Staff linked to a POS role profile but holding no POS role (dropped by a save of the ERP
user form, see pos_roles.keep_pos_role) get their profile's role back. Without it they signed
in as a plain Waiter."""

import frappe


def execute():
	from custom_erp.api import pos, pos_roles

	if not frappe.db.table_exists(pos_roles.DOCTYPE) or not frappe.get_meta("User").has_field(pos_roles.USER_FIELD):
		return
	for user, profile in frappe.get_all("User", filters={pos_roles.USER_FIELD: ["is", "set"]}, fields=["name", pos_roles.USER_FIELD], as_list=True):
		# From the table, not frappe.get_roles: the cached roles can be stale.
		roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
		if "System Manager" in roles or any(r in roles for r in pos_roles.ROLE_LEVEL):
			continue
		level, disabled = frappe.db.get_value(pos_roles.DOCTYPE, profile, ["access_level", "disabled"]) or (None, 1)
		role = pos_roles.LEVEL_ROLE.get((level or "").lower())
		if role and not disabled:
			pos._give_pos_role(user, role)
