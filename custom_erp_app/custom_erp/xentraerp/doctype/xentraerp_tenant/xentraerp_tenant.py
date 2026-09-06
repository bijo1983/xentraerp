import re

import frappe
from frappe.model.document import Document

SUBDOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")


class XentraERPTenant(Document):
	def validate(self):
		self.subdomain = (self.subdomain or "").strip().lower()
		if not SUBDOMAIN_RE.match(self.subdomain):
			frappe.throw(
				"Subdomain must be lowercase alphanumeric with optional hyphens "
				"(e.g. 'acme-corp')."
			)

		if self.status == "Trial" and not self.trial_end_date:
			frappe.throw("Trial End Date is required when status is Trial.")
