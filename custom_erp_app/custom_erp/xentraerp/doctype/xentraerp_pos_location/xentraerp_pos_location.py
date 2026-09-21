import re

import frappe
from frappe.model.document import Document


class XentraERPPOSLocation(Document):
	def before_naming(self):
		# The code is the record's name and part of every bill number, so it is normalised
		# before the name is taken — whether it was typed here or came from the POS app.
		self.location_code = (self.location_code or "").strip().upper()
		if not re.fullmatch(r"[A-Z0-9]{2,8}", self.location_code):
			frappe.throw("The location code must be 2-8 letters or numbers, e.g. MAIN or AIR2.")

	def validate(self):
		self.validate_cost_center()
		self.validate_warehouse()
		if not (self.enable_retail or self.enable_fnb):
			frappe.throw("Enable Retail, F&B or both — a location has to run at least one kind of POS.")

	def validate_cost_center(self):
		"""Each location posts to one cost center: it is what ties the location's sales,
		costs and reports together, so it has to be a real, usable one."""
		if not self.cost_center:
			frappe.throw("Choose the cost center this location posts to.")
		cc = frappe.db.get_value("Cost Center", self.cost_center, ["company", "is_group", "disabled"], as_dict=True)
		if not cc:
			frappe.throw(f"No such cost center: {self.cost_center}")
		if cc.is_group:
			frappe.throw(f"{self.cost_center} is a group — choose a cost center that transactions can post to.")
		if cc.disabled:
			frappe.throw(f"{self.cost_center} is disabled.")
		self.company = cc.company  # the location belongs to its cost center's company

	def validate_warehouse(self):
		if self.warehouse and frappe.db.get_value("Warehouse", self.warehouse, "company") != self.company:
			frappe.throw(f"Warehouse {self.warehouse} belongs to a different company than {self.cost_center}.")
