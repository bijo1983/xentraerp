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


@frappe.whitelist(allow_guest=True)
def request_otp(identifier: str, channel: str, purpose: str = "signup"):
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
				subject="Your XentraERP verification code",
				message=(
					f"<p>Your XentraERP verification code is <b>{otp}</b>.</p>"
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
def complete_signup(
	organization_name: str,
	subdomain: str,
	admin_name: str,
	admin_email: str,
	admin_mobile: str,
	plan: str = "Free Trial",
):
	admin_email = (admin_email or "").strip().lower()
	admin_mobile = (admin_mobile or "").strip()

	if not admin_email or not admin_mobile:
		frappe.throw("Email and mobile number are required.")

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
def tenant_lookup(tenant_code: str):
	"""Validate a tenant code and return the admin email to sign in with.

	No OTP — the follow-up password check against the real Frappe User
	(created on approval, see custom_erp.api.tenants.approve_tenant) is
	the actual verification step.
	"""
	tenant = frappe.get_all(
		"XentraERP Tenant",
		filters={"tenant_code": tenant_code},
		fields=["name", "organization_name", "tenant_admin_email", "status", "provisioning_status", "site_name"],
		limit_page_length=1,
	)
	if not tenant:
		frappe.throw("Tenant code not found.")

	t = tenant[0]
	if t.status == "Pending Approval":
		frappe.throw("Your account is awaiting admin approval. You'll be notified by email once it's activated.")
	if t.status in ("Rejected", "Suspended", "Cancelled", "Expired"):
		frappe.throw(f"This tenant account is {t.status.lower()}. Contact support.")
	if not t.site_name or t.provisioning_status != "Completed":
		frappe.throw(
			"Your workspace is still being set up. Please try again in a few minutes, "
			"or contact support if this persists."
		)

	return {
		"organization_name": t.organization_name,
		"admin_email": t.tenant_admin_email,
	}
