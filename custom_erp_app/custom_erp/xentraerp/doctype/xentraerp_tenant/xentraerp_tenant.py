import re

import frappe
from frappe.model.document import Document
from frappe.utils import add_months, today

SUBDOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")

ALL_MODULES = [
	"accounting", "selling", "buying", "inventory", "manufacturing",
	"projects", "assets", "hr", "payroll", "quality", "support",
	"maintenance", "pos", "website", "contracts", "tenders",
	"budget", "vendor", "documents", "lms",
]


def generate_tenant_code(organization_name: str = "") -> str:
	"""A random unique 6-digit numeric login code — not derived from the
	organization name, so it never collides with a previous tenant's name-based
	code or leftover site artifacts from a failed/removed tenant of the same name."""
	import secrets

	for _ in range(50):
		code = f"{secrets.randbelow(1_000_000):06d}"
		if not frappe.db.exists("XentraERP Tenant", {"tenant_code": code}):
			return code
	frappe.throw("Could not generate a unique tenant code. Please try again.")


class XentraERPTenant(Document):
	def validate(self):
		self.subdomain = (self.subdomain or "").strip().lower()
		if not SUBDOMAIN_RE.match(self.subdomain):
			frappe.throw(
				"Subdomain must be lowercase alphanumeric with optional hyphens "
				"(e.g. 'acme-corp')."
			)

		if not self.tenant_code:
			self.tenant_code = generate_tenant_code(self.organization_name)

		if self.status == "Trial" and not self.trial_end_date:
			self.trial_start_date = self.trial_start_date or today()
			self.trial_end_date = add_months(self.trial_start_date, 1)

		if self.status == "Trial" and not self.enabled_modules:
			self.enabled_modules = ",".join(ALL_MODULES)
