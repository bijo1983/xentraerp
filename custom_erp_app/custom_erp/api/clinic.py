"""CLINZA clinic management API (used by clinic-frontend/).

Same shape as the POS: the Clinza DocTypes are System-Manager-only over REST, and every
screen reads and writes through these whitelisted methods, which check the caller's
clinic role first (`require_cap`) and then do the work with system rights where
ERPNext's own permission checks would otherwise get in the way (`_elevated`).

Billing: a completed encounter is billed as ERPNext **Sales Invoices** (submitted, so they
post to the General Ledger / Accounting module): one to the patient for their share and,
when an insurance policy applies, one to the insurer's Customer for the covered share.
Payments are ERPNext Payment Entries against those invoices. A claim is raised against
the insurer invoice; recording the insurer's payment settles it.

Module gate: every call requires `clinic` in the tenant's subscription (same control-plane
entitlement check as the POS, `pos._tenant_has_module`).
"""

from __future__ import annotations

import json
from contextlib import contextmanager

import frappe
from frappe.utils import add_days, cint, flt, get_datetime, getdate, money_in_words, now_datetime, nowdate, today

from custom_erp.api import clinic_catalog as cat
from custom_erp.api import clinic_setup as setup

SETTINGS = "Clinza Settings"

# What each clinic role may do. System Manager = Clinic Manager.
# Visit flow: front desk (appointments: book, walk-in, check in + token) -> triage (vitals,
# complaint, priority) -> doctor (chart) -> front desk again (billing).
CAPS = {
	"Clinic Receptionist": {"patients", "appointments", "billing"},
	"Clinic Nurse": {"patients", "triage"},
	"Clinic Practitioner": {"patients", "appointments", "triage", "chart"},
	"Clinic Billing": {"patients", "billing", "claims", "reports"},
	"Clinic Manager": {"patients", "appointments", "triage", "chart", "billing", "claims", "reports", "setup", "staff"},
}
ALL_CAPS = set().union(*CAPS.values())
APPOINTMENT_STATUSES = ["Booked", "Confirmed", "Checked In", "Triaged", "In Consultation", "Completed", "Cancelled", "No Show"]
CLAIM_STATUSES = ["Draft", "Submitted", "Under Review", "Approved", "Partially Approved", "Rejected", "Paid"]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _caps(user: str | None = None) -> set[str]:
	roles = set(frappe.get_roles(user or frappe.session.user))
	if "System Manager" in roles:
		return set(ALL_CAPS)
	out: set[str] = set()
	for role, caps in CAPS.items():
		if role in roles:
			out |= caps
	return out


def _check_module():
	from custom_erp.api.pos import _tenant_has_module

	if not _tenant_has_module("clinic"):
		frappe.throw("[CLINIC_NOT_ENTITLED] Clinic management isn't part of your subscription.", frappe.PermissionError)


def require_cap(cap: str):
	if frappe.session.user == "Guest":
		frappe.throw("[NOT_AUTHENTICATED] Please sign in.", frappe.AuthenticationError)
	_check_module()
	if cap not in _caps():
		frappe.throw(f"[PERMISSION_DENIED] Your clinic role can't do this — it needs the '{cap}' right.", frappe.PermissionError)


@contextmanager
def _elevated():
	"""System rights for ERPNext's own logic (see pos_core._elevated for why not set_user)."""
	previous = frappe.session.user
	frappe.session.user = "Administrator"
	frappe.local.role_permissions = {}
	try:
		yield
	finally:
		frappe.session.user = previous
		frappe.local.role_permissions = {}


def _settings():
	s = frappe.get_single(SETTINGS)
	if not cint(s.configured):
		frappe.throw("[CLINIC_NOT_CONFIGURED] Choose your clinic type in Setup first.")
	return s


def _j(value, default):
	return setup._json(value, default)


def _args(data) -> dict:
	if isinstance(data, str):
		data = json.loads(data or "{}")
	return dict(data or {})


def _age(dob) -> str:
	if not dob:
		return ""
	d, t = getdate(dob), getdate(today())
	years = t.year - d.year - ((t.month, t.day) < (d.month, d.day))
	if years >= 2:
		return f"{years}y"
	months = (t.year - d.year) * 12 + t.month - d.month - (t.day < d.day)
	return f"{max(months, 0)}m"


# ---------------------------------------------------------------------------
# context & setup
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_context():
	"""Everything the app needs on start: who I am, my rights, the clinic settings,
	enabled templates (full definitions), appointment types, practitioners, services."""
	if frappe.session.user == "Guest":
		frappe.throw("[NOT_AUTHENTICATED] Please sign in.", frappe.AuthenticationError)
	_check_module()
	caps = _caps()
	if not caps:
		frappe.throw("[PERMISSION_DENIED] Your account has no clinic role. Ask the clinic manager to add you.", frappe.PermissionError)
	s = frappe.get_single(SETTINGS)
	enabled = _j(s.enabled_templates, [])
	user = frappe.session.user
	me_practitioner = frappe.db.get_value("Clinza Practitioner", {"user": user, "disabled": 0}, "name")
	return {
		"user": user,
		"full_name": frappe.utils.get_fullname(user),
		"caps": sorted(caps),
		"practitioner": me_practitioner,
		"configured": cint(s.configured),
		"settings": _settings_dict(s),
		"templates": {k: cat.TEMPLATES[k] for k in enabled if k in cat.TEMPLATES},
		"appointment_types": _j(s.appointment_types, []),
		"practitioners": frappe.get_all(
			"Clinza Practitioner", filters={"disabled": 0},
			fields=["name", "practitioner_name", "specialty", "registration_no", "qualification", "slot_minutes", "color", "user"],
			order_by="practitioner_name asc",
		),
		"services": frappe.get_all(
			"Clinza Service", filters={"disabled": 0}, fields=["name", "category", "rate", "tax_class", "code", "item"], order_by="category asc, name asc"
		),
		"payers": frappe.get_all(
			"Clinza Insurance Payer", filters={"disabled": 0}, fields=["name", "payer_code", "payer_type", "default_coverage", "claim_standard"],
			order_by="name asc",
		),
		"modes_of_payment": frappe.get_all("Mode of Payment", filters={"enabled": 1}, pluck="name", order_by="name asc"),
		"standards": cat.DOCUMENT_STANDARDS.get(s.region or "Other", cat.DOCUMENT_STANDARDS["Other"]),
		"catalog": cat.public_catalog(),
	}


def _settings_dict(s) -> dict:
	keys = [
		"clinic_name", "clinic_type", "region", "country", "company", "currency", "licence_no", "phone", "email", "address",
		"tax_regime", "tax_id", "tax_id_label", "standard_rate", "state_code", "arabic_invoice", "slot_minutes",
		"opening_time", "closing_time", "footer_note", "configured",
	]
	out = {k: s.get(k) for k in keys}
	out["tax_classes"] = _j(s.tax_classes, {})
	out["enabled_templates"] = _j(s.enabled_templates, [])
	for k in ("opening_time", "closing_time"):
		out[k] = str(out[k]) if out[k] else None
	return out


@frappe.whitelist()
def apply_clinic_type(clinic_type: str):
	"""Setup screen: (re)apply a clinic type — adds its templates, appointment types, services."""
	require_cap("setup")
	with _elevated():
		return setup.apply_clinic_type(clinic_type)


@frappe.whitelist()
def save_settings(data):
	"""Setup screen: clinic details, tax registration and rates, enabled templates,
	appointment types and hours. Changing rates re-syncs the ERPNext tax templates."""
	require_cap("setup")
	data = _args(data)
	s = frappe.get_single(SETTINGS)
	for k in ("clinic_name", "licence_no", "phone", "email", "address", "tax_id", "tax_id_label", "state_code", "footer_note",
			"opening_time", "closing_time"):
		if k in data:
			s.set(k, data[k] or None)
	if "slot_minutes" in data:
		s.slot_minutes = max(5, min(240, cint(data["slot_minutes"]) or 15))
	if "arabic_invoice" in data:
		s.arabic_invoice = 1 if data["arabic_invoice"] else 0
	tax_changed = False
	if "tax_regime" in data and data["tax_regime"] in ("VAT", "GST", "None"):
		tax_changed |= s.tax_regime != data["tax_regime"]
		s.tax_regime = data["tax_regime"]
	if "standard_rate" in data:
		rate = flt(data["standard_rate"])
		if rate < 0 or rate > 50:
			frappe.throw("Enter a tax rate between 0 and 50%.")
		tax_changed |= flt(s.standard_rate) != rate
		s.standard_rate = rate
	if "tax_classes" in data and isinstance(data["tax_classes"], dict):
		classes = {}
		for c in setup.TAX_CLASSES:
			v = data["tax_classes"].get(c, "exempt")
			classes[c] = "exempt" if v in ("exempt", None, "") else max(0.0, min(50.0, flt(v)))
		tax_changed |= _j(s.tax_classes, {}) != classes
		s.tax_classes = json.dumps(classes)
	if "enabled_templates" in data and isinstance(data["enabled_templates"], list):
		s.enabled_templates = json.dumps([t for t in data["enabled_templates"] if t in cat.TEMPLATES])
	if "appointment_types" in data and isinstance(data["appointment_types"], list):
		types = []
		for a in data["appointment_types"]:
			name = (a.get("name") or "").strip()
			if name:
				types.append({"name": name[:60], "minutes": max(5, min(480, cint(a.get("minutes")) or 15))})
		s.appointment_types = json.dumps(types)
	if s.tax_regime == "GST" and s.tax_id and not cat.gstin_state(s.tax_id):
		frappe.throw("A GSTIN has 15 characters and starts with the 2-digit state code.")
	if s.tax_regime == "GST" and not s.state_code and cat.gstin_state(s.tax_id):
		s.state_code = cat.gstin_state(s.tax_id)
	with _elevated():
		if tax_changed:
			setup.sync_tax(s)
		s.save(ignore_permissions=True)
	return _settings_dict(s)


@frappe.whitelist()
def save_service(data):
	"""Add or edit a billable service / medicine line."""
	require_cap("setup")
	data = _args(data)
	s = _settings()
	name = (data.get("name") or data.get("service_name") or "").strip()
	if not name:
		frappe.throw("Enter the service name.")
	tax_class = data.get("tax_class") if data.get("tax_class") in setup.TAX_CLASSES else "healthcare"
	with _elevated():
		if not frappe.db.exists("Clinza Service", name):
			setup.ensure_service(s, {"name": name, "rate": flt(data.get("rate")), "tax_class": tax_class, "code": data.get("code")},
				data.get("category") if data.get("category") in ("Service", "Medicine", "Consumable") else "Service")
		svc = frappe.get_doc("Clinza Service", name)
		svc.rate = flt(data.get("rate"))
		svc.code = data.get("code") or ""
		svc.disabled = 1 if data.get("disabled") else 0
		if svc.tax_class != tax_class:
			svc.tax_class = tax_class
			setup._set_item_tax(svc.item, setup.item_tax_template_name(s, tax_class))
		svc.save(ignore_permissions=True)
	return svc.as_dict()


@frappe.whitelist()
def save_practitioner(data):
	require_cap("setup")
	data = _args(data)
	if not (data.get("practitioner_name") or "").strip():
		frappe.throw("Enter the practitioner's name.")
	fields = ("practitioner_name", "specialty", "registration_no", "qualification", "user", "slot_minutes", "color", "disabled")
	if data.get("name") and frappe.db.exists("Clinza Practitioner", data["name"]):
		doc = frappe.get_doc("Clinza Practitioner", data["name"])
	else:
		doc = frappe.new_doc("Clinza Practitioner")
	for k in fields:
		if k in data:
			doc.set(k, data[k] or (0 if k in ("slot_minutes", "disabled") else None))
	doc.save(ignore_permissions=True)
	if doc.user:
		_grant_roles(doc.user, ["Clinic Practitioner"])
	return doc.as_dict()


@frappe.whitelist()
def save_payer(data):
	require_cap("setup" if "claims" not in _caps() else "claims")
	data = _args(data)
	name = (data.get("payer_name") or "").strip()
	if not name:
		frappe.throw("Enter the insurer's name.")
	s = _settings()
	doc = frappe.get_doc("Clinza Insurance Payer", name) if frappe.db.exists("Clinza Insurance Payer", name) else frappe.new_doc("Clinza Insurance Payer")
	doc.payer_name = name
	for k in ("payer_code", "payer_type", "claim_standard", "default_coverage", "submission_email", "portal_url", "tax_id", "disabled"):
		if k in data:
			doc.set(k, data[k])
	with _elevated():
		if not doc.customer:
			doc.customer = _make_customer(name, s.insurer_customer_group or "Insurance Payers", "Company", tax_id=doc.tax_id)
		doc.save(ignore_permissions=True)
	return doc.as_dict()


# ---------------------------------------------------------------------------
# staff (user limit is enforced by the User before_insert hook)
# ---------------------------------------------------------------------------

def _grant_roles(user: str, roles: list[str]):
	setup.ensure_roles()
	u = frappe.get_doc("User", user)
	have = {r.role for r in u.roles}
	changed = False
	for role in roles:
		if role not in have:
			u.append("roles", {"role": role})
			changed = True
	if changed:
		u.save(ignore_permissions=True)


@frappe.whitelist()
def list_staff():
	require_cap("staff")
	rows = frappe.get_all("Has Role", filters={"role": ["in", setup.ROLES], "parenttype": "User"}, fields=["parent", "role"])
	by_user: dict[str, list[str]] = {}
	for r in rows:
		by_user.setdefault(r.parent, []).append(r.role)
	out = []
	for user, roles in sorted(by_user.items()):
		info = frappe.db.get_value("User", user, ["full_name", "enabled"], as_dict=True) or {}
		out.append({"user": user, "full_name": info.get("full_name"), "enabled": info.get("enabled"), "roles": roles})
	from custom_erp.api.pos import tenant_entitlements

	try:
		max_users = int((tenant_entitlements() or {}).get("max_users") or 0)
	except Exception:
		max_users = 0
	active = frappe.db.count("User", {"enabled": 1, "user_type": "System User", "name": ["not in", ["Administrator", "Guest"]]})
	return {"staff": out, "max_users": max_users, "active_users": active}


@frappe.whitelist()
def create_staff(email: str, full_name: str, role: str, password: str | None = None, practitioner: int = 0, specialty: str | None = None,
		registration_no: str | None = None):
	"""Add a clinic staff member (a Frappe user with one clinic role). The SaaS user limit
	applies (XentraERP Tenant.max_users; unlimited today)."""
	require_cap("staff")
	if role not in setup.ROLES:
		frappe.throw("Choose a clinic role.")
	email = (email or "").strip().lower()
	frappe.utils.validate_email_address(email, throw=True)
	with _elevated():
		if not frappe.db.exists("User", email):
			first, _, last = (full_name or email).strip().partition(" ")
			u = frappe.get_doc({
				"doctype": "User", "email": email, "first_name": first, "last_name": last or None,
				"send_welcome_email": 0 if password else 1, "user_type": "System User",
			})
			u.insert(ignore_permissions=True)
			if password:
				from frappe.utils.password import update_password

				update_password(email, password)
		_grant_roles(email, [role])
		if cint(practitioner) and not frappe.db.exists("Clinza Practitioner", {"user": email}):
			frappe.get_doc({
				"doctype": "Clinza Practitioner", "practitioner_name": full_name or email, "user": email,
				"specialty": specialty, "registration_no": registration_no, "slot_minutes": frappe.db.get_single_value(SETTINGS, "slot_minutes") or 15,
			}).insert(ignore_permissions=True)
			_grant_roles(email, ["Clinic Practitioner"])
	return list_staff()


# ---------------------------------------------------------------------------
# patients
# ---------------------------------------------------------------------------

def _make_customer(name: str, group: str, customer_type: str = "Individual", tax_id: str | None = None) -> str:
	territory = frappe.db.get_single_value("Selling Settings", "territory") or (
		"All Territories" if frappe.db.exists("Territory", "All Territories") else None
	)
	doc = frappe.get_doc({
		"doctype": "Customer", "customer_name": name, "customer_type": customer_type, "customer_group": group,
		"territory": territory, "tax_id": tax_id or None,
	})
	doc.insert(ignore_permissions=True)
	return doc.name


PATIENT_FIELDS = ["patient_name", "gender", "date_of_birth", "mobile", "email", "id_type", "id_number", "nationality", "blood_group",
	"allergies", "chronic_conditions", "tax_id", "state_code", "address"]


@frappe.whitelist()
def search_patients(query: str = "", limit: int = 30):
	require_cap("patients")
	q = (query or "").strip()
	filters = {"disabled": 0}
	or_filters = None
	if q:
		like = f"%{q}%"
		or_filters = [["patient_name", "like", like], ["mobile", "like", like], ["id_number", "like", like], ["name", "like", like]]
	rows = frappe.get_all(
		"Clinza Patient", filters=filters, or_filters=or_filters,
		fields=["name", "patient_name", "gender", "date_of_birth", "mobile", "id_number", "allergies", "modified"],
		order_by="modified desc", limit_page_length=min(cint(limit) or 30, 100),
	)
	for r in rows:
		r["age"] = _age(r.date_of_birth)
	return rows


@frappe.whitelist()
def save_patient(data):
	require_cap("patients")
	data = _args(data)
	if not (data.get("patient_name") or "").strip():
		frappe.throw("Enter the patient's name.")
	if data.get("name") and frappe.db.exists("Clinza Patient", data["name"]):
		doc = frappe.get_doc("Clinza Patient", data["name"])
	else:
		doc = frappe.new_doc("Clinza Patient")
	for k in PATIENT_FIELDS:
		if k in data:
			doc.set(k, data[k] or None)
	if doc.mobile and not doc.name:
		dup = frappe.db.get_value("Clinza Patient", {"mobile": doc.mobile, "patient_name": doc.patient_name}, "name")
		if dup:
			frappe.throw(f"[DUPLICATE_PATIENT] {doc.patient_name} with this mobile number is already registered ({dup}).")
	doc.save(ignore_permissions=True)
	s = frappe.get_single(SETTINGS)
	with _elevated():
		if not doc.customer:
			doc.db_set("customer", _make_customer(doc.patient_name, s.patient_customer_group or "Patients", tax_id=doc.tax_id))
		else:
			frappe.db.set_value("Customer", doc.customer, {"customer_name": doc.patient_name, "tax_id": doc.tax_id or None})
	return get_patient(doc.name)


@frappe.whitelist()
def get_patient(name: str):
	"""Patient record + policies + visit history + appointments + bills."""
	require_cap("patients")
	p = frappe.get_doc("Clinza Patient", name).as_dict()
	p["age"] = _age(p.get("date_of_birth"))
	p["policies"] = frappe.get_all(
		"Clinza Insurance Policy", filters={"patient": name},
		fields=["name", "payer", "policy_no", "member_id", "plan_name", "coverage_pct", "copay_cap", "valid_from", "valid_to", "preauth_required", "active"],
		order_by="active desc, modified desc",
	)
	caps = _caps()
	p["encounters"] = frappe.get_all(
		"Clinza Encounter", filters={"patient": name},
		fields=["name", "encounter_date", "practitioner", "status", "diagnoses", "patient_invoice", "payer_invoice"],
		order_by="encounter_date desc, creation desc", limit_page_length=50,
	) if ("chart" in caps or "billing" in caps) else []
	for e in p["encounters"]:
		e["diagnoses"] = _j(e.get("diagnoses"), [])
	p["appointments"] = frappe.get_all(
		"Clinza Appointment", filters={"patient": name},
		fields=["name", "appointment_date", "appointment_time", "practitioner", "appointment_type", "status"],
		order_by="appointment_date desc, appointment_time desc", limit_page_length=30,
	)
	if "billing" in caps and p.get("customer"):
		p["invoices"] = frappe.get_all(
			"Sales Invoice", filters={"customer": p["customer"], "docstatus": 1},
			fields=["name", "posting_date", "grand_total", "rounded_total", "outstanding_amount", "status", "currency"],
			order_by="posting_date desc", limit_page_length=50,
		)
	else:
		p["invoices"] = []
	return p


@frappe.whitelist()
def save_policy(data):
	require_cap("patients")
	data = _args(data)
	for k in ("patient", "payer", "policy_no"):
		if not data.get(k):
			frappe.throw("Patient, insurer and policy number are required.")
	doc = frappe.get_doc("Clinza Insurance Policy", data["name"]) if data.get("name") and frappe.db.exists("Clinza Insurance Policy", data["name"]) else frappe.new_doc("Clinza Insurance Policy")
	for k in ("patient", "payer", "policy_no", "member_id", "plan_name", "coverage_pct", "copay_cap", "valid_from", "valid_to", "preauth_required", "active"):
		if k in data:
			doc.set(k, data[k] if data[k] != "" else None)
	if doc.coverage_pct is None:
		doc.coverage_pct = frappe.db.get_value("Clinza Insurance Payer", doc.payer, "default_coverage") or 80
	if flt(doc.coverage_pct) < 0 or flt(doc.coverage_pct) > 100:
		frappe.throw("Coverage must be between 0 and 100%.")
	doc.save(ignore_permissions=True)
	return doc.as_dict()


# ---------------------------------------------------------------------------
# appointments
# ---------------------------------------------------------------------------

def _minutes(t) -> int:
	t = str(t or "00:00:00")
	h, m, *_ = (t.split(":") + ["0", "0"])[:3]
	return int(h) * 60 + int(m)


def overlaps(a_start: int, a_len: int, b_start: int, b_len: int) -> bool:
	return a_start < b_start + b_len and b_start < a_start + a_len


@frappe.whitelist()
def list_appointments(date: str | None = None, practitioner: str | None = None, days: int = 1):
	require_cap("appointments") if "appointments" in _caps() else require_cap("billing")
	start = getdate(date or today())
	end = add_days(start, max(1, min(cint(days) or 1, 31)) - 1)
	filters = {"appointment_date": ["between", [start, end]]}
	if practitioner:
		filters["practitioner"] = practitioner
	rows = frappe.get_all(
		"Clinza Appointment", filters=filters,
		fields=["name", "patient", "patient_name", "practitioner", "appointment_type", "appointment_date", "appointment_time", "duration",
			"status", "notes", "encounter", "source"],
		order_by="appointment_date asc, appointment_time asc", limit_page_length=1000,
	)
	for r in rows:
		r["appointment_time"] = str(r.appointment_time)[:5]
	return rows


@frappe.whitelist()
def book_appointment(data):
	"""Book (or move) an appointment; refuses a double booking for the practitioner."""
	require_cap("appointments")
	data = _args(data)
	for k in ("patient", "practitioner", "appointment_date", "appointment_time"):
		if not data.get(k):
			frappe.throw("Patient, practitioner, date and time are required.")
	s = frappe.get_single(SETTINGS)
	duration = cint(data.get("duration")) or next(
		(cint(a.get("minutes")) for a in _j(s.appointment_types, []) if a.get("name") == data.get("appointment_type")), cint(s.slot_minutes) or 15
	)
	start = _minutes(data["appointment_time"])
	if s.opening_time and s.closing_time and not (_minutes(s.opening_time) <= start and start + duration <= _minutes(s.closing_time)):
		frappe.throw(f"[OUTSIDE_HOURS] The clinic is open {str(s.opening_time)[:5]}–{str(s.closing_time)[:5]}.")
	existing = frappe.get_all(
		"Clinza Appointment",
		filters={"practitioner": data["practitioner"], "appointment_date": data["appointment_date"],
			"status": ["not in", ["Cancelled", "No Show"]], "name": ["!=", data.get("name") or ""]},
		fields=["name", "patient_name", "appointment_time", "duration"],
	)
	for e in existing:
		if overlaps(start, duration, _minutes(e.appointment_time), cint(e.duration) or 15):
			frappe.throw(f"[SLOT_TAKEN] {str(e.appointment_time)[:5]} is already booked for {e.patient_name}.")
	doc = frappe.get_doc("Clinza Appointment", data["name"]) if data.get("name") else frappe.new_doc("Clinza Appointment")
	for k in ("patient", "practitioner", "appointment_type", "appointment_date", "appointment_time", "notes", "source"):
		if k in data:
			doc.set(k, data[k])
	doc.duration = duration
	if not doc.status:
		doc.status = "Booked"
	doc.save(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist()
def set_appointment_status(name: str, status: str):
	require_cap("appointments")
	if status not in APPOINTMENT_STATUSES:
		frappe.throw("Unknown status.")
	doc = frappe.get_doc("Clinza Appointment", name)
	if doc.status == "Completed" and status != "Completed":
		frappe.throw("A completed appointment can't be changed.")
	doc.status = status
	doc.save(ignore_permissions=True)
	return doc.as_dict()


# ---------------------------------------------------------------------------
# encounters (charting, diagnoses, prescriptions, services)
# ---------------------------------------------------------------------------

def policy_covers(policy, on=None) -> bool:
	"""Active and inside its validity window (both ends) on `on` (default today)."""
	d = getdate(on or today())
	return bool(
		policy and cint(policy.get("active"))
		and (not policy.get("valid_from") or getdate(policy.get("valid_from")) <= d)
		and (not policy.get("valid_to") or getdate(policy.get("valid_to")) >= d)
	)


def _current_policy(patient: str) -> str | None:
	"""The patient's policy that covers today, if any (most recently changed first)."""
	for p in frappe.get_all(
		"Clinza Insurance Policy", filters={"patient": patient, "active": 1},
		fields=["name", "active", "valid_from", "valid_to"], order_by="modified desc",
	):
		if policy_covers(p):
			return p.name
	return None


@frappe.whitelist()
def start_encounter(patient: str | None = None, appointment: str | None = None, practitioner: str | None = None):
	"""Open (or return the open) encounter for an appointment / a walk-in patient."""
	require_cap("chart")
	name = create_encounter(patient=patient, appointment=appointment, practitioner=practitioner)
	if appointment:
		frappe.db.set_value("Clinza Appointment", appointment, {"status": "In Consultation", "called_at": now_datetime()})
	return get_encounter(name)


def create_encounter(patient: str | None = None, appointment: str | None = None, practitioner: str | None = None) -> str:
	"""The appointment's encounter (created on first use). No permission check: callers do it."""
	if appointment:
		appt = frappe.get_doc("Clinza Appointment", appointment)
		if appt.encounter:
			return appt.encounter
		patient, practitioner = appt.patient, practitioner or appt.practitioner
	practitioner = practitioner or frappe.db.get_value("Clinza Practitioner", {"user": frappe.session.user, "disabled": 0}, "name")
	if not patient or not practitioner:
		frappe.throw("Choose the patient and the practitioner.")
	s = _settings()
	policy = _current_policy(patient)
	enc = frappe.get_doc({
		"doctype": "Clinza Encounter", "patient": patient, "practitioner": practitioner, "appointment": appointment,
		"encounter_date": today(), "status": "Draft", "policy": policy,
		"templates": json.dumps([t for t in _j(s.enabled_templates, []) if t in ("vitals", "soap")] or _j(s.enabled_templates, [])[:1]),
		"chart_data": "{}", "diagnoses": "[]",
	})
	# The practitioner's consultation fee goes on the bill by default.
	fee_item = frappe.db.get_value("Clinza Practitioner", practitioner, "consultation_item")
	svc = frappe.db.get_value("Clinza Service", {"item": fee_item}, ["name", "rate", "tax_class", "code", "item"], as_dict=True) if fee_item else None
	if svc:
		enc.append("services", {"item": svc.item, "item_name": svc.name, "qty": 1, "rate": svc.rate, "amount": svc.rate, "tax_class": svc.tax_class, "code": svc.code})
	enc.insert(ignore_permissions=True)
	if appointment:
		frappe.db.set_value("Clinza Appointment", appointment, "encounter", enc.name)
	return enc.name


@frappe.whitelist()
def get_encounter(name: str):
	caps = _caps()
	if "chart" not in caps and "billing" not in caps:
		require_cap("chart")
	_check_module()
	e = frappe.get_doc("Clinza Encounter", name).as_dict()
	e["templates"] = _j(e.get("templates"), [])
	e["chart_data"] = _j(e.get("chart_data"), {}) if "chart" in caps else {}
	e["diagnoses"] = _j(e.get("diagnoses"), [])
	e["patient_doc"] = frappe.db.get_value(
		"Clinza Patient", e["patient"], ["name", "patient_name", "gender", "date_of_birth", "mobile", "allergies", "chronic_conditions", "blood_group", "id_number"],
		as_dict=True,
	)
	e["patient_doc"]["age"] = _age(e["patient_doc"].date_of_birth)
	e["practitioner_doc"] = frappe.db.get_value("Clinza Practitioner", e["practitioner"], ["name", "practitioner_name", "specialty", "registration_no"], as_dict=True)
	e["policy_doc"] = frappe.get_doc("Clinza Insurance Policy", e["policy"]).as_dict() if e.get("policy") else None
	if "billing" in caps:
		e["bill_preview"] = _bill_preview(e) if e.get("services") else None
	else:
		# Clinical staff see which procedures were done, never prices, tax or insurance shares.
		e["services"] = [{"item_name": x.get("item_name"), "qty": x.get("qty"), "code": x.get("code")} for x in e.get("services") or []]
		e["bill_preview"] = None
	e["appointment_doc"] = frappe.db.get_value(
		"Clinza Appointment", e["appointment"], ["name", "token_no", "priority", "status", "appointment_type", "source", "checked_in_at", "triaged_at"], as_dict=True
	) if e.get("appointment") else None
	return e


@frappe.whitelist()
def save_encounter(data):
	"""Save the chart: templates used, chart data, diagnoses (ICD-10), prescriptions,
	procedures done and (billing staff only) the insurance policy. `complete=1` closes the clinical part."""
	require_cap("chart")
	return _save_encounter(_args(data))


def _save_encounter(data: dict):
	doc = frappe.get_doc("Clinza Encounter", data["name"])
	if doc.status in ("Billed", "Cancelled"):
		frappe.throw("[ENCOUNTER_LOCKED] This visit is already billed; it can't be changed.")
	if "templates" in data:
		doc.templates = json.dumps([t for t in data["templates"] if t in cat.TEMPLATES])
	if "chart_data" in data:
		doc.chart_data = json.dumps(data["chart_data"] or {})
	if "diagnoses" in data:
		dx = []
		for d in data["diagnoses"] or []:
			code = (d.get("code") or "").strip().upper()
			desc = (d.get("description") or "").strip()
			if code or desc:
				dx.append({"code": code[:12], "description": desc[:200], "primary": 1 if d.get("primary") else 0})
		if dx and not any(d["primary"] for d in dx):
			dx[0]["primary"] = 1
		doc.diagnoses = json.dumps(dx)
	if "notes" in data:
		doc.notes = data["notes"]
	for k in ("chief_complaint", "history", "examination", "advice"):
		if k in data:
			doc.set(k, data[k] or None)
	if "follow_up_date" in data:
		doc.follow_up_date = data["follow_up_date"] or None
	if "policy" in data and "billing" in _caps():
		doc.policy = data["policy"] or None
	if "prescriptions" in data:
		doc.set("prescriptions", [])
		for rx in data["prescriptions"] or []:
			if (rx.get("medicine") or "").strip():
				doc.append("prescriptions", {k: rx.get(k) for k in ("medicine", "brand", "strength", "dosage_form", "dose", "frequency", "route", "duration", "quantity", "instructions")})
		_learn_medicines(data["prescriptions"] or [])
	if "services" in data and "billing" not in _caps():
		# Clinical staff record procedures done; prices come from the service list (the front desk can change them when billing).
		old = {x.item_name: x for x in doc.services}
		data["services"] = [
			{"service": l.get("service") or l.get("item_name"), "qty": l.get("qty"),
			 "rate": old[l.get("item_name")].rate if l.get("item_name") in old else None}
			for l in data["services"] or []
		]
	if "services" in data:
		doc.set("services", [])
		for line in data["services"] or []:
			svc = frappe.db.get_value("Clinza Service", line.get("service") or line.get("item_name"), ["name", "item", "rate", "tax_class", "code"], as_dict=True)
			if not svc:
				continue
			qty = flt(line.get("qty")) or 1
			rate = flt(line.get("rate")) if line.get("rate") not in (None, "") else flt(svc.rate)
			doc.append("services", {"item": svc.item, "item_name": svc.name, "qty": qty, "rate": rate, "amount": flt(qty * rate, 2),
				"tax_class": svc.tax_class, "code": line.get("code") or svc.code})
	if cint(data.get("complete")):
		doc.status = "Completed"
		if doc.appointment:
			frappe.db.set_value("Clinza Appointment", doc.appointment, "status", "Completed")
	doc.save(ignore_permissions=True)
	return get_encounter(doc.name)


def _learn_medicines(lines: list[dict]):
	"""Remember brand names and medicines not in the catalogue, so the clinic gets them as suggestions next time."""
	known_generics = {m["generic"].lower() for m in cat.MEDICINES}
	s = frappe.get_single(SETTINGS)
	custom = _j(s.custom_medicines, [])
	have = {((c.get("generic") or "").lower(), (c.get("brand") or "").lower(), c.get("strength") or "") for c in custom}
	changed = False
	for rx in lines:
		generic = (rx.get("medicine") or "").strip()
		brand = (rx.get("brand") or "").strip()
		if not generic or (generic.lower() in known_generics and not brand):
			continue
		key = (generic.lower(), brand.lower(), rx.get("strength") or "")
		if key in have:
			continue
		have.add(key)
		custom.append({"generic": generic, "brand": brand, "strength": rx.get("strength") or "", "form": rx.get("dosage_form") or "",
			"route": rx.get("route") or ""})
		changed = True
	if changed:
		frappe.db.set_single_value(SETTINGS, "custom_medicines", json.dumps(custom[-2000:]))


@frappe.whitelist()
def save_billing(name: str, services=None, policy: str | None = None):
	"""Front desk: the services and prices to bill, and the insurance policy, before billing."""
	require_cap("billing")
	doc = frappe.get_doc("Clinza Encounter", name)
	if doc.status in ("Billed", "Cancelled"):
		frappe.throw("[ENCOUNTER_LOCKED] This visit is already billed; it can't be changed.")
	return _save_encounter({"name": name, "services": _j(services, []) if isinstance(services, str) else services or [], "policy": policy or ""})


@frappe.whitelist()
def billing_queue():
	"""Visits the doctor has completed that are waiting to be billed (front desk)."""
	require_cap("billing")
	rows = frappe.get_all(
		"Clinza Encounter", filters={"status": "Completed"},
		fields=["name", "patient", "patient_name", "practitioner", "encounter_date", "policy", "appointment", "modified"],
		order_by="modified asc", limit_page_length=200,
	)
	for r in rows:
		r["token_no"] = frappe.db.get_value("Clinza Appointment", r.appointment, "token_no") if r.appointment else None
		r["total"] = flt(frappe.db.sql("select coalesce(sum(amount),0) from `tabClinza Encounter Service` where parent=%s", r.name)[0][0])
	return rows


# ---------------------------------------------------------------------------
# billing -> ERPNext Sales Invoice (posts to the General Ledger on submit)
# ---------------------------------------------------------------------------

def _intra_state(s, patient_state: str | None) -> bool:
	"""India: same state (CGST+SGST) unless the patient's place of supply is another state."""
	clinic_state = s.state_code or cat.gstin_state(s.tax_id)
	return not patient_state or not clinic_state or patient_state == clinic_state


def _line_tax_rate(s, tax_class: str) -> tuple[float, bool]:
	if s.tax_regime not in ("VAT", "GST"):
		return 0.0, True
	classes = _j(s.tax_classes, {})
	return cat.class_rate({"classes": classes, "regime": s.tax_regime}, tax_class)


def _bill_preview(e) -> dict:
	"""Patient / insurer split and estimated tax for the encounter's services."""
	s = frappe.get_single(SETTINGS)
	policy = e.get("policy_doc") or (frappe.get_doc("Clinza Insurance Policy", e["policy"]).as_dict() if e.get("policy") else None)
	coverage = flt(policy.get("coverage_pct")) if policy else 0
	cap = flt(policy.get("copay_cap")) if policy else 0
	lines, net, tax, payer_net, patient_net = [], 0.0, 0.0, 0.0, 0.0
	for row in e.get("services") or []:
		amount = flt(row.get("amount") or flt(row.get("qty")) * flt(row.get("rate")), 2)
		rate, exempt = _line_tax_rate(s, row.get("tax_class"))
		payer, patient = cat.split_share(amount, coverage) if policy else (0.0, amount)
		lines.append({"service": row.get("item_name"), "amount": amount, "tax_rate": rate, "exempt": exempt, "payer": payer, "patient": patient})
		net += amount
		tax += amount * rate / 100
		payer_net += payer
		patient_net += patient
	if policy and cap and patient_net > cap:
		# Co-pay cap: the patient's share for the visit is capped; the insurer takes the rest.
		shift = patient_net - cap
		payer_net, patient_net = payer_net + shift, cap
	return {"net": flt(net, 2), "tax": flt(tax, 2), "total": flt(net + tax, 2), "payer_net": flt(payer_net, 2),
		"patient_net": flt(patient_net, 2), "coverage_pct": coverage, "lines": lines}


def _make_invoice(s, customer: str, lines: list[dict], *, remarks: str, intra_state: bool, due_days: int = 0, tax_id: str | None = None) -> str:
	from erpnext.controllers.accounts_controller import get_taxes_and_charges

	si = frappe.new_doc("Sales Invoice")
	si.customer = customer
	si.company = s.company
	si.posting_date = nowdate()
	si.set_posting_time = 0
	si.due_date = add_days(nowdate(), due_days)
	si.currency = s.currency or frappe.db.get_value("Company", s.company, "default_currency")
	si.ignore_pricing_rule = 1
	si.update_stock = 0
	si.remarks = remarks
	if tax_id:
		si.tax_id = tax_id
	for line in lines:
		if flt(line["rate"]) <= 0:
			continue
		si.append("items", {
			"item_code": line["item"], "item_name": line["item_name"], "description": line.get("description") or line["item_name"],
			"qty": line["qty"], "rate": line["rate"], "price_list_rate": line["rate"], "discount_percentage": 0,
			"item_tax_template": setup.item_tax_template_name(s, line.get("tax_class") or "healthcare"),
		})
	if not si.items:
		return ""
	template = s.tax_template_main if intra_state or not s.tax_template_inter else s.tax_template_inter
	if template and s.tax_regime in ("VAT", "GST"):
		si.taxes_and_charges = template
		for t in get_taxes_and_charges("Sales Taxes and Charges Template", template) or []:
			si.append("taxes", t)
	si.set_missing_values()
	si.insert(ignore_permissions=True)
	si.submit()
	return si.name


@frappe.whitelist()
def bill_encounter(name: str):
	"""Bill a visit: a submitted Sales Invoice to the patient for their share, and to the
	insurer (when a policy applies) for the covered share. Draft claim raised for the
	insurer invoice. Both invoices post to Accounting; payment comes after."""
	require_cap("billing")
	s = _settings()
	# Row lock for the rest of this request's transaction: a second "Bill visit" (another
	# tab / user) waits here and then sees the invoices, instead of billing twice.
	frappe.db.get_value("Clinza Encounter", name, "name", for_update=True)
	e = frappe.get_doc("Clinza Encounter", name)
	if e.status == "Billed" or e.patient_invoice or e.payer_invoice:
		frappe.throw("[ALREADY_BILLED] This visit has already been billed.")
	if not e.services:
		frappe.throw("Add at least one service before billing.")
	patient = frappe.get_doc("Clinza Patient", e.patient)
	policy = frappe.get_doc("Clinza Insurance Policy", e.policy) if e.policy else None
	if policy and not policy_covers(policy.as_dict()):
		frappe.throw("[POLICY_INACTIVE] The patient's insurance policy doesn't cover today (inactive, not started yet or expired) — remove it from the visit or update the policy.")
	coverage = flt(policy.coverage_pct) if policy else 0
	payer_lines, patient_lines = [], []
	for row in e.services:
		base = {"item": row.item, "item_name": row.item_name, "qty": flt(row.qty) or 1, "tax_class": row.tax_class}
		unit_payer, unit_patient = cat.split_share(flt(row.rate), coverage) if policy else (0.0, flt(row.rate))
		payer_lines.append({**base, "rate": unit_payer})
		patient_lines.append({**base, "rate": unit_patient})
	if policy and flt(policy.copay_cap):
		# Shift any co-pay above the cap from the patient lines onto the insurer lines, line by line.
		over = sum(flt(p["rate"]) * p["qty"] for p in patient_lines) - flt(policy.copay_cap)
		for p, q in zip(reversed(patient_lines), reversed(payer_lines)):
			if over <= 0:
				break
			take = min(over, flt(p["rate"]) * p["qty"])
			p["rate"] = flt(p["rate"] - take / p["qty"], 6)
			q["rate"] = flt(q["rate"] + take / q["qty"], 6)
			over -= take
	intra = _intra_state(s, patient.state_code)
	with _elevated():
		if not patient.customer:
			patient.db_set("customer", _make_customer(patient.patient_name, s.patient_customer_group or "Patients", tax_id=patient.tax_id))
		remarks = f"CLINZA {e.name} · {patient.patient_name} ({patient.name})"
		patient_inv = _make_invoice(s, patient.customer, patient_lines, remarks=remarks, intra_state=intra, tax_id=patient.tax_id)
		payer_inv, claim = "", ""
		if policy:
			payer = frappe.get_doc("Clinza Insurance Payer", policy.payer)
			if not payer.customer:
				payer.db_set("customer", _make_customer(payer.payer_name, s.insurer_customer_group or "Insurance Payers", "Company", tax_id=payer.tax_id))
			payer_inv = _make_invoice(s, payer.customer, payer_lines, remarks=f"{remarks} · policy {policy.policy_no}", intra_state=intra,
				due_days=30, tax_id=payer.tax_id)
			if payer_inv:
				claim = _create_claim(e, policy, payer_inv)
	# Snapshot of the tax treatment the bill was made under, so reprints after a later
	# Setup change still say "exempt" / "zero-rated" the way this invoice was taxed.
	snapshot = json.dumps({"regime": s.tax_regime, "standard_rate": flt(s.standard_rate), "classes": _j(s.tax_classes, {})})
	e.db_set({"patient_invoice": patient_inv or None, "payer_invoice": payer_inv or None, "claim": claim or None, "status": "Billed",
		"tax_snapshot": snapshot})
	if e.appointment:
		frappe.db.set_value("Clinza Appointment", e.appointment, "status", "Completed")
	return {"patient_invoice": patient_inv, "payer_invoice": payer_inv, "claim": claim}


@frappe.whitelist()
def record_payment(invoice: str, amount: float, mode_of_payment: str = "Cash", reference_no: str | None = None):
	"""Take a payment against a CLINZA invoice (ERPNext Payment Entry, posts to Accounting)."""
	require_cap("billing")
	return _pay(invoice, amount, mode_of_payment, reference_no)


def _pay(invoice: str, amount: float, mode_of_payment: str, reference_no: str | None) -> dict:
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	inv = frappe.get_doc("Sales Invoice", invoice)
	if not frappe.db.exists("Mode of Payment", mode_of_payment):
		frappe.throw(f"Unknown payment method {mode_of_payment}.")
	if inv.docstatus != 1 or not (inv.remarks or "").startswith("CLINZA"):
		frappe.throw("Only submitted CLINZA invoices can be paid here.")
	amount = flt(amount)
	if amount <= 0 or amount > flt(inv.outstanding_amount) + 0.005:
		frappe.throw(f"Enter an amount up to the outstanding {inv.outstanding_amount}.")
	with _elevated():
		pe = get_payment_entry("Sales Invoice", inv.name, party_amount=amount)
		pe.mode_of_payment = mode_of_payment
		try:
			from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account

			account = get_bank_cash_account(mode_of_payment, inv.company)["account"]
			pe.paid_to = account
			pe.paid_to_account_currency = frappe.db.get_value("Account", account, "account_currency")
		except Exception:
			frappe.clear_messages()  # no account on the mode of payment: keep the company default cash/bank
		pe.reference_no = reference_no or inv.name
		pe.reference_date = nowdate()
		pe.remarks = f"CLINZA receipt · {mode_of_payment} · {inv.name}"
		pe.custom_remarks = 1
		pe.insert(ignore_permissions=True)
		pe.submit()
	return {"payment_entry": pe.name, "outstanding": frappe.db.get_value("Sales Invoice", inv.name, "outstanding_amount")}


@frappe.whitelist()
def list_invoices(status: str = "", query: str = "", limit: int = 100):
	require_cap("billing")
	filters = [["docstatus", "=", 1], ["remarks", "like", "CLINZA%"]]
	if status == "unpaid":
		filters.append(["outstanding_amount", ">", 0])
	elif status == "paid":
		filters.append(["outstanding_amount", "<=", 0])
	if query:
		filters.append(["customer_name", "like", f"%{query}%"])
	return frappe.get_all(
		"Sales Invoice", filters=filters,
		fields=["name", "posting_date", "customer", "customer_name", "grand_total", "rounded_total", "outstanding_amount", "status", "currency", "remarks"],
		order_by="posting_date desc, creation desc", limit_page_length=min(cint(limit) or 100, 500),
	)


# ---------------------------------------------------------------------------
# insurance claims
# ---------------------------------------------------------------------------

def _create_claim(e, policy, invoice: str) -> str:
	inv = frappe.get_doc("Sales Invoice", invoice)
	claim = frappe.get_doc({
		"doctype": "Clinza Claim", "payer": policy.payer, "patient": e.patient, "policy": policy.name, "encounter": e.name,
		"invoice": invoice, "claim_date": today(), "status": "Draft", "claimed_amount": inv.rounded_total or inv.grand_total,
		"diagnoses": e.diagnoses or "[]",
	})
	codes = {r.item: r.code for r in e.services}
	for it in inv.items:
		claim.append("items", {"service": it.item_name, "code": codes.get(it.item_code) or "", "qty": it.qty, "amount": it.amount})
	claim.insert(ignore_permissions=True)
	return claim.name


@frappe.whitelist()
def list_claims(status: str = "", payer: str = ""):
	require_cap("claims")
	filters = {}
	if status:
		filters["status"] = status
	if payer:
		filters["payer"] = payer
	return frappe.get_all(
		"Clinza Claim", filters=filters,
		fields=["name", "payer", "patient", "patient_name", "claim_date", "status", "claimed_amount", "approved_amount", "paid_amount",
			"invoice", "payer_reference", "encounter"],
		order_by="claim_date desc, creation desc", limit_page_length=500,
	)


@frappe.whitelist()
def get_claim(name: str):
	require_cap("claims")
	c = frappe.get_doc("Clinza Claim", name).as_dict()
	c["diagnoses"] = _j(c.get("diagnoses"), [])
	c["policy_doc"] = frappe.get_doc("Clinza Insurance Policy", c["policy"]).as_dict() if c.get("policy") else None
	c["payer_doc"] = frappe.get_doc("Clinza Insurance Payer", c["payer"]).as_dict()
	return c


@frappe.whitelist()
def update_claim(name: str, status: str, approved_amount: float | None = None, payer_reference: str | None = None,
		rejection_reason: str | None = None, preauth_no: str | None = None):
	"""Move a claim through Submitted → Under Review → Approved / Partially Approved / Rejected."""
	require_cap("claims")
	if status not in CLAIM_STATUSES or status == "Paid":
		frappe.throw("Unknown status (use record_claim_payment to mark a claim paid).")
	c = frappe.get_doc("Clinza Claim", name)
	if c.status == "Paid":
		frappe.throw("This claim is already paid.")
	c.status = status
	if status == "Submitted" and not c.submitted_on:
		c.submitted_on = now_datetime()
	if approved_amount is not None and approved_amount != "":
		if flt(approved_amount) < 0 or flt(approved_amount) > flt(c.claimed_amount) + 0.005:
			frappe.throw("Approved amount can't be more than the claimed amount.")
		c.approved_amount = flt(approved_amount)
	if status == "Approved" and not flt(c.approved_amount):
		c.approved_amount = c.claimed_amount
	if status == "Rejected":
		if not rejection_reason and not c.rejection_reason:
			frappe.throw("Enter the reason the insurer gave for rejecting the claim.")
		c.approved_amount = 0
	for k, v in (("payer_reference", payer_reference), ("rejection_reason", rejection_reason), ("preauth_no", preauth_no)):
		if v is not None:
			c.set(k, v)
	c.save(ignore_permissions=True)
	return get_claim(c.name)


@frappe.whitelist()
def record_claim_payment(name: str, amount: float, reference_no: str | None = None, mode_of_payment: str = "Bank Draft"):
	"""The insurer paid (part of) a claim: Payment Entry against the insurer invoice."""
	require_cap("claims")
	c = frappe.get_doc("Clinza Claim", name)
	if not c.invoice:
		frappe.throw("This claim has no insurer invoice.")
	if not frappe.db.exists("Mode of Payment", mode_of_payment):
		mode_of_payment = "Cash"
	res = _pay(c.invoice, amount, mode_of_payment, reference_no)
	c.paid_amount = flt(c.paid_amount) + flt(amount)
	c.payment_entry = res["payment_entry"]
	if flt(res["outstanding"]) <= 0.005:
		c.status = "Paid"
	c.save(ignore_permissions=True)
	return get_claim(c.name)


# ---------------------------------------------------------------------------
# dashboard
# ---------------------------------------------------------------------------

@frappe.whitelist()
def dashboard(date: str | None = None):
	caps = _caps()
	if not caps:
		require_cap("appointments")
	_check_module()
	d = getdate(date or today())
	appts = frappe.get_all("Clinza Appointment", filters={"appointment_date": d}, fields=["status", "practitioner"])
	by_status: dict[str, int] = {}
	for a in appts:
		by_status[a.status] = by_status.get(a.status, 0) + 1
	out = {"date": str(d), "appointments": len(appts), "by_status": by_status,
		"new_patients": frappe.db.count("Clinza Patient", {"creation": [">=", get_datetime(f"{d} 00:00:00")]})}
	if "billing" in caps or "reports" in caps:
		rows = frappe.get_all(
			"Sales Invoice", filters=[["docstatus", "=", 1], ["remarks", "like", "CLINZA%"], ["posting_date", "=", d]],
			fields=["grand_total", "rounded_total", "outstanding_amount"],
		)
		out["billed_today"] = flt(sum(flt(r.rounded_total or r.grand_total) for r in rows), 2)
		out["unpaid_total"] = flt(frappe.db.sql(
			"select coalesce(sum(outstanding_amount),0) from `tabSales Invoice` where docstatus=1 and remarks like 'CLINZA%%' and outstanding_amount>0"
		)[0][0], 2)
	if "claims" in caps:
		open_claims = frappe.get_all("Clinza Claim", filters={"status": ["not in", ["Paid", "Rejected"]]}, fields=["claimed_amount", "paid_amount"])
		out["open_claims"] = len(open_claims)
		out["open_claims_amount"] = flt(sum(flt(c.claimed_amount) - flt(c.paid_amount) for c in open_claims), 2)
	return out


# ---------------------------------------------------------------------------
# printable documents (data for the app's print templates)
# ---------------------------------------------------------------------------

def _clinic_header(s) -> dict:
	return {
		"name": s.clinic_name, "address": s.address, "phone": s.phone, "email": s.email, "licence_no": s.licence_no,
		"tax_id": s.tax_id, "tax_id_label": s.tax_id_label, "region": s.region, "country": s.country, "state_code": s.state_code,
		"state_name": cat.INDIA_STATES.get(s.state_code or "", "") if s.region == "India" else "", "arabic": cint(s.arabic_invoice),
		"footer": s.footer_note, "currency": s.currency,
		"logo": frappe.db.get_value("Company", s.company, "company_logo") if s.company and frappe.get_meta("Company").has_field("company_logo") else None,
	}


@frappe.whitelist()
def get_invoice_print(name: str):
	"""Everything the regional invoice template prints: GCC tax invoice (bilingual, TRN,
	ZATCA QR for KSA), India Tax Invoice / Bill of Supply (GSTIN, place of supply,
	HSN/SAC, CGST/SGST/IGST), EU invoice (VAT IDs, exemption reason)."""
	require_cap("billing")
	s = _settings()
	inv = frappe.get_doc("Sales Invoice", name)
	if not (inv.remarks or "").startswith("CLINZA"):
		frappe.throw("Not a CLINZA invoice.")
	preset = cat.tax_preset(s.country)
	enc_name = (inv.remarks or "").split(" ")[1] if (inv.remarks or "").startswith("CLINZA ENC") else None
	snapshot = _j(frappe.db.get_value("Clinza Encounter", enc_name, "tax_snapshot"), {}) if enc_name else {}
	# Classification as billed (snapshot), else today's settings for invoices from before snapshots.
	preset.update({"regime": snapshot.get("regime") or s.tax_regime, "classes": snapshot.get("classes") or _j(s.tax_classes, preset["classes"])})
	accounts = {t.account_head: t.description for t in inv.taxes}
	lines, any_taxable, tax_summary = [], False, {}
	codes = {}
	for svc in frappe.get_all("Clinza Service", fields=["item", "code"]):
		codes[svc.item] = svc.code
	for it in inv.items:
		rates = _j(it.item_tax_rate, {})
		cls = setup.class_of_template(s, it.item_tax_template)
		comps = {}
		for acc, rate in rates.items():
			if acc in accounts:
				comps[accounts[acc]] = {"rate": flt(rate), "amount": flt(flt(it.net_amount) * flt(rate) / 100, 2)}
		tax_amt = flt(sum(c["amount"] for c in comps.values()), 2)
		# The rate actually charged on this line comes from the invoice, never from today's settings.
		r = flt(sum(c["rate"] for c in comps.values()), 3)
		exempt = r == 0 and cat.class_rate(preset, cls)[1]
		if not exempt:
			any_taxable = True
		key = "Exempt" if exempt else f"{r:g}%"
		bucket = tax_summary.setdefault(key, {"label": key, "taxable": 0.0, "tax": 0.0, "exempt": exempt})
		bucket["taxable"] = flt(bucket["taxable"] + flt(it.net_amount), 2)
		bucket["tax"] = flt(bucket["tax"] + tax_amt, 2)
		lines.append({
			"item": it.item_name, "description": it.description if it.description != it.item_name else "", "code": codes.get(it.item_code) or "",
			"qty": it.qty, "rate": it.rate, "amount": it.amount, "net_amount": it.net_amount, "tax_rate": r, "exempt": exempt,
			"zero_rated": (not exempt and r == 0), "components": comps, "tax_amount": tax_amt, "total": flt(flt(it.net_amount) + tax_amt, 2),
		})
	customer = frappe.db.get_value("Customer", inv.customer, ["customer_name", "tax_id", "customer_group"], as_dict=True)
	patient = frappe.db.get_value("Clinza Patient", {"customer": inv.customer},
		["name", "patient_name", "id_type", "id_number", "mobile", "state_code", "address"], as_dict=True)
	enc = frappe.db.get_value("Clinza Encounter", enc_name, ["name", "patient", "policy", "practitioner", "encounter_date"], as_dict=True) if enc_name else None
	visit_patient = frappe.db.get_value("Clinza Patient", enc.patient, ["name", "patient_name", "id_type", "id_number", "mobile"], as_dict=True) if enc else None
	policy = frappe.db.get_value("Clinza Insurance Policy", enc.policy, ["policy_no", "member_id", "payer", "coverage_pct"], as_dict=True) if enc and enc.policy else None
	title, title_ar = cat.document_title(preset, buyer_has_tax_id=bool(customer.tax_id), any_taxable=any_taxable,
		any_exempt=any(l["exempt"] for l in lines))
	total = flt(inv.rounded_total or inv.grand_total)
	qr = None
	if s.region == "GCC" and preset.get("qr") == "zatca_phase1" and s.tax_id:
		ts = get_datetime(f"{inv.posting_date} {inv.posting_time}")
		qr = cat.zatca_tlv_qr(s.clinic_name or inv.company, s.tax_id, ts, flt(inv.grand_total), flt(inv.total_taxes_and_charges))
	place_of_supply = ""
	if s.region == "India":
		pos_code = (patient.state_code if patient else None) or s.state_code or ""
		place_of_supply = f"{pos_code}-{cat.INDIA_STATES.get(pos_code, '')}" if pos_code else ""
	return {
		"kind": "invoice", "standard": s.region, "title": title, "title_ar": title_ar, "clinic": _clinic_header(s),
		"number": inv.name, "date": str(inv.posting_date), "time": str(inv.posting_time)[:8], "due_date": str(inv.due_date or ""),
		"currency": inv.currency, "bill_to": {"name": customer.customer_name, "tax_id": customer.tax_id,
			"is_insurer": customer.customer_group == (s.insurer_customer_group or "Insurance Payers"),
			"id_type": patient.id_type if patient else None, "id_number": patient.id_number if patient else None,
			"mobile": patient.mobile if patient else None, "address": patient.address if patient else None},
		"patient": visit_patient, "policy": policy, "encounter": enc_name,
		"practitioner": frappe.db.get_value("Clinza Practitioner", enc.practitioner, ["practitioner_name", "registration_no"], as_dict=True) if enc else None,
		"lines": lines, "tax_summary": list(tax_summary.values()),
		"net_total": inv.net_total, "tax_total": inv.total_taxes_and_charges, "grand_total": inv.grand_total,
		"rounding_adjustment": inv.rounding_adjustment, "total": total, "outstanding": inv.outstanding_amount,
		"paid": flt(total - flt(inv.outstanding_amount), 2), "in_words": money_in_words(total, inv.currency),
		"intra_state": not any("IGST" in (t.description or "") for t in inv.taxes), "place_of_supply": place_of_supply,
		"exempt_note": preset.get("exempt_note") if any(l["exempt"] for l in lines) else "", "qr_tlv": qr,
		"reverse_charge": "No" if s.region == "India" else None,
	}


@frappe.whitelist()
def get_prescription_print(name: str):
	"""Prescription for an encounter (regional layout chosen by the app)."""
	caps = _caps()
	if "chart" not in caps:
		require_cap("chart")
	s = _settings()
	e = frappe.get_doc("Clinza Encounter", name)
	if not e.prescriptions:
		frappe.throw("This visit has no prescription.")
	patient = frappe.db.get_value("Clinza Patient", e.patient,
		["name", "patient_name", "gender", "date_of_birth", "id_type", "id_number", "mobile", "allergies"], as_dict=True)
	patient["age"] = _age(patient.date_of_birth)
	return {
		"kind": "prescription", "standard": s.region, "clinic": _clinic_header(s), "number": e.name, "date": str(e.encounter_date),
		"patient": patient, "practitioner": frappe.db.get_value("Clinza Practitioner", e.practitioner,
			["practitioner_name", "specialty", "registration_no", "qualification"], as_dict=True),
		"diagnoses": _j(e.diagnoses, []),
		"items": [{k: rx.get(k) for k in ("medicine", "strength", "dosage_form", "dose", "frequency", "route", "duration", "quantity", "instructions")} for rx in e.prescriptions],
		"follow_up_days": (_j(e.chart_data, {}).get("soap") or {}).get("follow_up_days"),
		"advice": (_j(e.chart_data, {}).get("soap") or {}).get("advice"),
		"valid_days": 30 if s.region != "GCC" else 7,
		"standard_note": cat.DOCUMENT_STANDARDS.get(s.region or "Other", cat.DOCUMENT_STANDARDS["Other"])["prescription"],
	}


@frappe.whitelist()
def get_claim_print(name: str):
	"""Insurance claim form data (GCC unified / IRDAI Part B / EU itemised)."""
	require_cap("claims")
	s = _settings()
	c = get_claim(name)
	enc = frappe.get_doc("Clinza Encounter", c["encounter"]) if c.get("encounter") else None
	patient = frappe.db.get_value("Clinza Patient", c["patient"],
		["name", "patient_name", "gender", "date_of_birth", "id_type", "id_number", "mobile", "nationality", "address"], as_dict=True)
	patient["age"] = _age(patient.date_of_birth)
	return {
		"kind": "claim", "standard": s.region, "clinic": _clinic_header(s), "claim": c, "patient": patient,
		"practitioner": frappe.db.get_value("Clinza Practitioner", enc.practitioner, ["practitioner_name", "specialty", "registration_no"], as_dict=True) if enc else None,
		"encounter_date": str(enc.encounter_date) if enc else None,
		"chief_complaint": ((_j(enc.chart_data, {}).get("soap") or {}).get("chief_complaint") if enc else None),
		"standard_note": cat.DOCUMENT_STANDARDS.get(s.region or "Other", cat.DOCUMENT_STANDARDS["Other"])["claim_form"],
		"total_in_words": money_in_words(flt(c.get("claimed_amount")), s.currency),
	}
