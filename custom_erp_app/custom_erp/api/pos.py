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
import hmac
import os

import frappe
from frappe.utils import cint

PIN_MIN_LENGTH = 6
PIN_MAX_LENGTH = 8
MAX_FAILED_ATTEMPTS = 8
LOCKOUT_MINUTES = 15
POS_MODULE_CODE = "pos"


def _hash_pin(pin: str) -> str:
	"""Keyed hash (HMAC-SHA256) with this site's own encryption key. A PIN has
	only 10^6 possible values, so a plain unsalted hash would let anyone who
	obtains the table reverse every PIN instantly; keying it with a per-site
	secret that isn't stored in the table means a database leak alone doesn't
	give them that."""
	from frappe.utils.password import get_encryption_key

	return hmac.new(get_encryption_key().encode(), pin.encode(), hashlib.sha256).hexdigest()


def _validate_pin_format(pin: str):
	if not pin.isdigit() or not (PIN_MIN_LENGTH <= len(pin) <= PIN_MAX_LENGTH):
		frappe.throw(f"PIN must be {PIN_MIN_LENGTH}-{PIN_MAX_LENGTH} digits (numbers only).")


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
	_validate_pin_format(pin)

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


def _check_location(location: str | None, pos_profile: str | None):
	"""A person's location must exist, and if they are also locked to a register, that
	register must belong to it."""
	if location and not frappe.db.exists("XentraERP POS Location", {"name": location, "disabled": 0}):
		frappe.throw(f"No such location: {location}")
	if location and pos_profile:
		loc = core.location_of(pos_profile)
		if not loc or loc.location_code != location:
			frappe.throw(f"Register '{pos_profile}' doesn't belong to location {location}.")


@frappe.whitelist()
def set_pin(user: str, pin: str, pos_profile: str | None = None, assign_role: int = 1, pos_role: str | None = None, location: str | None = None):
	"""Set or replace someone's PIN on this tenant's site (company administrator). Also
	gives them a POS role so their screens can read items and prices: `pos_role`, else
	the role they already hold, else Cashier — unless assign_role=0 or they are an
	administrator."""
	_require_staff_admin()

	pin = (pin or "").strip()
	_validate_pin_format(pin)
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

	# None = leave as it is; "" = clear.
	existing = frappe.db.get_value("XentraERP POS PIN", user, ["pos_profile", "location"], as_dict=True)
	new_profile = (pos_profile or None) if pos_profile is not None else (existing.pos_profile if existing else None)
	new_location = (location or None) if location is not None else (existing.location if existing else None)
	_check_location(new_location, new_profile)
	if existing:
		doc = frappe.get_doc("XentraERP POS PIN", user)
		doc.pin_hash = pin_hash
		doc.active = 1
		doc.pos_profile = new_profile
		doc.location = new_location
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc(
			{
				"doctype": "XentraERP POS PIN",
				"user": user,
				"pin_hash": pin_hash,
				"pos_profile": new_profile,
				"location": new_location,
				"active": 1,
			}
		)
		doc.insert(ignore_permissions=True)
	if cint(assign_role) and not _is_system_manager_user(user):
		held = next((r for r in POS_ROLES if r in frappe.get_roles(user)), None)
		_give_pos_role(user, pos_role or held or POS_ROLE)
	# The PIN itself is never logged — only that it changed, and who changed it.
	frappe.get_doc("User", user).add_comment("Info", f"POS PIN set by {frappe.session.user}.")
	frappe.db.commit()
	return {"success": True}


def _is_system_manager_user(user: str) -> bool:
	return "System Manager" in frappe.get_roles(user)


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
	core.enforce_user_location(doc.pos_profile)


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
		from custom_erp.api.pos_core import location_of

		loc = location_of(profile["name"])
		profile["location"] = loc.location_code if loc else None
		profile["location_name"] = loc.location_name if loc else None
		payments = frappe.get_all(
			"POS Payment Method",
			filters={"parent": profile["name"], "parenttype": "POS Profile"},
			fields=["mode_of_payment", "default"],
			order_by="`default` desc, idx asc",
		)
		profile["payment_methods"] = [p["mode_of_payment"] for p in payments]
	# Someone tied to a location is only offered that location's registers.
	mine = core.user_location()
	return [p for p in profiles if p["location"] == mine] if mine else profiles


# ---------------------------------------------------------- staff & roles

from custom_erp.api import pos_core as core  # noqa: E402  (after the module's own helpers, which pos_core doesn't import)

POS_ROLES = ("POS Waiter", "POS Cashier", "POS Supervisor", "POS Kitchen")
POS_ROLE = "POS Cashier"  # kept for callers that predate the four roles
# What the POS screens read directly over the REST API (item grid, prices, payment modes,
# the register). Everything that changes data goes through the server-side POS methods,
# which check the role themselves — so these roles are read-only on purpose.
POS_ROLE_READS = ("Item", "Item Price", "Item Group", "POS Profile", "Mode of Payment", "Customer", "Price List", "Currency")


def ensure_pos_role(role: str = POS_ROLE) -> str:
	"""Create a POS role (and its read permissions) the first time it is needed."""
	from frappe.permissions import add_permission

	if role not in POS_ROLES:
		frappe.throw(f"Unknown POS role: {role}")
	if not frappe.db.exists("Role", role):
		frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 0}).insert(ignore_permissions=True)
	for doctype in POS_ROLE_READS:
		if frappe.db.exists("DocType", doctype) and not frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0}):
			add_permission(doctype, role, 0)
	return role


def _give_pos_role(user: str, role: str):
	"""A person holds exactly one POS role: this replaces any other."""
	ensure_pos_role(role)
	doc = frappe.get_doc("User", user)
	keep = [r for r in doc.roles if r.role not in POS_ROLES]
	if role in [r.role for r in doc.roles] and len(keep) == len(doc.roles) - 1:
		return
	doc.set("roles", [{"role": r.role} for r in keep] + [{"role": role}])
	doc.save(ignore_permissions=True)


def _require_staff_admin():
	"""POS staff, PINs and roles are managed by the company administrator, from the
	User form in the ERP app — nothing at the tills can change them."""
	core.require_manager()


@frappe.whitelist()
def list_pos_users():
	"""Everyone who could work the tills: their POS role and whether they have a PIN."""
	_require_staff_admin()
	pins = {p.user: p for p in frappe.get_all("XentraERP POS PIN", fields=["user", "pos_profile", "location", "active"])}
	out = []
	for u in frappe.get_all("User", filters={"enabled": 1, "name": ["not in", ["Guest", "Administrator"]]}, fields=["name", "full_name"], order_by="full_name asc"):
		roles = frappe.get_roles(u.name)
		p = pins.get(u.name)
		level = core.pos_level(u.name)
		out.append(
			{
				"user": u.name,
				"full_name": u.full_name,
				"has_pin": bool(p),
				"active": bool(p and p.active),
				"pos_profile": p.pos_profile if p else None,
				"location": core.user_location(u.name),
				"pos_role": next((r for r in POS_ROLES if r in roles), None),
				"level": level,
				"role_label": core.LEVEL_LABEL.get(level or "", ""),
				"is_cashier_role": "POS Cashier" in roles,
				"is_admin": "System Manager" in roles,
			}
		)
	return out


@frappe.whitelist()
def create_pos_user(email: str, full_name: str, pin: str, pos_profile: str | None = None, pos_role: str = "POS Waiter"):
	"""Add a staff member who works the tills: a PIN-only user with one POS role
	(Waiter by default — the least privilege), optionally locked to one register."""
	_require_staff_admin()
	email = (email or "").strip().lower()
	full_name = (full_name or "").strip()
	if "@" not in email or not full_name:
		frappe.throw("Enter the person's email and full name.")
	if frappe.db.exists("User", email):
		frappe.throw(f"{email} already exists — set a PIN for that user instead.")
	_validate_pin_format((pin or "").strip())
	ensure_pos_role(pos_role)
	frappe.get_doc(
		{"doctype": "User", "email": email, "first_name": full_name, "send_welcome_email": 0, "enabled": 1, "roles": [{"role": pos_role}]}
	).insert(ignore_permissions=True)
	set_pin(email, pin, pos_profile, 0)
	return {"user": email, "pos_role": pos_role}


@frappe.whitelist()
def set_pin_active(user: str, active: int = 1):
	"""Switch a person's PIN off (e.g. they left) or back on."""
	_require_staff_admin()
	if not frappe.db.exists("XentraERP POS PIN", user):
		frappe.throw("That user has no PIN.")
	frappe.db.set_value("XentraERP POS PIN", user, "active", cint(bool(cint(active))))
	frappe.db.commit()
	return {"success": True}


@frappe.whitelist()
def set_pos_role(user: str, pos_role: str):
	"""Change someone's POS role (Waiter / Cashier / Supervisor / Kitchen)."""
	_require_staff_admin()
	if "System Manager" in frappe.get_roles(user):
		frappe.throw("An administrator's access comes from their administrator role.")
	_give_pos_role(user, pos_role)
	frappe.db.commit()
	return {"user": user, "pos_role": pos_role}


@frappe.whitelist()
def get_pos_access(user: str):
	"""What the User form's POS Access panel shows: the person's POS role, register and
	whether their PIN exists / is switched on — never the PIN itself (only a keyed hash
	is stored)."""
	_require_staff_admin()
	if not frappe.db.exists("User", user):
		frappe.throw(f"No such user: {user}")
	roles = frappe.get_roles(user)
	pin = frappe.db.get_value("XentraERP POS PIN", user, ["pos_profile", "location", "active"], as_dict=True)
	level = core.pos_level(user)
	locations = frappe.get_all(
		"XentraERP POS Location",
		filters={"disabled": 0},
		fields=["name as code", "location_name as name", "company", "cost_center", "warehouse"],
		order_by="name asc",
	)
	registers = [
		{"name": r, "location": (core.location_code(core.location_of(r)))}
		for r in frappe.get_all("POS Profile", filters={"disabled": 0}, pluck="name", order_by="name asc")
	]
	# Where they actually work: their own setting, else the location of the register they're locked to.
	effective = core.user_location(user)
	where = next((l for l in locations if l.code == effective), None)
	return {
		"user": user,
		"has_pin": bool(pin),
		"active": bool(pin and pin.active),
		"pos_profile": pin.pos_profile if pin else None,
		"location": pin.location if pin else None,
		"effective_location": effective,
		"cost_center": where.cost_center if where else None,
		"warehouse": where.warehouse if where else None,
		"pos_role": next((r for r in POS_ROLES if r in roles), None),
		"level": level,
		"role_label": core.LEVEL_LABEL.get(level or "", ""),
		"is_admin": "System Manager" in roles,
		"pos_roles": list(POS_ROLES),
		"locations": locations,
		"registers": registers,
		"pin_min": PIN_MIN_LENGTH,
		"pin_max": PIN_MAX_LENGTH,
	}


@frappe.whitelist()
def save_pos_access(user: str, pos_role: str | None = None, pos_profile: str | None = None, active=None, location: str | None = None):
	"""Change a person's POS role, the location they work at (empty = every location), the
	register they are locked to (empty = any register at that location) and their PIN
	on/off switch, leaving the PIN itself as it is. The location, register and switch
	belong to the PIN, so they need one to exist."""
	_require_staff_admin()
	if not frappe.db.exists("User", user):
		frappe.throw(f"No such user: {user}")
	has_pin = frappe.db.exists("XentraERP POS PIN", user)
	if pos_profile is not None or active is not None or location is not None:
		if not has_pin:
			frappe.throw("Set a PIN first — the location, register and on/off switch belong to the PIN.")
	if pos_role:
		if pos_role not in POS_ROLES:
			frappe.throw(f"Unknown POS role: {pos_role}")
		if _is_system_manager_user(user):
			frappe.throw("An administrator's access comes from their administrator role.")
		_give_pos_role(user, pos_role)
	if pos_profile is not None or location is not None:
		current = frappe.db.get_value("XentraERP POS PIN", user, ["pos_profile", "location"], as_dict=True)
		new_profile = (pos_profile or None) if pos_profile is not None else current.pos_profile
		new_location = (location or None) if location is not None else current.location
		if new_profile and not frappe.db.exists("POS Profile", new_profile):
			frappe.throw(f"No such register: {new_profile}")
		_check_location(new_location, new_profile)
		frappe.db.set_value("XentraERP POS PIN", user, {"pos_profile": new_profile, "location": new_location})
	if active is not None:
		frappe.db.set_value("XentraERP POS PIN", user, "active", cint(bool(cint(active))))
	frappe.get_doc("User", user).add_comment("Info", f"POS access changed by {frappe.session.user}.")
	frappe.db.commit()
	return get_pos_access(user)


def _random_unused_pin() -> str:
	"""A random PIN no active cashier already has (pin_login finds a person by PIN alone)."""
	import secrets

	in_use = set(frappe.get_all("XentraERP POS PIN", filters={"active": 1}, pluck="pin_hash"))
	for _ in range(200):
		pin = "".join(secrets.choice("0123456789") for _ in range(PIN_MIN_LENGTH))
		if _hash_pin(pin) not in in_use:
			return pin
	frappe.throw("Couldn't find a free PIN — set one by hand.")


@frappe.whitelist()
def reset_pin(user: str):
	"""Give a person a new random PIN (forgotten, or handing a till to someone new) and
	return it — this is the only time it can be read, so pass it on straight away. Also
	switches the PIN on. Someone with no POS role yet becomes a Waiter (least privilege)."""
	_require_staff_admin()
	if not frappe.db.exists("User", user):
		frappe.throw(f"No such user: {user}")
	pin = _random_unused_pin()
	set_pin(user, pin, None, 1, None if any(r in frappe.get_roles(user) for r in POS_ROLES) else "POS Waiter")
	return {"pin": pin}
