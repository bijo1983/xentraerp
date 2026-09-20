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

import frappe
from frappe.utils import cint

PIN_MIN_LENGTH = 4
MAX_FAILED_ATTEMPTS = 8
LOCKOUT_MINUTES = 15


def _hash_pin(pin: str) -> str:
	return hashlib.sha256(pin.encode()).hexdigest()


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
		fields=["name", "company", "currency", "warehouse", "customer"],
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
