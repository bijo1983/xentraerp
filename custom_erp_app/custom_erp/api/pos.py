"""PIN-based cashier login for the POS app (pos.xentraerp.net).

Retail/F&B staff need something faster than a full email+password at every
shift change — the standard pattern is: pick your tenant once (same
tenant-code flow already used by the back-office login, see
custom_erp.api.signup.tenant_lookup), then log in for the shift with a
short numeric PIN. This module always runs against whichever site the
request resolved to (the frontend sets the xentra_tenant cookie to the
tenant code before calling this, exactly like the existing tenant-code
login) — PINs are looked up only within that one tenant's own site,
never across tenants.
"""

import hashlib
import os

import frappe
from frappe.utils import cint

PIN_MIN_LENGTH = 4
MAX_FAILED_ATTEMPTS = 8
LOCKOUT_MINUTES = 15
POS_MODULE_CODE = "pos"


def _hash_pin(pin: str) -> str:
	return hashlib.sha256(pin.encode()).hexdigest()


def _tenant_has_module(module_code: str) -> bool:
	"""Ask the control-plane site whether this tenant's subscription
	includes `module_code`. custom_erp.api.tenants.get_enabled_modules
	lives on the control-plane site's database — a different site/database
	entirely from wherever this function runs — so this is a plain
	internal HTTP call to the control-plane site (same box, loopback),
	not a cross-site frappe.get_doc (in-process site-switching has already
	proven unreliable elsewhere in this app, see provisioning.py).

	FAILS OPEN (returns True) whenever the check can't actually be
	performed — no control-plane host configured, or the request fails —
	because a broken check should never silently lock every tenant out of
	login. It still logs an error either way, so "this isn't actually
	enforced yet" is visible in the error log rather than silently true.

	To activate this gate, set XENTRAERP_CONTROL_PLANE_HOST (in
	site_config.json or as an env var for the bench worker process) to
	the control-plane site's hostname (e.g. erp.badmintonbooking.com per
	CLAUDE.md, if that's still the control-plane site in this deployment —
	confirm before setting it). Until that's set, POS (and any future
	module gated the same way) is NOT actually restricted by subscription,
	regardless of enabled_modules — every tenant can use it.
	"""
	control_plane_host = frappe.conf.get("control_plane_host") or os.environ.get("XENTRAERP_CONTROL_PLANE_HOST")
	if not control_plane_host:
		frappe.log_error(
			title="XentraERP module entitlement check not configured",
			message=(
				f"Checked whether this tenant has the '{module_code}' module, but "
				"XENTRAERP_CONTROL_PLANE_HOST isn't set — entitlement is NOT "
				"enforced; every tenant can use this module regardless of "
				"subscription until this is configured."
			),
		)
		return True

	tenant_code = frappe.local.site.split(".")[0]
	try:
		import requests

		resp = requests.get(
			"http://127.0.0.1:8001/api/method/custom_erp.api.tenants.get_enabled_modules",
			params={"tenant_code": tenant_code},
			headers={"Host": control_plane_host},
			timeout=3,
		)
		resp.raise_for_status()
		enabled = resp.json().get("message") or []
		return module_code in enabled
	except Exception:
		frappe.log_error(title="XentraERP module entitlement check failed")
		return True


def _throttle_key() -> str:
	# Scoped per source IP (not per attempted PIN/user — a wrong PIN
	# doesn't identify a specific cashier to blame, so the throttle has to
	# apply to guessing in general). frappe.cache() is already
	# site-namespaced, so this never leaks across tenants.
	ip = frappe.local.request_ip or "unknown"
	return f"pos_pin_attempts:{ip}"


def _check_not_locked_out():
	attempts = cint(frappe.cache().get_value(_throttle_key()))
	if attempts >= MAX_FAILED_ATTEMPTS:
		frappe.throw(
			f"Too many incorrect PIN attempts. Try again in {LOCKOUT_MINUTES} minutes, "
			"or ask an administrator to unlock this register."
		)


def _record_failed_attempt():
	key = _throttle_key()
	attempts = cint(frappe.cache().get_value(key)) + 1
	frappe.cache().set_value(key, attempts, expires_in_sec=LOCKOUT_MINUTES * 60)


def _clear_throttle():
	frappe.cache().delete_value(_throttle_key())


@frappe.whitelist(allow_guest=True)
def pin_login(pin: str):
	"""Log in whichever active cashier this PIN belongs to, on this site."""
	if not _tenant_has_module(POS_MODULE_CODE):
		frappe.throw("The Point of Sale module isn't included in this organization's current plan.")

	_check_not_locked_out()

	pin = (pin or "").strip()
	if not pin or len(pin) < PIN_MIN_LENGTH:
		frappe.throw(f"Enter your {PIN_MIN_LENGTH}-digit (or longer) PIN.")

	pin_hash = _hash_pin(pin)
	matches = frappe.get_all(
		"XentraERP POS PIN",
		filters={"pin_hash": pin_hash, "active": 1},
		fields=["name", "user", "pos_profile"],
		limit_page_length=1,
	)
	if not matches:
		_record_failed_attempt()
		frappe.throw("Incorrect PIN.")

	match = matches[0]
	if not frappe.db.exists("User", {"name": match.user, "enabled": 1}):
		frappe.throw("This cashier's account is disabled. Contact your administrator.")

	_clear_throttle()

	# Establish a real session without a password check — the PIN itself
	# was the auth check above. Same technique Frappe's own passwordless
	# (social/OAuth) login flows use: set the session user directly and run
	# the normal post-login hooks, rather than calling authenticate().
	from frappe.auth import LoginManager

	login_manager = LoginManager()
	login_manager.user = match.user
	login_manager.post_login()
	frappe.db.commit()

	user = frappe.get_doc("User", frappe.session.user)
	return {
		"user": {
			"name": user.name,
			"email": user.email,
			"full_name": user.full_name,
			"user_image": user.user_image,
			"roles": [r.role for r in user.roles],
		},
		"pos_profile": match.pos_profile or None,
	}


def _require_system_manager():
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def set_pin(user: str, pin: str, pos_profile: str | None = None):
	"""Admin action: set or replace a cashier's PIN on this tenant's site."""
	_require_system_manager()

	pin = (pin or "").strip()
	if not pin or len(pin) < PIN_MIN_LENGTH:
		frappe.throw(f"PIN must be at least {PIN_MIN_LENGTH} digits.")
	if not frappe.db.exists("User", user):
		frappe.throw(f"No such user: {user}")

	pin_hash = _hash_pin(pin)

	# Only `user` is unique on this doctype — nothing stops two cashiers
	# from ending up with the same PIN otherwise. pin_login's lookup takes
	# the first match, so a collision would let one cashier's PIN
	# authenticate as whichever other cashier happens to sort first,
	# misattributing their sales.
	collision = frappe.get_all(
		"XentraERP POS PIN",
		filters={"pin_hash": pin_hash, "active": 1, "user": ["!=", user]},
		limit_page_length=1,
	)
	if collision:
		frappe.throw("This PIN is already in use by another cashier. Choose a different one.")

	if frappe.db.exists("XentraERP POS PIN", user):
		doc = frappe.get_doc("XentraERP POS PIN", user)
		doc.pin_hash = pin_hash
		doc.active = 1
		if pos_profile is not None:
			doc.pos_profile = pos_profile
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc(
			{
				"doctype": "XentraERP POS PIN",
				"user": user,
				"pin_hash": pin_hash,
				"pos_profile": pos_profile,
				"active": 1,
			}
		)
		doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"success": True}


def validate_pos_invoice_profile(doc, method=None):
	"""doc_events validate hook on POS Invoice (see hooks.py): if the
	CURRENT session user is a PIN-restricted cashier, reject saving a POS
	Invoice against any other POS Profile.

	This has to live here, not just in the frontend's switchRegister() —
	clearing client-side Pinia state doesn't stop a request straight
	against the API from naming a different pos_profile, and the register
	picker's own auto-select is a convenience, not a security boundary.
	Runs for every save regardless of how it was made (REST, Desk, this
	app, anything) since it's a validate hook, not app-specific code.

	Only restricts a user who actually has an active PIN with a
	pos_profile restriction set — an admin/back-office user creating a
	POS Invoice directly (no PIN record at all) is unaffected.
	"""
	restriction = frappe.db.get_value(
		"XentraERP POS PIN",
		{"user": frappe.session.user, "active": 1},
		"pos_profile",
	)
	if restriction and doc.pos_profile != restriction:
		frappe.throw(f"Your PIN is restricted to the '{restriction}' register — you can't post against a different one.")


@frappe.whitelist()
def list_pos_profiles():
	"""POS Profiles available on this tenant's site, for the register-select
	step after PIN login. Includes each profile's configured payment modes
	and default customer — the terminal screen submits real POS Invoices
	against these, not guessed/hardcoded values (a tenant's actual Mode of
	Payment names vary, e.g. "Cash" vs "Cash - Till 1")."""
	profiles = frappe.get_all(
		"POS Profile",
		filters={"disabled": 0},
		fields=["name", "company", "currency", "warehouse", "customer", "selling_price_list"],
	)
	for profile in profiles:
		payments = frappe.get_all(
			"POS Payment Method",
			filters={"parent": profile["name"], "parenttype": "POS Profile"},
			fields=["mode_of_payment", "default"],
			order_by="default desc, idx asc",
		)
		profile["payment_methods"] = [p["mode_of_payment"] for p in payments]
	return profiles
