"""Authenticator-app (TOTP) two-factor sign-in for a tenant site's clinic admin.

Uses Frappe's own two-factor auth, so the code is enforced by /api/method/login itself (CLINZA,
the ERP sign-in and Frappe desk alike), not just by one screen:

- System Settings: two-factor on, method "OTP App", issuer "CLINZA".
- Role ROLE (two_factor_auth = 1) given only to the users who enrolled. Everyone else on the site
  signs in as before (Frappe asks for a code only when one of the user's roles has the flag).
- The user's secret is stored where Frappe (and the POS management sign-in) read it,
  `<user>_otpsecret` (encrypted with this site's key), and `<user>_otplogin` is set so Frappe
  doesn't try to email a QR code: the authenticator was already set up at signup.

Login flow for a client: POST /api/method/login {usr, pwd} answers
{"verification": {"method": "OTP App", ...}, "tmp_id": "..."} without a session; POST it again
with {usr, otp, tmp_id} to finish.
"""

import os

import frappe

ROLE = "Authenticator Sign-in"
SECRET_ENV = "CLINZA_TOTP_SECRET"


def _ensure_role():
	if not frappe.db.exists("Role", ROLE):
		frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 0, "two_factor_auth": 1}).insert(ignore_permissions=True)
	elif not frappe.db.get_value("Role", ROLE, "two_factor_auth"):
		frappe.db.set_value("Role", ROLE, "two_factor_auth", 1)


def _enable_site_2fa():
	settings = frappe.get_single("System Settings")
	changed = False
	for field, value in (("enable_two_factor_auth", 1), ("two_factor_method", "OTP App"), ("otp_issuer_name", "CLINZA")):
		if settings.get(field) != value and not (field == "otp_issuer_name" and settings.get(field)):
			settings.set(field, value)
			changed = True
	if changed:
		settings.flags.ignore_mandatory = True
		settings.save(ignore_permissions=True)


def install_admin_authenticator(email: str):
	"""Run on the tenant site (`bench --site <site> execute`, see provisioning). The secret comes in
	through the CLINZA_TOTP_SECRET environment variable so it never shows on a command line."""
	from frappe.twofactor import set_default
	from frappe.utils.password import encrypt

	secret = (os.environ.get(SECRET_ENV) or "").strip()
	if not secret:
		frappe.throw("No authenticator secret given.")
	if not frappe.db.exists("User", email):
		frappe.throw(f"User {email} does not exist on this site.")

	_ensure_role()
	_enable_site_2fa()
	set_default(email + "_otpsecret", encrypt(secret))
	set_default(email + "_otplogin", 1)
	user = frappe.get_doc("User", email)
	if ROLE not in {r.role for r in user.roles}:
		user.append("roles", {"role": ROLE})
		user.save(ignore_permissions=True)
	frappe.db.commit()
	frappe.clear_cache(user=email)
