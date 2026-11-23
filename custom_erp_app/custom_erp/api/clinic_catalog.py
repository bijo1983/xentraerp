"""CLINZA reference data: clinic types, charting templates, appointment types, starter
services, and the regional tax / document standards (GCC, India, Europe).

Pure data plus pure helpers (no `frappe` import), so it can be unit tested on its own
(see scripts/clinic-checks/test_clinic_catalog.py). Everything here is a *starting point*
that `clinic_setup.apply_clinic_type` copies into the tenant's Clinza Settings; the
tenant can change rates, tax IDs and enabled templates afterwards.

Tax notes (verify with the tenant's own tax adviser — rates and reliefs change):
- UAE (FTA): VAT 5 %. Preventive and basic healthcare services and listed medicines are
  zero-rated; cosmetic / elective services are standard-rated. Tax invoice must show the
  supplier TRN; "Tax Invoice" wording; Arabic is accepted alongside English.
- KSA (ZATCA): VAT 15 % on private healthcare and medicines (zero-rating applies only to
  state-funded care of citizens). Simplified tax invoices (B2C) must carry the Phase-1
  QR code (TLV: seller, VAT no., timestamp, total, VAT); "فاتورة ضريبية مبسطة".
- Bahrain (NBR): VAT 10 %. Basic healthcare and listed medicines zero-rated.
- Oman (OTA): VAT 5 %. Healthcare services exempt, medicines zero-rated.
- Qatar, Kuwait: no VAT in force — plain invoices.
- India (GST): healthcare services by a clinical establishment are exempt
  (SAC 9993, Notification 12/2017-CT(R)) → "Bill of Supply" when nothing is taxable.
  Cosmetic / plastic procedures 18 %; medicines typically 12 % (some 5 %). Intra-state =
  CGST + SGST (half each), inter-state = IGST. GSTIN, state code, place of supply and
  HSN/SAC per line are mandatory on a tax invoice.
- EU (VAT Directive 2006/112/EC): medical care is exempt under Art. 132(1)(b)/(c); an
  invoice for an exempt supply must state the exemption reason (Art. 226(11)).
"""

from __future__ import annotations

import base64
from datetime import datetime

# ---------------------------------------------------------------------------
# Charting templates. Field types the CLINZA chart renderer understands:
#   text, textarea, number, select, check, date, scale (0-10), tooth_chart, eye_diagram, rows
# `rows` = a small repeating table with its own `columns` (same field types minus rows).
# ---------------------------------------------------------------------------

def _f(key, label, type="text", **kw):
	return {"key": key, "label": label, "type": type, **kw}


TEMPLATES: dict[str, dict] = {
	"vitals": {
		"label": "Vital signs",
		"sections": [
			{"label": "Vitals", "fields": [
				_f("bp_systolic", "BP systolic", "number", unit="mmHg", min=40, max=260),
				_f("bp_diastolic", "BP diastolic", "number", unit="mmHg", min=20, max=180),
				_f("pulse", "Pulse", "number", unit="bpm", min=20, max=250),
				_f("temperature", "Temperature", "number", unit="°C", min=30, max=45, step=0.1),
				_f("resp_rate", "Respiratory rate", "number", unit="/min", min=4, max=80),
				_f("spo2", "SpO₂", "number", unit="%", min=50, max=100),
				_f("weight", "Weight", "number", unit="kg", min=0.3, max=400, step=0.1),
				_f("height", "Height", "number", unit="cm", min=20, max=250),
				_f("pain", "Pain score", "scale"),
			]},
		],
	},
	"soap": {
		"label": "Consultation (SOAP)",
		"sections": [
			{"label": "Subjective", "fields": [
				_f("chief_complaint", "Chief complaint"),
				_f("hpi", "History of present illness", "textarea"),
				_f("past_history", "Past medical / surgical history", "textarea"),
			]},
			{"label": "Objective", "fields": [_f("examination", "Examination findings", "textarea")]},
			{"label": "Assessment", "fields": [_f("assessment", "Assessment / impression", "textarea")]},
			{"label": "Plan", "fields": [
				_f("plan", "Plan", "textarea"),
				_f("advice", "Advice to patient", "textarea"),
				_f("follow_up_days", "Follow up in", "number", unit="days", min=0, max=365),
			]},
		],
	},
	"dental_chart": {
		"label": "Dental chart (FDI)",
		"sections": [
			{"label": "Odontogram", "fields": [
				_f("teeth", "Teeth", "tooth_chart", conditions=[
					"Sound", "Caries", "Filled", "Crown", "Missing", "Root canal", "Implant",
					"Bridge", "Fractured", "Extraction planned", "Impacted",
				]),
			]},
			{"label": "Periodontal", "fields": [
				_f("oral_hygiene", "Oral hygiene", "select", options=["Good", "Fair", "Poor"]),
				_f("gingiva", "Gingival condition", "textarea"),
				_f("occlusion", "Occlusion", "text"),
			]},
		],
	},
	"dental_treatment": {
		"label": "Dental treatment plan",
		"sections": [
			{"label": "Treatment plan", "fields": [
				_f("treatments", "Planned treatment", "rows", columns=[
					_f("tooth", "Tooth (FDI)"), _f("procedure", "Procedure"),
					_f("surface", "Surface", "select", options=["", "M", "O", "D", "B", "L", "MO", "DO", "MOD"]),
					_f("status", "Status", "select", options=["Planned", "In progress", "Done"]),
				]),
			]},
		],
	},
	"eye_exam": {
		"label": "Eye examination",
		"sections": [
			{"label": "Visual acuity", "fields": [
				_f("va_od_unaided", "VA right (unaided)"), _f("va_os_unaided", "VA left (unaided)"),
				_f("va_od_aided", "VA right (aided)"), _f("va_os_aided", "VA left (aided)"),
			]},
			{"label": "Refraction", "fields": [
				_f("od_sph", "Right SPH", "number", step=0.25), _f("od_cyl", "Right CYL", "number", step=0.25),
				_f("od_axis", "Right axis", "number", min=0, max=180), _f("od_add", "Right ADD", "number", step=0.25),
				_f("os_sph", "Left SPH", "number", step=0.25), _f("os_cyl", "Left CYL", "number", step=0.25),
				_f("os_axis", "Left axis", "number", min=0, max=180), _f("os_add", "Left ADD", "number", step=0.25),
				_f("pd", "Pupillary distance", "number", unit="mm"),
			]},
			{"label": "Anterior segment & fundus", "fields": [
				_f("eye_map", "Both eyes", "eye_diagram"),
			]},
			{"label": "Examination", "fields": [
				_f("iop_od", "IOP right", "number", unit="mmHg"), _f("iop_os", "IOP left", "number", unit="mmHg"),
				_f("slit_lamp", "Slit lamp", "textarea"), _f("fundus", "Fundus", "textarea"),
			]},
		],
	},
	"skin_exam": {
		"label": "Skin examination",
		"sections": [
			{"label": "Lesions", "fields": [
				_f("lesions", "Lesions", "rows", columns=[
					_f("site", "Site"),
					_f("morphology", "Morphology", "select", options=["Macule", "Papule", "Plaque", "Nodule", "Vesicle", "Pustule", "Ulcer", "Scar", "Other"]),
					_f("size_mm", "Size (mm)", "number"), _f("colour", "Colour"),
				]),
				_f("fitzpatrick", "Fitzpatrick skin type", "select", options=["I", "II", "III", "IV", "V", "VI"]),
				_f("distribution", "Distribution", "textarea"),
			]},
		],
	},
	"aesthetic_procedure": {
		"label": "Aesthetic procedure record",
		"sections": [
			{"label": "Procedure", "fields": [
				_f("procedure", "Procedure"), _f("areas", "Treated areas", "textarea"),
				_f("product", "Product / device"), _f("batch", "Batch / lot no."),
				_f("units", "Units / settings"), _f("consent", "Written consent obtained", "check"),
				_f("aftercare", "After-care given", "textarea"),
			]},
		],
	},
	"physio_assessment": {
		"label": "Physiotherapy assessment",
		"sections": [
			{"label": "Assessment", "fields": [
				_f("region", "Body region"), _f("pain", "Pain (VAS)", "scale"),
				_f("rom", "Range of motion", "rows", columns=[
					_f("joint", "Joint / movement"), _f("left", "Left (°)", "number"), _f("right", "Right (°)", "number"),
				]),
				_f("strength", "Muscle strength (MMT 0-5)", "textarea"),
				_f("special_tests", "Special tests", "textarea"),
				_f("goals", "Functional goals", "textarea"),
			]},
		],
	},
	"physio_session": {
		"label": "Therapy session note",
		"sections": [
			{"label": "Session", "fields": [
				_f("modalities", "Modalities", "textarea"), _f("exercises", "Exercises", "textarea"),
				_f("duration_min", "Duration", "number", unit="min"), _f("pain_after", "Pain after session", "scale"),
				_f("home_program", "Home programme", "textarea"),
			]},
		],
	},
	"growth": {
		"label": "Growth & development",
		"sections": [
			{"label": "Growth", "fields": [
				_f("weight", "Weight", "number", unit="kg", step=0.01), _f("length", "Length / height", "number", unit="cm", step=0.1),
				_f("head_circ", "Head circumference", "number", unit="cm", step=0.1),
				_f("milestones", "Developmental milestones", "textarea"),
				_f("feeding", "Feeding", "select", options=["Breast", "Formula", "Mixed", "Solids", "Family diet"]),
			]},
		],
	},
	"immunization": {
		"label": "Immunization record",
		"sections": [
			{"label": "Vaccines given", "fields": [
				_f("vaccines", "Vaccines", "rows", columns=[
					_f("vaccine", "Vaccine"), _f("dose", "Dose"), _f("batch", "Batch no."),
					_f("site", "Site", "select", options=["L deltoid", "R deltoid", "L thigh", "R thigh", "Oral"]),
				]),
				_f("next_due", "Next due", "date"),
			]},
		],
	},
	"antenatal": {
		"label": "Antenatal visit",
		"sections": [
			{"label": "Pregnancy", "fields": [
				_f("lmp", "LMP", "date"), _f("edd", "EDD", "date"),
				_f("gravida", "Gravida", "number", min=0), _f("para", "Para", "number", min=0),
				_f("ga_weeks", "Gestational age", "number", unit="weeks", min=0, max=45),
				_f("fundal_height", "Fundal height", "number", unit="cm"),
				_f("fhr", "Fetal heart rate", "number", unit="bpm"),
				_f("presentation", "Presentation", "select", options=["", "Cephalic", "Breech", "Transverse"]),
				_f("urine", "Urine (protein/glucose)"),
			]},
		],
	},
	"ent_exam": {
		"label": "ENT examination",
		"sections": [
			{"label": "Examination", "fields": [
				_f("ear_right", "Right ear", "textarea"), _f("ear_left", "Left ear", "textarea"),
				_f("nose", "Nose / sinuses", "textarea"), _f("throat", "Throat", "textarea"),
				_f("hearing", "Hearing (Rinne / Weber)", "text"),
			]},
		],
	},
	"cardiac": {
		"label": "Cardiac assessment",
		"sections": [
			{"label": "Cardiac", "fields": [
				_f("rhythm", "Rhythm", "select", options=["Sinus", "AF", "Flutter", "Other"]),
				_f("ecg", "ECG findings", "textarea"), _f("ef", "Ejection fraction", "number", unit="%"),
				_f("murmur", "Murmurs", "text"), _f("nyha", "NYHA class", "select", options=["", "I", "II", "III", "IV"]),
			]},
		],
	},
}

# ---------------------------------------------------------------------------
# Services. tax_class: healthcare | cosmetic | medicine | goods — mapped to a VAT/GST
# treatment by the tenant's tax preset (TAX_PRESETS[...]["classes"]).
# code = default SAC/HSN for India (9993 = human health services).
# ---------------------------------------------------------------------------

def _s(name, rate, tax_class="healthcare", code="999312"):
	return {"name": name, "rate": rate, "tax_class": tax_class, "code": code}


CLINIC_TYPES: dict[str, dict] = {
	"general": {
		"label": "General practice / family medicine",
		"templates": ["vitals", "soap"],
		"appointment_types": [("Consultation", 15), ("Follow-up", 10), ("Procedure", 30), ("Health check", 45)],
		"services": [_s("GP consultation", 150), _s("Follow-up visit", 80), _s("Wound dressing", 60),
			_s("Injection administration", 40), _s("ECG", 120)],
	},
	"dental": {
		"label": "Dental",
		"templates": ["vitals", "soap", "dental_chart", "dental_treatment"],
		"appointment_types": [("Check-up", 30), ("Scaling & polishing", 45), ("Filling", 60), ("Root canal", 90), ("Extraction", 45)],
		"services": [_s("Dental examination", 100), _s("Scaling & polishing", 250), _s("Composite filling", 350),
			_s("Root canal treatment", 1200), _s("Tooth extraction", 300), _s("Teeth whitening", 900, "cosmetic", "999319"),
			_s("OPG X-ray", 150)],
	},
	"dermatology": {
		"label": "Dermatology & aesthetics",
		"templates": ["vitals", "soap", "skin_exam", "aesthetic_procedure"],
		"appointment_types": [("Consultation", 20), ("Procedure", 45), ("Laser session", 30), ("Follow-up", 15)],
		"services": [_s("Dermatology consultation", 250), _s("Cryotherapy", 200), _s("Skin biopsy", 450),
			_s("Chemical peel", 600, "cosmetic", "999319"), _s("Laser hair removal session", 800, "cosmetic", "999319"),
			_s("Botulinum toxin (per area)", 1200, "cosmetic", "999319")],
	},
	"ophthalmology": {
		"label": "Ophthalmology & optometry",
		"templates": ["vitals", "soap", "eye_exam"],
		"appointment_types": [("Eye consultation", 20), ("Refraction", 15), ("Diagnostic test", 30), ("Post-op review", 15)],
		"services": [_s("Eye consultation", 250), _s("Refraction test", 100), _s("OCT scan", 400), _s("Tonometry", 80),
			_s("Spectacle lenses (pair)", 300, "goods", "9001")],
	},
	"physiotherapy": {
		"label": "Physiotherapy & rehabilitation",
		"templates": ["vitals", "physio_assessment", "physio_session"],
		"appointment_types": [("Initial assessment", 45), ("Therapy session", 30), ("Review", 20)],
		"services": [_s("Physiotherapy assessment", 300), _s("Physiotherapy session", 200), _s("Dry needling", 250),
			_s("Shockwave therapy", 350)],
	},
	"pediatrics": {
		"label": "Pediatrics",
		"templates": ["vitals", "soap", "growth", "immunization"],
		"appointment_types": [("Consultation", 15), ("Well-baby visit", 20), ("Vaccination", 10)],
		"services": [_s("Pediatric consultation", 200), _s("Well-baby check", 150), _s("Vaccine administration", 50)],
	},
	"obgyn": {
		"label": "Obstetrics & gynecology",
		"templates": ["vitals", "soap", "antenatal"],
		"appointment_types": [("Consultation", 20), ("Antenatal visit", 20), ("Ultrasound", 30)],
		"services": [_s("Gynecology consultation", 300), _s("Antenatal visit", 250), _s("Obstetric ultrasound", 400),
			_s("Pap smear", 200)],
	},
	"ent": {
		"label": "ENT",
		"templates": ["vitals", "soap", "ent_exam"],
		"appointment_types": [("Consultation", 15), ("Procedure", 30), ("Audiometry", 30)],
		"services": [_s("ENT consultation", 250), _s("Ear wax removal", 150), _s("Audiometry", 250), _s("Nasal endoscopy", 400)],
	},
	"cardiology": {
		"label": "Cardiology",
		"templates": ["vitals", "soap", "cardiac"],
		"appointment_types": [("Consultation", 20), ("ECG / Echo", 30), ("Follow-up", 15)],
		"services": [_s("Cardiology consultation", 350), _s("ECG", 120), _s("Echocardiogram", 700), _s("Holter monitoring", 600)],
	},
	"multispecialty": {
		"label": "Multi-specialty polyclinic",
		"templates": list(TEMPLATES.keys()),
		"appointment_types": [("Consultation", 15), ("Follow-up", 10), ("Procedure", 30), ("Diagnostic test", 30)],
		"services": [_s("Specialist consultation", 250), _s("GP consultation", 150), _s("Follow-up visit", 80),
			_s("Procedure fee", 300), _s("ECG", 120)],
	},
}

# Every clinic dispenses / sells a couple of goods lines.
COMMON_SERVICES = [_s("Medicines (dispensed)", 0, "medicine", "3004"), _s("Medical consumables", 0, "goods", "9018")]

# ---------------------------------------------------------------------------
# Regions & tax presets
# ---------------------------------------------------------------------------

GCC = {"United Arab Emirates": "AE", "Saudi Arabia": "SA", "Bahrain": "BH", "Oman": "OM", "Qatar": "QA", "Kuwait": "KW"}
EUROPE_RATES = {
	# country: (standard, reduced rate used for medicines)
	"Germany": (19, 19), "France": (20, 2.1), "Italy": (22, 10), "Spain": (21, 4), "Netherlands": (21, 9),
	"Belgium": (21, 6), "Austria": (20, 10), "Ireland": (23, 0), "Portugal": (23, 6), "Poland": (23, 8),
	"Sweden": (25, 25), "Denmark": (25, 25), "Finland": (25.5, 14), "Greece": (24, 6), "Luxembourg": (17, 3),
	"Cyprus": (19, 5), "Malta": (18, 0), "Czech Republic": (21, 12), "Romania": (21, 11), "Hungary": (27, 5),
	"United Kingdom": (20, 0), "Switzerland": (8.1, 2.6), "Norway": (25, 25),
}

EU_EXEMPT_NOTE = "Exempt from VAT — medical care, Art. 132(1)(c) Directive 2006/112/EC"
IN_EXEMPT_NOTE = "Exempt — health care services by a clinical establishment (SAC 9993), Notification 12/2017-CT(R)"


def _vat(country, code, rate, classes, *, arabic=False, qr=None, tax_id_label="TRN", simplified_title=None, note=""):
	return {
		"region": "GCC", "country": country, "country_code": code, "regime": "VAT" if rate else "None",
		"standard_rate": rate, "classes": classes, "tax_id_label": tax_id_label, "arabic": arabic, "qr": qr,
		"invoice_title": "Tax Invoice" if rate else "Invoice",
		"invoice_title_ar": "فاتورة ضريبية" if rate else "فاتورة",
		"simplified_title": simplified_title or ("Simplified Tax Invoice" if rate else "Invoice"),
		"simplified_title_ar": "فاتورة ضريبية مبسطة" if rate else "فاتورة",
		"exempt_note": note, "currency_decimals": 3 if code in ("BH", "OM", "KW") else 2,
	}


def tax_preset(country: str | None) -> dict:
	"""The starting VAT / GST preset for a tenant in `country`. Rates by tax class are
	{class: rate or "exempt"} — 0 means zero-rated (still a taxable supply)."""
	c = (country or "").strip()
	if c == "United Arab Emirates":
		return _vat(c, "AE", 5, {"healthcare": 0, "cosmetic": 5, "medicine": 0, "goods": 5}, arabic=True)
	if c == "Saudi Arabia":
		return _vat(c, "SA", 15, {"healthcare": 15, "cosmetic": 15, "medicine": 15, "goods": 15}, arabic=True,
			qr="zatca_phase1", tax_id_label="VAT No.")
	if c == "Bahrain":
		return _vat(c, "BH", 10, {"healthcare": 0, "cosmetic": 10, "medicine": 0, "goods": 10}, arabic=True, tax_id_label="VAT No.")
	if c == "Oman":
		return _vat(c, "OM", 5, {"healthcare": "exempt", "cosmetic": 5, "medicine": 0, "goods": 5}, arabic=True,
			tax_id_label="VATIN", note="Exempt — healthcare services (Oman VAT Law, Art. 47)")
	if c in ("Qatar", "Kuwait"):
		return _vat(c, GCC[c], 0, {"healthcare": "exempt", "cosmetic": "exempt", "medicine": "exempt", "goods": "exempt"}, arabic=True,
			tax_id_label="CR No.")
	if c == "India":
		return {
			"region": "India", "country": c, "country_code": "IN", "regime": "GST", "standard_rate": 18,
			"classes": {"healthcare": "exempt", "cosmetic": 18, "medicine": 12, "goods": 18},
			"tax_id_label": "GSTIN", "arabic": False, "qr": None,
			"invoice_title": "Tax Invoice", "bill_of_supply_title": "Bill of Supply",
			"simplified_title": "Tax Invoice", "exempt_note": IN_EXEMPT_NOTE, "currency_decimals": 2,
		}
	if c in EUROPE_RATES:
		std, reduced = EUROPE_RATES[c]
		return {
			"region": "Europe", "country": c, "country_code": "", "regime": "VAT", "standard_rate": std,
			"classes": {"healthcare": "exempt", "cosmetic": std, "medicine": reduced, "goods": std},
			"tax_id_label": "VAT ID", "arabic": False, "qr": None,
			"invoice_title": "Invoice", "simplified_title": "Invoice", "exempt_note": EU_EXEMPT_NOTE, "currency_decimals": 2,
		}
	return {
		"region": "Other", "country": c, "country_code": "", "regime": "None", "standard_rate": 0,
		"classes": {"healthcare": "exempt", "cosmetic": "exempt", "medicine": "exempt", "goods": "exempt"},
		"tax_id_label": "Tax ID", "arabic": False, "qr": None, "invoice_title": "Invoice", "simplified_title": "Invoice",
		"exempt_note": "", "currency_decimals": 2,
	}


def region_of(country: str | None) -> str:
	return tax_preset(country)["region"]


# Claim / prescription standards by region — what the printable forms carry.
DOCUMENT_STANDARDS = {
	"GCC": {
		"claim_form": "GCC unified claim (DHA eClaimLink / DOH Shafafiya / CCHI NPHIES fields)",
		"code_sets": ["ICD-10-CM", "CPT", "DHA/DOH drug codes (GTIN)"],
		"prescription": "Bilingual prescription with licence no.; generic names; Emirates ID / Iqama no.",
		"id_types": ["Emirates ID", "Iqama", "National ID", "GCC ID", "Passport"],
	},
	"India": {
		"claim_form": "IRDAI standard claim form Part B (hospital / TPA) · PM-JAY where applicable",
		"code_sets": ["ICD-10", "SAC/HSN"],
		"prescription": "NMC format: registration no., generic names in CAPITALS (NMC 2023 guidance), patient age/sex",
		"id_types": ["Aadhaar", "ABHA ID", "PAN", "Passport"],
	},
	"Europe": {
		"claim_form": "Itemised invoice for reimbursement (e.g. statutory / private insurer), EHIC / S2 where applicable",
		"code_sets": ["ICD-10", "national tariff codes (e.g. GOÄ, NGAP, CCAM)"],
		"prescription": "EU cross-border prescription fields (Directive 2012/52/EU): prescriber, patient DoB, INN, strength, form, quantity",
		"id_types": ["National ID", "Health insurance no.", "EHIC", "Passport"],
	},
	"Other": {
		"claim_form": "Generic itemised claim",
		"code_sets": ["ICD-10"],
		"prescription": "Standard prescription",
		"id_types": ["National ID", "Passport"],
	},
}

INDIA_STATES = {
	"01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
	"06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
	"12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
	"18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
	"24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
	"31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
	"36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
}


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def class_rate(preset: dict, tax_class: str):
	"""(rate, exempt) for a tax class under a preset."""
	v = (preset.get("classes") or {}).get(tax_class or "healthcare", "exempt")
	if v == "exempt" or preset.get("regime") == "None":
		return 0.0, True
	return float(v), False


def gst_split(rate: float, intra_state: bool) -> dict:
	"""India: an item's GST rate as CGST/SGST halves (same state) or IGST (other state)."""
	if intra_state:
		return {"cgst": rate / 2, "sgst": rate / 2, "igst": 0.0}
	return {"cgst": 0.0, "sgst": 0.0, "igst": rate}


def gstin_state(gstin: str | None) -> str:
	"""The 2-digit state code that starts a GSTIN ('' when it doesn't look like one)."""
	g = (gstin or "").strip()
	return g[:2] if len(g) == 15 and g[:2].isdigit() else ""


def document_title(preset: dict, *, buyer_has_tax_id: bool, any_taxable: bool, any_exempt: bool = False) -> tuple[str, str]:
	"""(English title, Arabic title or '') for an invoice under the tenant's preset.
	India: Tax Invoice (all taxable), Bill of Supply (all exempt), or Invoice-cum-Bill of
	Supply when one bill has both (CGST Rule 46A)."""
	if preset.get("region") == "India":
		if any_taxable and any_exempt:
			return "Invoice-cum-Bill of Supply", ""
		return (preset["invoice_title"] if any_taxable else preset["bill_of_supply_title"]), ""
	if preset.get("region") == "GCC" and preset.get("regime") == "VAT":
		if buyer_has_tax_id:
			return preset["invoice_title"], preset.get("invoice_title_ar", "")
		return preset["simplified_title"], preset.get("simplified_title_ar", "")
	return preset.get("invoice_title", "Invoice"), preset.get("invoice_title_ar", "") if preset.get("arabic") else ""


def zatca_tlv_qr(seller: str, vat_no: str, timestamp: datetime | str, total: float, vat: float) -> str:
	"""ZATCA Phase-1 QR payload: base64 of TLV tags 1-5 (seller name, VAT registration no.,
	ISO-8601 timestamp, invoice total incl. VAT, VAT total). Values are UTF-8 encoded."""
	if isinstance(timestamp, datetime):
		timestamp = timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")
	out = bytearray()
	for tag, value in enumerate([seller, vat_no, str(timestamp), f"{total:.2f}", f"{vat:.2f}"], start=1):
		b = str(value).encode("utf-8")
		if len(b) > 255:
			raise ValueError(f"ZATCA QR field {tag} is longer than 255 bytes")
		out += bytes([tag, len(b)]) + b
	return base64.b64encode(bytes(out)).decode("ascii")


def split_share(amount: float, coverage_pct: float, copay_cap: float = 0.0) -> tuple[float, float]:
	"""(insurer share, patient share) of `amount`. coverage_pct = what the insurer pays;
	copay_cap > 0 limits the patient's share per visit (the insurer covers the rest)."""
	coverage_pct = max(0.0, min(100.0, float(coverage_pct or 0)))
	patient = round(amount * (100 - coverage_pct) / 100, 2)
	if copay_cap and copay_cap > 0:
		patient = min(patient, round(float(copay_cap), 2))
	return round(amount - patient, 2), patient


def public_catalog() -> dict:
	"""What the signup form and the clinic setup screen show (guest-safe)."""
	return {
		"clinic_types": [
			{"code": k, "label": v["label"], "templates": v["templates"],
			 "appointment_types": [{"name": n, "minutes": m} for n, m in v["appointment_types"]]}
			for k, v in CLINIC_TYPES.items()
		],
		"templates": {k: {"label": v["label"]} for k, v in TEMPLATES.items()},
	}
