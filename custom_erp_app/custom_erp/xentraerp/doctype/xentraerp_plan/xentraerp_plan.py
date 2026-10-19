import frappe
from frappe.model.document import Document

from custom_erp.xentraerp.doctype.xentraerp_tenant.xentraerp_tenant import ALL_MODULES

ANNUAL_MONTHS = 10  # annual billing charges 10 months


def module_prices() -> dict[str, float]:
	return dict(frappe.get_all("XentraERP Module Price", fields=["module_code", "price_monthly"], as_list=True))


def module_total(codes: list[str]) -> float:
	prices = module_prices()
	return sum(prices.get(c) or 0 for c in codes)


class XentraERPPlan(Document):
	def validate(self):
		seen = set()
		modules = []
		for row in self.modules:
			code = (row.module_code or "").strip().lower()
			if code not in ALL_MODULES:
				frappe.throw(f"Unknown module '{row.module_code}'.")
			if code in seen:
				continue
			seen.add(code)
			row.module_code = code
			modules.append(row)
		self.modules = modules

		# A report bundle row only means something for a module in this plan that is
		# limited to selected reports; anything else would be silently ignored, so drop it.
		selective = {m.module_code for m in self.modules if m.report_access == "Selected Reports"}
		kept, pairs = [], set()
		for row in self.reports:
			key = (row.module_code, row.report)
			if row.module_code in selective and key not in pairs:
				pairs.add(key)
				kept.append(row)
		self.reports = kept

		# Customizable plans are pay-per-module: the price is the sum of the selected
		# modules' prices (XentraERP Module Price), with two months free on annual billing.
		if self.is_custom or self.custom_for:
			self.price_monthly = module_total([m.module_code for m in self.modules])
			self.price_annual = self.price_monthly * ANNUAL_MONTHS

	def on_update(self):
		# Tenants follow their plan: re-apply its modules and user limit to every
		# tenant subscribed to it, so editing a plan changes what those tenants get.
		for name in frappe.get_all("XentraERP Tenant", filters={"plan": self.name}, pluck="name"):
			apply_plan_to_tenant(frappe.get_doc("XentraERP Tenant", name), self)

	def on_trash(self):
		if frappe.db.exists("XentraERP Tenant", {"plan": self.name}):
			frappe.throw(f"Plan '{self.name}' still has tenants. Move them to another plan first.")


def custom_copy_for_tenant(template, tenant):
	"""A tenant's own plan cloned from a customizable template (reused if it already has one)."""
	existing = frappe.db.get_value("XentraERP Plan", {"custom_for": tenant.name}, "name")
	if existing:
		return frappe.get_doc("XentraERP Plan", existing)
	copy = frappe.copy_doc(template)
	copy.plan_name = f"Custom - {tenant.organization_name or tenant.name} ({tenant.tenant_code or tenant.name})"
	copy.is_custom = 0
	copy.custom_for = tenant.name
	copy.description = f"Tailored plan for {tenant.organization_name or tenant.name}, based on {template.name}."
	copy.insert(ignore_permissions=True)
	return copy


def apply_plan_to_tenant(tenant, plan):
	tenant.plan = plan.name
	tenant.enabled_modules = ",".join(m.module_code for m in plan.modules)
	tenant.max_users = plan.max_users or 0
	tenant.save(ignore_permissions=True)
