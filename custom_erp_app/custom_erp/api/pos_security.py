"""Pure policy helpers for POS authentication (no Frappe import).

Everything here is deterministic and side-effect free so it can be unit-tested
without a bench (`python3 -m unittest discover -s scripts/pos-checks/unit`).
`custom_erp.api.pos_auth` wires these rules to Frappe (cache, DocTypes, sessions).

Device and session modes (F&B front-of-house split, Retail single role):

=================  ========================================  =======================================
Device type        Who may sign in (POS level)               Session mode / what it can do
=================  ========================================  =======================================
Till               cashier, supervisor                       "till": register + shift + payments
                   waiter only if `allow_waiter_on_till`      waiter on a till is still "order" mode
Order Taking       waiter, cashier, supervisor               "order": floor, orders, KOT, request
                                                              bill; cashier caps masked (no bill/shift)
Kitchen Display    kitchen, supervisor                       "kitchen": kitchen board only
(none)             anyone (legacy / device policy off)       derived from the level
=================  ========================================  =======================================

Supervisors keep every capability on every device type. Administrators (System
Manager) never use a PIN — they use the management login (password + TOTP).
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets

# ----------------------------------------------------------------- lockout

USER_FREE_ATTEMPTS = 3  # failures allowed before any delay, per staff identity
IP_FREE_ATTEMPTS = 5  # failures allowed before any delay, per client IP
BASE_DELAY_SECONDS = 30
MAX_DELAY_SECONDS = 15 * 60
USER_HARD_LOCK_AT = 10  # consecutive failures that lock a staff PIN until an admin unlocks it
IP_WINDOW_SECONDS = 15 * 60  # IP counters expire after this much quiet time


def lockout_seconds(failures: int, free: int = USER_FREE_ATTEMPTS, base: int = BASE_DELAY_SECONDS, cap: int = MAX_DELAY_SECONDS) -> int:
	"""Progressive delay after `failures` consecutive failures: nothing for the first
	`free`, then base, 2x base, 4x base ... capped at `cap`."""
	if failures <= free:
		return 0
	return int(min(cap, base * (2 ** (failures - free - 1))))


def is_hard_locked(failures: int, limit: int = USER_HARD_LOCK_AT) -> bool:
	return failures >= limit


# ------------------------------------------------------- devices and roles

DEVICE_TILL = "Till"
DEVICE_ORDER = "Order Taking"
DEVICE_KITCHEN = "Kitchen Display"
DEVICE_TYPES = (DEVICE_TILL, DEVICE_ORDER, DEVICE_KITCHEN)

LEVELS = ("kitchen", "waiter", "cashier", "supervisor", "admin")

# Capabilities a device type permits for levels below supervisor (None = no mask).
_ORDER_DEVICE_CAPS = frozenset({"view", "kot", "order", "reserve", "modify"})
_KITCHEN_DEVICE_CAPS = frozenset({"view", "kot"})


def allowed_on_device(level: str | None, device_type: str | None, allow_waiter_on_till: bool = True) -> bool:
	"""Whether a person at `level` may sign in on a device of `device_type`.
	No device type (unregistered device, device policy off) = no restriction."""
	if not level:
		return False
	if level == "admin":
		return True  # management login only; device type never blocks it (break-glass)
	if not device_type:
		return True
	if level == "supervisor":
		return True
	if device_type == DEVICE_TILL:
		return level == "cashier" or (level == "waiter" and bool(allow_waiter_on_till))
	if device_type == DEVICE_ORDER:
		return level in ("waiter", "cashier")
	if device_type == DEVICE_KITCHEN:
		return level == "kitchen"
	return False


def device_cap_mask(level: str | None, device_type: str | None):
	"""The capability mask a device type puts on a session, or None for no mask."""
	if level in ("supervisor", "admin") or not device_type:
		return None
	if device_type == DEVICE_ORDER:
		return _ORDER_DEVICE_CAPS
	if device_type == DEVICE_KITCHEN:
		return _KITCHEN_DEVICE_CAPS
	return None


def session_mode(level: str | None, device_type: str | None) -> str:
	"""'till' (register + shift + payments), 'order' (floor/orders only, no register or
	shift), 'kitchen' (kitchen board) or 'manager' (management login)."""
	if level == "admin":
		return "manager"
	if level == "kitchen" or device_type == DEVICE_KITCHEN:
		return "kitchen"
	if device_type == DEVICE_ORDER:
		return "order" if level != "supervisor" else "till"
	if level == "waiter":
		return "order"
	return "till"


def mask_caps(caps, mask):
	caps = set(caps or ())
	return sorted(caps if mask is None else caps & set(mask))


# ------------------------------------------------------------ identifiers

_STAFF_RE = re.compile(r"^[A-Z0-9]{2,12}$")
APPROVAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/L
APPROVAL_LENGTH = 8
_TENANT_RE = re.compile(r"^[a-z0-9]{2,10}$")


def normalize_staff_code(value) -> str | None:
	code = re.sub(r"[\s-]", "", str(value or "")).upper()
	return code if _STAFF_RE.match(code) else None


def normalize_approval_code(value) -> str | None:
	code = re.sub(r"[\s-]", "", str(value or "")).upper()
	if len(code) != APPROVAL_LENGTH or any(c not in APPROVAL_ALPHABET for c in code):
		return None
	return code


def generate_approval_code(rand=secrets.choice) -> str:
	return "".join(rand(APPROVAL_ALPHABET) for _ in range(APPROVAL_LENGTH))


def format_approval_code(code: str) -> str:
	return f"{code[:4]}-{code[4:]}" if code and len(code) == APPROVAL_LENGTH else code


def valid_tenant_code(value) -> bool:
	return bool(_TENANT_RE.match(str(value or "")))


def sha256_hex(value: str) -> str:
	return hashlib.sha256(str(value).encode()).hexdigest()


def constant_time_equal(a: str | None, b: str | None) -> bool:
	return bool(a) and bool(b) and hmac.compare_digest(str(a), str(b))


def new_token(nbytes: int = 32) -> str:
	return secrets.token_urlsafe(nbytes)


def split_device_cookie(value) -> tuple[str | None, str | None]:
	"""Device cookie = '<device id>.<secret token>'."""
	value = str(value or "")
	if "." not in value:
		return None, None
	dev, token = value.split(".", 1)
	if not re.match(r"^[A-Za-z0-9-]{4,40}$", dev) or len(token) < 20:
		return None, None
	return dev, token


def display_name(full_name: str | None) -> str:
	"""What the staff picker shows: first name + last initial ("Aisha K.")."""
	parts = [p for p in str(full_name or "").split() if p]
	if not parts:
		return "Staff"
	if len(parts) == 1:
		return parts[0][:24]
	return f"{parts[0][:20]} {parts[-1][0].upper()}."


def initials(full_name: str | None) -> str:
	parts = [p for p in str(full_name or "").split() if p]
	return "".join(p[0] for p in parts[:2]).upper() or "?"


# ------------------------------------------------------------- sessions

def session_too_old(started_ts: float, now_ts: float, max_hours: float) -> bool:
	return bool(max_hours) and (now_ts - started_ts) > float(max_hours) * 3600


def idle_exceeded(last_activity_ts: float, now_ts: float, idle_minutes: float) -> bool:
	return bool(idle_minutes) and (now_ts - last_activity_ts) > float(idle_minutes) * 60


# Methods a locked POS session may still call (unlock, inspect itself, leave).
LOCKED_ALLOWED_METHODS = frozenset(
	{
		"custom_erp.api.pos_auth.unlock_session",
		"custom_erp.api.pos_auth.session_info",
		"custom_erp.api.pos_auth.logout",
		"logout",
		"frappe.auth.get_logged_user",
		"xentraerp.auth.get_logged_user",
	}
)


def method_from_path(path: str | None) -> str | None:
	path = str(path or "")
	prefix = "/api/method/"
	if not path.startswith(prefix):
		return None
	return path[len(prefix):].split("/")[0].split("?")[0] or None


# ------------------------------------------------------- tenant lookups

def lookup_outcome(status: str | None, provisioning_status: str | None, site_name: str | None) -> str:
	"""'ok', 'setup' (still provisioning) or 'unavailable' (unknown/pending/suspended/...).
	The caller shows ONE generic message for 'unavailable' so the response does not
	reveal whether a code exists."""
	if status not in ("Trial", "Active"):
		return "unavailable"
	if not site_name or provisioning_status != "Completed":
		return "setup"
	return "ok"


LOOKUP_LIMIT = 20  # lookups per IP per window
LOOKUP_FAIL_LIMIT = 8  # unknown codes per IP per window
LOOKUP_WINDOW_SECONDS = 10 * 60


def over_limit(count: int, limit: int) -> bool:
	return int(count or 0) >= int(limit)


# ---------------------------------------------------------- entitlements

def effective_modules(fresh, last_known):
	"""Fresh answer from the control plane, else the last known good answer, else None."""
	if fresh is not None:
		return list(fresh)
	if last_known is not None:
		return list(last_known)
	return None


def module_allowed(modules, module_code: str, mode: str = "closed") -> bool:
	"""Fail CLOSED by default: unknown entitlements (control plane unreachable and no
	last-known value) deny. mode='open' restores the old behaviour; mode='off' skips."""
	if mode == "off":
		return True
	if modules is None:
		return mode == "open"
	return module_code in modules


# ----------------------------------------------------------------- TOTP

def totp_window_ok(otp) -> bool:
	return bool(re.match(r"^\d{6}$", str(otp or "").strip()))
