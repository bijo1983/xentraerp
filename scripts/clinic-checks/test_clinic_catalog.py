"""Pure-logic checks for CLINZA's catalog / tax helpers (no Frappe needed).

    python3 scripts/clinic-checks/test_clinic_catalog.py
"""
import base64
import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("clinic_catalog", ROOT / "custom_erp_app/custom_erp/api/clinic_catalog.py")
cat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cat)

failures = 0


def check(name, cond):
	global failures
	print(("ok   " if cond else "FAIL ") + name)
	failures += 0 if cond else 1


# every clinic type only refers to templates that exist; services have a valid tax class
for code, t in cat.CLINIC_TYPES.items():
	check(f"{code}: templates exist", all(x in cat.TEMPLATES for x in t["templates"]))
	check(f"{code}: services have tax classes", all(s["tax_class"] in ("healthcare", "cosmetic", "medicine", "goods") for s in t["services"]))
	check(f"{code}: appointment types have minutes", all(m > 0 for _, m in t["appointment_types"]))

# template field types are the ones the frontend renders
TYPES = {"text", "textarea", "number", "select", "check", "date", "scale", "tooth_chart", "eye_diagram", "rows"}
for k, t in cat.TEMPLATES.items():
	keys = [f["key"] for s in t["sections"] for f in s["fields"]]
	check(f"template {k}: field types known", all(f["type"] in TYPES for s in t["sections"] for f in s["fields"]))
	check(f"template {k}: keys unique", len(keys) == len(set(keys)))

# presets
ae, sa, bh, om, qa, ind, de = (cat.tax_preset(c) for c in ("United Arab Emirates", "Saudi Arabia", "Bahrain", "Oman", "Qatar", "India", "Germany"))
check("UAE VAT 5%", ae["regime"] == "VAT" and ae["standard_rate"] == 5)
check("UAE basic healthcare zero-rated (taxable at 0)", cat.class_rate(ae, "healthcare") == (0.0, False))
check("UAE cosmetic standard-rated", cat.class_rate(ae, "cosmetic") == (5.0, False))
check("KSA VAT 15% with ZATCA QR", sa["standard_rate"] == 15 and sa["qr"] == "zatca_phase1")
check("Bahrain VAT 10%, 3 decimals", bh["standard_rate"] == 10 and bh["currency_decimals"] == 3)
check("Oman healthcare exempt", cat.class_rate(om, "healthcare") == (0.0, True))
check("Qatar has no VAT", qa["regime"] == "None" and cat.class_rate(qa, "cosmetic") == (0.0, True))
check("India GST, healthcare exempt", ind["regime"] == "GST" and cat.class_rate(ind, "healthcare") == (0.0, True))
check("India medicines 12%", cat.class_rate(ind, "medicine") == (12.0, False))
check("Germany VAT 19%, healthcare exempt", de["standard_rate"] == 19 and cat.class_rate(de, "healthcare")[1])
check("unknown country -> no tax", cat.tax_preset("Atlantis")["regime"] == "None")
check("regions", [cat.region_of(c) for c in ("Kuwait", "India", "France", "Japan")] == ["GCC", "India", "Europe", "Other"])

# titles
check("India all exempt -> Bill of Supply", cat.document_title(ind, buyer_has_tax_id=False, any_taxable=False)[0] == "Bill of Supply")
check("India taxable -> Tax Invoice", cat.document_title(ind, buyer_has_tax_id=False, any_taxable=True)[0] == "Tax Invoice")
check("India mixed -> Invoice-cum-Bill of Supply", cat.document_title(ind, buyer_has_tax_id=False, any_taxable=True, any_exempt=True)[0] == "Invoice-cum-Bill of Supply")
check("KSA B2C -> simplified, Arabic", cat.document_title(sa, buyer_has_tax_id=False, any_taxable=True) == ("Simplified Tax Invoice", "فاتورة ضريبية مبسطة"))
check("UAE B2B -> Tax Invoice", cat.document_title(ae, buyer_has_tax_id=True, any_taxable=True)[0] == "Tax Invoice")

# GST split
check("GST intra-state halves", cat.gst_split(18, True) == {"cgst": 9, "sgst": 9, "igst": 0.0})
check("GST inter-state IGST", cat.gst_split(18, False)["igst"] == 18)
check("GSTIN state code", cat.gstin_state("29ABCDE1234F1Z5") == "29" and cat.gstin_state("bad") == "")

# insurance split
check("80% cover of 200", cat.split_share(200, 80) == (160.0, 40.0))
check("co-pay cap 25", cat.split_share(200, 80, 25) == (175.0, 25.0))
check("no cover", cat.split_share(100, 0) == (0.0, 100.0))
check("coverage clamped", cat.split_share(100, 150) == (100.0, 0.0))

# ZATCA TLV (structure check: tag, length, value)
qr = base64.b64decode(cat.zatca_tlv_qr("Clinic", "300000000000003", "2026-11-23T10:00:00Z", 115.0, 15.0))
fields, i = [], 0
while i < len(qr):
	tag, ln = qr[i], qr[i + 1]
	fields.append((tag, qr[i + 2:i + 2 + ln].decode()))
	i += 2 + ln
check("ZATCA TLV fields", fields == [(1, "Clinic"), (2, "300000000000003"), (3, "2026-11-23T10:00:00Z"), (4, "115.00"), (5, "15.00")])
check("ZATCA TLV Arabic seller is UTF-8", base64.b64decode(cat.zatca_tlv_qr("عيادة", "3", "t", 1, 0))[1] == len("عيادة".encode()))

check("public catalog lists every type", len(cat.public_catalog()["clinic_types"]) == len(cat.CLINIC_TYPES))

print(f"\n{failures} failed")
sys.exit(1 if failures else 0)
