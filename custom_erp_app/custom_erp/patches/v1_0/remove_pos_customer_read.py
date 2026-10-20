"""POS upgrade Phase 1 (least privilege, audit H6): POS roles lose READ on Customer.

Earlier versions gave every POS role (Waiter/Cashier/Supervisor/Kitchen) a Custom DocPerm
READ row on Customer, so any till session could list all customers over
/api/resource/Customer. No POS screen reads Customer over REST (checkout runs elevated),
so the row is removed. Idempotent; only touches the rows this app created."""

import frappe

POS_ROLES = ("POS Waiter", "POS Cashier", "POS Supervisor", "POS Kitchen")


def execute():
	if not frappe.db.table_exists("Custom DocPerm"):
		return
	rows = frappe.get_all("Custom DocPerm", filters={"parent": "Customer", "role": ["in", POS_ROLES]}, pluck="name")
	for name in rows:
		frappe.delete_doc("Custom DocPerm", name, ignore_permissions=True, force=True)
	if rows:
		frappe.clear_cache(doctype="Customer")
