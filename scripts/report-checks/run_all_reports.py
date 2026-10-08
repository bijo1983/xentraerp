"""Run every report in erp-frontend's report catalog with its default filters,
as the tenant admin, and list the ones that fail. Read-only, rolled back.

	bench --site 197349.xentraerp.local console < scripts/report-checks/run_all_reports.py

Set CATALOG / USER below if the checkout or tenant admin differ. Token defaults
(`@today|m-1`, `@company`, ...) are resolved the same way the report page does
(erp-frontend/src/lib/reports/tokens.ts).
"""
import json, re
from frappe.utils import add_days, add_months, get_first_day, get_last_day, getdate, now_datetime

CATALOG = "/home/xentraerp/erp-frontend/src/lib/reports/catalog.json"
USER = "admin@jjc.com"

frappe.set_user(USER)
from custom_erp.api.reports import report_context
ctx = report_context()
permitted = set(ctx["permitted"])


def resolve(v):
	if not isinstance(v, str) or not v.startswith("@"):
		return v
	base, *shifts = v[1:].split("|")
	if base in ("today", "now", "month_start", "month_end", "year_start", "year_end"):
		d = getdate(ctx["today"])
		d = {"month_start": get_first_day(d), "month_end": get_last_day(d),
		     "year_start": getdate(ctx["year_start"]) if ctx["year_start"] else d,
		     "year_end": getdate(ctx["year_end"]) if ctx["year_end"] else d}.get(base, d)
		for s in shifts:
			d = add_months(d, int(s[1:])) if s[0] == "m" else add_days(d, int(s[1:]))
		return str(d) if base != "now" else str(now_datetime())
	return ctx.get(base, "")


def active(f, values):
	"""The page's depends_on rule: `eval:doc.x == 'y'`, `!=`, `doc.x`, `!doc.x`."""
	dep = (f.get("depends_on") or "").strip()
	if not dep:
		return True
	expr = dep[5:].strip() if dep.startswith("eval:") else "doc." + dep
	m = re.match(r"^(!?)doc\.(\w+)\s*(?:(==|!=)\s*['\"](.*)['\"])?$", expr)
	if not m:
		return True
	neg, field, op, lit = m.groups()
	val = values.get(field)
	if op == "==":
		return str(val or "") == lit
	if op == "!=":
		return str(val or "") != lit
	return (not val) if neg else bool(val)


catalog = json.load(open(CATALOG))
ok, failed, skipped, needs_input = 0, [], [], []
for r in catalog:
	if r["name"] not in permitted:
		skipped.append(r["name"])
		continue
	filters = {}
	for f in r["filters"]:
		if "default" in f:
			val = resolve(f["default"])
			if f["fieldtype"] == "MultiSelectList":
				val = [val] if val else []
			if val not in ("", None, []):
				filters[f["fieldname"]] = val
	filters = {k: v for k, v in filters.items() if active(next(f for f in r["filters"] if f["fieldname"] == k), filters)}
	missing = [f["fieldname"] for f in r["filters"]
		if f.get("reqd") and not f.get("hidden") and active(f, filters) and f["fieldname"] not in filters and f["fieldtype"] != "Check"]
	if missing:  # the page won't run it until the user fills these in
		needs_input.append((r["name"], missing))
		continue
	try:
		frappe.desk.query_report.run(r["name"], filters=filters, ignore_prepared_report=True)
		ok += 1
	except Exception as e:
		msg = str(e).strip() or type(e).__name__
		failed.append((r["section"], r["name"], type(e).__name__, msg[:200]))
	finally:
		frappe.db.rollback()

print("\n@@ RESULT ok=%d failed=%d needs-input=%d not-permitted=%d" % (ok, len(failed), len(needs_input), len(skipped)))
for n in needs_input:
	print("@@ NEEDS INPUT", n)
for f in failed:
	print("@@ FAIL", f)
if skipped:
	print("@@ NOT PERMITTED", skipped)
frappe.message_log = []
frappe.db.rollback()
frappe.set_user("Administrator")
