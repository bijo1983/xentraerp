import frappe
from frappe.model.document import Document


class XentraERPPOSLoginAttempt(Document):
	"""Append-only: rows are written by custom_erp.api.pos_auth and never edited or deleted."""

	def validate(self):
		if not self.is_new():
			frappe.throw("Login attempts are read-only.", frappe.PermissionError)

	def on_trash(self):
		frappe.throw("Login attempts can't be deleted.", frappe.PermissionError)
