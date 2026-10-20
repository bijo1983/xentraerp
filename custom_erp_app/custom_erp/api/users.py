"""Tenant user accounts for the ERP frontend's Users screen.

Frappe's own User form is built for system administrators (sounds, document
follow, 2FA bypass, desk settings, ...). Tenant admins only need who the
person is, whether they can sign in, how they sign in the first time and what
they may do, so the frontend shows its own form and saves through here.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, validate_email_address

# Roles a tenant admin never hands out or sees.
HIDDEN_ROLES = {"Administrator", "Guest", "All", "Desk User"}

EDITABLE = ("first_name", "middle_name", "last_name", "mobile_no", "phone", "language", "time_zone")


def outgoing_email_ready():
	"""True when the site has an outgoing email account Frappe can send from."""
	return bool(
		frappe.db.get_value("Email Account", {"default_outgoing": 1, "enable_outgoing": 1})
		or frappe.conf.get("mail_server")
	)


def skip_welcome_email_without_mail(doc, method=None):
	"""User before_insert: with no outgoing email account Frappe v14 crashes
	while building the welcome email (email_body.get_brand_logo on a None
	account) and the user is never created. Create the user anyway and say
	why no email went out."""
	if cint(doc.send_welcome_email) and not outgoing_email_ready():
		doc.send_welcome_email = 0
		frappe.msgprint(
			_("No outgoing email account is set up, so no welcome email was sent. Give the user their password yourself."),
			indicator="orange",
			alert=True,
		)


def _require_manager():
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only an administrator can manage users."), frappe.PermissionError)


def _assignable_roles():
	return sorted(
		r.name
		for r in frappe.get_all("Role", filters={"disabled": 0, "desk_access": 1}, fields=["name"])
		if r.name not in HIDDEN_ROLES
	)


@frappe.whitelist()
def get_user_form(name=None):
	"""Everything the Users screen needs: the user (if editing), the role
	profiles and roles on offer, and whether email can be sent."""
	_require_manager()
	user = None
	if name:
		doc = frappe.get_doc("User", name)
		user = {
			"name": doc.name,
			"email": doc.email,
			"enabled": doc.enabled,
			"full_name": doc.full_name,
			"user_type": doc.user_type,
			"role_profile_name": doc.role_profile_name,
			"roles": [r.role for r in doc.roles if r.role not in HIDDEN_ROLES],
			"last_login": doc.last_login,
			"creation": str(doc.creation),
			**{f: doc.get(f) for f in EDITABLE},
		}
	return {
		"user": user,
		"role_profiles": frappe.get_all("Role Profile", pluck="name", order_by="name"),
		"roles": _assignable_roles(),
		"email_ready": outgoing_email_ready(),
	}


@frappe.whitelist()
def get_role_profile_roles(role_profile):
	_require_manager()
	return [r.role for r in frappe.get_doc("Role Profile", role_profile).roles]


@frappe.whitelist(methods=["POST"])
def save_user(data):
	"""Create or update a tenant user. `data`: email, first_name, last_name,
	mobile_no, enabled, role_profile_name or roles, and for a new user either
	`new_password` or `send_invite`."""
	_require_manager()
	data = frappe._dict(json.loads(data) if isinstance(data, str) else data)
	name = data.get("name")

	if name:
		doc = frappe.get_doc("User", name)
		if doc.name in ("Administrator", "Guest"):
			frappe.throw(_("This user can't be edited here."))
	else:
		email = (data.get("email") or "").strip().lower()
		if not email or not validate_email_address(email):
			frappe.throw(_("Enter a valid email address."))
		if frappe.db.exists("User", email):
			frappe.throw(_("A user with the email {0} already exists.").format(email))
		doc = frappe.new_doc("User")
		doc.email = email
		doc.user_type = "System User"

	if not (data.get("first_name") or "").strip():
		frappe.throw(_("Enter the user's first name."))
	for f in EDITABLE:
		if f in data:
			doc.set(f, (data.get(f) or "").strip() if isinstance(data.get(f), str) else data.get(f))
	doc.enabled = cint(data.get("enabled", 1))
	if name == frappe.session.user and not doc.enabled:
		frappe.throw(_("You can't disable your own account."))

	roles = [r for r in (data.get("roles") or []) if r not in HIDDEN_ROLES]
	if data.get("role_profile_name"):
		doc.role_profile_name = data.role_profile_name
	else:
		doc.role_profile_name = None
		allowed = set(_assignable_roles())
		bad = [r for r in roles if r not in allowed]
		if bad:
			frappe.throw(_("Unknown role: {0}").format(", ".join(bad)))
		keep = [r.role for r in doc.roles if r.role in HIDDEN_ROLES]
		doc.set("roles", [])
		for r in keep + roles:
			doc.append("roles", {"role": r})

	password = data.get("new_password")
	invite = cint(data.get("send_invite"))
	if not name:
		if invite and not outgoing_email_ready():
			frappe.throw(_("Email isn't set up for this company, so an invitation can't be sent. Set a password instead."))
		if not invite and not password:
			frappe.throw(_("Set a password for the user, or send them an invitation."))
		doc.send_welcome_email = 1 if invite else 0
	if password:
		doc.new_password = password

	doc.save() if name else doc.insert()
	return {"name": doc.name}
