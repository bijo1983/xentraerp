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

import frappe
from frappe.utils import cint, flt, getdate, now_datetime

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


def _require_fnb():
	core.require_pos_user()
	if core.settings()["pos_mode"] != "F&B":
		frappe.throw("Table service isn't enabled — this organization's POS is in Retail mode.")


def _lock_table(table: str):
	"""Serialise concurrent opens/transfers/merges touching the same table."""
	frappe.db.sql("select name from `tabXentraERP POS Table` where name=%s for update", (table,))


def _split_tables(csv) -> list:
	return [t.strip() for t in (csv or "").split(",") if t.strip()]


def _tables_of(order) -> set:
	"""Every table an open order occupies: its own plus any merged in."""
	return {order.pos_table, *_split_tables(order.merged_tables)}


def _open_orders() -> list:
	return frappe.get_all(
		"XentraERP POS Order",
		filters={"status": "Open"},
		fields=["name", "pos_table", "merged_tables", "guests", "total", "creation", "waiter", "bill_closed", "business_date"],
		order_by="creation asc",
		limit_page_length=0,
	)


def _orders_touching(table: str) -> list:
	return [o for o in _open_orders() if table in _tables_of(o)]


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
def list_tables():
	"""Every table with its live status and the open bills sitting on it."""
	_require_fnb()
	tables = frappe.get_all(
		"XentraERP POS Table",
		fields=["name", "zone", "seats", "reserved", "disabled"],
		order_by="zone asc, name asc",
		limit_page_length=0,
	)
	orders = _open_orders()
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
				"seats": cint(t.seats),
				"reserved": cint(t.reserved),
				"disabled": cint(t.disabled),
				"status": _table_status(t.disabled, t.reserved, bool(here)),
				# `order` = the first bill here (kept for simple callers); `orders` = all of them.
				"order": first.name if first else None,
				"orders": [
					{
						"name": o.name,
						"guests": cint(o.guests),
						"total": flt(o.total),
						"waiter": o.waiter,
						"bill_closed": cint(o.bill_closed),
						"merged": o.pos_table != t.name,
						"primary_table": o.pos_table,
						"kots_pending": pending.get(o.name, 0),
					}
					for o in here
				],
				"guests": sum(cint(o.guests) for o in here),
				"total": sum(flt(o.total) for o in here),
				"since": str(first.creation) if first else None,
				"waiter": first.waiter if first else None,
				"kots_pending": sum(pending.get(o.name, 0) for o in here),
			}
		)
	return out


@frappe.whitelist()
def save_table(table_name: str, zone: str | None = None, seats: int = 4, reserved: int = 0, disabled: int = 0):
	"""Admin: add a table, or update an existing one (its name is its identity)."""
	core.require_manager()
	table_name = (table_name or "").strip()
	if not table_name or len(table_name) > 40 or any(c in table_name for c in "/\\#?%"):
		frappe.throw("Give the table a short name (up to 40 characters), e.g. T1 or Patio 3.")
	seats = cint(seats)
	if not 1 <= seats <= 99:
		frappe.throw("Seats must be between 1 and 99.")
	values = {"zone": (zone or "").strip(), "seats": seats, "reserved": cint(bool(cint(reserved))), "disabled": cint(bool(cint(disabled)))}
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
	core.require_manager()
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
	_require_fnb()
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
		"merged_tables": _split_tables(doc.merged_tables),
		"pos_profile": doc.pos_profile,
		"status": doc.status,
		"guests": cint(doc.guests),
		"customer": doc.customer,
		"waiter": doc.waiter,
		"total": flt(doc.total),
		"invoice": doc.invoice,
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
			"pos_profile": source["pos_profile"],
			"status": "Open",
			"guests": 0,
			"customer": source.get("customer"),
			"waiter": source.get("waiter"),
			"business_date": source.get("business_date"),
		}
	)


@frappe.whitelist()
def open_order(table: str, pos_profile: str, guests: int = 1, customer: str | None = None, new_bill: int = 0):
	"""Seat a party: start the table's order, or return the one already open.
	`new_bill=1` starts an additional bill on an occupied table."""
	_require_fnb()
	_lock_table(table)
	tdoc = frappe.db.get_value("XentraERP POS Table", table, ["disabled"], as_dict=True)
	if not tdoc:
		frappe.throw("No such table.")
	if tdoc.disabled:
		frappe.throw("This table is disabled.")
	here = _orders_touching(table)
	if here and not cint(new_bill):
		return _order_payload(frappe.get_doc("XentraERP POS Order", here[0].name))
	if here and any(o.pos_table != table for o in here) and not any(o.pos_table == table for o in here):
		frappe.throw("This table is part of a merged party. Use that party's bill.")
	core.get_profile(pos_profile)
	doc = frappe.get_doc(
		{
			"doctype": "XentraERP POS Order",
			"pos_table": table,
			"pos_profile": pos_profile,
			"status": "Open",
			"guests": max(1, cint(guests)),
			"customer": customer or None,
			"waiter": frappe.session.user,
			# The bill belongs to the trading day it was started on, however late it is settled.
			"business_date": core.business_date(),
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.set_value("XentraERP POS Table", table, "reserved", 0)
	frappe.db.commit()
	return _order_payload(doc)


@frappe.whitelist()
def get_order(order: str):
	_require_fnb()
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
	_require_fnb()
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
	frappe.db.commit()
	return _order_payload(doc)


# ---------------------------------------------------------------------- KOT


@frappe.whitelist()
def send_kot(order: str):
	"""Send everything added since the last KOT to the kitchen as one ticket."""
	_require_fnb()
	doc = _open_order(order, for_update=True)
	_editable(doc)
	fresh = []
	for r in doc.items:
		delta = flt(r.qty) - flt(r.kot_qty)
		if delta > 0:
			fresh.append({"item_code": r.item_code, "item_name": r.item_name, "qty": delta, "note": r.note or ""})
			r.kot_qty = flt(r.qty)
	if not fresh:
		frappe.throw("Nothing new to send to the kitchen.")
	kot = frappe.get_doc(
		{
			"doctype": "XentraERP KOT",
			"pos_order": doc.name,
			"pos_table": doc.pos_table,
			"pos_profile": doc.pos_profile,
			"status": "New",
			"created_by": frappe.session.user,
			"items": fresh,
		}
	)
	kot.insert(ignore_permissions=True)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"kot": kot.name, "table": doc.pos_table, "order": doc.name, "items": fresh, "created": str(kot.creation)}


def _kot_payload(k) -> dict:
	return {
		"name": k.name,
		"order": k.pos_order,
		"table": k.pos_table,
		"status": k.status,
		"created": str(k.creation),
		"items": [{"item_code": i.item_code, "item_name": i.item_name, "qty": flt(i.qty), "note": i.note or ""} for i in k.items],
	}


@frappe.whitelist()
def list_kots(statuses=None):
	"""Tickets for the kitchen screen — oldest first. Active ones by default."""
	_require_fnb()
	if isinstance(statuses, str):
		try:
			statuses = json.loads(statuses)
		except ValueError:
			statuses = [statuses]
	wanted = [s for s in (statuses or ACTIVE_KOT) if s in ("New", "Preparing", "Ready", "Served", "Cancelled")]
	rows = frappe.get_all("XentraERP KOT", filters={"status": ["in", wanted]}, fields=["name"], order_by="creation asc", limit_page_length=200)
	return [_kot_payload(frappe.get_doc("XentraERP KOT", r.name)) for r in rows]


@frappe.whitelist()
def set_kot_status(kot: str, status: str):
	_require_fnb()
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
	_require_fnb()
	doc = _open_order(order, for_update=True)
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
	_require_fnb()
	doc = _open_order(order, for_update=True)
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
		merge_orders(doc.name, o.name)
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
	_require_fnb()
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
	_require_fnb()
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
	_require_fnb()
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
	"""Abandon an order. Once food has gone to the kitchen only an admin may."""
	_require_fnb()
	doc = _open_order(order, for_update=True)
	if any(flt(r.kot_qty) > 0 for r in doc.items) and not core.is_manager():
		frappe.throw("Items were already sent to the kitchen — ask a manager to cancel this order.")
	doc.status = "Cancelled"
	doc.save(ignore_permissions=True)
	for k in frappe.get_all("XentraERP KOT", filters={"pos_order": doc.name, "status": ["in", list(ACTIVE_KOT)]}, pluck="name"):
		frappe.db.set_value("XentraERP KOT", k, "status", "Cancelled")
	frappe.db.commit()
	return {"success": True}


# ------------------------------------------------------------------ billing


def _lines(doc) -> list:
	return [{"item_code": r.item_code, "qty": r.qty, "rate": r.rate} for r in doc.items]


@frappe.whitelist()
def close_bill(order: str):
	"""Close the check: lock the items and return what the guest owes (with
	the server's own tax and rounding) so it can be printed and paid."""
	_require_fnb()
	doc = _open_order(order, for_update=True)
	if not doc.items:
		frappe.throw("The order has no items to bill.")
	totals = core.estimate_totals(core.get_profile(doc.pos_profile), _lines(doc), doc.customer)
	doc.bill_closed = 1
	doc.bill_closed_at = now_datetime()
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"order": _order_payload(doc), "totals": totals}


@frappe.whitelist()
def reopen_bill(order: str):
	"""Re-open a closed check to add or change items (the waiter or an admin)."""
	_require_fnb()
	doc = _open_order(order, for_update=True)
	if doc.waiter != frappe.session.user and not core.is_manager():
		frappe.throw("Only the waiter on this bill, or a manager, can re-open it.", frappe.PermissionError)
	doc.bill_closed = 0
	doc.bill_closed_at = None
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _order_payload(doc)


@frappe.whitelist()
def bill_totals(order: str):
	"""What this bill comes to right now (no changes made)."""
	_require_fnb()
	doc = frappe.get_doc("XentraERP POS Order", order)
	if not doc.items:
		return {"net": 0, "tax": 0, "grand": 0, "rounded": 0, "due": 0}
	return core.estimate_totals(core.get_profile(doc.pos_profile), _lines(doc), doc.customer)


@frappe.whitelist()
def bill_order(order: str, payment_method: str | None = None, payments=None):
	"""Settle the bill: create and submit the real POS Invoice (one or more
	payments, possibly in several currencies — see pos_core.post_invoice),
	close the order and free its tables. All-or-nothing: if the invoice can't
	be posted (stock, payment mode, tax setup, no open shift, ...) nothing is
	committed, the order stays open, and the reason is returned.

	`payments` = [{mode_of_payment, currency?, tendered}]. For the simple
	case, `payment_method` alone pays the whole bill with that one method."""
	_require_fnb()
	doc = _open_order(order, for_update=True)
	if not doc.items:
		frappe.throw("The order has no items to bill.")
	profile = core.get_profile(doc.pos_profile)
	if not payments:
		if not payment_method:
			frappe.throw("Choose how the bill is being paid.")
		due = core.estimate_totals(profile, _lines(doc), doc.customer)["due"]
		payments = [{"mode_of_payment": payment_method, "tendered": due}]
	result = core.post_invoice(
		profile, _lines(doc), payments, customer=doc.customer, business_dt=doc.business_date and getdate(doc.business_date)
	)
	doc.status = "Billed"
	doc.invoice = result["invoice"]
	doc.total = flt(result["total"])
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {
		**result,
		"table": doc.pos_table,
		"lines": [{"name": r.item_name, "qty": flt(r.qty), "rate": flt(r.rate), "amount": flt(r.amount)} for r in doc.items],
	}
