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

from custom_erp.api import pos_security

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


ENTITLEMENT_CACHE_KEY = "xentraerp_tenant_entitlements"
ENTITLEMENT_LKG_KEY = "xentraerp_tenant_entitlements_lkg"  # last known good answer
ENTITLEMENT_FAIL_KEY = "xentraerp_tenant_entitlements_fail"
ENTITLEMENT_TTL = 60  # seconds a fresh answer is trusted
ENTITLEMENT_LKG_TTL = 24 * 3600  # how long a last-known-good answer may stand in for an unreachable control plane
ENTITLEMENT_RETRY_AFTER = 15  # seconds between control-plane retries after a failure


def _fetch_tenant_entitlements() -> dict | None:
	"""Ask the control-plane site (plain loopback HTTP, see the CLAUDE.md note) for this
	tenant's subscription: {"modules": [codes], "reports": {code: [report names]}}
	(custom_erp.api.tenants.get_entitlements; `reports` lists only the modules the plan
	limits to a report bundle). None = couldn't tell (not configured / request failed)."""
	control_plane_host = frappe.conf.get("control_plane_host") or os.environ.get("XENTRAERP_CONTROL_PLANE_HOST")
	if not control_plane_host:
		frappe.log_error(
			title="XentraERP module entitlement check not configured",
			message="control_plane_host isn't set — POS sign-in is refused (fails closed) until it is, or until site config pos_entitlement_check is set to 'open'/'off'.",
		)
		return None
	tenant_code = frappe.local.site.split(".")[0]
	headers = {"Host": control_plane_host}
	token = frappe.conf.get("xentraerp_internal_token") or os.environ.get("XENTRAERP_INTERNAL_TOKEN")
	if token:
		headers["X-Xentra-Internal-Token"] = token
	try:
		import requests

		resp = requests.get(
			"http://127.0.0.1:8001/api/method/custom_erp.api.tenants.get_entitlements",
			params={"tenant_code": tenant_code},
			headers=headers,
			timeout=3,
		)
		resp.raise_for_status()
		message = resp.json().get("message") or {}
		return {"modules": list(message.get("modules") or []), "reports": dict(message.get("reports") or {})}
	except Exception:
		frappe.log_error(title="XentraERP module entitlement check failed")
		return None


def tenant_entitlements() -> dict | None:
	"""This tenant's subscription (see _fetch_tenant_entitlements). Cached for
	ENTITLEMENT_TTL seconds; when the control plane can't be asked, the last known good
	answer (kept for a day) is used; with none, returns None. Callers decide what None
	means: the POS gate fails CLOSED (`_tenant_has_module`), the reports gate keeps its
	old fail-open behaviour."""
	cache = frappe.cache()
	cached = cache.get_value(ENTITLEMENT_CACHE_KEY)
	if cached is not None:
		return cached
	fresh = None if cache.get_value(ENTITLEMENT_FAIL_KEY) else _fetch_tenant_entitlements()
	if fresh is not None:
		cache.set_value(ENTITLEMENT_CACHE_KEY, fresh, expires_in_sec=ENTITLEMENT_TTL)
		cache.set_value(ENTITLEMENT_LKG_KEY, fresh, expires_in_sec=ENTITLEMENT_LKG_TTL)
		return fresh
	cache.set_value(ENTITLEMENT_FAIL_KEY, 1, expires_in_sec=ENTITLEMENT_RETRY_AFTER)
	return cache.get_value(ENTITLEMENT_LKG_KEY)


def tenant_modules() -> list[str] | None:
	"""The module codes this tenant's subscription includes (None = unknown)."""
	entitlements = tenant_entitlements()
	return pos_security.effective_modules(None if entitlements is None else entitlements.get("modules"), None)


def _tenant_has_module(module_code: str) -> bool:
	"""Whether this tenant's subscription includes `module_code`. Fails CLOSED when the
	answer is unknown (changed in POS upgrade Phase 1; it used to fail open). Site config
	`pos_entitlement_check`: "closed" (default) | "open" (old behaviour) | "off" (skip,
	for development sites without a control plane)."""
	mode = str(frappe.conf.get("pos_entitlement_check") or "closed").lower()
	if mode == "off":
		return True
	return pos_security.module_allowed(tenant_modules(), module_code, mode)


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
def pin_login(pin: str, staff: str | None = None):
	"""Staff PIN sign-in.

	With `staff` (staff number from the picker) this is `pos_auth.pin_login` — the
	Phase 1 flow (identity + PIN, device policy, per-user and per-IP lockout, login
	log). Without it, the legacy PIN-only lookup runs ONLY when POS Settings
	`legacy_pin_login` is on (default off); it too refuses administrators and logs
	every attempt."""
	from custom_erp.api import pos_auth

	if staff:
		return pos_auth.pin_login(staff, pin)
	pos_auth.require_pos_entitlement(for_login=True)
	if not pos_auth.auth_settings()["legacy_pin_login"]:
		pos_auth.log_attempt("PIN", "Refused", "legacy PIN-only login disabled")
		frappe.throw("[STAFF_REQUIRED] Choose your name or enter your staff number, then your PIN.", frappe.AuthenticationError)

	_check_not_locked_out()
	pos_auth.check_ip_lock()

	pin = (pin or "").strip()
	_validate_pin_format(pin)

	pin_hash = _hash_pin(pin)
	matches = frappe.get_all(
		"XentraERP POS PIN",
		filters={"pin_hash": pin_hash, "active": 1},
		fields=["name", "user", "pos_profile"],
		limit_page_length=1,
	)
	if not matches or not frappe.db.exists("User", {"name": matches[0].user, "enabled": 1}):
		_record_failed_attempt()
		pos_auth.record_ip_failure()
		pos_auth.log_attempt("PIN", "Failed", "legacy: bad PIN")
		frappe.throw("[BAD_CREDENTIALS] Incorrect PIN.", frappe.AuthenticationError)

	match = matches[0]
	if _is_system_manager_user(match.user):
		pos_auth.log_attempt("PIN", "Refused", "legacy: administrator PIN refused", user=match.user)
		frappe.throw("[ADMIN_USE_MANAGEMENT_LOGIN] Administrators sign in with the management login.", frappe.PermissionError)

	_clear_throttle()
	session = pos_auth._start_session(match.user, "PIN", pos_auth.current_device(), core.pos_level(match.user))
	pos_auth.log_attempt("PIN", "Success", "legacy PIN-only login", user=match.user)
	frappe.db.commit()
	return {"user": pos_auth._user_payload(match.user), "pos_profile": match.pos_profile or None, "session": session}


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
def set_pin(user: str, pin: str, pos_profile: str | None = None, assign_role: int = 1, pos_role: str | None = None, location: str | None = None, role_profile: str | None = None):
	"""Set or replace someone's PIN on this tenant's site (company administrator). Also
	gives them POS access so their screens can read items and prices: `role_profile` (or
	the standard profile matching the old `pos_role`), else the role they already hold,
	else the Cashier profile — unless assign_role=0 or they are an administrator. (The
	User form and reset_pin ask for Waiter, the least privilege.)"""
	_require_staff_admin()

	pin = (pin or "").strip()
	_validate_pin_format(pin)
	if not frappe.db.exists("User", user):
		frappe.throw(f"No such user: {user}")
	if _is_system_manager_user(user):
		# Phase 1: administrators never use a PIN (management login with an authenticator code).
		frappe.throw("Administrators don't use a PIN — they sign in to the POS with email, password and authenticator code.")

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
		doc.failed_count = 0
		doc.locked_until = None
		if not doc.staff_code:
			doc.staff_code = _pos_auth().next_staff_code()
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
				"staff_code": _pos_auth().next_staff_code(),
			}
		)
		doc.insert(ignore_permissions=True)
	if cint(assign_role) and not _is_system_manager_user(user):
		_apply_role_profile(user, role_profile, pos_role, default="POS Cashier")
	# The PIN itself is never logged — only that it changed, and who changed it.
	frappe.get_doc("User", user).add_comment("Info", f"POS PIN set by {frappe.session.user}.")
	frappe.db.commit()
	return {"success": True}


def _pos_auth():
	from custom_erp.api import pos_auth

	return pos_auth


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
from custom_erp.api import pos_roles  # noqa: E402

POS_ROLES = ("POS Waiter", "POS Cashier", "POS Supervisor", "POS Kitchen")
POS_ROLE = "POS Cashier"  # kept for callers that predate the four roles
# What the POS screens read directly over the REST API (item grid, prices, payment modes,
# the register). Everything that changes data goes through the server-side POS methods,
# which check the role themselves — so these roles are read-only on purpose.
# Customer is deliberately NOT here (Phase 1, least privilege): checkout runs elevated, and no
# POS screen lists customers over REST. patches/v1_0/remove_pos_customer_read.py removes the
# read permission that earlier versions granted.
POS_ROLE_READS = ("Item", "Item Price", "Item Group", "POS Profile", "Mode of Payment", "Price List", "Currency")


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
	doc.flags.pos_role = role  # pos_roles.keep_pos_role re-applies it after a Role Profile
	doc.save(ignore_permissions=True)


def _apply_role_profile(user: str, role_profile: str | None = None, pos_role: str | None = None, default: str = "POS Waiter"):
	"""Give someone a POS role profile: the one named, else the standard profile for the old
	`pos_role`, else — only if they have no POS access yet — the standard profile for
	`default`. People who already hold a plain POS role keep it (and its full rights) until
	a profile is chosen."""
	profile = role_profile or pos_roles.profile_for_legacy_role(pos_role)
	if not profile and pos_role:
		_give_pos_role(user, pos_role)  # validated by ensure_pos_role
		return
	if not profile:
		if any(r in frappe.get_roles(user) for r in POS_ROLES):
			return
		profile = pos_roles.profile_for_legacy_role(default)
	if profile:
		pos_roles.assign(user, profile)
	else:  # profiles table not migrated yet on this site
		_give_pos_role(user, default)


def _require_staff_admin():
	"""POS staff, PINs and roles are managed by the company administrator, from the
	User form in the ERP app — nothing at the tills can change them."""
	core.require_manager()


@frappe.whitelist()
def list_pos_users():
	"""Everyone who could work the tills: their POS role and whether they have a PIN."""
	_require_staff_admin()
	pins = {p.user: p for p in frappe.get_all("XentraERP POS PIN", fields=["user", "pos_profile", "location", "active", "staff_code"])}
	out = []
	for u in frappe.get_all("User", filters={"enabled": 1, "name": ["not in", ["Guest", "Administrator"]]}, fields=["name", "full_name"], order_by="full_name asc"):
		roles = frappe.get_roles(u.name)
		p = pins.get(u.name)
		level = core.pos_level(u.name)
		held = pos_roles.profile_of(u.name)
		out.append(
			{
				"user": u.name,
				"full_name": u.full_name,
				"has_pin": bool(p),
				"staff_code": p.staff_code if p else None,
				"active": bool(p and p.active),
				"pos_profile": p.pos_profile if p else None,
				"location": core.user_location(u.name),
				"pos_role": next((r for r in POS_ROLES if r in roles), None),
				"role_profile": held.name if held else None,
				"level": level,
				"role_label": pos_roles.label_for(u.name, level),
				"is_cashier_role": "POS Cashier" in roles,
				"is_admin": "System Manager" in roles,
			}
		)
	return out


@frappe.whitelist()
def create_pos_user(email: str, full_name: str, pin: str, pos_profile: str | None = None, pos_role: str = "POS Waiter", role_profile: str | None = None):
	"""Add a staff member who works the tills: a PIN-only user with one POS role profile
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
	_apply_role_profile(email, role_profile, pos_role)
	frappe.db.commit()
	held = pos_roles.profile_of(email)
	return {"user": email, "pos_role": pos_role, "role_profile": held.name if held else None}


@frappe.whitelist()
def set_pin_active(user: str, active: int = 1):
	"""Switch a person's PIN off (e.g. they left) or back on."""
	_require_staff_admin()
	if not frappe.db.exists("XentraERP POS PIN", user):
		frappe.throw("That user has no PIN.")
	frappe.db.set_value("XentraERP POS PIN", user, "active", cint(bool(cint(active))))
	if not cint(active):
		# Phase 1: switching a PIN off also ends that person's open sessions (audit M9).
		_pos_auth().end_user_sessions(user, "PIN switched off")
	frappe.db.commit()
	return {"success": True}


@frappe.whitelist()
def set_pos_role(user: str, pos_role: str):
	"""Change someone's POS role (Waiter / Cashier / Supervisor / Kitchen)."""
	_require_staff_admin()
	if "System Manager" in frappe.get_roles(user):
		frappe.throw("An administrator's access comes from their administrator role.")
	_apply_role_profile(user, None, pos_role)
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
	pin = frappe.db.get_value("XentraERP POS PIN", user, ["pos_profile", "location", "active", "staff_code"], as_dict=True)
	level = core.pos_level(user)
	options = _access_options()
	held = pos_roles.profile_of(user)
	# Where they actually work: their own setting, else the location of the register they're locked to.
	effective = core.user_location(user)
	where = next((l for l in options["locations"] if l.code == effective), None)
	return {
		**options,
		"user": user,
		"has_pin": bool(pin),
		"staff_code": pin.staff_code if pin else None,
		"active": bool(pin and pin.active),
		"pos_profile": pin.pos_profile if pin else None,
		"location": pin.location if pin else None,
		"effective_location": effective,
		"cost_center": where.cost_center if where else None,
		"warehouse": where.warehouse if where else None,
		"pos_role": next((r for r in POS_ROLES if r in roles), None),
		"role_profile": held.name if held else None,
		"level": level,
		"role_label": pos_roles.label_for(user, level),
		"rights": sorted(pos_roles.rights_for(user, level)) if level else [],
		"is_admin": "System Manager" in roles,
	}


def _access_options() -> dict:
	"""What the POS Access panel offers: role profiles, locations, registers, PIN length."""
	return {
		"pos_roles": list(POS_ROLES),
		"role_profiles": pos_roles.summary(),
		"rights_catalogue": [{"key": k, "label": label, "description": desc} for k, label, desc in pos_roles.RIGHTS],
		"locations": frappe.get_all(
			"XentraERP POS Location",
			filters={"disabled": 0},
			fields=["name as code", "location_name as name", "company", "cost_center", "warehouse"],
			order_by="name asc",
		),
		"registers": [
			{"name": r, "location": (core.location_code(core.location_of(r)))}
			for r in frappe.get_all("POS Profile", filters={"disabled": 0}, pluck="name", order_by="name asc")
		],
		"pin_min": PIN_MIN_LENGTH,
		"pin_max": PIN_MAX_LENGTH,
	}


@frappe.whitelist()
def get_pos_access_options():
	"""The POS Access choices for a user that doesn't exist yet (the ERP's New User form)."""
	_require_staff_admin()
	return _access_options()


@frappe.whitelist()
def save_pos_access(user: str, pos_role: str | None = None, pos_profile: str | None = None, active=None, location: str | None = None, role_profile: str | None = None):
	"""Change a person's POS role profile (or, for old callers, plain POS role), the location they work at (empty = every location), the
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
	if role_profile or pos_role:
		if pos_role and pos_role not in POS_ROLES:
			frappe.throw(f"Unknown POS role: {pos_role}")
		if _is_system_manager_user(user):
			frappe.throw("An administrator's access comes from their administrator role.")
		_apply_role_profile(user, role_profile, pos_role)
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
		if not cint(active):
			_pos_auth().end_user_sessions(user, "PIN switched off")
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
