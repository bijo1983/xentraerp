import hashlib
import re
import secrets

import frappe
from frappe.utils import add_to_date, now_datetime

OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 30


def _hash_otp(otp: str) -> str:
	return hashlib.sha256(otp.encode()).hexdigest()


def _validate_identifier(identifier: str, channel: str):
	if channel == "email":
		if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", identifier or ""):
			frappe.throw("Enter a valid email address.")
	elif channel == "mobile":
		if not re.match(r"^\+?[0-9]{7,15}$", identifier or ""):
			frappe.throw("Enter a valid mobile number.")
	else:
		frappe.throw("Invalid channel.")


# Same OTP purpose as the ERP signup (the OTP DocType's Select only knows signup/login, and a
# new option would need a control-plane migrate); only the email's brand differs.
CLINZA_PURPOSE = "signup"


def _brand(brand: str | None) -> str:
	return "CLINZA" if (brand or "").lower() == "clinza" else "XentraERP"


@frappe.whitelist(allow_guest=True)
def request_otp(identifier: str, channel: str, purpose: str = "signup", brand: str | None = None):
	"""Generate and dispatch a 6-digit OTP to email or mobile."""
	identifier = (identifier or "").strip().lower() if channel == "email" else (identifier or "").strip()
	_validate_identifier(identifier, channel)

	recent = frappe.get_all(
		"XentraERP OTP",
		filters={
			"identifier": identifier,
			"channel": channel,
			"purpose": purpose,
			"creation": [">", add_to_date(now_datetime(), seconds=-RESEND_COOLDOWN_SECONDS)],
		},
		limit_page_length=1,
	)
	if recent:
		frappe.throw(f"Please wait {RESEND_COOLDOWN_SECONDS} seconds before requesting another code.")

	otp = f"{secrets.randbelow(1_000_000):06d}"

	frappe.get_doc(
		{
			"doctype": "XentraERP OTP",
			"identifier": identifier,
			"channel": channel,
			"purpose": purpose,
			"otp_hash": _hash_otp(otp),
			"expires_at": add_to_date(now_datetime(), minutes=OTP_TTL_MINUTES),
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()

	if channel == "email":
		try:
			frappe.sendmail(
				recipients=[identifier],
				subject=f"Your {_brand(brand)} verification code",
				message=(
					f"<p>Your {_brand(brand)} verification code is <b>{otp}</b>.</p>"
					f"<p>This code expires in {OTP_TTL_MINUTES} minutes.</p>"
				),
				now=True,
			)
		except Exception:
			frappe.log_error(title="XentraERP OTP email send failed")
	else:
		# SMS gateway not configured yet — log for now so signup can be tested end-to-end.
		frappe.logger("xentraerp").info(f"[DEV] Mobile OTP for {identifier}: {otp}")

	response = {"sent": True, "channel": channel, "expires_in_minutes": OTP_TTL_MINUTES}
	if frappe.conf.get("developer_mode"):
		response["dev_otp"] = otp
	return response


@frappe.whitelist(allow_guest=True)
def verify_otp(identifier: str, channel: str, otp: str, purpose: str = "signup"):
	identifier = (identifier or "").strip().lower() if channel == "email" else (identifier or "").strip()

	record = frappe.get_all(
		"XentraERP OTP",
		filters={
			"identifier": identifier,
			"channel": channel,
			"purpose": purpose,
			"verified": 0,
		},
		fields=["name", "otp_hash", "attempts", "expires_at"],
		order_by="creation desc",
		limit_page_length=1,
	)
	if not record:
		frappe.throw("No pending verification for this identifier. Please request a new code.")

	rec = record[0]
	if now_datetime() > frappe.utils.get_datetime(rec.expires_at):
		frappe.throw("Code expired. Please request a new one.")
	if rec.attempts >= OTP_MAX_ATTEMPTS:
		frappe.throw("Too many attempts. Please request a new code.")

	doc = frappe.get_doc("XentraERP OTP", rec.name)
	if _hash_otp((otp or "").strip()) != doc.otp_hash:
		doc.attempts = (doc.attempts or 0) + 1
		doc.save(ignore_permissions=True)
		frappe.db.commit()
		frappe.throw("Incorrect code. Please try again.")

	doc.verified = 1
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"verified": True}


def _is_verified(identifier: str, channel: str, purpose: str = "signup") -> bool:
	return bool(
		frappe.get_all(
			"XentraERP OTP",
			filters={
				"identifier": identifier,
				"channel": channel,
				"purpose": purpose,
				"verified": 1,
				"creation": [">", add_to_date(now_datetime(), minutes=-OTP_TTL_MINUTES)],
			},
			limit_page_length=1,
		)
	)


@frappe.whitelist(allow_guest=True)
def list_countries():
	"""Country names + dialing codes for the signup form's Country dropdown
	(public reference data) — ignore_permissions since Guest has no Country
	read access by default, and this is non-sensitive reference data."""
	from frappe.geo.country_info import get_all as get_all_country_info

	info = get_all_country_info()
	countries = frappe.get_all(
		"Country", fields=["country_name"], order_by="country_name asc", ignore_permissions=True
	)
	return [
		{"name": c.country_name, "isd": (info.get(c.country_name) or {}).get("isd") or ""}
		for c in countries
	]


def _generate_subdomain() -> str:
	"""Random 6-digit numeric subdomain — retried on the rare collision."""
	import secrets

	for _ in range(20):
		candidate = f"{secrets.randbelow(1_000_000):06d}"
		if not frappe.db.exists("XentraERP Tenant", {"subdomain": candidate}):
			return candidate
	frappe.throw("Could not generate a unique organization ID. Please try again.")


@frappe.whitelist(allow_guest=True)
def complete_signup(
	organization_name: str,
	admin_name: str,
	admin_email: str,
	admin_mobile: str,
	plan: str = "Free Trial",
	country: str | None = None,
	time_zone: str | None = None,
	subdomain: str | None = None,
	clinic_type: str | None = None,
):
	admin_email = (admin_email or "").strip().lower()
	admin_mobile = (admin_mobile or "").strip()

	if not admin_email or not admin_mobile:
		frappe.throw("Email and mobile number are required.")
	# The country decides the tenant's base currency, time zone and number formats.
	country = (country or "").strip()
	if not country or not frappe.db.exists("Country", country):
		frappe.throw("Please select your country.")

	# CLINZA: a clinic signs up with its clinic type, which decides the charting templates,
	# appointment types and starter services its site is provisioned with.
	clinic_type = (clinic_type or "").strip().lower() or None
	if clinic_type:
		from custom_erp.api.clinic_catalog import CLINIC_TYPES

		if clinic_type not in CLINIC_TYPES:
			frappe.throw("Please choose a valid clinic type.")

	subdomain = (subdomain or "").strip().lower() or _generate_subdomain()
	if frappe.db.exists("XentraERP Tenant", {"subdomain": subdomain}):
		frappe.throw("This subdomain is already taken. Please choose another.")

	# OTP verification is skipped for now — admin approval (see
	# custom_erp.api.tenants.approve_tenant) is the verification gate
	# until email/SMS delivery is wired up. The XentraERP OTP endpoints
	# above stay available for that later phase.
	tenant = frappe.get_doc(
		{
			"doctype": "XentraERP Tenant",
			"organization_name": organization_name,
			"subdomain": subdomain,
			"status": "Pending Approval",
			"plan": plan,
			"provisioning_status": "Pending",
			"tenant_admin_name": admin_name,
			"tenant_admin_email": admin_email,
			"tenant_admin_mobile": admin_mobile,
			"email_verified": 0,
			"mobile_verified": 0,
			"country": country,
			"time_zone": time_zone or None,
			"clinic_type": clinic_type,
		}
	)
	tenant.insert(ignore_permissions=True)
	frappe.db.commit()

	try:
		frappe.sendmail(
			recipients=[admin_email],
			subject="Your XentraERP signup is under review",
			message=(
				f"<p>Thanks for signing up, {admin_name}.</p>"
				f"<p>Your organization <b>{organization_name}</b> "
				f"(tenant code <b>{tenant.tenant_code}</b>) is pending approval. "
				f"You'll receive another email once it's activated.</p>"
			),
			now=True,
		)
	except Exception:
		frappe.log_error(title="XentraERP signup pending-approval email failed")

	return {
		"tenant_code": tenant.tenant_code,
		"subdomain": tenant.subdomain,
		"status": tenant.status,
		"login_url": f"/login?tenant={tenant.tenant_code}",
	}


@frappe.whitelist(allow_guest=True)
def list_clinic_types():
	"""Clinic types for the signup form (CLINZA). Static reference data, guest-safe."""
	from custom_erp.api.clinic_catalog import public_catalog

	return public_catalog()["clinic_types"]


@frappe.whitelist(allow_guest=True)
def tenant_lookup(tenant_code: str):
	"""Validate a tenant code for the sign-in screens and return the organization name.

	Phase 1 (POS upgrade) change: the tenant admin's email is NO LONGER returned to an
	unauthenticated caller (it let anyone enumerate tenant admin emails); the ERP
	sign-in now asks for the email. Requests are rate limited per IP and unknown,
	pending, suspended and cancelled codes get the same generic answer. Set site config
	`tenant_lookup_legacy_admin_email: 1` on the control-plane site to return
	`admin_email` again during a transition (old cached ERP login pages).
	"""
	from custom_erp.api import pos_security as sec

	ip = frappe.local.request_ip or "unknown"
	all_key, fail_key = f"xpos:lookup:{ip}", f"xpos:lookupfail:{ip}"
	cache = frappe.cache()
	if sec.over_limit(cache.get_value(all_key) or 0, sec.LOOKUP_LIMIT) or sec.over_limit(cache.get_value(fail_key) or 0, sec.LOOKUP_FAIL_LIMIT):
		frappe.throw("Too many attempts. Please wait a few minutes and try again.", frappe.TooManyRequestsError)
	cache.set_value(all_key, int(cache.get_value(all_key) or 0) + 1, expires_in_sec=sec.LOOKUP_WINDOW_SECONDS)

	tenant = frappe.get_all(
		"XentraERP Tenant",
		filters={"tenant_code": (tenant_code or "").strip()},
		fields=["name", "organization_name", "tenant_admin_email", "status", "provisioning_status", "site_name"],
		limit_page_length=1,
	)
	t = tenant[0] if tenant else None
	outcome = sec.lookup_outcome(t.status, t.provisioning_status, t.site_name) if t else "unavailable"
	if outcome == "unavailable":
		cache.set_value(fail_key, int(cache.get_value(fail_key) or 0) + 1, expires_in_sec=sec.LOOKUP_WINDOW_SECONDS)
		frappe.throw("We couldn't find an active organization with that code. Check the code or contact support.")
	if outcome == "setup":
		frappe.throw(
			"Your workspace is still being set up. Please try again in a few minutes, "
			"or contact support if this persists."
		)

	out = {"organization_name": t.organization_name}
	if frappe.conf.get("tenant_lookup_legacy_admin_email"):
		out["admin_email"] = t.tenant_admin_email
	return out


# ---------------------------------------------------------------------------
# CLINZA self-signup (clinza.xentraerp.net/signup). The clinic's own landing page and signup run
# against the control-plane site; registering creates a normal XentraERP Tenant (Pending Approval)
# with its clinic type, exactly like the ERP signup, but only after the email has been proven:
# either a 6-digit code sent to it (request_otp with brand "clinza", then verify_otp) or a
# Google sign-in whose ID token the server verifies itself.
# ---------------------------------------------------------------------------


def _google_client_id() -> str:
	return frappe.conf.get("clinza_google_client_id") or frappe.conf.get("google_client_id") or ""


@frappe.whitelist(allow_guest=True)
def clinza_signup_options():
	"""Everything the CLINZA signup page needs in one guest-safe call."""
	from custom_erp.api.clinic_catalog import public_catalog

	return {
		"clinic_types": public_catalog()["clinic_types"],
		"countries": list_countries(),
		# Empty = Google sign-in is not set up yet; the page then hides the button.
		"google_client_id": _google_client_id(),
	}


def _mark_email_verified(email: str):
	frappe.get_doc(
		{
			"doctype": "XentraERP OTP",
			"identifier": email,
			"channel": "email",
			"purpose": CLINZA_PURPOSE,
			"otp_hash": _hash_otp(secrets.token_hex(16)),
			"expires_at": add_to_date(now_datetime(), minutes=OTP_TTL_MINUTES),
			"verified": 1,
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()


@frappe.whitelist(allow_guest=True, methods=["POST"])
def verify_google_identity(credential: str):
	"""Verify a Google Identity Services ID token server-side (never trust the browser's decode):
	audience must be our client id, issuer Google, email verified. On success the email counts
	as verified for the CLINZA signup, and the name is returned to prefill the form."""
	import requests

	client_id = _google_client_id()
	if not client_id:
		frappe.throw("[NOT_CONFIGURED] Google sign-in is not available yet. Use your email instead.")
	try:
		r = requests.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": credential or ""}, timeout=10)
	except Exception:
		frappe.log_error(title="CLINZA Google token check failed")
		frappe.throw("[GOOGLE_UNAVAILABLE] Couldn't reach Google to confirm your sign-in. Use your email instead.")
	info = r.json() if r.status_code == 200 else {}
	ok = (
		info.get("aud") == client_id
		and info.get("iss") in ("accounts.google.com", "https://accounts.google.com")
		and str(info.get("email_verified")).lower() == "true"
		and info.get("email")
	)
	if not ok:
		frappe.throw("[INVALID_GOOGLE] Google sign-in could not be verified. Please try again.")
	email = info["email"].strip().lower()
	_mark_email_verified(email)
	return {"email": email, "name": info.get("name") or "", "picture": info.get("picture") or ""}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def register_clinic(
	clinic_name: str,
	admin_name: str,
	email: str,
	mobile: str,
	country: str,
	clinic_type: str,
	time_zone: str | None = None,
	enroll_token: str | None = None,
):
	"""Create the clinic's XentraERP tenant. Requires a verified email (code or Google) or a
	confirmed authenticator enrolment (clinza_authenticator_verify) for this email."""
	email = (email or "").strip().lower()
	clinic_name = (clinic_name or "").strip()
	admin_name = (admin_name or "").strip()
	if not clinic_name or not admin_name:
		frappe.throw("[MISSING] Enter your clinic's name and your name.")
	if not (clinic_type or "").strip():
		frappe.throw("[MISSING] Choose your clinic type.")
	enrolment = _confirmed_enrolment(enroll_token, email)
	email_verified = _is_verified(email, "email", CLINZA_PURPOSE)
	if not enrolment and not email_verified:
		frappe.throw("[NOT_VERIFIED] Please verify your email or set up your authenticator app first. This expires after 10–15 minutes.")
	if frappe.db.exists("XentraERP Tenant", {"tenant_admin_email": email, "status": ["not in", ["Rejected", "Cancelled", "Expired", "Archived"]]}):
		frappe.throw("[EXISTS] A workspace is already registered with this email. Sign in instead, or use another email.")

	result = complete_signup(
		organization_name=clinic_name,
		admin_name=admin_name,
		admin_email=email,
		admin_mobile=mobile,
		plan="Free Trial",
		country=country,
		time_zone=time_zone,
		clinic_type=clinic_type,
	)
	name = frappe.db.get_value("XentraERP Tenant", {"tenant_code": result["tenant_code"]}, "name")
	if name:
		tenant = frappe.get_doc("XentraERP Tenant", name)
		if email_verified:
			tenant.email_verified = 1
		if enrolment:
			# Password field: stored encrypted in __Auth, never in the tenant row.
			tenant.admin_totp_secret = enrolment["secret"]
		tenant.save(ignore_permissions=True)
		frappe.db.commit()
		if enrolment:
			frappe.cache().delete_value(_totp_key("enroll", enroll_token))
	result["authenticator"] = bool(enrolment)
	return result


# ---------------------------------------------------------------------------
# CLINZA authenticator-app signup (no email delivery needed). The person scans a QR code with
# Google Authenticator / Microsoft Authenticator / 1Password etc. and types one 6-digit code back.
# That proves they hold the secret, not that they own the email (admin approval still covers
# that), so the tenant is registered with email_verified = 0. The secret is kept, encrypted, on
# the tenant and installed as the clinic admin's two-factor secret when the site is provisioned,
# which makes the authenticator code required at every sign-in (see custom_erp.api.clinza_2fa).
# ---------------------------------------------------------------------------

TOTP_ENROLL_TTL_SECONDS = 15 * 60
TOTP_MAX_ATTEMPTS = 5
TOTP_START_LIMIT = 10  # enrolment starts per IP per window
TOTP_START_WINDOW_SECONDS = 15 * 60


def _totp_key(kind: str, value: str) -> str:
	return f"clinza:totp_{kind}:{hashlib.sha256(value.encode()).hexdigest()[:32]}"


def _qr_svg_data_uri(text: str) -> str:
	import base64
	import io

	from pyqrcode import create as qrcreate

	buf = io.BytesIO()
	qrcreate(text).svg(buf, scale=5, background="#ffffff", module_color="#0f172a", xmldecl=False, svgns=True)
	return "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode()


def _check_new_clinic_email(email: str):
	if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email or ""):
		frappe.throw("[BAD_EMAIL] Enter a valid email address.")
	if frappe.db.exists("XentraERP Tenant", {"tenant_admin_email": email, "status": ["not in", ["Rejected", "Cancelled", "Expired", "Archived"]]}):
		frappe.throw("[EXISTS] A workspace is already registered with this email. Sign in instead, or use another email.")


@frappe.whitelist(allow_guest=True, methods=["POST"])
def clinza_authenticator_start(email: str):
	"""Start authenticator enrolment for a CLINZA signup: a fresh TOTP secret, its QR code and
	an enrolment token (the secret itself only lives in the cache until it is confirmed)."""
	import pyotp

	email = (email or "").strip().lower()
	_check_new_clinic_email(email)

	cache = frappe.cache()
	ip_key = f"clinza:totp_start:{frappe.local.request_ip or 'unknown'}"
	count = int(cache.get_value(ip_key) or 0)
	if count >= TOTP_START_LIMIT:
		frappe.throw("[RATE_LIMITED] Too many attempts. Please wait a few minutes and try again.", frappe.TooManyRequestsError)
	cache.set_value(ip_key, count + 1, expires_in_sec=TOTP_START_WINDOW_SECONDS)

	secret = pyotp.random_base32()
	token = secrets.token_urlsafe(24)
	cache.set_value(_totp_key("enroll", token), {"email": email, "secret": secret, "attempts": 0}, expires_in_sec=TOTP_ENROLL_TTL_SECONDS)
	uri = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="CLINZA")
	return {
		"enroll_token": token,
		"secret": secret,  # for typing in by hand when the phone can't scan
		"otpauth_uri": uri,
		"qr": _qr_svg_data_uri(uri),
		"expires_in_minutes": TOTP_ENROLL_TTL_SECONDS // 60,
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def clinza_authenticator_verify(enroll_token: str, otp: str):
	"""Confirm the authenticator: the first 6-digit code it shows. The enrolment then stays
	confirmed (for register_clinic) until the token expires."""
	import pyotp

	cache = frappe.cache()
	key = _totp_key("enroll", enroll_token or "")
	pending = cache.get_value(key)
	if not pending:
		frappe.throw("[EXPIRED] This setup has expired. Start again to get a new QR code.")
	if pending.get("confirmed"):
		return {"verified": True, "email": pending["email"]}
	if int(pending.get("attempts") or 0) >= TOTP_MAX_ATTEMPTS:
		cache.delete_value(key)
		frappe.throw("[EXPIRED] Too many incorrect codes. Start again to get a new QR code.")

	code = re.sub(r"\D", "", otp or "")
	if len(code) != 6 or not pyotp.TOTP(pending["secret"]).verify(code, valid_window=1):
		pending["attempts"] = int(pending.get("attempts") or 0) + 1
		cache.set_value(key, pending, expires_in_sec=TOTP_ENROLL_TTL_SECONDS)
		frappe.throw("[BAD_CODE] That code doesn't match. Check your phone's clock and try the newest code.")

	pending["confirmed"] = 1
	cache.set_value(key, pending, expires_in_sec=TOTP_ENROLL_TTL_SECONDS)
	return {"verified": True, "email": pending["email"]}


def _confirmed_enrolment(enroll_token: str | None, email: str) -> dict | None:
	if not enroll_token:
		return None
	pending = frappe.cache().get_value(_totp_key("enroll", enroll_token))
	if pending and pending.get("confirmed") and pending.get("email") == email:
		return pending
	return None
