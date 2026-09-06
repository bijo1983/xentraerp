import frappe


@frappe.whitelist()
def list_tenants(search: str | None = None, limit: int = 100):
	"""Return tenants for the Super Admin portal, restricted to System Manager."""
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Not permitted", frappe.PermissionError)

	filters = {}
	if search:
		filters["organization_name"] = ["like", f"%{search}%"]

	return frappe.get_all(
		"XentraERP Tenant",
		filters=filters,
		fields=[
			"name",
			"organization_name",
			"subdomain",
			"plan",
			"status",
			"provisioning_status",
			"max_users",
			"trial_end_date",
			"creation",
		],
		order_by="creation desc",
		limit_page_length=limit,
	)


@frappe.whitelist()
def tenant_stats():
	"""Aggregate counts for the admin dashboard."""
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Not permitted", frappe.PermissionError)

	rows = frappe.get_all("XentraERP Tenant", fields=["status"])
	counts = {"total": len(rows)}
	for row in rows:
		key = (row.status or "Draft").lower().replace(" ", "_")
		counts[key] = counts.get(key, 0) + 1
	return counts
