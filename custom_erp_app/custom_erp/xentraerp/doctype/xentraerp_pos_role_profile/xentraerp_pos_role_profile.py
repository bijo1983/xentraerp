from frappe.model.document import Document


class XentraERPPOSRoleProfile(Document):
	def validate(self):
		from custom_erp.api import pos_roles

		pos_roles.validate_profile(self)

	def on_trash(self):
		from custom_erp.api import pos_roles

		pos_roles.check_can_delete(self)
