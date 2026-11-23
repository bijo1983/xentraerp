"""CLINZA visit flow: front desk -> triage -> doctor -> front desk (billing).

1. Front desk books an appointment, or registers a walk-in, and checks the patient in. Check-in
   gives the day's next token number (printed on a slip) and puts the patient in the triage queue.
2. Triage (nurse, or the doctor in a small clinic) records vitals, the chief complaint and a
   priority (Routine / Urgent / Emergency). The patient moves to the doctor's queue.
3. The doctor's queue is sorted by priority, then token. Calling a patient in opens the visit:
   history and examination (typed or dictated), ICD-10 diagnoses, prescription by generic name.
   Completing the visit sends it to the front desk's "ready to bill" list.
"""

import json

import frappe
from frappe.utils import cint, flt, get_datetime, getdate, now_datetime, nowtime, time_diff_in_seconds, today

from custom_erp.api import clinic_catalog as cat
from custom_erp.api.clinic import (
	SETTINGS, _caps, _check_module, _j, _settings, create_encounter, get_encounter, require_cap,
)

PRIORITIES = ["Emergency", "Urgent", "Routine"]
VITAL_KEYS = ("bp_systolic", "bp_diastolic", "pulse", "temperature", "resp_rate", "spo2", "weight", "height", "pain", "glucose")


def _rank(priority: str | None) -> int:
	return PRIORITIES.index(priority) if priority in PRIORITIES else len(PRIORITIES) - 1


def _next_token(day) -> int:
	"""The day's next token (one sequence per clinic per day). Locks the day's rows so two
	front-desk check-ins at the same moment can't get the same number."""
	row = frappe.db.sql(
		"select coalesce(max(token_no), 0) from `tabClinza Appointment` where appointment_date=%s for update", getdate(day)
	)
	return cint(row[0][0]) + 1


def _wait_minutes(since) -> int:
	return max(0, int(time_diff_in_seconds(now_datetime(), get_datetime(since)) // 60)) if since else 0


def _ticket(a) -> dict:
	s = _settings()
	ahead = frappe.db.count("Clinza Appointment", {
		"appointment_date": a.appointment_date, "status": ["in", ["Checked In", "Triaged"]],
		"token_no": ["<", cint(a.token_no)], "practitioner": a.practitioner,
	})
	return {
		"clinic": s.clinic_name, "clinic_ar": "", "phone": s.phone, "token": cint(a.token_no), "patient": a.patient_name,
		"patient_id": a.patient, "practitioner": frappe.db.get_value("Clinza Practitioner", a.practitioner, "practitioner_name"),
		"appointment_type": a.appointment_type, "priority": a.priority or "Routine", "date": str(a.appointment_date),
		"checked_in_at": str(a.checked_in_at or ""), "ahead": ahead, "name": a.name, "walk_in": a.source == "Walk-in",
	}


@frappe.whitelist()
def check_in(name: str):
	"""Arrived: next token, into the triage queue. Returns the token slip."""
	require_cap("appointments")
	a = frappe.get_doc("Clinza Appointment", name)
	if a.status not in ("Booked", "Confirmed", "Checked In"):
		frappe.throw(f"[BAD_STATUS] This appointment is {a.status}; it can't be checked in.")
	if getdate(a.appointment_date) != getdate(today()):
		frappe.throw("[NOT_TODAY] Only today's appointments can be checked in. Move it to today first.")
	if not a.token_no:
		a.token_no = _next_token(a.appointment_date)
	a.status = "Checked In"
	a.checked_in_at = a.checked_in_at or now_datetime()
	a.save(ignore_permissions=True)
	return _ticket(a)


@frappe.whitelist()
def walk_in(patient: str, practitioner: str, appointment_type: str | None = None, priority: str = "Routine", notes: str | None = None):
	"""A patient without a booking: an appointment for now, checked in at once (token issued)."""
	require_cap("appointments")
	if not patient or not practitioner:
		frappe.throw("Choose the patient and the doctor.")
	s = frappe.get_single(SETTINGS)
	duration = next((cint(x.get("minutes")) for x in _j(s.appointment_types, []) if x.get("name") == appointment_type), cint(s.slot_minutes) or 15)
	a = frappe.get_doc({
		"doctype": "Clinza Appointment", "patient": patient, "practitioner": practitioner, "appointment_type": appointment_type,
		"appointment_date": today(), "appointment_time": nowtime()[:5], "duration": duration, "source": "Walk-in",
		"priority": priority if priority in PRIORITIES else "Routine", "notes": notes, "status": "Booked",
	})
	a.insert(ignore_permissions=True)
	return check_in(a.name)


@frappe.whitelist()
def token_ticket(name: str):
	if not ({"appointments", "triage", "chart"} & _caps()):
		require_cap("appointments")
	_check_module()
	return _ticket(frappe.get_doc("Clinza Appointment", name))


def _vitals_of(encounter: str | None) -> dict:
	if not encounter:
		return {}
	return (_j(frappe.db.get_value("Clinza Encounter", encounter, "chart_data"), {}) or {}).get("vitals") or {}


@frappe.whitelist()
def queue(stage: str = "triage", practitioner: str | None = None):
	"""Today's queue for a stage, priority first then token.
	triage = checked in, not yet triaged; doctor = triaged (+ the doctor's patients in consultation);
	all = everyone checked in and not finished (front desk board)."""
	if stage == "triage":
		require_cap("triage")
		statuses = ["Checked In"]
	elif stage == "doctor":
		require_cap("chart")
		statuses = ["Checked In", "Triaged", "In Consultation"]
	else:
		require_cap("appointments")
		statuses = ["Checked In", "Triaged", "In Consultation"]
	filters = {"appointment_date": today(), "status": ["in", statuses]}
	if practitioner:
		filters["practitioner"] = practitioner
	rows = frappe.get_all(
		"Clinza Appointment", filters=filters,
		fields=["name", "patient", "patient_name", "practitioner", "appointment_type", "status", "token_no", "priority", "source",
			"checked_in_at", "triaged_at", "called_at", "encounter", "notes"],
		limit_page_length=500,
	)
	pats = {p.name: p for p in frappe.get_all(
		"Clinza Patient", filters={"name": ["in", [r.patient for r in rows] or [""]]},
		fields=["name", "gender", "date_of_birth", "allergies"],
	)}
	from custom_erp.api.clinic import _age

	for r in rows:
		p = pats.get(r.patient)
		r["age"] = _age(p.date_of_birth) if p else ""
		r["gender"] = p.gender if p else ""
		r["allergies"] = p.allergies if p else ""
		r["waiting_min"] = _wait_minutes(r.triaged_at or r.checked_in_at)
		if stage != "triage":
			r["vitals"] = _vitals_of(r.encounter)
			r["chief_complaint"] = frappe.db.get_value("Clinza Encounter", r.encounter, "chief_complaint") if r.encounter else ""
	# In consultation first (the doctor's current patient), then priority, then token.
	rows.sort(key=lambda r: (0 if r.status == "In Consultation" else 1, _rank(r.priority), cint(r.token_no) or 9999))
	return rows


@frappe.whitelist()
def save_triage(appointment: str, vitals=None, chief_complaint: str | None = None, priority: str = "Routine",
		allergies: str | None = None, notes: str | None = None, send: int = 1):
	"""Record triage on the visit (creating it). send=1 moves the patient to the doctor's queue."""
	require_cap("triage")
	vitals = _j(vitals, {}) if isinstance(vitals, str) else (vitals or {})
	a = frappe.get_doc("Clinza Appointment", appointment)
	if a.status not in ("Checked In", "Triaged"):
		frappe.throw(f"[BAD_STATUS] This patient is {a.status}; triage is done before the doctor sees them.")
	enc_name = create_encounter(appointment=appointment)
	e = frappe.get_doc("Clinza Encounter", enc_name)
	chart = _j(e.chart_data, {})
	clean = {k: vitals.get(k) for k in VITAL_KEYS if vitals.get(k) not in (None, "")}
	if "notes" in vitals or notes:
		clean["notes"] = (vitals.get("notes") or notes or "")[:500]
	chart["vitals"] = {**(chart.get("vitals") or {}), **clean}
	e.chart_data = json.dumps(chart)
	tpls = _j(e.templates, [])
	if "vitals" not in tpls and "vitals" in cat.TEMPLATES:
		e.templates = json.dumps(["vitals", *tpls])
	if chief_complaint is not None:
		e.chief_complaint = chief_complaint
	e.triage_by = frappe.session.user
	e.triage_at = now_datetime()
	e.save(ignore_permissions=True)
	if allergies is not None and (allergies or "").strip() != (frappe.db.get_value("Clinza Patient", a.patient, "allergies") or "").strip():
		frappe.db.set_value("Clinza Patient", a.patient, "allergies", allergies.strip())
	a.priority = priority if priority in PRIORITIES else "Routine"
	if cint(send):
		a.status = "Triaged"
		a.triaged_at = now_datetime()
	a.save(ignore_permissions=True)
	return {"appointment": a.name, "encounter": e.name, "status": a.status}


@frappe.whitelist()
def call_in(appointment: str):
	"""Doctor calls the patient in: the visit opens (triage can be skipped for a direct consult)."""
	require_cap("chart")
	a = frappe.get_doc("Clinza Appointment", appointment)
	if a.status not in ("Checked In", "Triaged", "In Consultation"):
		frappe.throw(f"[BAD_STATUS] This patient is {a.status}.")
	me = frappe.db.get_value("Clinza Practitioner", {"user": frappe.session.user, "disabled": 0}, "name")
	enc = create_encounter(appointment=appointment, practitioner=a.practitioner or me)
	if a.status != "In Consultation":
		a.status = "In Consultation"
		a.called_at = now_datetime()
		a.save(ignore_permissions=True)
	return get_encounter(enc)


# ---------------------------------------------------------------------------
# prescribing helpers
# ---------------------------------------------------------------------------

@frappe.whitelist()
def search_medicines(query: str = "", limit: int = 20):
	"""Generic medicines from the catalogue plus the clinic's own (learned brands / additions)."""
	require_cap("chart")
	q = (query or "").strip().lower()
	if len(q) < 2:
		return []
	custom = _j(frappe.db.get_single_value(SETTINGS, "custom_medicines"), [])
	brands: dict[str, set] = {}
	for c in custom:
		if c.get("brand"):
			brands.setdefault((c.get("generic") or "").lower(), set()).add(c["brand"])
	out, seen = [], set()
	for m in cat.MEDICINES:
		g = m["generic"].lower()
		b = sorted(brands.get(g, []))
		if q in g or any(q in x.lower() for x in b):
			key = (g, m["form"])
			if key in seen:
				continue
			seen.add(key)
			out.append({**m, "brands": b, "source": "catalogue"})
	known = {m["generic"].lower() for m in cat.MEDICINES}
	for c in custom:
		g = (c.get("generic") or "").lower()
		if g in known or (q not in g and q not in (c.get("brand") or "").lower()):
			continue
		key = (g, c.get("form") or "")
		if key in seen:
			continue
		seen.add(key)
		out.append({"generic": c.get("generic"), "form": c.get("form") or "", "strengths": [c["strength"]] if c.get("strength") else [],
			"route": c.get("route") or "Oral", "dose": "1", "frequency": "", "brands": sorted(brands.get(g, [])), "source": "clinic"})
	out.sort(key=lambda m: (not m["generic"].lower().startswith(q), m["generic"]))
	return out[: max(1, min(cint(limit) or 20, 50))]


@frappe.whitelist()
def prescribing_reference():
	"""Frequencies with doses per day (for quantity) — static reference data."""
	require_cap("chart")
	return {"frequencies": [{"code": c, "label": l, "per_day": n} for c, l, n in cat.FREQUENCIES]}
