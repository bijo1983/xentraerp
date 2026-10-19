"""POS authentication v2: device registry, staff identity + PIN, management login
(password + TOTP), lockout, login log, POS sessions (expiry, lock, revocation).

Policy rules live in `pos_security` (pure, unit-tested); this module wires them to
Frappe. Nothing here ever stores or logs a PIN, password, TOTP code, device token or
session id in clear: only keyed/SHA-256 hashes.

Flow (see pos-frontend/src/views/LandingView.vue):

1. organization code -> `lookup_organization` on the control-plane site (rate limited,
   no admin email);
2. `login_context` on the tenant site -> is this device registered (HttpOnly device
   cookie), its type/location/register, the staff picker;
3. unregistered device -> `register_device(approval code)` (code made by an admin with
   `create_device_code`);
4. staff picks their name / types their staff number, then PIN -> `pin_login`;
5. administrators use `management_login` (email + password + authenticator code).

Every POS session gets an `XentraERP POS Session` row; the `auth_hooks` entry
`enforce_pos_session` checks expiry, lock and device revocation on every request made
with such a session (sessions without a row, e.g. ERP logins, are untouched).
"""

from __future__ import annotations

import time
from datetime import timedelta

import frappe
from frappe.utils import cint, flt, get_datetime, now_datetime

from custom_erp.api import pos_security as sec

SETTINGS = "XentraERP POS Settings"
DEVICE = "XentraERP POS Device"
ATTEMPT = "XentraERP POS Login Attempt"
SESSION = "XentraERP POS Session"
PIN = "XentraERP POS PIN"
CODE_TTL_MINUTES = 30
DEVICE_COOKIE_DAYS = 730
ENROLL_TTL_SECONDS = 10 * 60

GENERIC_PIN_ERROR = "[BAD_CREDENTIALS] Incorrect staff number or PIN."
GENERIC_MGMT_ERROR = "[BAD_CREDENTIALS] Incorrect email, password or code."


# ------------------------------------------------------------------ settings


def auth_settings() -> dict:
	"""Phase 1 auth settings (fields on XentraERP POS Settings). Defaults apply to a
	never-saved Single, so the owner defaults below are in force until changed."""
	raw = frappe.db.get_singles_dict(SETTINGS) or {}

	def flag(key, default):
		return cint(raw.get(key)) if raw.get(key) not in (None, "") else default

	return {
		"require_registered_device": flag("require_registered_device", 1),
		"legacy_pin_login": flag("legacy_pin_login", 0),
		"allow_waiter_on_till": flag("allow_waiter_on_till", 1),
		"show_staff_list": flag("show_staff_list", 1),
		"require_management_2fa": flag("require_management_2fa", 1),
		"idle_lock_minutes": flag("idle_lock_minutes", 5),
		"session_max_hours": flag("session_max_hours", 12),
	}


def _tenant_code() -> str:
	return (frappe.local.site or "").split(".")[0]


def _ip() -> str:
	return frappe.local.request_ip or "unknown"


def _user_agent() -> str:
	try:
		return (frappe.get_request_header("User-Agent") or "")[:140]
	except Exception:
		return ""


def _err(message: str, exc=frappe.ValidationError):
	frappe.throw(message, exc)


# --------------------------------------------------------------- login log


def log_attempt(kind: str, result: str, reason: str = "", user: str | None = None, staff: str | None = None, device: str | None = None):
	"""Append one row to the login log and commit it immediately, so a failed attempt is
	kept even though the request that follows rolls back. Never raises."""
	try:
		frappe.get_doc(
			{
				"doctype": ATTEMPT,
				"attempt_at": now_datetime(),
				"kind": kind,
				"result": result,
				"reason": (reason or "")[:140],
				"user": user if user and frappe.db.exists("User", user) else None,
				"staff_ref": (staff or "")[:20] or None,
				"device": device if device and frappe.db.exists(DEVICE, device) else None,
				"ip_address": _ip()[:60],
				"user_agent": _user_agent(),
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()
	except Exception:
		frappe.log_error(title="POS login log write failed")


# ------------------------------------------------------------ counters / lockout


def _cache():
	return frappe.cache()


def _get_int(key: str) -> int:
	return cint(_cache().get_value(key))


def _ip_state_key() -> str:
	return f"xpos:ipfail:{_ip()}"


def _ident_key(kind: str, ident: str) -> str:
	return f"xpos:{kind}fail:{sec.sha256_hex(ident.lower())[:32]}"


def _locked_for(key: str) -> int:
	"""Seconds left on a lockout stored as {'n': failures, 'until': ts}."""
	state = _cache().get_value(key) or {}
	until = flt(state.get("until")) if isinstance(state, dict) else 0
	return max(0, int(until - time.time()))


def _bump(key: str, free: int, ttl: int = sec.IP_WINDOW_SECONDS) -> int:
	state = _cache().get_value(key) or {}
	n = cint(state.get("n") if isinstance(state, dict) else 0) + 1
	delay = sec.lockout_seconds(n, free=free)
	_cache().set_value(key, {"n": n, "until": time.time() + delay if delay else 0}, expires_in_sec=max(ttl, delay + 60))
	return n


def _clear(key: str):
	_cache().delete_value(key)


def _throw_locked(seconds: int, hard: bool = False):
	if hard:
		_err("[LOCKED] Too many incorrect attempts. Ask a manager to unlock your PIN.", frappe.AuthenticationError)
	mins = max(1, round(seconds / 60))
	_err(f"[LOCKED] Too many incorrect attempts. Try again in {seconds if seconds < 90 else mins} {'seconds' if seconds < 90 else 'minutes'}.", frappe.AuthenticationError)


def check_ip_lock():
	left = _locked_for(_ip_state_key())
	if left:
		_throw_locked(left)


def record_ip_failure():
	_bump(_ip_state_key(), sec.IP_FREE_ATTEMPTS)


# --------------------------------------------------------------- entitlement


def require_pos_entitlement(for_login: bool = False):
	"""The tenant's plan must include the POS module (fails CLOSED, see pos.tenant_modules)."""
	from custom_erp.api import pos

	if not pos._tenant_has_module(pos.POS_MODULE_CODE):
		if for_login:
			log_attempt("PIN", "Refused", "module not entitled")
		_err("[POS_NOT_ENTITLED] The Point of Sale isn't available for this organization right now. Contact your administrator.", frappe.PermissionError)


# ------------------------------------------------------------------ devices


def _device_cookie_name() -> str:
	return f"xpos_dev_{_tenant_code()}"


def current_device() -> dict | None:
	"""The registered, active device this request comes from (HttpOnly cookie), or None."""
	if hasattr(frappe.local, "_xpos_device"):
		return frappe.local._xpos_device
	device = None
	try:
		raw = frappe.request.cookies.get(_device_cookie_name()) if getattr(frappe, "request", None) else None
	except Exception:
		raw = None
	dev_id, token = sec.split_device_cookie(raw)
	if dev_id:
		row = frappe.db.get_value(
			DEVICE, dev_id, ["name", "device_label", "device_type", "status", "location", "pos_profile", "token_hash"], as_dict=True
		)
		if row and row.status == "Active" and sec.constant_time_equal(row.token_hash, sec.sha256_hex(token)):
			device = {k: row[k] for k in ("name", "device_label", "device_type", "location", "pos_profile")}
	frappe.local._xpos_device = device
	return device


def _set_device_cookie(dev_id: str, token: str):
	frappe.local.cookie_manager.set_cookie(
		_device_cookie_name(), f"{dev_id}.{token}", expires=now_datetime() + timedelta(days=DEVICE_COOKIE_DAYS), secure=True, httponly=True
	)


def _device_payload(device: dict | None) -> dict:
	if not device:
		return {"registered": False}
	loc_name = frappe.db.get_value("XentraERP POS Location", device.get("location"), "location_name") if device.get("location") else None
	return {
		"registered": True,
		"id": device["name"],
		"label": device.get("device_label"),
		"type": device.get("device_type"),
		"location": device.get("location"),
		"location_name": loc_name,
		"register": device.get("pos_profile"),
	}


def _validate_device_fields(device_type, location, pos_profile):
	if device_type not in sec.DEVICE_TYPES:
		_err(f"Device type must be one of: {', '.join(sec.DEVICE_TYPES)}")
	if location and not frappe.db.exists("XentraERP POS Location", {"name": location, "disabled": 0}):
		_err(f"No such location: {location}")
	if pos_profile:
		if not frappe.db.exists("POS Profile", {"name": pos_profile, "disabled": 0}):
			_err(f"No such register: {pos_profile}")
		from custom_erp.api import pos_core

		loc = pos_core.location_of(pos_profile)
		if location and (not loc or loc.location_code != location):
			_err(f"Register '{pos_profile}' doesn't belong to location {location}.")


@frappe.whitelist()
def create_device_code(device_label: str, device_type: str = sec.DEVICE_TILL, location: str | None = None, pos_profile: str | None = None):
	"""Administrator: approve a new till/handheld/kitchen screen. Returns a one-time code
	(valid 30 minutes) to type on that device. The admin sets the device type here."""
	from custom_erp.api import pos_core

	pos_core.require_manager()
	device_label = (device_label or "").strip()[:60]
	if not device_label:
		_err("Give the device a name, e.g. 'Front till' or 'Handheld 2'.")
	_validate_device_fields(device_type, location or None, pos_profile or None)
	code = sec.generate_approval_code()
	doc = frappe.get_doc(
		{
			"doctype": DEVICE,
			"device_label": device_label,
			"device_type": device_type,
			"status": "Pending",
			"location": location or None,
			"pos_profile": pos_profile or None,
			"approval_code_hash": sec.sha256_hex(code),
			"code_expires": now_datetime() + timedelta(minutes=CODE_TTL_MINUTES),
			"approved_by": frappe.session.user,
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"device": doc.name, "code": sec.format_approval_code(code), "expires": str(doc.code_expires)}


def _activate(doc, token: str):
	doc.status = "Active"
	doc.token_hash = sec.sha256_hex(token)
	doc.approval_code_hash = None
	doc.code_expires = None
	doc.registered_at = now_datetime()
	doc.registered_ip = _ip()[:60]
	doc.save(ignore_permissions=True)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def register_device(code: str):
	"""Register THIS browser/app as a POS device with an admin's one-time approval code.
	Sets an HttpOnly device cookie for this tenant."""
	check_ip_lock()
	norm = sec.normalize_approval_code(code)
	row = None
	if norm:
		row = frappe.db.get_value(DEVICE, {"approval_code_hash": sec.sha256_hex(norm), "status": "Pending"}, ["name", "code_expires"], as_dict=True)
	if not row or not row.code_expires or get_datetime(row.code_expires) < now_datetime():
		record_ip_failure()
		log_attempt("Device", "Failed", "bad or expired approval code")
		_err("[BAD_CODE] That approval code isn't valid or has expired. Ask a manager for a new one.", frappe.AuthenticationError)
	doc = frappe.get_doc(DEVICE, row.name)
	token = sec.new_token()
	_activate(doc, token)
	_set_device_cookie(doc.name, token)
	log_attempt("Device", "Success", "device registered", device=doc.name)
	frappe.db.commit()
	frappe.local._xpos_device = {k: doc.get(k) for k in ("name", "device_label", "device_type", "location", "pos_profile")}
	return _device_payload(frappe.local._xpos_device)


@frappe.whitelist(methods=["POST"])
def register_this_device(device_label: str, device_type: str = sec.DEVICE_TILL, location: str | None = None, pos_profile: str | None = None):
	"""Administrator signed in on the device itself: approve and register it in one step."""
	made = create_device_code(device_label, device_type, location, pos_profile)
	doc = frappe.get_doc(DEVICE, made["device"])
	token = sec.new_token()
	_activate(doc, token)
	_set_device_cookie(doc.name, token)
	log_attempt("Device", "Success", "registered by administrator on the device", user=frappe.session.user, device=doc.name)
	frappe.db.commit()
	return _device_payload({k: doc.get(k) for k in ("name", "device_label", "device_type", "location", "pos_profile")})


@frappe.whitelist()
def list_devices():
	from custom_erp.api import pos_core

	pos_core.require_manager()
	return frappe.get_all(
		DEVICE,
		fields=["name", "device_label", "device_type", "status", "location", "pos_profile", "registered_at", "last_seen", "last_user", "code_expires"],
		order_by="creation desc",
		limit_page_length=500,
	)


@frappe.whitelist(methods=["POST"])
def update_device(device: str, device_label: str | None = None, device_type: str | None = None, location: str | None = None, pos_profile: str | None = None):
	from custom_erp.api import pos_core

	pos_core.require_manager()
	doc = frappe.get_doc(DEVICE, device)
	new_type = device_type or doc.device_type
	new_loc = (location or None) if location is not None else doc.location
	new_prof = (pos_profile or None) if pos_profile is not None else doc.pos_profile
	_validate_device_fields(new_type, new_loc, new_prof)
	if device_label:
		doc.device_label = device_label.strip()[:60]
	doc.device_type, doc.location, doc.pos_profile = new_type, new_loc, new_prof
	doc.save(ignore_permissions=True)
	# A changed type changes what may run there: end its sessions so they re-sign in.
	end_sessions({"device": device}, "Device settings changed")
	frappe.db.commit()
	return {"device": doc.name}


@frappe.whitelist(methods=["POST"])
def revoke_device(device: str):
	"""Administrator: switch a device off. Its sessions end immediately and its cookie
	stops working; it must be registered again with a new approval code."""
	from custom_erp.api import pos_core

	pos_core.require_manager()
	doc = frappe.get_doc(DEVICE, device)
	doc.status = "Revoked"
	doc.token_hash = None
	doc.approval_code_hash = None
	doc.revoked_at = now_datetime()
	doc.revoked_by = frappe.session.user
	doc.save(ignore_permissions=True)
	_cache().delete_value(f"xpos:devstatus:{device}")
	end_sessions({"device": device}, "Device revoked")
	log_attempt("Device", "Refused", "device revoked", user=frappe.session.user, device=device)
	frappe.db.commit()
	return {"device": device, "status": "Revoked"}


# ------------------------------------------------------------- login context


def _staff_rows(location: str | None):
	"""Active, non-administrator PIN holders (at `location`, or everywhere)."""
	from custom_erp.api import pos_core

	rows = frappe.get_all(PIN, filters={"active": 1}, fields=["user", "staff_code", "location", "pos_profile"], limit_page_length=0)
	out = []
	for r in rows:
		if not r.staff_code or "System Manager" in frappe.get_roles(r.user):
			continue
		if not frappe.db.get_value("User", r.user, "enabled"):
			continue
		if location:
			where = pos_core.user_location(r.user)
			if where and where != location:
				continue
		out.append(r)
	return out


@frappe.whitelist(allow_guest=True)
def login_context():
	"""What the sign-in panel needs on this tenant site: device registration, whether the
	staff picker is offered, PIN length. Staff names are only listed to a registered
	device (and only as first name + initial)."""
	s = auth_settings()
	device = current_device()
	staff = []
	if device and s["show_staff_list"]:
		for r in _staff_rows(device.get("location")):
			full = frappe.db.get_value("User", r.user, "full_name")
			staff.append({"staff": r.staff_code, "name": sec.display_name(full), "initials": sec.initials(full)})
		staff.sort(key=lambda x: x["name"].lower())
	from custom_erp.api import pos

	company = frappe.db.get_single_value("Global Defaults", "default_company")
	return {
		"device": _device_payload(device),
		"require_registered_device": bool(s["require_registered_device"]),
		"can_sign_in": bool(device) or not s["require_registered_device"],
		"staff": staff,
		"pin_min": pos.PIN_MIN_LENGTH,
		"pin_max": pos.PIN_MAX_LENGTH,
		"company": company,
		"device_types": list(sec.DEVICE_TYPES),
	}


# ------------------------------------------------------------------ PIN login


def _pin_row_for(staff_code: str):
	return frappe.db.get_value(PIN, {"staff_code": staff_code, "active": 1}, ["name", "user", "pin_hash", "pos_profile", "failed_count", "locked_until"], as_dict=True)


def _record_user_failure(row, staff_code: str) -> None:
	"""Per-identity failure: persisted on the PIN row when the staff number is real
	(survives a cache flush), in the cache otherwise (same visible behaviour)."""
	if row:
		n = cint(row.failed_count) + 1
		delay = sec.lockout_seconds(n)
		frappe.db.set_value(
			PIN, row.name, {"failed_count": n, "locked_until": (now_datetime() + timedelta(seconds=delay)) if delay else None}, update_modified=False
		)
	else:
		_bump(_ident_key("staff", staff_code), sec.USER_FREE_ATTEMPTS)
	frappe.db.commit()


def _user_lock(row, staff_code: str):
	if row:
		if sec.is_hard_locked(cint(row.failed_count)):
			_throw_locked(0, hard=True)
		if row.locked_until and get_datetime(row.locked_until) > now_datetime():
			_throw_locked(int((get_datetime(row.locked_until) - now_datetime()).total_seconds()) + 1)
	else:
		left = _locked_for(_ident_key("staff", staff_code))
		if left:
			_throw_locked(left)


def _start_session(user: str, kind: str, device: dict | None, level: str | None) -> dict:
	"""Create the Frappe session (no password check — the caller verified the factor) and
	its POS Session record."""
	from frappe.auth import LoginManager

	login_manager = LoginManager()
	login_manager.user = user
	login_manager.post_login()
	return create_session_record(user, kind, device, level)


def _user_payload(user: str) -> dict:
	doc = frappe.get_doc("User", user)
	return {"name": doc.name, "email": doc.email, "full_name": doc.full_name, "user_image": doc.user_image, "roles": [r.role for r in doc.roles]}


def _default_register(user: str, device: dict | None) -> str | None:
	"""Register an order-taking session files its orders under (orders need one, the
	person never picks it): the device's, else the PIN's, else the first enabled one at
	their location."""
	from custom_erp.api import pos_core

	if device and device.get("pos_profile"):
		return device["pos_profile"]
	restricted = frappe.db.get_value(PIN, {"user": user, "active": 1}, "pos_profile")
	if restricted:
		return restricted
	loc = (device or {}).get("location") or pos_core.user_location(user)
	for name in frappe.get_all("POS Profile", filters={"disabled": 0}, pluck="name", order_by="name asc"):
		pl = pos_core.location_of(name)
		if not loc or (pl and pl.location_code == loc):
			return name
	return None


@frappe.whitelist(allow_guest=True, methods=["POST"])
def pin_login(staff: str, pin: str):
	"""Staff sign-in: staff number (or the picker's value) + PIN, on this tenant site.

	Refuses administrators (System Manager -> management login), unregistered devices
	when the device policy is on, and roles the device type doesn't allow. Every
	outcome is logged; errors are generic."""
	from custom_erp.api import pos, pos_core

	require_pos_entitlement(for_login=True)
	s = auth_settings()
	device = current_device()
	dev_id = device["name"] if device else None
	if s["require_registered_device"] and not device:
		log_attempt("PIN", "Refused", "device not registered")
		_err("[DEVICE_NOT_REGISTERED] This device isn't registered for this organization. Ask a manager for an approval code.", frappe.PermissionError)

	check_ip_lock()
	staff_code = sec.normalize_staff_code(staff) or ""
	row = _pin_row_for(staff_code) if staff_code else None
	_user_lock(row, staff_code or "-")

	pin = (pin or "").strip()
	ok = bool(row) and pin.isdigit() and pos.PIN_MIN_LENGTH <= len(pin) <= pos.PIN_MAX_LENGTH and sec.constant_time_equal(row.pin_hash, pos._hash_pin(pin))
	if ok and not frappe.db.get_value("User", row.user, "enabled"):
		ok = False
	if not ok:
		_record_user_failure(row, staff_code or "-")
		record_ip_failure()
		log_attempt("PIN", "Failed", "bad staff/PIN", user=row.user if row else None, staff=staff_code, device=dev_id)
		_err(GENERIC_PIN_ERROR, frappe.AuthenticationError)

	user = row.user
	if "System Manager" in frappe.get_roles(user):
		log_attempt("PIN", "Refused", "administrator PIN refused", user=user, staff=staff_code, device=dev_id)
		_err("[ADMIN_USE_MANAGEMENT_LOGIN] Administrators sign in with email, password and authenticator code (Management sign-in).", frappe.PermissionError)
	level = pos_core.pos_level(user)
	if not level or not sec.allowed_on_device(level, device and device.get("device_type"), bool(s["allow_waiter_on_till"])):
		log_attempt("PIN", "Refused", f"{level or 'no'} role not allowed on {device and device.get('device_type')}", user=user, staff=staff_code, device=dev_id)
		_err("[ROLE_NOT_ALLOWED_ON_DEVICE] Your role can't sign in on this device. Use a device set up for your role.", frappe.PermissionError)

	frappe.db.set_value(PIN, row.name, {"failed_count": 0, "locked_until": None}, update_modified=False)
	_clear(_ip_state_key())
	session = _start_session(user, "PIN", device, level)
	log_attempt("PIN", "Success", "", user=user, staff=staff_code, device=dev_id)
	frappe.db.commit()
	return {"user": _user_payload(user), "pos_profile": row.pos_profile or None, "session": session}


# --------------------------------------------------------- management login


def _otp_secret(user: str) -> str | None:
	from frappe.twofactor import get_default
	from frappe.utils.password import decrypt

	raw = get_default(user + "_otpsecret")
	return decrypt(raw) if raw else None


def _verify_totp(user: str, secret: str, otp: str) -> bool:
	import pyotp

	otp = str(otp or "").strip()
	if not sec.totp_window_ok(otp):
		return False
	if not pyotp.TOTP(secret).verify(otp, valid_window=1):
		return False
	# A code is single-use: refuse a replay within its validity window.
	key = f"xpos:totp_used:{sec.sha256_hex(user)[:24]}:{otp}"
	if _cache().get_value(key):
		return False
	_cache().set_value(key, 1, expires_in_sec=120)
	return True


@frappe.whitelist(allow_guest=True, methods=["POST"])
def management_login(usr: str, pwd: str, otp: str | None = None, enroll_token: str | None = None):
	"""Administrator sign-in for the POS: email + password + authenticator (TOTP) code.

	Uses the same per-user TOTP secret Frappe's built-in two-factor auth stores, so the
	same authenticator entry works if Frappe 2FA is later switched on site-wide. First
	sign-in enrols the authenticator (returns status 'enroll' with a QR code)."""
	from frappe.utils.password import check_password

	require_pos_entitlement()
	check_ip_lock()
	ident = (usr or "").strip().lower()
	ukey = _ident_key("mgmt", ident or "-")
	left = _locked_for(ukey)
	if left:
		_throw_locked(left)

	user = frappe.db.get_value("User", {"name": ident}) or frappe.db.get_value("User", {"email": ident})

	def fail(reason: str):
		_bump(ukey, sec.USER_FREE_ATTEMPTS)
		record_ip_failure()
		log_attempt("Management", "Failed", reason, user=user)
		_err(GENERIC_MGMT_ERROR, frappe.AuthenticationError)

	if not user or user in ("Guest", "Administrator") or not frappe.db.get_value("User", user, "enabled"):
		fail("unknown or disabled user")
	try:
		check_password(user, pwd or "")
	except frappe.AuthenticationError:
		fail("bad password")
	if "System Manager" not in frappe.get_roles(user):
		log_attempt("Management", "Refused", "not an administrator", user=user)
		_err("[NOT_ADMIN] Management sign-in is for administrators. Staff sign in with their staff number and PIN.", frappe.PermissionError)

	s = auth_settings()
	if s["require_management_2fa"]:
		secret = _otp_secret(user)
		if not secret:
			pending_key = f"xpos:enroll:{sec.sha256_hex(enroll_token)}" if enroll_token else None
			pending = _cache().get_value(pending_key) if pending_key else None
			if not (pending and isinstance(pending, dict) and pending.get("user") == user and otp):
				import pyotp
				from frappe.twofactor import get_qr_svg_code

				new_secret = pyotp.random_base32()
				token = sec.new_token(18)
				_cache().set_value(f"xpos:enroll:{sec.sha256_hex(token)}", {"user": user, "secret": new_secret}, expires_in_sec=ENROLL_TTL_SECONDS)
				issuer = "XentraERP POS"
				uri = pyotp.TOTP(new_secret).provisioning_uri(name=user, issuer_name=issuer)
				qr = get_qr_svg_code(uri)
				return {
					"status": "enroll",
					"enroll_token": token,
					"secret": new_secret,
					"otpauth_uri": uri,
					"qr_svg_base64": qr.decode() if isinstance(qr, bytes) else qr,
				}
			if not _verify_totp(user, pending["secret"], otp):
				fail("bad enrolment code")
			from frappe.twofactor import set_default
			from frappe.utils.password import encrypt

			set_default(user + "_otpsecret", encrypt(pending["secret"]))
			_cache().delete_value(pending_key)
		else:
			if not otp:
				return {"status": "otp_required"}
			if not _verify_totp(user, secret, otp):
				fail("bad authenticator code")

	_clear(ukey)
	_clear(_ip_state_key())
	device = current_device()
	session = _start_session(user, "Management", device, "admin")
	log_attempt("Management", "Success", "", user=user, device=device["name"] if device else None)
	frappe.db.commit()
	return {"status": "ok", "user": _user_payload(user), "pos_profile": None, "session": session}


@frappe.whitelist(methods=["POST"])
def reset_management_2fa(user: str):
	"""Administrator: clear another administrator's authenticator (lost phone). They enrol
	again at their next management sign-in. Refused for yourself."""
	from custom_erp.api import pos_core
	from frappe.twofactor import clear_default

	pos_core.require_manager()
	if user == frappe.session.user:
		_err("Ask another administrator to reset your authenticator.")
	clear_default(user + "_otpsecret")
	log_attempt("Management", "Refused", f"authenticator reset by {frappe.session.user}", user=user)
	end_sessions({"user": user}, "Authenticator reset")
	frappe.db.commit()
	return {"user": user}


# -------------------------------------------------------------- POS sessions


def _sid() -> str | None:
	sid = getattr(frappe.session, "sid", None)
	return sid if sid and sid != "Guest" else None


def _key(sid: str) -> str:
	return sec.sha256_hex(sid)


def _cache_key(key: str) -> str:
	return f"xpos:sess:{key}"


def create_session_record(user: str, kind: str, device: dict | None, level: str | None) -> dict:
	from custom_erp.api import pos_core

	s = auth_settings()
	sid = _sid()
	if not sid:
		return {}
	now = now_datetime()
	device_type = device.get("device_type") if device else None
	mode = sec.session_mode(level, device_type)
	doc = frappe.get_doc(
		{
			"doctype": SESSION,
			"session_key": _key(sid),
			"user": user,
			"login_kind": kind,
			"device": device["name"] if device else None,
			"device_type": device_type,
			"session_mode": mode,
			"ip_address": _ip()[:60],
			"user_agent": _user_agent(),
			"started_at": now,
			"last_seen": now,
			"expires_at": now + timedelta(hours=s["session_max_hours"]) if s["session_max_hours"] else None,
			"status": "Active",
		}
	).insert(ignore_permissions=True)
	if device:
		frappe.db.set_value(DEVICE, device["name"], {"last_seen": now, "last_user": user, "last_ip": _ip()[:60]}, update_modified=False)
	state = _state_from_doc(doc)
	_cache().set_value(_cache_key(doc.session_key), state, expires_in_sec=6 * 3600)
	return session_summary(state, user=user, device=device, level=level or pos_core.pos_level(user))


def _state_from_doc(doc) -> dict:
	return {
		"name": doc.name,
		"user": doc.user,
		"kind": doc.login_kind,
		"device": doc.device,
		"device_type": doc.device_type,
		"mode": doc.session_mode,
		"started": get_datetime(doc.started_at).timestamp(),
		"expires": get_datetime(doc.expires_at).timestamp() if doc.expires_at else 0,
		"status": doc.status,
		"locked": cint(doc.locked),
		"seen_db": time.time(),
	}


def current_state() -> dict | None:
	"""This request's POS session state, or None for a non-POS session (ERP login,
	legacy PIN session). Cached; a miss is cached as 'none' for 5 minutes."""
	if hasattr(frappe.local, "_xpos_state"):
		return frappe.local._xpos_state
	state = None
	sid = _sid()
	if sid:
		key = _key(sid)
		cached = _cache().get_value(_cache_key(key))
		if isinstance(cached, dict) and cached.get("none"):
			state = None
		elif isinstance(cached, dict):
			state = cached
		else:
			name = frappe.db.get_value(SESSION, {"session_key": key}, "name")
			if name:
				state = _state_from_doc(frappe.get_doc(SESSION, name))
				_cache().set_value(_cache_key(key), state, expires_in_sec=6 * 3600)
			else:
				_cache().set_value(_cache_key(key), {"none": 1}, expires_in_sec=300)
	frappe.local._xpos_state = state
	return state


def _save_state(state: dict):
	sid = _sid()
	if sid:
		_cache().set_value(_cache_key(_key(sid)), state, expires_in_sec=6 * 3600)
	frappe.local._xpos_state = state


def current_cap_mask():
	state = current_state()
	if not state:
		return None
	from custom_erp.api import pos_core

	return sec.device_cap_mask(pos_core.pos_level(state["user"]), state.get("device_type"))


def session_summary(state: dict | None = None, user: str | None = None, device: dict | None = None, level: str | None = None) -> dict:
	"""What the app shell needs about this session."""
	state = state if state is not None else current_state()
	s = auth_settings()
	if not state:
		return {"pos_session": False, "mode": None, "idle_lock_minutes": s["idle_lock_minutes"]}
	user = user or state["user"]
	if device is None and state.get("device"):
		device = frappe.db.get_value(DEVICE, state["device"], ["name", "device_label", "device_type", "location", "pos_profile"], as_dict=True)
	mode = state.get("mode")
	return {
		"pos_session": True,
		"id": state.get("name"),
		"kind": state.get("kind"),
		"mode": mode,
		"device": _device_payload(dict(device) if device else None),
		"needs_register": mode in ("till", "manager"),
		"default_register": _default_register(user, dict(device) if device else None) if mode in ("order", "kitchen") else (device or {}).get("pos_profile"),
		"locked": bool(state.get("locked")),
		"expires_at": state.get("expires") or None,
		"idle_lock_minutes": s["idle_lock_minutes"],
	}


def _end_record(name: str, status: str, reason: str):
	frappe.db.set_value(SESSION, name, {"status": status, "ended_at": now_datetime(), "end_reason": (reason or "")[:140]}, update_modified=False)


def _kill_frappe_session(session_key: str, reason: str):
	"""Delete the Frappe session whose sid hashes to `session_key`."""
	from frappe.sessions import delete_session

	user = frappe.db.get_value(SESSION, {"session_key": session_key}, "user")
	if not user:
		return
	for sid in frappe.get_all("Sessions", filters={"user": user}, pluck="sid") if frappe.db.table_exists("Sessions") else []:
		if _key(sid) == session_key:
			delete_session(sid, reason=reason)
	_cache().delete_value(_cache_key(session_key))


def end_sessions(filters: dict, reason: str, status: str = "Revoked", keep_current: bool = False):
	"""End every active POS session matching `filters` (user / device / name)."""
	current = _key(_sid()) if (keep_current and _sid()) else None
	for row in frappe.get_all(SESSION, filters={**filters, "status": "Active"}, fields=["name", "session_key"], limit_page_length=0):
		if current and row.session_key == current:
			continue
		_end_record(row.name, status, reason)
		_kill_frappe_session(row.session_key, reason)


def end_user_sessions(user: str, reason: str):
	"""End ALL Frappe sessions of a user (POS or not), e.g. their PIN was switched off."""
	from frappe.sessions import delete_session

	end_sessions({"user": user}, reason)
	for sid in frappe.get_all("Sessions", filters={"user": user}, pluck="sid"):
		delete_session(sid, reason=reason)


def _device_active(device: str) -> bool:
	"""Device status for the per-request check, cached 30 s (revoke_device clears it)."""
	key = f"xpos:devstatus:{device}"
	status = _cache().get_value(key)
	if status is None:
		status = frappe.db.get_value(DEVICE, device, "status") or "Missing"
		_cache().set_value(key, status, expires_in_sec=30)
	return status == "Active"


def _pos_tables_ready() -> bool:
	"""False on sites where custom_erp is installed but the POS doctypes were never
	migrated (e.g. the control-plane site). Cached for 10 minutes."""
	flag = _cache().get_value("xpos:tables_ready")
	if flag is None:
		flag = 1 if frappe.db.table_exists(SESSION) else 0
		_cache().set_value("xpos:tables_ready", flag, expires_in_sec=600)
	return bool(cint(flag))


def enforce_pos_session():
	"""auth_hooks entry: runs on every request after the session is resolved. Only acts on
	sessions that have a POS Session record."""
	try:
		if frappe.session.user in (None, "Guest") or not _pos_tables_ready():
			return
		state = current_state()
	except Exception:
		# Never take every request down because of this check (logged once per 10 min).
		if not _cache().get_value("xpos:hook_err"):
			_cache().set_value("xpos:hook_err", 1, expires_in_sec=600)
			frappe.log_error(title="POS session check failed")
		return
	if not state:
		return
	now = time.time()
	reason = None
	if state.get("status") != "Active":
		reason = "Session ended"
	elif state.get("expires") and now > flt(state["expires"]):
		reason = "Session expired"
	elif state.get("device") and not _device_active(state["device"]):
		reason = "Device revoked"
	if reason:
		_end_record(state["name"], "Expired" if reason == "Session expired" else "Revoked", reason)
		sid = _sid()
		_cache().delete_value(_cache_key(_key(sid)))
		from frappe.sessions import delete_session

		delete_session(sid, reason=reason)
		frappe.local._xpos_state = None
		raise frappe.SessionExpired(f"[SESSION_EXPIRED] {reason}. Please sign in again.")
	if state.get("locked"):
		method = sec.method_from_path(getattr(frappe.request, "path", None)) or frappe.form_dict.get("cmd")
		if method not in sec.LOCKED_ALLOWED_METHODS:
			raise frappe.PermissionError("[POS_SESSION_LOCKED] The screen is locked. Enter your PIN to continue.")
	# Touch last_seen in the DB at most every 5 minutes.
	if now - flt(state.get("seen_db")) > 300:
		frappe.db.set_value(SESSION, state["name"], "last_seen", now_datetime(), update_modified=False)
		frappe.db.commit()
		state["seen_db"] = now
		_save_state(state)


def _require_state() -> dict:
	state = current_state()
	if not state:
		_err("[NO_POS_SESSION] This isn't a POS session.", frappe.PermissionError)
	return state


@frappe.whitelist()
def session_info():
	from custom_erp.api import pos_core

	state = current_state()
	return {**session_summary(state), "user": frappe.session.user, "level": pos_core.pos_level() if frappe.session.user != "Guest" else None}


@frappe.whitelist(methods=["POST"])
def lock_session():
	"""Lock the till (idle timer or the 'Lock' button). Only unlock_session/logout work
	until the same person re-enters their PIN (or password for administrators)."""
	state = _require_state()
	state["locked"] = 1
	frappe.db.set_value(SESSION, state["name"], "locked", 1, update_modified=False)
	frappe.db.commit()
	_save_state(state)
	return {"locked": True}


@frappe.whitelist(methods=["POST"])
def unlock_session(pin: str | None = None, password: str | None = None):
	from custom_erp.api import pos

	state = _require_state()
	user = frappe.session.user
	check_ip_lock()
	ok = False
	if state.get("kind") == "Management":
		from frappe.utils.password import check_password

		left = _locked_for(_ident_key("mgmt", user))
		if left:
			_throw_locked(left)

		try:
			check_password(user, password or "")
			ok = True
		except frappe.AuthenticationError:
			ok = False
		ukey = _ident_key("mgmt", user)
		if not ok:
			_bump(ukey, sec.USER_FREE_ATTEMPTS)
	else:
		row = frappe.db.get_value(PIN, {"user": user, "active": 1}, ["name", "pin_hash", "failed_count", "locked_until", "staff_code"], as_dict=True)
		_user_lock(row, user)
		p = (pin or "").strip()
		ok = bool(row) and p.isdigit() and sec.constant_time_equal(row.pin_hash, pos._hash_pin(p))
		if not ok:
			_record_user_failure(row, user)
		elif row:
			frappe.db.set_value(PIN, row.name, {"failed_count": 0, "locked_until": None}, update_modified=False)
	if not ok:
		record_ip_failure()
		log_attempt("Unlock", "Failed", "bad unlock factor", user=user, device=state.get("device"))
		frappe.db.commit()
		_err("[BAD_CREDENTIALS] That didn't match. Try again.", frappe.AuthenticationError)
	state["locked"] = 0
	frappe.db.set_value(SESSION, state["name"], "locked", 0, update_modified=False)
	log_attempt("Unlock", "Success", "", user=user, device=state.get("device"))
	frappe.db.commit()
	_save_state(state)
	return {"locked": False}


@frappe.whitelist(methods=["POST"])
def logout():
	"""Secure sign-out: ends the POS session record and the Frappe session."""
	state = current_state()
	if state:
		_end_record(state["name"], "Ended", "Signed out")
		_cache().delete_value(_cache_key(_key(_sid())))
	frappe.local.login_manager.logout()
	frappe.db.commit()
	return {"ok": True}


def _session_rows(filters: dict, limit: int = 100):
	current = _key(_sid()) if _sid() else None
	rows = frappe.get_all(
		SESSION,
		filters=filters,
		fields=["name", "user", "login_kind", "device", "device_type", "session_mode", "ip_address", "user_agent", "started_at", "last_seen", "expires_at", "status", "end_reason", "session_key"],
		order_by="started_at desc",
		limit_page_length=limit,
	)
	labels = {d.name: d.device_label for d in frappe.get_all(DEVICE, fields=["name", "device_label"], limit_page_length=0)}
	for r in rows:
		r["current"] = r.pop("session_key") == current
		r["device_label"] = labels.get(r.device)
	return rows


@frappe.whitelist()
def list_my_sessions():
	return _session_rows({"user": frappe.session.user, "status": "Active"})


@frappe.whitelist()
def list_sessions(user: str | None = None, active_only: int = 1):
	from custom_erp.api import pos_core

	pos_core.require_manager()
	filters = {"status": "Active"} if cint(active_only) else {}
	if user:
		filters["user"] = user
	return _session_rows(filters, limit=300)


@frappe.whitelist(methods=["POST"])
def revoke_session(session: str):
	"""End one POS session: your own, or anyone's for an administrator."""
	from custom_erp.api import pos_core

	owner = frappe.db.get_value(SESSION, session, "user")
	if not owner:
		_err("No such session.")
	if owner != frappe.session.user:
		pos_core.require_manager()
	end_sessions({"name": session}, f"Revoked by {frappe.session.user}")
	frappe.db.commit()
	return {"session": session, "status": "Revoked"}


@frappe.whitelist(methods=["POST"])
def revoke_other_sessions():
	"""'Sign out of other devices': every other POS session of the current user."""
	if frappe.session.user == "Guest":
		_err("Please log in.", frappe.PermissionError)
	end_sessions({"user": frappe.session.user}, "Signed out from another device", keep_current=True)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def login_history(user: str | None = None, limit: int = 50):
	"""Recent sign-in attempts: your own, or (administrators) anyone's / everyone's."""
	from custom_erp.api import pos_core

	if frappe.session.user == "Guest":
		_err("Please log in.", frappe.PermissionError)
	if user != frappe.session.user and not pos_core.is_manager():
		user = frappe.session.user
	filters = {"user": user} if user else {}
	return frappe.get_all(
		ATTEMPT,
		filters=filters,
		fields=["name", "attempt_at", "kind", "result", "reason", "user", "staff_ref", "device", "ip_address"],
		order_by="attempt_at desc",
		limit_page_length=min(500, max(1, cint(limit))),
	)


# --------------------------------------------------------------- staff admin


@frappe.whitelist()
def list_staff_security():
	"""Administrator: staff numbers, lockout state (never PINs)."""
	from custom_erp.api import pos_core

	pos_core.require_manager()
	out = []
	for r in frappe.get_all(PIN, fields=["user", "staff_code", "active", "failed_count", "locked_until", "location"], order_by="staff_code asc", limit_page_length=0):
		out.append(
			{
				**r,
				"full_name": frappe.db.get_value("User", r.user, "full_name"),
				"hard_locked": sec.is_hard_locked(cint(r.failed_count)),
				"is_admin": "System Manager" in frappe.get_roles(r.user),
			}
		)
	return out


@frappe.whitelist(methods=["POST"])
def unlock_staff(user: str):
	from custom_erp.api import pos_core

	pos_core.require_manager()
	if not frappe.db.exists(PIN, user):
		_err("That user has no PIN.")
	frappe.db.set_value(PIN, user, {"failed_count": 0, "locked_until": None})
	log_attempt("PIN", "Success", f"unlocked by {frappe.session.user}", user=user)
	frappe.db.commit()
	return {"user": user}


@frappe.whitelist(methods=["POST"])
def set_staff_code(user: str, staff_code: str):
	from custom_erp.api import pos_core

	pos_core.require_manager()
	code = sec.normalize_staff_code(staff_code)
	if not code:
		_err("A staff number is 2-12 letters or digits.")
	if not frappe.db.exists(PIN, user):
		_err("That user has no PIN.")
	if frappe.db.exists(PIN, {"staff_code": code, "user": ["!=", user]}):
		_err("That staff number is already used by someone else.")
	frappe.db.set_value(PIN, user, "staff_code", code)
	frappe.db.commit()
	return {"user": user, "staff_code": code}


def next_staff_code() -> str:
	"""A random unused 4-digit staff number."""
	import secrets

	used = set(frappe.get_all(PIN, filters={"staff_code": ["is", "set"]}, pluck="staff_code"))
	for _ in range(500):
		code = str(1000 + secrets.randbelow(9000))
		if code not in used:
			return code
	for n in range(10000, 1000000):
		if str(n) not in used:
			return str(n)
	_err("Couldn't allocate a staff number.")


# ------------------------------------------------- organization lookup (control plane)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def lookup_organization(tenant_code: str):
	"""POS step 1, on the CONTROL-PLANE site: is this organization code usable? Returns
	only the organization's display name. Rate limited per IP; unknown, pending,
	suspended and cancelled codes all get the same answer."""
	ip = _ip()
	window = sec.LOOKUP_WINDOW_SECONDS
	all_key, fail_key = f"xpos:lookup:{ip}", f"xpos:lookupfail:{ip}"
	if sec.over_limit(_get_int(all_key), sec.LOOKUP_LIMIT) or sec.over_limit(_get_int(fail_key), sec.LOOKUP_FAIL_LIMIT):
		_err("[RATE_LIMITED] Too many attempts. Please wait a few minutes and try again.", frappe.TooManyRequestsError)
	_cache().set_value(all_key, _get_int(all_key) + 1, expires_in_sec=window)
	code = str(tenant_code or "").strip().lower()
	row = None
	if sec.valid_tenant_code(code) and frappe.db.exists("DocType", "XentraERP Tenant"):
		found = frappe.get_all(
			"XentraERP Tenant", filters={"tenant_code": code}, fields=["organization_name", "status", "provisioning_status", "site_name"], limit_page_length=1
		)
		row = found[0] if found else None
	outcome = sec.lookup_outcome(row.status, row.provisioning_status, row.site_name) if row else "unavailable"
	if outcome == "unavailable":
		_cache().set_value(fail_key, _get_int(fail_key) + 1, expires_in_sec=window)
		_err("[ORG_NOT_FOUND] We couldn't find an active organization with that code. Check the code or contact your administrator.")
	if outcome == "setup":
		_err("[ORG_SETTING_UP] This organization is still being set up. Please try again in a few minutes.")
	return {"organization_name": row.organization_name, "tenant_code": code}
