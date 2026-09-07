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


def generate_tenant_code(organization_name: str) -> str:
	"""Derive a short lowercase code from the organization name, e.g.
	'JJ Consultancy' -> 'jjc'. Falls back to numeric suffixes on clash."""
	words = re.findall(r"[A-Za-z0-9]+", organization_name or "")
	if not words:
		base = "tnt"
	elif len(words) == 1:
		base = words[0][:3].lower()
	else:
		base = "".join(w[0] for w in words)[:5].lower()

	base = base or "tnt"
	code = base
	suffix = 1
	while frappe.db.exists("XentraERP Tenant", {"tenant_code": code}):
		suffix += 1
		code = f"{base}{suffix}"
	return code


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
