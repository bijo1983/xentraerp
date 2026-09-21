"""Shared POS engine used by both Retail and F&B: operating-hours settings,
the business day, shifts with per-currency cash-up, multi-currency checkout,
and the shift / end-of-day reports.

Three ideas everything here hangs on:

* **Business date.** The trading day a sale belongs to, which is not always
  the calendar date. With "continue billing on the previous day" on, sales
  rung up between midnight and the cut-off time (e.g. 05:00) are posted to the
  previous day, so a bar that trades past 24:00 still closes one clean day. An
  F&B bill keeps the business date of the moment its table was opened, however
  late it is settled.
* **Shift.** One cashier on one register with a cash drawer: opened with an
  opening float per currency, closed with a count, and the variance against
  what the drawer should hold. In 24/7 mode a shift may run across the day
  rollover and there is no day-end close; otherwise a shift must be closed
  (and a new one opened) once the business date changes.
* **Tender.** Each payment leg is recorded in the currency it was handed over
  in (XentraERP POS Tender) — the POS Invoice itself only knows the invoice
  currency — so the drawer can be cashed up per currency.
"""

import json
from contextlib import contextmanager
from datetime import timedelta

import frappe
from frappe.utils import add_days, cint, flt, get_datetime, get_time, getdate, now_datetime

SETTINGS = "XentraERP POS Settings"
MODES = ("Retail", "F&B")
CHECKOUT_DOCS = ("POS Invoice", "Draft Invoice + Receipt")


# --------------------------------------------------------------- guards


def is_manager() -> bool:
	return "System Manager" in frappe.get_roles()


# ------------------------------------------------------------ roles & rights
# Four POS roles besides the administrator (System Manager). Each grants a set of
# capabilities; the server checks them on every call, so hiding a button in the
# app is only a convenience — a waiter calling the API directly is refused too.
POS_ROLES = {"POS Kitchen": "kitchen", "POS Waiter": "waiter", "POS Cashier": "cashier", "POS Supervisor": "supervisor"}
_WAITER = {"view", "kot", "order", "reserve"}
_CASHIER = _WAITER | {"modify", "bill", "shift"}
_SUPERVISOR = _CASHIER | {"supervise", "tables", "menu", "reports", "staff"}
CAPS = {
	"kitchen": {"view", "kot"},
	"waiter": _WAITER,
	"cashier": _CASHIER,
	"supervisor": _SUPERVISOR,
	"admin": _SUPERVISOR | {"settings"},
}
LEVEL_LABEL = {"kitchen": "Kitchen", "waiter": "Waiter", "cashier": "Cashier", "supervisor": "Supervisor", "admin": "Administrator"}
_CAP_NEEDS = {
	"modify": "a cashier", "bill": "a cashier", "shift": "a cashier", "supervise": "a supervisor or administrator",
	"tables": "a supervisor or administrator", "menu": "a supervisor or administrator", "reports": "a supervisor or administrator",
	"staff": "a supervisor or administrator", "settings": "an administrator", "order": "a waiter or above", "reserve": "a waiter or above", "kot": "kitchen or floor staff",
}


def pos_level(user: str | None = None) -> str | None:
	"""The user's POS level: admin (System Manager) > supervisor > cashier > waiter >
	kitchen. Someone with an active PIN but no POS role is treated as a waiter (least
	privilege). None = no POS access."""
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if "System Manager" in roles:
		return "admin"
	for role, level in (("POS Supervisor", "supervisor"), ("POS Cashier", "cashier"), ("POS Waiter", "waiter"), ("POS Kitchen", "kitchen")):
		if role in roles:
			return level
	return "waiter" if frappe.db.exists("XentraERP POS PIN", {"user": user, "active": 1}) else None


def has_cap(cap: str) -> bool:
	return cap in CAPS.get(pos_level() or "", set())


def require_cap(cap: str):
	"""Refuse unless the signed-in POS user's role grants `cap`."""
	require_pos_user()
	if not has_cap(cap):
		level = LEVEL_LABEL.get(pos_level() or "", "your role")
		frappe.throw(f"{level} accounts can't do this — it needs {_CAP_NEEDS.get(cap, 'a higher role')}.", frappe.PermissionError)


def require_pos_user():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Please log in.", frappe.PermissionError)
	if is_manager():
		return
	if not frappe.db.exists("XentraERP POS PIN", {"user": user, "active": 1}):
		frappe.throw("Not permitted", frappe.PermissionError)


def require_manager():
	if not is_manager():
		frappe.throw("Only an administrator can do this.", frappe.PermissionError)


# ------------------------------------------------------------- settings


def settings() -> dict:
	"""Read straight from the database — not via the document cache — so a
	change made by the admin is seen by every worker immediately."""
	raw = frappe.db.get_singles_dict(SETTINGS) or {}
	mode = raw.get("pos_mode")
	until = raw.get("previous_day_until") or "05:00:00"
	return {
		"pos_mode": mode if mode in MODES else "Retail",
		"checkout_document": raw.get("checkout_document") if raw.get("checkout_document") in CHECKOUT_DOCS else "POS Invoice",
		# A never-saved Single has no rows: "require shift" then defaults on.
		"require_shift": cint(raw.get("require_shift", 1)) if raw else 1,
		"pos_247": cint(raw.get("pos_247")),
		# Saving an order sends its kitchen ticket automatically (a fresh Single defaults to on).
		"auto_kot": cint(raw.get("auto_kot", 1)) if raw else 1,
		"item_notes_prompt": cint(raw.get("item_notes_prompt", 1)) if raw else 1,
		"previous_day_billing": cint(raw.get("previous_day_billing")),
		"previous_day_until": str(until),
	}


def draft_mode() -> bool:
	"""True when checkout produces a Draft Sales Invoice that is submitted, with
	receipts (Payment Entries) against it, once payment is finalized."""
	return settings()["checkout_document"] == "Draft Invoice + Receipt"


def business_date(now=None):
	now = now or now_datetime()
	s = settings()
	if s["previous_day_billing"] and now.time() < get_time(s["previous_day_until"]):
		return getdate(add_days(now, -1))
	return getdate(now)


@frappe.whitelist()
def get_pos_settings():
	"""Everything the POS app needs right after login to pick its screens."""
	require_pos_user()
	s = settings()
	shift = _open_shift_of(frappe.session.user)
	return {
		**s,
		"can_switch": is_manager(),
		"role": LEVEL_LABEL.get(pos_level() or "", ""),
		"level": pos_level(),
		"caps": sorted(CAPS.get(pos_level() or "", set())),
		"business_date": str(business_date()),
		"shift": _shift_payload(shift) if shift else None,
	}


@frappe.whitelist()
def set_pos_mode(mode: str):
	"""Tenant admin: switch this organization between Retail and F&B."""
	require_manager()
	if mode not in MODES:
		frappe.throw(f"Mode must be one of: {', '.join(MODES)}")
	current = settings()["pos_mode"]
	if mode == current:
		return {"pos_mode": current}
	# Leaving F&B while dine-in orders are open would strand them (no screen
	# could bill them), so finish or cancel those first.
	if current == "F&B":
		open_orders = frappe.db.count("XentraERP POS Order", {"status": ["in", ["Open", "Part Paid"]]})
		if open_orders:
			frappe.throw(
				f"There {'is' if open_orders == 1 else 'are'} {open_orders} open table order"
				f"{'' if open_orders == 1 else 's'}. Bill or cancel them before switching to Retail."
			)
	frappe.db.set_single_value(SETTINGS, "pos_mode", mode)
	frappe.db.commit()
	return {"pos_mode": mode}


@frappe.whitelist()
def save_pos_settings(require_shift=None, pos_247=None, previous_day_billing=None, previous_day_until=None, checkout_document=None, auto_kot=None, item_notes_prompt=None):
	"""Tenant admin: operating-hours behaviour and what a checkout produces."""
	require_manager()
	updates = {}
	if checkout_document is not None:
		if checkout_document not in CHECKOUT_DOCS:
			frappe.throw(f"Checkout document must be one of: {', '.join(CHECKOUT_DOCS)}")
		updates["checkout_document"] = checkout_document
	for key, val in (("require_shift", require_shift), ("pos_247", pos_247), ("previous_day_billing", previous_day_billing), ("auto_kot", auto_kot), ("item_notes_prompt", item_notes_prompt)):
		if val is not None:
			updates[key] = cint(bool(cint(val)))
	if previous_day_until is not None:
		try:
			updates["previous_day_until"] = str(get_time(previous_day_until))
		except Exception:
			frappe.throw("Enter the cut-off time as HH:MM, e.g. 05:00.")
	for key, val in updates.items():
		frappe.db.set_single_value(SETTINGS, key, val)
	frappe.db.commit()
	return settings()


# --------------------------------------------------------------- pricing


def rate_for(item_code: str, profile) -> float:
	"""The item's selling price on this register's price list, else the Item's
	default rate. (Customer-specific prices / pricing rules are ERPNext's
	engine and aren't applied here.)"""
	if profile.selling_price_list:
		rate = frappe.db.get_value(
			"Item Price",
			{"item_code": item_code, "price_list": profile.selling_price_list, "selling": 1, "customer": ["is", "not set"]},
			"price_list_rate",
		)
		if rate is not None:
			return flt(rate)
	return flt(frappe.db.get_value("Item", item_code, "standard_rate"))


def get_profile(pos_profile: str):
	if not frappe.db.exists("POS Profile", {"name": pos_profile, "disabled": 0}):
		frappe.throw(f"POS Profile '{pos_profile}' isn't available.")
	return frappe.get_doc("POS Profile", pos_profile)


# ------------------------------------------------------------- locations
# A location is a site (branch, outlet, floor) with its own registers, tables,
# cost center and warehouse, and a short code that is part of every bill number
# so bills from different sites are told apart at a glance.

# Invoice / receipt numbering per location. The tail (.#####) is added by Frappe.
SERIES = {"Sales Invoice": "{code}-INV-.YYYY.-", "POS Invoice": "{code}-POS-.YYYY.-", "Payment Entry": "{code}-RCT-.YYYY.-"}


def location_of(pos_profile: str):
	"""The active location this register belongs to, or None (single-site tenants
	that never define locations keep ERPNext's normal numbering)."""
	name = frappe.db.sql(
		"""select l.name from `tabXentraERP POS Location` l
		   join `tabXentraERP POS Location Profile` p on p.parent = l.name
		   where p.pos_profile = %s and l.disabled = 0 limit 1""",
		(pos_profile,),
	)
	return frappe.get_doc("XentraERP POS Location", name[0][0]) if name else None


def location_code(loc) -> str | None:
	return loc.location_code if loc else None


def ensure_series(doctype: str, series: str):
	"""Make `series` a valid naming series for `doctype`. Frappe only accepts a
	naming_series that is one of the field's options, so a new location's series
	is appended to those options (a Property Setter, exactly what the Naming
	Series tool does) the first time it is needed."""
	field = frappe.get_meta(doctype).get_field("naming_series")
	options = [o for o in (field.options or "").split("\n") if o]
	if series in options:
		return
	with _elevated():
		frappe.make_property_setter(
			{"doctype": doctype, "doctype_or_field": "DocField", "fieldname": "naming_series", "property": "options",
			 "value": "\n".join(options + [series]), "property_type": "Text"}
		)
		frappe.clear_cache(doctype=doctype)


def series_for(doctype: str, loc) -> str | None:
	if not loc:
		return None
	series = SERIES[doctype].format(code=loc.location_code)
	ensure_series(doctype, series)
	return series


@frappe.whitelist()
def list_locations():
	require_pos_user()
	out = []
	for l in frappe.get_all("XentraERP POS Location", fields=["name", "location_name", "company", "cost_center", "warehouse", "disabled"], order_by="name asc"):
		out.append({
			"code": l.name, "name": l.location_name, "company": l.company, "cost_center": l.cost_center, "warehouse": l.warehouse,
			"disabled": cint(l.disabled),
			"profiles": frappe.get_all("XentraERP POS Location Profile", filters={"parent": l.name}, pluck="pos_profile"),
		})
	return out


@frappe.whitelist()
def save_location(location_code: str, location_name: str, cost_center: str | None = None, warehouse: str | None = None, profiles=None, disabled: int = 0):
	"""Tenant admin: define (or update) a location and the registers that belong to it."""
	require_manager()
	import re

	code = (location_code or "").strip().upper()
	if not re.fullmatch(r"[A-Z0-9]{2,8}", code):
		frappe.throw("The location code must be 2-8 letters or numbers, e.g. MAIN or AIR2.")
	if not (location_name or "").strip():
		frappe.throw("Give the location a name.")
	if isinstance(profiles, str):
		profiles = json.loads(profiles or "[]")
	profiles = list(dict.fromkeys(profiles or []))
	for pr in profiles:
		if not frappe.db.exists("POS Profile", pr):
			frappe.throw(f"No such register (POS Profile): {pr}")
		other = frappe.db.sql(
			"select parent from `tabXentraERP POS Location Profile` where pos_profile=%s and parent != %s limit 1", (pr, code)
		)
		if other:
			frappe.throw(f"'{pr}' already belongs to location {other[0][0]}. A register can serve only one location.")
	for field, dt in (("cost_center", "Cost Center"), ("warehouse", "Warehouse")):
		val = {"cost_center": cost_center, "warehouse": warehouse}[field]
		if val and not frappe.db.exists(dt, val):
			frappe.throw(f"No such {dt.lower()}: {val}")
	values = {"location_name": location_name.strip(), "cost_center": cost_center or None, "warehouse": warehouse or None,
	          "disabled": cint(bool(cint(disabled))), "profiles": [{"pos_profile": pr} for pr in profiles]}
	if frappe.db.exists("XentraERP POS Location", code):
		doc = frappe.get_doc("XentraERP POS Location", code)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "XentraERP POS Location", "location_code": code, **values})
		doc.insert(ignore_permissions=True)
	# Numbering is ready the moment the location exists, not at its first sale.
	for dt in SERIES:
		series_for(dt, doc)
	frappe.db.commit()
	return {"code": doc.name}


@frappe.whitelist()
def delete_location(location_code: str):
	require_manager()
	if any(frappe.db.exists(dt, {"location": location_code}) for dt in ("XentraERP POS Shift", "XentraERP POS Order", "XentraERP POS Tender")):
		frappe.throw("This location has trading history, so it can't be deleted. Disable it instead.")
	frappe.delete_doc("XentraERP POS Location", location_code, ignore_permissions=True)
	frappe.db.commit()
	return {"success": True}


# ---------------------------------------------------- multi-currency


def exchange_rate(from_currency: str, to_currency: str, on_date=None) -> float:
	"""How many `to_currency` one `from_currency` buys, from the tenant's own
	Currency Exchange records (latest on or before the date; a reverse
	record is inverted). Never fetches an online rate — a till must not hang
	or silently guess — so a missing rate is an error the admin can fix."""
	if from_currency == to_currency:
		return 1.0
	on_date = str(getdate(on_date or now_datetime()))
	direct = frappe.db.sql(
		"select exchange_rate from `tabCurrency Exchange` where from_currency=%s and to_currency=%s and date<=%s order by date desc, creation desc limit 1",
		(from_currency, to_currency, on_date),
	)
	if direct and flt(direct[0][0]) > 0:
		return flt(direct[0][0])
	inverse = frappe.db.sql(
		"select exchange_rate from `tabCurrency Exchange` where from_currency=%s and to_currency=%s and date<=%s order by date desc, creation desc limit 1",
		(to_currency, from_currency, on_date),
	)
	if inverse and flt(inverse[0][0]) > 0:
		return 1.0 / flt(inverse[0][0])
	frappe.throw(f"No exchange rate from {from_currency} to {to_currency}. Add one (Currency Exchange) before accepting {from_currency}.")


@frappe.whitelist()
def list_checkout_currencies(pos_profile: str):
	"""Currencies a bill on this register can be paid in: its own, plus every
	currency the tenant has an exchange rate for. `rate` = register-currency
	units per 1 unit of that currency."""
	require_pos_user()
	profile = get_profile(pos_profile)
	base = profile.currency
	out = [{"currency": base, "rate": 1.0, "base": True}]
	seen = {base}
	for r in frappe.db.sql("select from_currency, to_currency from `tabCurrency Exchange` where from_currency=%s or to_currency=%s", (base, base)):
		other = r[1] if r[0] == base else r[0]
		if other in seen:
			continue
		try:
			out.append({"currency": other, "rate": exchange_rate(other, base), "base": False})
			seen.add(other)
		except frappe.ValidationError:
			continue
	return out


@frappe.whitelist()
def set_exchange_rate(from_currency: str, to_currency: str, rate: float):
	"""Tenant admin: today's rate for accepting a foreign currency."""
	require_manager()
	rate = flt(rate)
	if rate <= 0:
		frappe.throw("The rate must be above zero.")
	for c in (from_currency, to_currency):
		if not frappe.db.exists("Currency", c):
			frappe.throw(f"Unknown currency '{c}'.")
	if from_currency == to_currency:
		frappe.throw("Choose two different currencies.")
	today = str(getdate(now_datetime()))
	existing = frappe.db.get_value("Currency Exchange", {"date": today, "from_currency": from_currency, "to_currency": to_currency})
	if existing:
		frappe.db.set_value("Currency Exchange", existing, "exchange_rate", rate)
	else:
		frappe.get_doc(
			{"doctype": "Currency Exchange", "date": today, "from_currency": from_currency, "to_currency": to_currency,
			 "exchange_rate": rate, "for_buying": 1, "for_selling": 1}
		).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"from_currency": from_currency, "to_currency": to_currency, "rate": rate}


# --------------------------------------------------------------- shifts


def _open_shift_of(user: str, pos_profile: str | None = None):
	filters = {"status": "Open", "cashier": user}
	if pos_profile:
		filters["pos_profile"] = pos_profile
	name = frappe.db.get_value("XentraERP POS Shift", filters, "name")
	return frappe.get_doc("XentraERP POS Shift", name) if name else None


def _shift_payload(shift) -> dict:
	return {
		"name": shift.name,
		"pos_profile": shift.pos_profile,
		"location": shift.location,
		"cashier": shift.cashier,
		"status": shift.status,
		"business_date": str(shift.business_date) if shift.business_date else None,
		"opened_at": str(shift.opened_at) if shift.opened_at else None,
		"closed_at": str(shift.closed_at) if shift.closed_at else None,
		"cash": [
			{
				"currency": c.currency,
				"opening": flt(c.opening_amount),
				"expected": flt(c.expected_amount),
				"counted": flt(c.counted_amount),
				"variance": flt(c.variance),
			}
			for c in shift.cash
		],
		"invoice_count": cint(shift.invoice_count),
		"total_sales": flt(shift.total_sales),
		"notes": shift.notes,
	}


@frappe.whitelist()
def current_shift(pos_profile: str | None = None):
	require_cap("shift")
	shift = _open_shift_of(frappe.session.user, pos_profile)
	return _shift_payload(shift) if shift else None


@frappe.whitelist()
def open_shift(pos_profile: str, opening_cash=None):
	"""Start a shift on a register with the cash already in the drawer,
	per currency: {"BHD": 50, "USD": 20}."""
	require_cap("shift")
	profile = get_profile(pos_profile)
	user = frappe.session.user
	if _open_shift_of(user):
		frappe.throw("You already have a shift open. Close it before opening another.")
	taken = frappe.db.get_value("XentraERP POS Shift", {"status": "Open", "pos_profile": pos_profile}, "cashier")
	if taken:
		frappe.throw(f"This register already has an open shift ({taken}). It must be closed first.")
	if isinstance(opening_cash, str):
		opening_cash = json.loads(opening_cash or "{}")
	opening_cash = opening_cash or {}
	if not isinstance(opening_cash, dict):
		frappe.throw("Opening cash must be given per currency.")
	if not opening_cash:
		opening_cash = {profile.currency: 0}
	rows = []
	for currency, amount in opening_cash.items():
		if not frappe.db.exists("Currency", currency):
			frappe.throw(f"Unknown currency '{currency}'.")
		if flt(amount) < 0:
			frappe.throw("Opening cash can't be negative.")
		rows.append({"currency": currency, "opening_amount": flt(amount)})
	shift = frappe.get_doc(
		{
			"doctype": "XentraERP POS Shift",
			"pos_profile": pos_profile,
			"location": location_code(location_of(pos_profile)),
			"cashier": user,
			"status": "Open",
			"business_date": business_date(),
			"opened_at": now_datetime(),
			"cash": rows,
		}
	)
	shift.insert(ignore_permissions=True)
	frappe.db.commit()
	return _shift_payload(shift)


def _cash_taken(shift_name: str) -> dict:
	"""Net cash that came into the drawer during the shift, per tendered currency."""
	rows = frappe.db.sql(
		"select currency, sum(tendered) from `tabXentraERP POS Tender` where shift=%s and mode_type='Cash' group by currency",
		(shift_name,),
	)
	return {r[0]: flt(r[1]) for r in rows}


def _shift_sales(shift_name: str) -> tuple:
	rows = frappe.db.sql("select distinct invoice, invoice_doctype from `tabXentraERP POS Tender` where shift=%s and invoice is not null", (shift_name,))
	total = 0.0
	for doctype in ("POS Invoice", "Sales Invoice"):
		names = [r[0] for r in rows if (r[1] or "POS Invoice") == doctype]
		if names:
			total += flt(frappe.db.sql(f"select sum(base_grand_total) from `tab{doctype}` where name in %s and docstatus=1", (names,))[0][0])
	return len(rows), total


@frappe.whitelist()
def shift_report(shift: str):
	"""Live totals for a shift (also what the closing screen shows). Open
	shifts show the expected drawer; the cashier only sees their own."""
	require_cap("shift")
	doc = frappe.get_doc("XentraERP POS Shift", shift)
	if doc.cashier != frappe.session.user and not has_cap("supervise"):
		frappe.throw("Not permitted", frappe.PermissionError)
	taken = _cash_taken(doc.name)
	cash = []
	for c in doc.cash:
		expected = flt(c.opening_amount) + taken.get(c.currency, 0.0)
		cash.append({"currency": c.currency, "opening": flt(c.opening_amount), "cash_in": taken.get(c.currency, 0.0),
			"expected": expected if doc.status == "Open" else flt(c.expected_amount),
			"counted": flt(c.counted_amount), "variance": flt(c.variance)})
	for cur, amt in taken.items():  # cash taken in a currency the drawer wasn't opened with
		if cur not in {c.currency for c in doc.cash}:
			cash.append({"currency": cur, "opening": 0.0, "cash_in": amt, "expected": amt, "counted": 0.0, "variance": 0.0})
	count, total = _shift_sales(doc.name)
	by_payment = frappe.db.sql(
		"select mode_of_payment, currency, sum(tendered), sum(amount) from `tabXentraERP POS Tender` where shift=%s group by mode_of_payment, currency order by mode_of_payment",
		(doc.name,),
	)
	return {
		**_shift_payload(doc),
		"cash": cash,
		"invoice_count": count,
		"total_sales": total,
		"by_payment": [{"mode": r[0], "currency": r[1], "tendered": flt(r[2]), "amount": flt(r[3])} for r in by_payment],
	}


@frappe.whitelist()
def close_shift(shift: str, counted=None, notes: str | None = None):
	"""Count the drawer per currency and close: {"BHD": 152.5, "USD": 20}.
	Every currency the shift handled must be counted."""
	require_cap("shift")
	doc = frappe.get_doc("XentraERP POS Shift", shift)
	if doc.status != "Open":
		frappe.throw("This shift is already closed.")
	if doc.cashier != frappe.session.user and not has_cap("supervise"):
		frappe.throw("Only the cashier who opened this shift (or a supervisor or administrator) can close it.", frappe.PermissionError)
	if not settings()["pos_247"]:
		open_orders = frappe.db.count("XentraERP POS Order", {"status": ["in", ["Open", "Part Paid"]], "pos_profile": doc.pos_profile})
		if open_orders:
			frappe.throw(f"{open_orders} table order(s) are still open on this register. Bill or cancel them first.")
	if isinstance(counted, str):
		counted = json.loads(counted or "{}")
	counted = counted or {}
	taken = _cash_taken(doc.name)
	currencies = [c.currency for c in doc.cash] + [c for c in taken if c not in {c.currency for c in doc.cash}]
	missing = [c for c in currencies if c not in counted]
	if missing:
		frappe.throw(f"Count the drawer in: {', '.join(missing)}.")
	for c in counted.values():
		if flt(c) < 0:
			frappe.throw("A counted amount can't be negative.")
	for cur in [c for c in taken if c not in {r.currency for r in doc.cash}]:
		doc.append("cash", {"currency": cur, "opening_amount": 0})
	for row in doc.cash:
		row.expected_amount = flt(row.opening_amount) + taken.get(row.currency, 0.0)
		row.counted_amount = flt(counted.get(row.currency))
		row.variance = flt(row.counted_amount - row.expected_amount, 3)
	count, total = _shift_sales(doc.name)
	doc.invoice_count, doc.total_sales = count, total
	doc.notes = (notes or "").strip()[:500]
	doc.status = "Closed"
	doc.closed_at = now_datetime()
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _shift_payload(doc)


def require_billing_shift(pos_profile: str):
	"""The shift a sale on this register is rung against, or an error saying
	why billing isn't allowed right now."""
	s = settings()
	shift = _open_shift_of(frappe.session.user, pos_profile)
	if not s["require_shift"]:
		return shift
	if not shift:
		frappe.throw("Open a shift on this register before billing.")
	if not s["pos_247"] and shift.business_date and getdate(shift.business_date) != business_date():
		frappe.throw(
			f"Your shift from {shift.business_date} is still open. Close it and open a new one for today's trading "
			"(or ask an administrator to turn on 24/7 operation)."
		)
	return shift


# ------------------------------------------------------------- checkout


@contextmanager
def _elevated():
	"""Run ERPNext's own invoice logic with system rights, for the few lines
	that need it. ERPNext's party checks (`Not permitted for <customer>`) test
	the *session user's* read access to the Customer, and a cashier's role
	rightly has none. Everything that is about *who the cashier is* — the
	register restriction, the shift, the tender ledger — is decided before this
	scope opens, from the real user.

	Deliberately NOT frappe.set_user(): that also overwrites session.sid with
	the user name and wipes the form dict and session data, which — found by
	testing over real HTTP — logged the cashier out after every bill. Only the
	effective user is swapped here, and restored exactly."""
	previous = frappe.session.user
	frappe.session.user = "Administrator"
	frappe.local.role_permissions = {}
	try:
		yield
	finally:
		frappe.session.user = previous
		frappe.local.role_permissions = {}


def enforce_register_restriction(pos_profile: str, user: str):
	"""A PIN locked to one register can't bill against another (also enforced
	by the POS Invoice validate hook for direct API saves)."""
	restriction = frappe.db.get_value("XentraERP POS PIN", {"user": user, "active": 1}, "pos_profile")
	if restriction and pos_profile != restriction:
		frappe.throw(f"Your PIN is restricted to the '{restriction}' register — you can't post against a different one.")



def _profile_invoice(profile, lines, customer=None, business_dt=None):
	loc = location_of(profile.name)
	series = series_for("POS Invoice", loc)
	d = {
		"doctype": "POS Invoice",
		"company": profile.company,
		"pos_profile": profile.name,
		"currency": profile.currency,
		"customer": customer or profile.customer,
		"is_pos": 1,
		"items": [{"item_code": l["item_code"], "qty": l["qty"], "rate": l["rate"]} for l in lines],
	}
	if series:
		d["naming_series"] = series
	if loc and loc.cost_center:
		d["cost_center"] = loc.cost_center
		for row in d["items"]:
			row["cost_center"] = loc.cost_center
	if loc and loc.warehouse:
		d["set_warehouse"] = loc.warehouse
		for row in d["items"]:
			row["warehouse"] = loc.warehouse
	if business_dt:
		# Post to the business day, at the real time of day.
		d.update({"set_posting_time": 1, "posting_date": str(business_dt), "posting_time": now_datetime().strftime("%H:%M:%S")})
	return d


def estimate_totals(profile, lines, customer=None) -> dict:
	"""What the bill will come to (server-side tax/rounding), without saving anything."""
	first_mop = profile.payments[0].mode_of_payment if profile.payments else None
	d = _profile_invoice(profile, lines, customer)
	d["payments"] = [{"mode_of_payment": first_mop, "amount": 0}] if first_mop else []
	inv = frappe.get_doc(d)
	with _elevated():
		inv.run_method("set_missing_values")
		inv.run_method("calculate_taxes_and_totals")
	prec = inv.precision("grand_total")
	return {
		"net": flt(inv.net_total, prec),
		"tax": flt(inv.total_taxes_and_charges, prec),
		"grand": flt(inv.grand_total, prec),
		"rounded": flt(inv.rounded_total, prec) if inv.rounded_total else 0,
		"due": flt(inv.rounded_total or inv.grand_total, prec),
		"currency": profile.currency,
	}


def _parse_payments(payments) -> list:
	if isinstance(payments, str):
		try:
			payments = json.loads(payments)
		except ValueError:
			frappe.throw("Payments must be a list.")
	if not isinstance(payments, list) or not payments:
		frappe.throw("Enter at least one payment.")
	return payments


def _build_legs(profile, payments, business_dt) -> list:
	"""Validate the payment legs and convert each to its tendered currency rate."""
	allowed = {p.mode_of_payment for p in profile.payments}
	if not allowed:
		frappe.throw("This register has no payment methods configured.")
	legs = []
	for raw in _parse_payments(payments):
		mop = (raw or {}).get("mode_of_payment")
		if mop not in allowed:
			frappe.throw(f"'{mop}' isn't a payment method on this register ({', '.join(sorted(allowed))}).")
		tendered = flt((raw or {}).get("tendered"))
		if tendered < 0:
			frappe.throw("A payment can't be negative.")
		if tendered == 0:
			continue
		currency = (raw or {}).get("currency") or profile.currency
		mode_type = frappe.db.get_value("Mode of Payment", mop, "type") or ""
		if currency != profile.currency and mode_type != "Cash":
			frappe.throw(f"{mop} can only be paid in {profile.currency}. Foreign currency is accepted as cash.")
		rate = exchange_rate(currency, profile.currency, business_dt)
		legs.append({"mop": mop, "type": mode_type, "currency": currency, "tendered": tendered, "rate": rate})
	if not legs:
		frappe.throw("Enter at least one payment amount.")
	return legs


def _settle(legs, due, prec, profile, allow_partial=False) -> tuple:
	"""Convert legs to the invoice currency; return (paid, change). Raises if
	the bill isn't covered (unless a partial payment was asked for — the
	balance then stays open), or if non-cash payments would need change."""
	for leg in legs:
		leg["amount"] = flt(leg["tendered"] * leg["rate"], prec)
	paid = flt(sum(l["amount"] for l in legs), prec)
	if paid + 10 ** -prec / 2 < due and allow_partial:
		return paid, 0.0
	if paid + 10 ** -prec / 2 < due:
		frappe.throw(f"Payment is short by {flt(due - paid, prec):g} {profile.currency} (bill {due:g}, received {paid:g}).")
	change = flt(max(0.0, paid - due), prec)
	cash_in = sum(l["amount"] for l in legs if l["type"] == "Cash")
	if change > cash_in + 10 ** -prec / 2:
		frappe.throw("Card and other non-cash payments can't exceed the amount due — only cash gives change.")
	return paid, change


def _write_tenders(invoice, invoice_doctype, legs, change, profile, shift, cashier, business_dt, receipts=None):
	"""One ledger row per tendered leg (in the currency handed over), plus a
	negative cash row for change given back."""
	receipts = receipts or {}
	rows = list(legs)
	if change:
		change_mop = next(l["mop"] for l in legs if l["type"] == "Cash")
		rows.append({"mop": change_mop, "type": "Cash", "currency": profile.currency, "tendered": -change, "rate": 1.0, "amount": -change})
	for i, r in enumerate(rows):
		frappe.get_doc(
			{
				"doctype": "XentraERP POS Tender",
				"invoice": invoice,
				"invoice_doctype": invoice_doctype,
				"receipt": receipts.get(i),
				"shift": shift.name if shift else None,
				"pos_profile": profile.name,
				"location": location_code(location_of(profile.name)),
				"cashier": cashier,
				"business_date": business_dt,
				"mode_of_payment": r["mop"],
				"mode_type": r["type"],
				"currency": r["currency"],
				"tendered": r["tendered"],
				"exchange_rate": r["rate"],
				"amount": r["amount"],
			}
		).insert(ignore_permissions=True)


def post_invoice(profile, lines, payments, *, customer=None, business_dt=None, draft_name=None, allow_partial=False) -> dict:
	"""The one place a sale is posted — Retail and F&B both come here.

	Two checkout documents (a tenant setting):
	* POS Invoice — built with its payment rows in a single insert (ERPNext
	  refuses a POS Invoice with none) and submitted.
	* Draft Invoice + Receipt — a Draft Sales Invoice (created earlier, when the
	  check was closed, or here) is submitted once payment is finalized and one
	  receipt (Payment Entry) per payment leg is created against it.

	Either way each tendered leg is converted to the invoice currency, change may
	only come out of cash, and the legs are recorded in the tender ledger.
	All-or-nothing: any failure raises before anything is committed and the
	caller's transaction is rolled back."""
	if not lines:
		frappe.throw("There's nothing to bill.")
	cashier = frappe.session.user
	enforce_register_restriction(profile.name, cashier)
	shift = require_billing_shift(profile.name)
	business_dt = business_dt or business_date()
	legs = _build_legs(profile, payments, business_dt)

	if draft_mode():
		return _finalize_draft_invoice(profile, lines, legs, customer=customer, business_dt=business_dt, shift=shift, cashier=cashier, draft_name=draft_name, allow_partial=cint(allow_partial))

	first_mop = legs[0]["mop"]
	d = _profile_invoice(profile, lines, customer, business_dt)
	d["payments"] = [{"mode_of_payment": first_mop, "amount": 0}]
	inv = frappe.get_doc(d)
	with _elevated():
		inv.insert(ignore_permissions=True)
	prec = inv.precision("grand_total")
	due = flt(inv.rounded_total or inv.grand_total, prec)
	paid, change = _settle(legs, due, prec, profile)

	inv.set("payments", [])
	for leg in legs:
		inv.append("payments", {"mode_of_payment": leg["mop"], "amount": leg["amount"]})
	if change:
		inv.change_amount = change
		if profile.account_for_change_amount:
			inv.account_for_change_amount = profile.account_for_change_amount
	with _elevated():
		inv.save(ignore_permissions=True)
		inv.submit()
	# The invoice belongs to the cashier who rang it up, not to the system
	# scope it was built under (reports attribute sales by owner).
	frappe.db.set_value("POS Invoice", inv.name, "owner", cashier, update_modified=False)
	_write_tenders(inv.name, "POS Invoice", legs, change, profile, shift, cashier, business_dt)
	return _result(inv.name, "POS Invoice", profile, inv, due, paid, change, business_dt, legs)


def _result(name, doctype, profile, inv, due, paid, change, business_dt, legs, receipts=None) -> dict:
	prec = inv.precision("grand_total")
	return {
		"invoice": name,
		"invoice_doctype": doctype,
		"receipts": receipts or [],
		"currency": profile.currency,
		"total": flt(inv.grand_total, prec),
		"due": due,
		"paid": paid,
		"change": change,
		"business_date": str(business_dt),
		"location": location_code(location_of(profile.name)),
		"payments": [{"mode_of_payment": l["mop"], "currency": l["currency"], "tendered": l["tendered"], "amount": l["amount"]} for l in legs],
	}


# ---------------------------------- draft invoice + receipt (Payment Entry)


def _draft_invoice_doc(profile, lines, customer, business_dt):
	loc = location_of(profile.name)
	warehouse = (loc.warehouse if loc and loc.warehouse else None) or profile.warehouse
	cost_center = (loc.cost_center if loc and loc.cost_center else None) or profile.cost_center
	items = []
	for l in lines:
		row = {"item_code": l["item_code"], "qty": l["qty"], "rate": l["rate"]}
		if warehouse:
			row["warehouse"] = warehouse
		if cost_center:
			row["cost_center"] = cost_center
		if profile.income_account:
			row["income_account"] = profile.income_account
		items.append(row)
	d = {
		"doctype": "Sales Invoice",
		"company": profile.company,
		"customer": customer or profile.customer,
		"currency": profile.currency,
		"selling_price_list": profile.selling_price_list,
		"posting_date": str(business_dt),
		"set_posting_time": 1,
		"posting_time": now_datetime().strftime("%H:%M:%S"),
		# A balance left open at the till should read "Partly Paid", not flip to "Overdue" at midnight.
		"due_date": str(add_days(business_dt, 30)),
		"update_stock": cint(profile.update_stock),
		"pos_profile": profile.name,
		"remarks": f"POS sale · {profile.name}" + (f" · {loc.location_code}" if loc else ""),
		"items": items,
	}
	series = series_for("Sales Invoice", loc)
	if series:
		d["naming_series"] = series
	if cost_center:
		d["cost_center"] = cost_center
	if profile.taxes_and_charges:
		d["taxes_and_charges"] = profile.taxes_and_charges
	return frappe.get_doc(d)


def create_draft_invoice(profile, lines, customer=None, business_dt=None):
	"""Insert a Draft Sales Invoice for this sale (nothing is posted to the
	books until it is submitted). Returns the saved draft."""
	business_dt = business_dt or business_date()
	inv = _draft_invoice_doc(profile, lines, customer, business_dt)
	with _elevated():
		inv.run_method("set_missing_values")
		inv.run_method("calculate_taxes_and_totals")
		inv.insert(ignore_permissions=True)
	# Owned by the cashier, not the elevated scope it was built under. The in-memory
	# copy must match the database or Frappe refuses to submit it later
	# ("Value cannot be changed for Created By").
	frappe.db.set_value("Sales Invoice", inv.name, "owner", frappe.session.user, update_modified=False)
	inv.owner = frappe.session.user
	return inv


def discard_draft_invoice(name: str):
	"""Delete a POS-created draft (only ever a draft — a submitted invoice is never touched)."""
	if name and frappe.db.get_value("Sales Invoice", name, "docstatus") == 0:
		with _elevated():
			frappe.delete_doc("Sales Invoice", name, ignore_permissions=True, force=1)


def draft_due(name: str) -> float:
	row = frappe.db.get_value("Sales Invoice", name, ["rounded_total", "grand_total"], as_dict=True)
	return flt(row.rounded_total or row.grand_total) if row else 0.0


def _make_receipts(inv, legs, remaining, profile, cashier, business_dt, prec) -> tuple:
	"""Create one receipt (Payment Entry) per payment leg against `inv`, taking at
	most `remaining` in total. Non-cash legs are taken in full and cash absorbs
	whatever is left, so change comes out of cash — never out of a card payment.
	Returns ({leg index: receipt name}, [receipt names], total allocated)."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account

	order = sorted(range(len(legs)), key=lambda i: legs[i]["type"] == "Cash")
	receipts, made, taken = {}, [], 0.0
	for i in order:
		leg = legs[i]
		alloc = flt(min(leg["amount"], remaining), prec)
		if alloc <= 0:
			continue
		with _elevated():
			pe = get_payment_entry("Sales Invoice", inv.name, party_amount=alloc)
			rseries = series_for("Payment Entry", location_of(profile.name))
			if rseries:
				pe.naming_series = rseries
			pe.mode_of_payment = leg["mop"]
			account = get_bank_cash_account(leg["mop"], profile.company)["account"]
			pe.paid_to = account
			pe.paid_to_account_currency = frappe.db.get_value("Account", account, "account_currency")
			pe.posting_date = str(business_dt)
			pe.reference_no = pe.reference_no or inv.name
			pe.reference_date = str(business_dt)
			note = f"POS receipt · {leg['mop']}"
			if leg["currency"] != profile.currency:
				note += f" · tendered {leg['tendered']:g} {leg['currency']} @ {leg['rate']:g}"
			pe.remarks = note
			pe.custom_remarks = 1  # otherwise ERPNext regenerates the remarks and drops the tendered-currency note
			pe.insert(ignore_permissions=True)
			pe.submit()
		frappe.db.set_value("Payment Entry", pe.name, "owner", cashier, update_modified=False)
		remaining = flt(remaining - alloc, prec)
		taken = flt(taken + alloc, prec)
		receipts[i], _ = pe.name, made.append(pe.name)
	return receipts, made, taken


def _finalize_draft_invoice(profile, lines, legs, *, customer, business_dt, shift, cashier, draft_name, allow_partial=0):
	created_here = False
	if draft_name and frappe.db.get_value("Sales Invoice", draft_name, "docstatus") == 0:
		inv = frappe.get_doc("Sales Invoice", draft_name)
	else:
		inv = create_draft_invoice(profile, lines, customer, business_dt)
		created_here = True
	try:
		prec = inv.precision("grand_total")
		due = flt(inv.rounded_total or inv.grand_total, prec)
		paid, change = _settle(legs, due, prec, profile, bool(allow_partial))
	except Exception:
		# Not enough to settle the bill: don't leave a stray draft behind.
		if created_here:
			discard_draft_invoice(inv.name)
		raise

	# Payment is finalized: post the invoice, then a receipt per leg against it.
	# With a partial payment the invoice is still submitted — it is real,
	# outstanding revenue — and shows as "Partly Paid" with its balance open.
	with _elevated():
		inv.submit()
	receipts, made, taken = _make_receipts(inv, legs, due, profile, cashier, business_dt, prec)
	inv.reload()
	balance = flt(inv.outstanding_amount, prec)
	if balance > 10 ** -prec / 2 and not allow_partial:
		frappe.throw(f"The receipts don't clear the invoice ({balance:g} still outstanding).")
	frappe.db.set_value("Sales Invoice", inv.name, "owner", cashier, update_modified=False)
	_write_tenders(inv.name, "Sales Invoice", legs, change, profile, shift, cashier, business_dt, receipts)
	out = _result(inv.name, "Sales Invoice", profile, inv, due, paid, change, business_dt, legs, made)
	out.update({"balance": balance, "status": inv.status, "partial": balance > 10 ** -prec / 2})
	return out


def _pos_sales_invoice(invoice: str):
	"""A submitted Sales Invoice that this POS created (it has tender rows)."""
	if not frappe.db.exists("XentraERP POS Tender", {"invoice": invoice, "invoice_doctype": "Sales Invoice"}):
		frappe.throw("That isn't a POS invoice.")
	inv = frappe.get_doc("Sales Invoice", invoice)
	if inv.docstatus != 1:
		frappe.throw("That invoice isn't submitted.")
	return inv


@frappe.whitelist()
def settle_invoice(invoice: str, payments, allow_partial: int = 0):
	"""Finish billing a part-paid invoice: take (more of) the balance. One receipt
	per payment leg is created against the same invoice; when the balance reaches
	zero it becomes Paid. Change is given only from cash."""
	require_cap("bill")
	if not draft_mode():
		frappe.throw("Balances are only kept open when checkout is set to Draft Invoice + Receipt.")
	inv = _pos_sales_invoice(invoice)
	profile = get_profile(inv.pos_profile)
	cashier = frappe.session.user
	enforce_register_restriction(profile.name, cashier)
	shift = require_billing_shift(profile.name)
	prec = inv.precision("grand_total")
	balance = flt(inv.outstanding_amount, prec)
	if balance <= 10 ** -prec / 2:
		frappe.throw("This invoice is already fully paid.")
	today = business_date()
	legs = _build_legs(profile, payments, today)
	paid, change = _settle(legs, balance, prec, profile, bool(cint(allow_partial)))
	receipts, made, taken = _make_receipts(inv, legs, balance, profile, cashier, today, prec)
	inv.reload()
	left = flt(inv.outstanding_amount, prec)
	if left > 10 ** -prec / 2 and not cint(allow_partial):
		frappe.throw(f"The receipts don't clear the invoice ({left:g} still outstanding).")
	_write_tenders(inv.name, "Sales Invoice", legs, change, profile, shift, cashier, today, receipts)
	out = _result(inv.name, "Sales Invoice", profile, inv, balance, paid, change, today, legs, made)
	out.update({"balance": left, "status": inv.status, "partial": left > 10 ** -prec / 2, "invoice_total": flt(inv.grand_total, prec)})
	return out


@frappe.whitelist()
def list_open_balances(pos_profile: str | None = None):
	"""Part-paid POS invoices with a balance still to collect, newest last."""
	require_cap("bill")
	names = frappe.db.sql_list("select distinct invoice from `tabXentraERP POS Tender` where invoice_doctype='Sales Invoice'")
	if not names:
		return []
	filters = {"name": ["in", names], "docstatus": 1, "outstanding_amount": [">", 0]}
	if pos_profile:
		filters["pos_profile"] = pos_profile
	rows = frappe.get_all(
		"Sales Invoice",
		filters=filters,
		fields=["name", "customer", "grand_total", "outstanding_amount", "status", "posting_date", "pos_profile", "currency", "owner"],
		order_by="creation asc",
		limit_page_length=200,
	)
	tables = {}
	for o in frappe.get_all("XentraERP POS Order", filters={"draft_invoice": ["in", [r.name for r in rows] or [""]]}, fields=["draft_invoice", "pos_table", "name"]):
		tables[o.draft_invoice] = o
	return [
		{
			"invoice": r.name,
			"customer": r.customer,
			"total": flt(r.grand_total),
			"balance": flt(r.outstanding_amount),
			"paid": flt(r.grand_total) - flt(r.outstanding_amount),
			"status": r.status,
			"date": str(r.posting_date),
			"pos_profile": r.pos_profile,
			"currency": r.currency,
			"cashier": r.owner,
			"table": tables[r.name].pos_table if r.name in tables else None,
			"order": tables[r.name].name if r.name in tables else None,
		}
		for r in rows
	]


def _retail_lines(profile, items) -> list:
	if isinstance(items, str):
		try:
			items = json.loads(items)
		except ValueError:
			frappe.throw("Items must be a list.")
	if not isinstance(items, list) or not items:
		frappe.throw("There's nothing to bill.")
	allow_rate = cint(profile.allow_rate_change)
	lines = []
	for raw in items:
		code, qty = (raw or {}).get("item_code"), flt((raw or {}).get("qty"))
		if not code or qty <= 0:
			frappe.throw("Each line needs an item and a quantity above zero.")
		item = frappe.db.get_value("Item", code, ["disabled", "is_sales_item"], as_dict=True)
		if not item or item.disabled or not item.is_sales_item:
			frappe.throw(f"'{code}' isn't a sellable item.")
		rate = flt(raw.get("rate")) if allow_rate and raw.get("rate") not in (None, "") else rate_for(code, profile)
		lines.append({"item_code": code, "qty": qty, "rate": rate})
	return lines


@frappe.whitelist()
def retail_estimate(pos_profile: str, items):
	"""What a counter sale comes to including tax and rounding (nothing saved)."""
	require_cap("bill")
	profile = get_profile(pos_profile)
	return estimate_totals(profile, _retail_lines(profile, items))


@frappe.whitelist()
def retail_checkout(pos_profile: str, items, payments, customer: str | None = None, allow_partial: int = 0):
	"""Counter sale. Rates come from the register's price list, not the client,
	unless the POS Profile allows rate changes. With checkout = Draft Invoice +
	Receipt, `allow_partial=1` takes what was paid and leaves the balance open
	(Partly Paid) to be collected later with settle_invoice."""
	require_cap("bill")
	profile = get_profile(pos_profile)
	if cint(allow_partial) and not draft_mode():
		frappe.throw("Part payment needs checkout set to Draft Invoice + Receipt.")
	result = post_invoice(profile, _retail_lines(profile, items), payments, customer=customer, allow_partial=cint(allow_partial))
	frappe.db.commit()
	return result


# ------------------------------------------------------------ item notes
# "Well done", "crunchy", "no onions"... suggested for the dish being ordered. When an
# Anthropic API key is configured (site config `anthropic_api_key` or the
# ANTHROPIC_API_KEY environment variable) Claude proposes them for the specific item; the
# answer is cached per item, so the AI is asked once per dish, not on every tap. Without a
# key — or if the call fails — a built-in list keyed on the kind of dish is used, so the
# feature always works. A supervisor can also write a dish's notes by hand.

NOTE_MODEL = "claude-haiku-4-5-20251001"
NOTES = "XentraERP POS Item Note"
AI_RETRY = timedelta(hours=6)  # after a failed AI call, don't try again for this long

_RULES = (
	(("steak", "beef", "burger", "lamb", "kebab", "grill", "ribs"), ["Rare", "Medium rare", "Medium", "Medium well", "Well done", "No salt", "Sauce on the side"]),
	(("chicken", "wings", "tikka", "shawarma"), ["Grilled", "Deep fried", "Crispy", "Well done", "Less spicy", "Extra spicy", "No skin"]),
	(("fish", "prawn", "shrimp", "seafood", "salmon", "calamari", "squid"), ["Grilled", "Deep fried", "Lightly seasoned", "Well done", "Lemon on the side", "No garlic"]),
	(("fries", "chips", "potato", "nugget", "onion ring", "samosa", "spring roll", "falafel"), ["Extra crunchy", "Well done", "Less oil", "Extra salt", "No salt", "Sauce on the side"]),
	(("pizza",), ["Thin crust", "Well done", "Extra cheese", "No onion", "Cut in 8"]),
	(("pasta", "noodle", "spaghetti", "rice", "biryani"), ["Al dente", "Extra spicy", "Less spicy", "No garlic", "Extra sauce"]),
	(("salad",), ["Dressing on the side", "No onions", "No croutons", "Extra dressing"]),
	(("coffee", "tea", "latte", "cappuccino", "espresso", "mocha"), ["Extra hot", "Less sugar", "No sugar", "Extra shot", "Oat milk", "Decaf"]),
	(("juice", "smoothie", "shake", "cola", "soda", "drink", "water", "lemonade", "mojito"), ["No ice", "Less ice", "Less sugar", "No sugar", "Extra ice"]),
	(("soup",), ["Extra hot", "Less salt", "Spicy"]),
	(("cake", "dessert", "ice cream", "pudding", "brownie"), ["Warm", "Extra topping", "No nuts"]),
)
_DEFAULT_NOTES = ["Well done", "Less spicy", "Extra spicy", "No onion", "Less salt", "No salt", "Extra sauce", "Sauce on the side"]


def _rule_notes(item_name: str, group: str | None) -> list:
	hay = f"{item_name} {group or ''}".lower()
	for keys, notes in _RULES:
		if any(k in hay for k in keys):
			return notes[:8]
	return _DEFAULT_NOTES[:8]


def _clean_notes(raw) -> list:
	out = []
	for n in raw or []:
		n = " ".join(str(n).split())[:30]
		if n and n.lower() not in {o.lower() for o in out}:
			out.append(n)
	return out[:8]


def _anthropic_key():
	import os

	return frappe.conf.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY")


def _ai_notes(item_name: str, group: str | None):
	"""Ask Claude for short kitchen-preference notes for this dish. Returns a list, or
	None if there is no key or the call fails (the caller then falls back)."""
	key = _anthropic_key()
	if not key:
		return None
	import re

	import requests

	prompt = (
		"You help a restaurant point-of-sale. For the menu item below, list up to 8 short notes a guest might "
		"ask the kitchen for — cooking level, texture (e.g. crunchy), cooking method (e.g. deep fried, grilled), "
		"spice level, ingredients to leave out, how it is served. Each note is under 25 characters and specific "
		"to this item; do not include notes that make no sense for it (no 'well done' for a soft drink). "
		f"Return ONLY a JSON array of strings.\n\nItem: {item_name}\nCategory: {group or 'unknown'}"
	)
	try:
		r = requests.post(
			"https://api.anthropic.com/v1/messages",
			headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
			json={"model": NOTE_MODEL, "max_tokens": 250, "messages": [{"role": "user", "content": prompt}]},
			timeout=6,
		)
		r.raise_for_status()
		text = "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
		m = re.search(r"\[.*\]", text, re.S)
		notes = _clean_notes(json.loads(m.group(0))) if m else []
		return notes or None
	except Exception:
		frappe.log_error(title="POS item-note suggestion (AI) failed")
		return None


@frappe.whitelist()
def get_item_notes(item_code: str, refresh: int = 0):
	"""Suggested notes for a dish: cached; from Claude when a key is set, else a built-in
	list. `refresh=1` (supervisor) regenerates them."""
	require_cap("view")
	if not frappe.db.exists("Item", item_code):
		frappe.throw("No such item.")
	refresh = cint(refresh) and has_cap("menu")
	row = frappe.get_doc(NOTES, item_code) if frappe.db.exists(NOTES, item_code) else None
	have_key = bool(_anthropic_key())
	if row and row.source == "Manual" and not refresh:
		return {"item_code": item_code, "notes": _clean_notes((row.notes or "").split("\n")), "source": "Manual", "ai_enabled": have_key}
	tried_recently = bool(row and row.ai_tried_at and now_datetime() - get_datetime(row.ai_tried_at) < AI_RETRY)
	upgrade = have_key and (not row or (row.source == "Standard" and not tried_recently))
	if row and not refresh and not upgrade:
		return {"item_code": item_code, "notes": _clean_notes((row.notes or "").split("\n")), "source": row.source, "ai_enabled": have_key}
	item = frappe.db.get_value("Item", item_code, ["item_name", "item_group"], as_dict=True)
	notes = _ai_notes(item.item_name, item.item_group) if (have_key and (upgrade or refresh)) else None
	source = "AI" if notes else "Standard"
	if not notes:
		# keep an earlier AI answer rather than replace it with the generic list
		notes = _clean_notes((row.notes or "").split("\n")) if row and row.source == "AI" else _rule_notes(item.item_name, item.item_group)
		source = "AI" if row and row.source == "AI" else "Standard"
	values = {"notes": "\n".join(notes), "source": source, "ai_tried_at": now_datetime() if have_key else None}
	if row:
		row.update(values)
		row.save(ignore_permissions=True)
	else:
		frappe.get_doc({"doctype": NOTES, "item_code": item_code, **values}).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"item_code": item_code, "notes": notes, "source": source, "ai_enabled": have_key}


@frappe.whitelist()
def set_item_notes(item_code: str, notes):
	"""Supervisor: write the suggested notes for a dish by hand (kept until refreshed)."""
	require_cap("menu")
	if not frappe.db.exists("Item", item_code):
		frappe.throw("No such item.")
	if isinstance(notes, str):
		notes = json.loads(notes) if notes.strip().startswith("[") else notes.split("\n")
	clean = _clean_notes(notes)
	values = {"notes": "\n".join(clean), "source": "Manual"}
	if frappe.db.exists(NOTES, item_code):
		doc = frappe.get_doc(NOTES, item_code)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		frappe.get_doc({"doctype": NOTES, "item_code": item_code, **values}).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"item_code": item_code, "notes": clean, "source": "Manual"}


# ------------------------------------------------------------------ menu

HIDDEN = "XentraERP POS Hidden Item"


def _hidden_items(loc_code) -> set:
	return {r.item_code for r in frappe.get_all(HIDDEN, fields=["item_code", "location"]) if not r.location or r.location == loc_code}


def _selling_list(profile) -> str:
	return (
		(profile.selling_price_list if profile else None)
		or frappe.db.get_single_value("Selling Settings", "selling_price_list")
		or "Standard Selling"
	)


@frappe.whitelist()
def list_menu(pos_profile: str | None = None, include_hidden: int = 0):
	"""What can be sold on this register, with prices. Items a supervisor has hidden
	for the location (or everywhere) are left out; `include_hidden=1` (supervisor)
	returns them too, flagged, for the menu manager."""
	require_cap("view")
	profile = get_profile(pos_profile) if pos_profile else None
	loc_code = location_code(location_of(pos_profile)) if pos_profile else None
	hidden = _hidden_items(loc_code)
	if cint(include_hidden):
		require_cap("menu")
	rates = {}
	if profile:
		for r in frappe.get_all(
			"Item Price", filters={"price_list": _selling_list(profile), "selling": 1, "customer": ["is", "not set"]}, fields=["item_code", "price_list_rate"], order_by="modified asc"
		):
			rates[r.item_code] = flt(r.price_list_rate)
	out = []
	for i in frappe.get_all(
		"Item", filters={"disabled": 0, "is_sales_item": 1}, fields=["name", "item_name", "item_group", "standard_rate", "is_stock_item"],
		order_by="item_group asc, item_name asc", limit_page_length=2000,
	):
		is_hidden = i.name in hidden
		if is_hidden and not cint(include_hidden):
			continue
		out.append({"item_code": i.name, "item_name": i.item_name, "item_group": i.item_group, "rate": rates.get(i.name, flt(i.standard_rate)),
		            "hidden": is_hidden, "is_stock_item": cint(i.is_stock_item)})
	return out


@frappe.whitelist()
def list_item_groups():
	require_cap("view")
	return frappe.get_all("Item Group", filters={"is_group": 0}, pluck="name", order_by="name asc")


@frappe.whitelist()
def set_item_hidden(item_code: str, hidden: int = 1, location: str | None = None):
	"""Supervisor: hide a dish from the POS menu (only the POS — the item stays in ERPNext),
	at one location or everywhere; or show it again."""
	require_cap("menu")
	if not frappe.db.exists("Item", item_code):
		frappe.throw("No such item.")
	location = (location or "").strip() or None
	if location and not frappe.db.exists("XentraERP POS Location", location):
		frappe.throw(f"No such location: {location}")
	existing = frappe.db.get_value(HIDDEN, {"item_code": item_code, "location": location or ["is", "not set"]})
	if cint(hidden) and not existing:
		frappe.get_doc({"doctype": HIDDEN, "item_code": item_code, "location": location}).insert(ignore_permissions=True)
	elif not cint(hidden) and existing:
		frappe.delete_doc(HIDDEN, existing, ignore_permissions=True)
	frappe.db.commit()
	return {"item_code": item_code, "hidden": bool(cint(hidden))}


@frappe.whitelist()
def save_menu_item(item_name: str, item_group: str, rate: float, pos_profile: str | None = None, item_code: str | None = None, is_stock_item: int = 0):
	"""Supervisor: add a dish to the menu, or change an existing one's name, group and
	price. The price is stored as an Item Price on the register's selling price list."""
	require_cap("menu")
	item_name = (item_name or "").strip()
	if not item_name or len(item_name) > 140:
		frappe.throw("Give the item a name (up to 140 characters).")
	if not frappe.db.exists("Item Group", item_group):
		frappe.throw(f"No such item group: {item_group}")
	rate = flt(rate)
	if rate < 0:
		frappe.throw("The price can't be negative.")
	profile = get_profile(pos_profile) if pos_profile else None
	with _elevated():
		if item_code:
			if not frappe.db.exists("Item", item_code):
				frappe.throw("No such item.")
			doc = frappe.get_doc("Item", item_code)
			doc.item_name, doc.item_group = item_name, item_group
			doc.save(ignore_permissions=True)
		else:
			if frappe.db.exists("Item", item_name):
				frappe.throw(f"An item called '{item_name}' already exists.")
			doc = frappe.get_doc(
				{"doctype": "Item", "item_code": item_name, "item_name": item_name, "item_group": item_group, "stock_uom": "Nos",
				 "is_stock_item": cint(bool(cint(is_stock_item))), "is_sales_item": 1, "is_purchase_item": 0}
			)
			doc.insert(ignore_permissions=True)
		price_list = _selling_list(profile)
		row = frappe.db.get_value("Item Price", {"item_code": doc.name, "price_list": price_list, "customer": ["is", "not set"]})
		if row:
			frappe.db.set_value("Item Price", row, "price_list_rate", rate)
		else:
			frappe.get_doc({"doctype": "Item Price", "item_code": doc.name, "price_list": price_list, "price_list_rate": rate}).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"item_code": doc.name, "item_name": doc.item_name, "item_group": doc.item_group, "rate": rate, "hidden": False}


# --------------------------------------------------------------- reports


@frappe.whitelist()
def end_of_day_report(date: str | None = None, location: str | None = None):
	"""Administrator: everything traded on one business day, optionally for one
	location. Covers both checkout documents (POS Invoices and Sales Invoices +
	receipts) and shows part-paid balances that are still to be collected."""
	require_cap("reports")
	bd = str(getdate(date)) if date else str(business_date())
	company_ccy = frappe.db.get_value("Company", frappe.db.get_single_value("Global Defaults", "default_company"), "default_currency")
	loc_sql, loc_args = (" and location=%s", (location,)) if location else ("", ())

	tender_docs = frappe.db.sql(
		f"select distinct invoice, invoice_doctype from `tabXentraERP POS Tender` where business_date=%s{loc_sql}", (bd, *loc_args)
	)
	pos_names = [r[0] for r in tender_docs if (r[1] or "POS Invoice") == "POS Invoice"]
	si_names = [r[0] for r in tender_docs if r[1] == "Sales Invoice"]
	if not location:  # POS Invoices booked outside this app's tender ledger still count
		pos_names = list({*pos_names, *frappe.db.sql_list("select name from `tabPOS Invoice` where posting_date=%s and docstatus=1", (bd,))})

	inv = []
	for doctype, names in (("POS Invoice", pos_names), ("Sales Invoice", si_names)):
		if not names:
			continue
		extra = ", outstanding_amount" if doctype == "Sales Invoice" else ", 0 as outstanding_amount"
		for r in frappe.db.sql(
			f"""select name, owner, pos_profile, base_grand_total, base_net_total, base_total_taxes_and_charges, is_return{extra}
			    from `tab{doctype}` where name in %s and docstatus=1""",
			(names,), as_dict=True,
		):
			r["doctype"] = doctype
			inv.append(r)
	sales = [i for i in inv if not i.is_return]
	returns = [i for i in inv if i.is_return]
	by_payment = frappe.db.sql(
		f"""select mode_of_payment, currency, sum(tendered) as tendered, sum(amount) as amount
		    from `tabXentraERP POS Tender` where business_date=%s{loc_sql} group by mode_of_payment, currency order by mode_of_payment""",
		(bd, *loc_args), as_dict=True,
	)
	by_location = frappe.db.sql(
		"""select coalesce(location, '') as location, count(distinct invoice) as invoices, sum(amount) as received
		   from `tabXentraERP POS Tender` where business_date=%s group by location order by location""",
		(bd,), as_dict=True,
	)
	cashiers = {}
	for i in inv:
		c = cashiers.setdefault(i.owner, {"cashier": i.owner, "invoices": 0, "total": 0.0})
		c["invoices"] += 1
		c["total"] += flt(i.base_grand_total)
	top_items = []
	for doctype, names in (("POS Invoice", pos_names), ("Sales Invoice", si_names)):
		if names:
			top_items += frappe.db.sql(
				f"select item_code, item_name, sum(qty) as qty, sum(base_amount) as amount from `tab{doctype} Item` where parent in %s group by item_code, item_name",
				(names,), as_dict=True,
			)
	merged = {}
	for t in top_items:
		m = merged.setdefault(t.item_code, {"item_code": t.item_code, "item_name": t.item_name, "qty": 0.0, "amount": 0.0})
		m["qty"] += flt(t.qty)
		m["amount"] += flt(t.amount)
	shift_filters = {"business_date": bd, **({"location": location} if location else {})}
	shifts = frappe.get_all(
		"XentraERP POS Shift", filters=shift_filters,
		fields=["name", "cashier", "pos_profile", "location", "status", "opened_at", "closed_at", "invoice_count", "total_sales"],
		order_by="opened_at asc", limit_page_length=0,
	)
	for sh in shifts:
		sh["variance"] = [
			{"currency": c.currency, "variance": flt(c.variance)}
			for c in frappe.get_all("XentraERP POS Shift Cash", filters={"parent": sh.name}, fields=["currency", "variance"])
		]
		sh["opened_at"], sh["closed_at"] = str(sh.opened_at or ""), str(sh.closed_at or "")
	order_filter = " and location=%s" if location else ""
	orders = frappe.db.sql(
		f"select status, count(*), coalesce(sum(guests),0) from `tabXentraERP POS Order` where business_date=%s{order_filter} group by status",
		(bd, *loc_args),
	)
	order_counts = {r[0]: {"orders": cint(r[1]), "guests": cint(r[2])} for r in orders}
	billed = {"orders": sum(order_counts.get(k, {"orders": 0})["orders"] for k in ("Billed", "Part Paid")),
	          "guests": sum(order_counts.get(k, {"guests": 0})["guests"] for k in ("Billed", "Part Paid"))}
	gross = flt(sum(flt(i.base_grand_total) for i in sales))
	outstanding = flt(sum(flt(i.outstanding_amount) for i in sales))
	warnings = []
	open_shifts = [sh.name for sh in shifts if sh.status == "Open"]
	if open_shifts:
		warnings.append(f"{len(open_shifts)} shift(s) are still open: {', '.join(open_shifts)}.")
	open_orders = frappe.db.count("XentraERP POS Order", {"status": "Open", "business_date": bd, **({"location": location} if location else {})})
	if open_orders:
		warnings.append(f"{open_orders} table order(s) from this day are still open.")
	part = [i for i in sales if flt(i.outstanding_amount) > 0.0005]
	if part:
		warnings.append(f"{len(part)} invoice(s) are part-paid with {outstanding:g} still to collect.")
	return {
		"business_date": bd,
		"location": location,
		"currency": company_ccy,
		"invoice_count": len(sales),
		"gross_sales": gross,
		"net_sales": flt(sum(flt(i.base_net_total) for i in sales)),
		"tax": flt(sum(flt(i.base_total_taxes_and_charges) for i in sales)),
		"outstanding_balance": outstanding,
		"returns": {"count": len(returns), "total": flt(sum(flt(i.base_grand_total) for i in returns))},
		"average_bill": gross / len(sales) if sales else 0.0,
		"by_payment": [{"mode": r.mode_of_payment, "currency": r.currency, "tendered": flt(r.tendered), "amount": flt(r.amount)} for r in by_payment],
		"by_location": [{"location": r.location, "invoices": cint(r.invoices), "received": flt(r.received)} for r in by_location],
		"by_cashier": sorted(cashiers.values(), key=lambda c: -c["total"]),
		"top_items": sorted(merged.values(), key=lambda t: -t["amount"])[:10],
		"shifts": shifts,
		"fnb": {
			"billed_orders": billed["orders"],
			"covers": billed["guests"],
			"average_per_cover": (gross / billed["guests"]) if billed["guests"] else 0.0,
			"cancelled_orders": order_counts.get("Cancelled", {"orders": 0})["orders"],
			"merged_orders": order_counts.get("Merged", {"orders": 0})["orders"],
		},
		"warnings": warnings,
	}
