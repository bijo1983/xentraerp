"""F&B table service: table management, dine-in orders that grow over the
meal, kitchen order tickets (KOT), and the bill operations restaurants need —
split a bill, merge bills, merge tables, close the check.

Retail (the plain counter flow) is untouched and needs none of this. The mode
is one setting per tenant site (see pos_core.set_pos_mode) that a tenant
admin flips; every method here refuses to run unless the tenant is in F&B
mode, so a Retail tenant can't be driven into table service through the API.

Model: a *table* is a place. An *order* (one bill) belongs to a table and may
also span further tables that were merged into the party. A table can carry
several open orders at once — that is what a split bill is — and it is free
again only when none remain. A table's status is always derived from the open
orders, never stored, so it can't drift out of sync.
"""

import json
from datetime import timedelta

import frappe
from frappe.model.naming import getseries
from frappe.utils import cint, flt, get_datetime, getdate, now_datetime

from custom_erp.api import pos_core as core
# Re-exported so the POS app has one place to ask about modes.
from custom_erp.api.pos_core import get_pos_settings, set_pos_mode  # noqa: F401

ACTIVE_KOT = ("New", "Preparing", "Ready")
KOT_TRANSITIONS = {
	"New": ("Preparing", "Cancelled"),
	"Preparing": ("Ready", "Cancelled"),
	"Ready": ("Served",),
}


# --------------------------------------------------------------- guards


def _require_fnb(cap: str = "view"):
	"""Signed-in POS user, tenant in F&B mode, and a role that grants `cap`."""
	core.require_pos_user()
	if core.settings()["pos_mode"] != "F&B":
		frappe.throw("Table service isn't enabled — this organization's POS is in Retail mode.")
	core.require_cap(cap)


def _lock_table(table: str):
	"""Serialise concurrent opens/transfers/merges touching the same table."""
	frappe.db.sql("select name from `tabXentraERP POS Table` where name=%s for update", (table,))


def _split_tables(csv) -> list:
	return [t.strip() for t in (csv or "").split(",") if t.strip()]


def _tables_of(order) -> set:
	"""Every table an open order occupies: its own plus any merged in."""
	return {t for t in (order.pos_table, *_split_tables(order.merged_tables)) if t}


def _open_orders() -> list:
	return frappe.get_all(
		"XentraERP POS Order",
		filters={"status": ["in", ["Open", "Part Paid"]]},
		fields=["name", "pos_table", "merged_tables", "guests", "total", "creation", "waiter", "bill_closed", "business_date", "status", "draft_invoice", "location", "order_type", "token", "guest_name"],
		order_by="creation asc",
		limit_page_length=0,
	)


def _orders_touching(table: str) -> list:
	return [o for o in _open_orders() if table in _tables_of(o)]


# --------------------------------------------------------------- reservations

RESERVATION = "XentraERP POS Reservation"
HOLD_BEFORE = timedelta(hours=2)     # a booked table shows Reserved from 2 hours before the booking...
HOLD_AFTER = timedelta(minutes=30)   # ...until 30 minutes after it (then the party is late / a no-show)
CLASH = timedelta(minutes=90)        # two bookings on one table must be at least this far apart


def _res_when(r):
	return get_datetime(f"{r.reservation_date} {r.reservation_time}")


def _hhmm(t) -> str:
	return str(t)[:5]


def _held_tables() -> dict:
	"""{table: booking} for bookings whose hold window is open right now."""
	now = now_datetime()
	held = {}
	for r in frappe.get_all(
		RESERVATION,
		filters={"status": "Booked", "reservation_date": ["between", [str(getdate(now) - timedelta(days=1)), str(getdate(now) + timedelta(days=1))]]},
		fields=["name", "guest_name", "party_size", "reservation_date", "reservation_time", "tables"],
	):
		if -HOLD_AFTER <= _res_when(r) - now <= HOLD_BEFORE:
			for t in _split_tables(r.tables):
				held.setdefault(t, r)
	return held


def _complete_reservation(order: str, status: str):
	"""A seated party's booking follows its order: billed -> Completed, cancelled -> Cancelled."""
	for n in frappe.get_all(RESERVATION, filters={"pos_order": order, "status": "Seated"}, pluck="name"):
		frappe.db.set_value(RESERVATION, n, "status", status)


# --------------------------------------------------------------- tables


def _table_status(disabled, reserved, has_order) -> str:
	if disabled:
		return "Disabled"
	if has_order:
		return "Occupied"
	if reserved:
		return "Reserved"
	return "Available"


@frappe.whitelist()
def list_tables(pos_profile: str | None = None):
	"""Every table with its live status and the open bills sitting on it. Given a
	register, only that register's location's tables (plus any shared ones)."""
	_require_fnb("view")
	tables = frappe.get_all(
		"XentraERP POS Table",
		fields=["name", "zone", "seats", "reserved", "disabled", "location"],
		order_by="zone asc, name asc",
		limit_page_length=0,
	)
	loc = core.location_of(pos_profile) if pos_profile else None
	if loc:
		tables = [t for t in tables if not t.location or t.location == loc.location_code]
	orders = _open_orders()
	held = _held_tables()
	pending = {}
	for k in frappe.get_all(
		"XentraERP KOT",
		filters={"status": ["in", list(ACTIVE_KOT)], "pos_order": ["in", [o.name for o in orders] or [""]]},
		fields=["pos_order"],
		limit_page_length=0,
	):
		pending[k.pos_order] = pending.get(k.pos_order, 0) + 1
	by_table = {}
	for o in orders:
		for t in _tables_of(o):
			by_table.setdefault(t, []).append(o)
	out = []
	for t in tables:
		here = by_table.get(t.name, [])
		first = here[0] if here else None
		out.append(
			{
				"name": t.name,
				"zone": t.zone or "",
				"location": t.location or "",
				"seats": cint(t.seats),
				"reserved": cint(t.reserved),
				"disabled": cint(t.disabled),
				"status": _table_status(t.disabled, t.reserved or t.name in held, bool(here)),
				"reservation": (
					{"name": held[t.name].name, "guest": held[t.name].guest_name, "party_size": cint(held[t.name].party_size), "time": _hhmm(held[t.name].reservation_time)}
					if t.name in held and not here
					else None
				),
				# `order` = the first bill here (kept for simple callers); `orders` = all of them.
				"order": first.name if first else None,
				"orders": [
					{
						"name": o.name,
						"guests": cint(o.guests),
						"total": flt(o.total),
						"waiter": o.waiter,
						"bill_closed": cint(o.bill_closed),
						"status": o.status,
						"part_paid": o.status == "Part Paid",
						"merged": o.pos_table != t.name,
						"primary_table": o.pos_table,
						"kots_pending": pending.get(o.name, 0),
					}
					for o in here
				],
				"guests": sum(cint(o.guests) for o in here) if here else (cint(held[t.name].party_size) if t.name in held else 0),
				"total": sum(flt(o.total) for o in here),
				"since": str(first.creation) if first else None,
				"waiter": first.waiter if first else None,
				"kots_pending": sum(pending.get(o.name, 0) for o in here),
			}
		)
	return out


@frappe.whitelist()
def save_table(table_name: str, zone: str | None = None, seats: int = 4, reserved: int = 0, disabled: int = 0, location: str | None = None):
	"""Admin: add a table, or update an existing one (its name is its identity)."""
	core.require_cap("tables")
	table_name = (table_name or "").strip()
	if not table_name or len(table_name) > 40 or any(c in table_name for c in "/\\#?%"):
		frappe.throw("Give the table a short name (up to 40 characters), e.g. T1 or Patio 3.")
	seats = cint(seats)
	if not 1 <= seats <= 99:
		frappe.throw("Seats must be between 1 and 99.")
	if location and not frappe.db.exists("XentraERP POS Location", location):
		frappe.throw(f"No such location: {location}")
	values = {"zone": (zone or "").strip(), "location": location or None, "seats": seats, "reserved": cint(bool(cint(reserved))), "disabled": cint(bool(cint(disabled)))}
	if frappe.db.exists("XentraERP POS Table", table_name):
		if values["disabled"] and _orders_touching(table_name):
			frappe.throw("This table has an open order — bill or cancel it before disabling the table.")
		doc = frappe.get_doc("XentraERP POS Table", table_name)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "XentraERP POS Table", "table_name": table_name, **values})
		doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name}


@frappe.whitelist()
def delete_table(table: str):
	core.require_cap("tables")
	if _orders_touching(table):
		frappe.throw("This table has an open order.")
	try:
		frappe.delete_doc("XentraERP POS Table", table, ignore_permissions=True)
	except frappe.LinkExistsError:
		frappe.throw("This table has past orders, so it can't be deleted. Disable it instead.")
	frappe.db.commit()
	return {"success": True}


@frappe.whitelist()
def set_table_reserved(table: str, reserved: int = 1):
	_require_fnb("reserve")
	_lock_table(table)
	if not frappe.db.exists("XentraERP POS Table", table):
		frappe.throw("No such table.")
	if _orders_touching(table):
		frappe.throw("This table is occupied.")
	frappe.db.set_value("XentraERP POS Table", table, "reserved", cint(bool(cint(reserved))))
	frappe.db.commit()
	return {"success": True}


# --------------------------------------------------------------- orders


def _order_payload(doc) -> dict:
	return {
		"name": doc.name,
		"table": doc.pos_table,
		"order_type": doc.order_type or "Dine In",
		"token": doc.token,
		"guest_name": doc.guest_name,
		"guest_phone": doc.guest_phone,
		"merged_tables": _split_tables(doc.merged_tables),
		"pos_profile": doc.pos_profile,
		"status": doc.status,
		"guests": cint(doc.guests),
		"customer": doc.customer,
		"waiter": doc.waiter,
		"total": flt(doc.total),
		"invoice": doc.invoice,
		"draft_invoice": doc.draft_invoice,
		"location": doc.location,
		"balance": flt(frappe.db.get_value("Sales Invoice", doc.draft_invoice, "outstanding_amount")) if doc.status == "Part Paid" and doc.draft_invoice else 0,
		"business_date": str(doc.business_date) if doc.business_date else None,
		"bill_closed": cint(doc.bill_closed),
		"items": [
			{
				"item_code": r.item_code,
				"item_name": r.item_name,
				"qty": flt(r.qty),
				"rate": flt(r.rate),
				"amount": flt(r.amount),
				"note": r.note or "",
				"kot_qty": flt(r.kot_qty),
			}
			for r in doc.items
		],
	}


def _open_order(order: str, for_update: bool = False):
	if not frappe.db.exists("XentraERP POS Order", order):
		frappe.throw("No such order.")
	if for_update:
		frappe.db.sql("select name from `tabXentraERP POS Order` where name=%s for update", (order,))
	doc = frappe.get_doc("XentraERP POS Order", order)
	if doc.status != "Open":
		frappe.throw(f"This order is already {doc.status.lower()}.")
	return doc


def _payable_order(order: str, for_update: bool = False):
	"""An order that can still take payment: open, or part-paid."""
	if not frappe.db.exists("XentraERP POS Order", order):
		frappe.throw("No such order.")
	if for_update:
		frappe.db.sql("select name from `tabXentraERP POS Order` where name=%s for update", (order,))
	doc = frappe.get_doc("XentraERP POS Order", order)
	if doc.status not in ("Open", "Part Paid"):
		frappe.throw(f"This order is already {doc.status.lower()}.")
	return doc


def _editable(doc):
	if cint(doc.bill_closed):
		frappe.throw("This bill is closed. Re-open it to change or send items.")


def _recompute(doc):
	for r in doc.items:
		r.amount = flt(r.qty) * flt(r.rate)
	doc.total = sum(flt(r.amount) for r in doc.items)


def _new_order(source, table=None) -> "frappe.model.document.Document":
	return frappe.get_doc(
		{
			"doctype": "XentraERP POS Order",
			"pos_table": table or source["pos_table"],
			"order_type": source.get("order_type") or "Dine In",
			"token": source.get("token"),
			"guest_name": source.get("guest_name"),
			"pos_profile": source["pos_profile"],
			"status": "Open",
			"guests": 0,
			"customer": source.get("customer"),
			"waiter": source.get("waiter"),
			"location": source.get("location"),
			"business_date": source.get("business_date"),
		}
	)


def _next_token(loc, business_dt) -> str:
	"""Take-away ticket number: 001, 002, ... restarting each business day per location."""
	return getseries(f"TA-{core.location_code(loc) or 'X'}-{business_dt:%Y%m%d}-", 3)


@frappe.whitelist()
def open_order(
	table: str | None, pos_profile: str, guests: int = 1, customer: str | None = None, new_bill: int = 0,
	order_type: str = "Dine In", guest_name: str | None = None, guest_phone: str | None = None,
):
	"""Start an order — the first question at the till is Dine In or Take Away.

	Dine In seats a party at `table` (or returns the bill already open there;
	`new_bill=1` starts an additional bill on an occupied table). Take Away needs
	no table: the order gets a token number and an optional name/phone."""
	_require_fnb("order")
	if order_type not in ("Dine In", "Take Away"):
		frappe.throw("Choose Dine In or Take Away.")
	core.get_profile(pos_profile)
	ploc = core.location_of(pos_profile)
	bd = core.business_date()
	base = {
		"doctype": "XentraERP POS Order", "pos_profile": pos_profile, "status": "Open", "order_type": order_type,
		"customer": customer or None, "waiter": frappe.session.user, "location": core.location_code(ploc),
		# The bill belongs to the trading day it was started on, however late it is settled.
		"business_date": bd,
		"guest_name": (guest_name or "").strip()[:80] or None, "guest_phone": (guest_phone or "").strip()[:30] or None,
	}
	if order_type == "Take Away":
		doc = frappe.get_doc({**base, "pos_table": None, "guests": 1, "token": _next_token(ploc, bd)})
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return _order_payload(doc)

	if not table:
		frappe.throw("Choose a table for a dine-in order.")
	_lock_table(table)
	tdoc = frappe.db.get_value("XentraERP POS Table", table, ["disabled", "location"], as_dict=True)
	if not tdoc:
		frappe.throw("No such table.")
	if tdoc.disabled:
		frappe.throw("This table is disabled.")
	here = _orders_touching(table)
	if here and not cint(new_bill):
		return _order_payload(frappe.get_doc("XentraERP POS Order", here[0].name))
	if here and any(o.pos_table != table for o in here) and not any(o.pos_table == table for o in here):
		frappe.throw("This table is part of a merged party. Use that party's bill.")
	if ploc and tdoc.location and tdoc.location != ploc.location_code:
		frappe.throw(f"Table {table} belongs to location {tdoc.location}, not to this register's location ({ploc.location_code}).")
	doc = frappe.get_doc({**base, "pos_table": table, "guests": max(1, cint(guests))})
	doc.insert(ignore_permissions=True)
	frappe.db.set_value("XentraERP POS Table", table, "reserved", 0)
	frappe.db.commit()
	return _order_payload(doc)


@frappe.whitelist()
def list_open_orders(pos_profile: str | None = None):
	"""Open take-away orders (they have no table to find them by), oldest first, so the
	floor can list them and staff can go back to one that isn't paid yet."""
	_require_fnb("view")
	loc = core.location_of(pos_profile) if pos_profile else None
	return [
		{"name": o.name, "token": o.token, "guest_name": o.guest_name, "total": flt(o.total), "status": o.status, "guests": cint(o.guests), "bill_closed": cint(o.bill_closed)}
		for o in _open_orders()
		if o.order_type == "Take Away" and (not loc or not o.location or o.location == loc.location_code)
	]


@frappe.whitelist()
def get_order(order: str):
	_require_fnb("view")
	if not frappe.db.exists("XentraERP POS Order", order):
		frappe.throw("No such order.")
	return _order_payload(frappe.get_doc("XentraERP POS Order", order))


def _parse_list(value, what="Items"):
	if isinstance(value, str):
		try:
			value = json.loads(value)
		except ValueError:
			frappe.throw(f"{what} must be a list.")
	if not isinstance(value, list):
		frappe.throw(f"{what} must be a list.")
	return value


@frappe.whitelist()
def set_order_items(order: str, items):
	"""Replace the order's lines with the given ones. Rates come from the
	server's price list, not the client, unless the register's POS Profile
	allows rate changes. A line that already went to the kitchen can't be
	reduced or removed here — the kitchen has already started it."""
	_require_fnb("order")
	doc = _open_order(order, for_update=True)
	_editable(doc)
	profile = core.get_profile(doc.pos_profile)
	allow_rate = cint(profile.allow_rate_change)

	incoming = []
	for raw in _parse_list(items):
		code = (raw or {}).get("item_code")
		qty = flt((raw or {}).get("qty"))
		if not code or qty <= 0:
			frappe.throw("Each line needs an item and a quantity above zero.")
		item = frappe.db.get_value("Item", code, ["item_name", "disabled", "is_sales_item"], as_dict=True)
		if not item or item.disabled or not item.is_sales_item:
			frappe.throw(f"'{code}' isn't a sellable item.")
		rate = flt(raw.get("rate")) if allow_rate and raw.get("rate") not in (None, "") else core.rate_for(code, profile)
		incoming.append({"item_code": code, "item_name": item.item_name, "qty": qty, "rate": rate, "note": (raw.get("note") or "").strip()[:140]})

	sent = {}
	for r in doc.items:
		if flt(r.kot_qty) > 0:
			sent[(r.item_code, r.note or "")] = sent.get((r.item_code, r.note or ""), 0) + flt(r.kot_qty)
	new_qty = {}
	for line in incoming:
		key = (line["item_code"], line["note"])
		new_qty[key] = new_qty.get(key, 0) + line["qty"]
	if not core.has_cap("modify"):
		saved = {}
		for r in doc.items:
			saved[(r.item_code, r.note or "")] = saved.get((r.item_code, r.note or ""), 0) + flt(r.qty)
		for key, q in saved.items():
			if new_qty.get(key, 0) < q:
				frappe.throw(f"A waiter can add items but not reduce or remove '{key[0]}' — ask a cashier to change the order.")
	for key, was_sent in sent.items():
		if new_qty.get(key, 0) < was_sent:
			frappe.throw(f"'{key[0]}' was already sent to the kitchen ({was_sent:g}) — it can't be reduced or removed here.")

	# Carry each line's already-sent quantity across the rebuild.
	remaining_sent = dict(sent)
	doc.set("items", [])
	for line in incoming:
		key = (line["item_code"], line["note"])
		carried = min(line["qty"], remaining_sent.get(key, 0))
		remaining_sent[key] = remaining_sent.get(key, 0) - carried
		doc.append("items", {**line, "amount": line["qty"] * line["rate"], "kot_qty": carried})
	_recompute(doc)
	doc.save(ignore_permissions=True)
	# Saving is what sends the order to the kitchen: the KOT for whatever is new
	# is created right here and shows on the kitchen screen (and prints) at once.
	kot = _make_kot(doc) if core.settings()["auto_kot"] else None
	frappe.db.commit()
	return {**_order_payload(doc), "kot": kot}


# ---------------------------------------------------------------------- KOT


def _make_kot(doc):
	"""Create a KOT for whatever was added since the last one and mark it sent.
	Returns the ticket, or None if nothing is new. Does not commit."""
	fresh = []
	for r in doc.items:
		delta = flt(r.qty) - flt(r.kot_qty)
		if delta > 0:
			fresh.append({"item_code": r.item_code, "item_name": r.item_name, "qty": delta, "note": r.note or ""})
			r.kot_qty = flt(r.qty)
	if not fresh:
		return None
	kot = frappe.get_doc(
		{
			"doctype": "XentraERP KOT",
			"pos_order": doc.name,
			"pos_table": doc.pos_table,
			"order_type": doc.order_type or "Dine In",
			"token": doc.token,
			"pos_profile": doc.pos_profile,
			"location": doc.location,
			"status": "New",
			"created_by": frappe.session.user,
			"items": fresh,
		}
	)
	kot.insert(ignore_permissions=True)
	doc.save(ignore_permissions=True)
	return {
		"kot": kot.name, "table": doc.pos_table, "order": doc.name, "order_type": doc.order_type or "Dine In",
		"token": doc.token, "items": fresh, "created": str(kot.creation),
	}


@frappe.whitelist()
def send_kot(order: str):
	"""Send everything added since the last KOT to the kitchen as one ticket. Not
	needed when "send to kitchen automatically on save" is on (the default) — saving
	the order already did it — but stays available if that is switched off."""
	_require_fnb("order")
	doc = _open_order(order, for_update=True)
	_editable(doc)
	out = _make_kot(doc)
	if not out:
		frappe.throw("Nothing new to send to the kitchen.")
	frappe.db.commit()
	return out


def _kot_payload(k) -> dict:
	return {
		"name": k.name,
		"order": k.pos_order,
		"table": k.pos_table,
		"order_type": k.order_type or "Dine In",
		"token": k.token,
		"status": k.status,
		"created": str(k.creation),
		"items": [{"item_code": i.item_code, "item_name": i.item_name, "qty": flt(i.qty), "note": i.note or ""} for i in k.items],
	}


@frappe.whitelist()
def list_kots(statuses=None, pos_profile: str | None = None):
	"""Tickets for the kitchen screen — oldest first. Active ones by default.
	Given a register, only its location's tickets (each site has its own kitchen)."""
	_require_fnb("kot")
	if isinstance(statuses, str):
		try:
			statuses = json.loads(statuses)
		except ValueError:
			statuses = [statuses]
	wanted = [s for s in (statuses or ACTIVE_KOT) if s in ("New", "Preparing", "Ready", "Served", "Cancelled")]
	filters = {"status": ["in", wanted]}
	loc = core.location_of(pos_profile) if pos_profile else None
	if loc:
		filters["location"] = loc.location_code
	rows = frappe.get_all("XentraERP KOT", filters=filters, fields=["name"], order_by="creation asc", limit_page_length=200)
	return [_kot_payload(frappe.get_doc("XentraERP KOT", r.name)) for r in rows]


@frappe.whitelist()
def set_kot_status(kot: str, status: str):
	_require_fnb("kot")
	if not frappe.db.exists("XentraERP KOT", kot):
		frappe.throw("No such ticket.")
	frappe.db.sql("select name from `tabXentraERP KOT` where name=%s for update", (kot,))
	doc = frappe.get_doc("XentraERP KOT", kot)
	if status not in KOT_TRANSITIONS.get(doc.status, ()):
		frappe.throw(f"A ticket that is {doc.status} can't be marked {status}.")
	doc.status = status
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _kot_payload(doc)


# -------------------------------------------- table moves, merges and splits


@frappe.whitelist()
def transfer_table(order: str, to_table: str):
	"""Move a party (and their order and open tickets) to another, free table."""
	_require_fnb("modify")
	doc = _open_order(order, for_update=True)
	if doc.order_type == "Take Away":
		frappe.throw("A take-away order has no table to move.")
	if to_table == doc.pos_table:
		frappe.throw("The order is already on that table.")
	_lock_table(to_table)
	target = frappe.db.get_value("XentraERP POS Table", to_table, ["disabled"], as_dict=True)
	if not target or target.disabled:
		frappe.throw("That table isn't available.")
	if _orders_touching(to_table):
		frappe.throw("That table already has an order.")
	old = doc.pos_table
	doc.pos_table = to_table
	# Keep the merged set free of the table the party just left / arrived at.
	doc.merged_tables = ",".join(t for t in _split_tables(doc.merged_tables) if t != to_table)
	doc.save(ignore_permissions=True)
	for k in frappe.get_all("XentraERP KOT", filters={"pos_order": doc.name, "status": ["in", list(ACTIVE_KOT)]}, pluck="name"):
		frappe.db.set_value("XentraERP KOT", k, "pos_table", to_table)
	frappe.db.set_value("XentraERP POS Table", to_table, "reserved", 0)
	frappe.db.commit()
	return {**_order_payload(doc), "moved_from": old}


@frappe.whitelist()
def merge_tables(order: str, table: str):
	"""Join another table to this party (a big group across several tables).
	If that table has its own bill, the two bills are merged too."""
	_require_fnb("modify")
	return _merge_tables(order, table)


def _merge_tables(order: str, table: str):
	"""The work of merge_tables without the role check — also used when seating a
	booked party across several tables, which is a waiter's task."""
	doc = _open_order(order, for_update=True)
	if doc.order_type == "Take Away":
		frappe.throw("A take-away order has no table to join.")
	_editable(doc)
	if table in _tables_of(doc):
		frappe.throw("That table is already part of this party.")
	_lock_table(table)
	tinfo = frappe.db.get_value("XentraERP POS Table", table, ["disabled"], as_dict=True)
	if not tinfo or tinfo.disabled:
		frappe.throw("That table isn't available.")
	here = _orders_touching(table)
	for o in here:
		if o.pos_table != table:
			frappe.throw("That table is already merged into another party.")
	for o in here:
		_merge_orders(doc.name, o.name)
		doc = _open_order(doc.name, for_update=True)
	merged = _split_tables(doc.merged_tables)
	if table not in merged:
		merged.append(table)
	doc.merged_tables = ",".join(merged)
	doc.save(ignore_permissions=True)
	frappe.db.set_value("XentraERP POS Table", table, "reserved", 0)
	frappe.db.commit()
	return _order_payload(doc)


@frappe.whitelist()
def unmerge_table(order: str, table: str):
	"""Take a merged-in table back out of the party (it becomes free)."""
	_require_fnb("modify")
	doc = _open_order(order, for_update=True)
	merged = _split_tables(doc.merged_tables)
	if table not in merged:
		frappe.throw("That table isn't merged into this order.")
	doc.merged_tables = ",".join(t for t in merged if t != table)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _order_payload(doc)


@frappe.whitelist()
def merge_orders(target: str, source: str):
	"""Combine two open bills into one. The source's lines, guests, tables and
	open kitchen tickets move onto the target; the source is closed as Merged."""
	_require_fnb("modify")
	return _merge_orders(target, source)


def _merge_orders(target: str, source: str):
	if target == source:
		frappe.throw("Choose two different bills.")
	tdoc = _open_order(target, for_update=True)
	sdoc = _open_order(source, for_update=True)
	if tdoc.pos_profile != sdoc.pos_profile:
		frappe.throw("These bills are on different registers and can't be merged.")
	_editable(tdoc)
	_editable(sdoc)
	for r in sdoc.items:
		match = next(
			(t for t in tdoc.items if t.item_code == r.item_code and (t.note or "") == (r.note or "") and flt(t.rate) == flt(r.rate)), None
		)
		if match:
			match.qty = flt(match.qty) + flt(r.qty)
			match.kot_qty = flt(match.kot_qty) + flt(r.kot_qty)
		else:
			tdoc.append(
				"items",
				{"item_code": r.item_code, "item_name": r.item_name, "qty": r.qty, "rate": r.rate, "note": r.note, "kot_qty": r.kot_qty},
			)
	_recompute(tdoc)
	tdoc.guests = cint(tdoc.guests) + cint(sdoc.guests)
	tables = _split_tables(tdoc.merged_tables)
	for t in [sdoc.pos_table, *_split_tables(sdoc.merged_tables)]:
		if t != tdoc.pos_table and t not in tables:
			tables.append(t)
	tdoc.merged_tables = ",".join(tables)
	tdoc.save(ignore_permissions=True)
	for k in frappe.get_all("XentraERP KOT", filters={"pos_order": sdoc.name}, pluck="name"):
		frappe.db.set_value("XentraERP KOT", k, "pos_order", tdoc.name)
	sdoc.status = "Merged"
	sdoc.merged_into = tdoc.name
	sdoc.save(ignore_permissions=True)
	frappe.db.commit()
	return _order_payload(tdoc)


@frappe.whitelist()
def split_order(order: str, moves):
	"""Split a bill: move the given quantities onto a new bill on the same
	table, so each can be paid separately. `moves` = [{item_code, note, qty}].
	Quantities already sent to the kitchen travel with the items."""
	_require_fnb("modify")
	doc = _open_order(order, for_update=True)
	_editable(doc)
	moves = _parse_list(moves, "Moves")
	want = {}
	for m in moves:
		code, qty = (m or {}).get("item_code"), flt((m or {}).get("qty"))
		if not code or qty <= 0:
			frappe.throw("Each item to move needs a quantity above zero.")
		key = (code, ((m.get("note") or "").strip())[:140])
		want[key] = want.get(key, 0) + qty
	if not want:
		frappe.throw("Choose what to move onto the new bill.")

	have = {}
	for r in doc.items:
		key = (r.item_code, r.note or "")
		have[key] = have.get(key, 0) + flt(r.qty)
	for key, qty in want.items():
		if qty > have.get(key, 0) + 1e-9:
			frappe.throw(f"There's only {have.get(key, 0):g} of '{key[0]}' on this bill.")
	if all(abs(want.get(k, 0) - v) < 1e-9 for k, v in have.items()):
		frappe.throw("Leave at least one item on the original bill.")

	new = _new_order(doc.as_dict())
	remaining = dict(want)
	keep = []
	for r in doc.items:
		key = (r.item_code, r.note or "")
		take = min(flt(r.qty), remaining.get(key, 0))
		if take > 0:
			remaining[key] -= take
			sent_moved = min(take, flt(r.kot_qty))
			new.append("items", {"item_code": r.item_code, "item_name": r.item_name, "qty": take, "rate": r.rate, "note": r.note, "kot_qty": sent_moved})
			r.qty = flt(r.qty) - take
			r.kot_qty = flt(r.kot_qty) - sent_moved
		if flt(r.qty) > 1e-9:
			keep.append(r)
	doc.set("items", [])
	for r in keep:
		doc.append("items", {"item_code": r.item_code, "item_name": r.item_name, "qty": r.qty, "rate": r.rate, "note": r.note, "kot_qty": r.kot_qty})
	_recompute(doc)
	_recompute(new)
	doc.save(ignore_permissions=True)
	new.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"source": _order_payload(doc), "new": _order_payload(new)}


@frappe.whitelist()
def cancel_order(order: str):
	"""Abandon an order. Once food has gone to the kitchen only an admin may. A
	part-paid order has a submitted invoice and receipts, so it can't be
	cancelled here — collect the balance (or reverse it in the back office)."""
	_require_fnb("order")
	doc = _open_order(order, for_update=True)
	if doc.items and not core.has_cap("modify"):
		frappe.throw("A waiter can only cancel an order that has no items — ask a cashier.")
	if any(flt(r.kot_qty) > 0 for r in doc.items) and not core.has_cap("supervise"):
		frappe.throw("Items were already sent to the kitchen — ask a manager to cancel this order.")
	if doc.draft_invoice:
		core.discard_draft_invoice(doc.draft_invoice)
		doc.draft_invoice = None
		doc.invoice_doctype = None
	doc.status = "Cancelled"
	doc.save(ignore_permissions=True)
	for k in frappe.get_all("XentraERP KOT", filters={"pos_order": doc.name, "status": ["in", list(ACTIVE_KOT)]}, pluck="name"):
		frappe.db.set_value("XentraERP KOT", k, "status", "Cancelled")
	_complete_reservation(doc.name, "Cancelled")
	frappe.db.commit()
	return {"success": True}


# ------------------------------------------------------------------ billing


def _lines(doc) -> list:
	return [{"item_code": r.item_code, "qty": r.qty, "rate": r.rate} for r in doc.items]


@frappe.whitelist()
def close_bill(order: str):
	"""Close the check: lock the items and return what the guest owes (with the
	server's own tax and rounding) so it can be printed and paid. When checkout
	is set to Draft Invoice + Receipt this also creates the Draft Sales Invoice
	that payment will later submit."""
	_require_fnb("bill")
	doc = _open_order(order, for_update=True)
	if not doc.items:
		frappe.throw("The order has no items to bill.")
	profile = core.get_profile(doc.pos_profile)
	if core.draft_mode():
		if doc.draft_invoice:
			core.discard_draft_invoice(doc.draft_invoice)
		inv = core.create_draft_invoice(profile, _lines(doc), doc.customer, doc.business_date and getdate(doc.business_date))
		doc.draft_invoice, doc.invoice_doctype = inv.name, "Sales Invoice"
		prec = inv.precision("grand_total")
		due = flt(inv.rounded_total or inv.grand_total, prec)
		totals = {"net": flt(inv.net_total, prec), "tax": flt(inv.total_taxes_and_charges, prec), "grand": flt(inv.grand_total, prec),
		          "rounded": flt(inv.rounded_total, prec) if inv.rounded_total else 0, "due": due, "currency": profile.currency,
		          "invoice": inv.name}
	else:
		totals = core.estimate_totals(profile, _lines(doc), doc.customer)
	doc.bill_closed = 1
	doc.bill_closed_at = now_datetime()
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"order": _order_payload(doc), "totals": totals}


@frappe.whitelist()
def reopen_bill(order: str):
	"""Re-open a closed check to add or change items (the waiter or an admin).
	Any Draft Sales Invoice made for it is discarded — it is rebuilt at the next close."""
	_require_fnb("bill")
	doc = _open_order(order, for_update=True)
	if doc.waiter != frappe.session.user and not core.has_cap("supervise"):
		frappe.throw("Only the waiter on this bill, or a manager, can re-open it.", frappe.PermissionError)
	if doc.draft_invoice:
		core.discard_draft_invoice(doc.draft_invoice)
		doc.draft_invoice = None
		doc.invoice_doctype = None
	doc.bill_closed = 0
	doc.bill_closed_at = None
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _order_payload(doc)


@frappe.whitelist()
def bill_totals(order: str):
	"""What is owed on this bill right now (no changes made): the balance for a
	part-paid order, the draft invoice's total once the check is closed, else an estimate."""
	_require_fnb("order")
	doc = frappe.get_doc("XentraERP POS Order", order)
	if doc.status == "Part Paid" and doc.draft_invoice:
		bal = flt(frappe.db.get_value("Sales Invoice", doc.draft_invoice, "outstanding_amount"))
		return {"net": 0, "tax": 0, "grand": bal, "rounded": 0, "due": bal, "partial": True}
	if not doc.items:
		return {"net": 0, "tax": 0, "grand": 0, "rounded": 0, "due": 0}
	if core.draft_mode() and doc.draft_invoice and cint(doc.bill_closed):
		return {"net": 0, "tax": 0, "grand": core.draft_due(doc.draft_invoice), "rounded": 0, "due": core.draft_due(doc.draft_invoice)}
	return core.estimate_totals(core.get_profile(doc.pos_profile), _lines(doc), doc.customer)


@frappe.whitelist()
def bill_order(order: str, payment_method: str | None = None, payments=None, allow_partial: int = 0):
	"""Settle the bill: post the sale, close the order and free its tables.

	With checkout = POS Invoice, one submitted POS Invoice carries the payments.
	With checkout = Draft Invoice + Receipt, the Draft Sales Invoice is submitted
	and one receipt (Payment Entry) per payment leg is created against it. There
	a *partial* payment (`allow_partial=1`) is allowed: the invoice is submitted,
	shows as Partly Paid, and the order becomes Part Paid — the table stays
	occupied and the cashier finishes billing by paying the balance (call this
	again). All-or-nothing per call: if anything can't be posted (stock, payment
	mode, tax setup, no open shift, ...) nothing is committed and the reason is
	returned.

	`payments` = [{mode_of_payment, currency?, tendered}]. `payment_method`
	alone pays everything still owed with that one method."""
	_require_fnb("bill")
	doc = _payable_order(order, for_update=True)
	profile = core.get_profile(doc.pos_profile)

	if doc.status == "Part Paid":
		balance = flt(frappe.db.get_value("Sales Invoice", doc.draft_invoice, "outstanding_amount"))
		if not payments:
			if not payment_method:
				frappe.throw("Choose how the balance is being paid.")
			payments = [{"mode_of_payment": payment_method, "tendered": balance}]
		result = core.settle_invoice(doc.draft_invoice, payments, allow_partial)
		if not result["partial"]:
			doc.status = "Billed"
			doc.total = flt(result["invoice_total"])
			doc.save(ignore_permissions=True)
	else:
		if not doc.items:
			frappe.throw("The order has no items to bill.")
		lines = _lines(doc)
		draft = doc.draft_invoice if (core.draft_mode() and cint(doc.bill_closed) and doc.draft_invoice) else None
		if not payments:
			if not payment_method:
				frappe.throw("Choose how the bill is being paid.")
			due = core.draft_due(draft) if draft else core.estimate_totals(profile, lines, doc.customer)["due"]
			payments = [{"mode_of_payment": payment_method, "tendered": due}]
		result = core.post_invoice(
			profile, lines, payments, customer=doc.customer, business_dt=doc.business_date and getdate(doc.business_date),
			draft_name=draft, allow_partial=allow_partial,
		)
		if result["invoice_doctype"] == "Sales Invoice":
			doc.draft_invoice, doc.invoice_doctype = result["invoice"], "Sales Invoice"
			doc.status = "Part Paid" if result.get("partial") else "Billed"
		else:
			doc.invoice, doc.invoice_doctype, doc.status = result["invoice"], "POS Invoice", "Billed"
		doc.total = flt(result["total"])
		doc.save(ignore_permissions=True)
	if doc.status == "Billed":
		_complete_reservation(doc.name, "Completed")
	frappe.db.commit()
	return {
		**result,
		"table": doc.pos_table,
		"order_status": doc.status,
		"lines": [{"name": r.item_name, "qty": flt(r.qty), "rate": flt(r.rate), "amount": flt(r.amount)} for r in doc.items],
	}


# ------------------------------------------------------------ booking API


def _res_payload(r) -> dict:
	order = frappe.db.get_value("XentraERP POS Order", r.pos_order, ["status", "total"], as_dict=True) if r.pos_order else None
	return {
		"name": r.name,
		"guest": r.guest_name,
		"phone": r.phone or "",
		"party_size": cint(r.party_size),
		"date": str(r.reservation_date),
		"time": _hhmm(r.reservation_time),
		"meal": r.meal,
		"status": r.status,
		"tables": _split_tables(r.tables),
		"order": r.pos_order,
		# What a seated party is doing now: on dine (Open), part paid, or settled.
		"order_status": order.status if order else None,
		"notes": r.notes or "",
		"location": r.location,
	}


@frappe.whitelist()
def list_reservations(date: str | None = None, pos_profile: str | None = None):
	"""The day's bookings for the guests panel, earliest first. Given a register,
	only its location's."""
	_require_fnb("reserve")
	day = str(getdate(date)) if date else str(core.business_date())
	loc = core.location_of(pos_profile) if pos_profile else None
	rows = frappe.get_all(RESERVATION, filters={"reservation_date": day}, fields=["*"], order_by="reservation_time asc, creation asc", limit_page_length=0)
	if loc:
		rows = [r for r in rows if not r.location or r.location == loc.location_code]
	return [_res_payload(r) for r in rows]


def _clean_tables(tables, pos_profile, party_size) -> list:
	if isinstance(tables, str):
		tables = json.loads(tables) if tables.strip().startswith("[") else _split_tables(tables)
	tables = list(dict.fromkeys(tables or []))
	loc = core.location_of(pos_profile) if pos_profile else None
	seats = 0
	for t in tables:
		row = frappe.db.get_value("XentraERP POS Table", t, ["disabled", "seats", "location"], as_dict=True)
		if not row or row.disabled:
			frappe.throw(f"Table {t} isn't available.")
		if loc and row.location and row.location != loc.location_code:
			frappe.throw(f"Table {t} belongs to location {row.location}.")
		seats += cint(row.seats)
	if tables and seats < party_size:
		frappe.throw(f"Those tables seat {seats}, but the party is {party_size}. Add another table.")
	return tables


def _check_clash(tables, when, exclude=None):
	for r in frappe.get_all(
		RESERVATION,
		filters={"status": ["in", ["Booked", "Seated"]], "reservation_date": str(when.date()), "name": ["!=", exclude or ""]},
		fields=["name", "guest_name", "reservation_date", "reservation_time", "tables", "status"],
	):
		if abs(_res_when(r) - when) < CLASH:
			shared = set(_split_tables(r.tables)) & set(tables)
			if shared:
				frappe.throw(f"Table {', '.join(sorted(shared))} is already booked for {r.guest_name} at {_hhmm(r.reservation_time)}.")


@frappe.whitelist()
def save_reservation(
	guest_name: str, party_size: int, reservation_date: str, reservation_time: str, phone: str | None = None,
	tables=None, meal: str | None = None, notes: str | None = None, name: str | None = None, pos_profile: str | None = None,
):
	"""Book a party for a date and time, optionally holding tables for them.
	A table already booked within 90 minutes of that time is refused."""
	_require_fnb("reserve")
	guest_name = (guest_name or "").strip()
	if not guest_name:
		frappe.throw("Enter the guest's name.")
	party_size = cint(party_size)
	if not 1 <= party_size <= 200:
		frappe.throw("Party size must be between 1 and 200.")
	try:
		when = get_datetime(f"{getdate(reservation_date)} {reservation_time}")
	except Exception:
		frappe.throw("Enter a valid date and time.")
	if getdate(when) < core.business_date():
		frappe.throw("That date has already passed.")
	tables = _clean_tables(tables, pos_profile, party_size)
	_check_clash(tables, when, exclude=name)
	if meal not in ("Breakfast", "Lunch", "Dinner", "Other"):
		meal = "Breakfast" if when.hour < 11 else "Lunch" if when.hour < 16 else "Dinner"
	loc = core.location_of(pos_profile) if pos_profile else None
	values = {
		"guest_name": guest_name, "phone": (phone or "").strip(), "party_size": party_size, "reservation_date": str(when.date()),
		"reservation_time": when.strftime("%H:%M:%S"), "meal": meal, "tables": ",".join(tables), "notes": (notes or "").strip()[:300],
		"location": core.location_code(loc),
	}
	if name:
		doc = frappe.get_doc(RESERVATION, name)
		if doc.status != "Booked":
			frappe.throw(f"A {doc.status.lower()} booking can't be changed.")
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": RESERVATION, "status": "Booked", **values})
		doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return _res_payload(doc)


def _booked(name: str):
	if not frappe.db.exists(RESERVATION, name):
		frappe.throw("No such booking.")
	doc = frappe.get_doc(RESERVATION, name)
	if doc.status != "Booked":
		frappe.throw(f"This booking is already {doc.status.lower()}.")
	return doc


@frappe.whitelist()
def cancel_reservation(name: str):
	_require_fnb("reserve")
	doc = _booked(name)
	doc.status = "Cancelled"
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _res_payload(doc)


@frappe.whitelist()
def mark_no_show(name: str):
	_require_fnb("reserve")
	doc = _booked(name)
	doc.status = "No Show"
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _res_payload(doc)


@frappe.whitelist()
def seat_reservation(name: str, pos_profile: str, tables=None):
	"""The party has arrived: open their table (joining several for a big party)
	and start the order. `tables` overrides the ones held for them."""
	_require_fnb("reserve")
	doc = _booked(name)
	chosen = _clean_tables(tables, pos_profile, cint(doc.party_size)) if tables else _split_tables(doc.tables)
	if not chosen:
		frappe.throw("Choose a table to seat this party at.")
	for t in chosen:
		if _orders_touching(t):
			frappe.throw(f"Table {t} is occupied.")
	order = open_order(chosen[0], pos_profile, cint(doc.party_size), None, 0, "Dine In", doc.guest_name, doc.phone)
	for extra in chosen[1:]:
		order = _merge_tables(order["name"], extra)
	doc.status = "Seated"
	doc.tables = ",".join(chosen)
	doc.pos_order = order["name"]
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"reservation": _res_payload(doc), "order": order}
