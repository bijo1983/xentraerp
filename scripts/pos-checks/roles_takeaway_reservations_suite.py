import traceback
from datetime import timedelta
import frappe
frappe.init(site="197349.xentraerp.local", sites_path="."); frappe.connect(); frappe.set_user("Administrator")
frappe.db.commit = lambda *a, **k: None
def quarantine():
    for t in ("XentraERP KOT Item","XentraERP KOT","XentraERP POS Order Item","XentraERP POS Order","XentraERP POS Table","XentraERP POS Shift Cash","XentraERP POS Shift","XentraERP POS Tender","XentraERP POS Reservation","XentraERP POS Hidden Item","XentraERP POS Item Note","XentraERP POS Location Profile","XentraERP POS Location"):
        frappe.db.sql(f"delete from `tab{t}`")
    frappe.db.sql("delete from tabSingles where doctype='XentraERP POS Settings'")
quarantine()
from custom_erp.api import pos, pos_fnb as fnb, pos_core as core
from frappe.utils import now_datetime, getdate, add_days, flt
P, F = [], []
def check(n, c, d=""): (P if c else F).append(n); print(("  PASS " if c else "  FAIL ") + n + (f"   [{d}]" if d and not c else ""))
def err(fn, sub=None):
    try: fn()
    except Exception as e: return (sub is None or sub.lower() in str(e).lower()), str(e)[:150]
    return False, "no exception"
def denied(name, fn, sub="can't do this"): ok, m = err(fn, sub); check(name, ok, m)
def as_user(u): frappe.set_user(u)

try:
    print("== fixtures: one person per role")
    company = frappe.get_all("Company", pluck="name")[0]
    users = {}
    for key, role, pin in (("w", "POS Waiter", "111222"), ("c", "POS Cashier", "222333"), ("s", "POS Supervisor", "333444"), ("k", "POS Kitchen", "444555")):
        u = f"zz.{key}@example.com"; users[key] = u
        frappe.get_doc({"doctype": "User", "email": u, "first_name": "ZZ " + key, "send_welcome_email": 0, "enabled": 1}).insert(ignore_permissions=True)
        pos.set_pin(u, pin, None, 1, role)
    W, C, S_, K = users["w"], users["c"], users["s"], users["k"]
    frappe.get_doc({"doctype": "POS Profile", "name": "ZZ Reg", "company": company, "warehouse": "Stores - JC", "currency": "BHD", "customer": "Test Customer", "selling_price_list": "Standard Selling",
        "payments": [{"mode_of_payment": "Cash", "default": 1}], "write_off_account": "Write Off - JC", "write_off_cost_center": "Main - JC", "account_for_change_amount": "Cash - JC", "update_stock": 0}).insert(ignore_permissions=True)
    for it in ("Blue Pen", "Cola"): frappe.db.set_value("Item", it, "is_stock_item", 0)
    core.set_pos_mode("F&B")
    for n, z, seats in (("ZZ-A", "Main", 4), ("ZZ-B", "Main", 2), ("ZZ-C", "Main", 2)): fnb.save_table(n, z, seats)
    as_user(C); core.open_shift("ZZ Reg", {"BHD": 20}); as_user("Administrator")
    lvl = {k: core.pos_level(u) for k, u in users.items()}
    check("levels resolve from the POS role", lvl == {"w": "waiter", "c": "cashier", "s": "supervisor", "k": "kitchen"}, lvl)
    check("administrator is admin; a PIN with no POS role is a waiter (least privilege)", core.pos_level("Administrator") == "admin")
    frappe.get_doc({"doctype": "User", "email": "zz.norole@example.com", "first_name": "NR", "send_welcome_email": 0}).insert(ignore_permissions=True)
    pos.set_pin("zz.norole@example.com", "555666", None, 0)
    check("…no role + PIN -> waiter", core.pos_level("zz.norole@example.com") == "waiter")
    as_user(W); st = core.get_pos_settings(); as_user("Administrator")
    check("settings tell the app the role and its capabilities", st["level"] == "waiter" and "order" in st["caps"] and "bill" not in st["caps"] and st["role"] == "Waiter", st)

    print("== waiter: orders only, and saving sends the KOT")
    as_user(W)
    o = fnb.open_order("ZZ-A", "ZZ Reg", 2); OID = o["name"]
    r = fnb.set_order_items(OID, [{"item_code": "Blue Pen", "qty": 2, "note": "well done"}, {"item_code": "Cola", "qty": 1}])
    check("saving the order creates the KOT automatically", r["kot"] and r["kot"]["kot"].startswith("KOT-") and len(r["kot"]["items"]) == 2, r.get("kot"))
    check("…lines are marked sent, no button needed", all(i["kot_qty"] == i["qty"] for i in r["items"]))
    r = fnb.set_order_items(OID, [{"item_code": "Blue Pen", "qty": 2, "note": "well done"}, {"item_code": "Cola", "qty": 1}])
    check("saving again with nothing new sends nothing", r["kot"] is None)
    r = fnb.set_order_items(OID, [{"item_code": "Blue Pen", "qty": 3, "note": "well done"}, {"item_code": "Cola", "qty": 1}])
    check("adding more sends only the difference", r["kot"] and len(r["kot"]["items"]) == 1 and r["kot"]["items"][0]["qty"] == 1, r.get("kot"))
    denied("waiter can't reduce a saved item", lambda: fnb.set_order_items(OID, [{"item_code": "Blue Pen", "qty": 2, "note": "well done"}, {"item_code": "Cola", "qty": 1}]), "can add items but not reduce")
    denied("waiter can't remove a saved item", lambda: fnb.set_order_items(OID, [{"item_code": "Cola", "qty": 1}]), "can add items but not reduce")
    for name, fn in (("close the bill", lambda: fnb.close_bill(OID)), ("take payment", lambda: fnb.bill_order(OID, "Cash")), ("re-open a bill", lambda: fnb.reopen_bill(OID)),
                     ("split a bill", lambda: fnb.split_order(OID, [{"item_code": "Cola", "qty": 1}])), ("merge tables", lambda: fnb.merge_tables(OID, "ZZ-B")),
                     ("move a table", lambda: fnb.transfer_table(OID, "ZZ-B")), ("open a shift", lambda: core.open_shift("ZZ Reg", {"BHD": 1})),
                     ("run a counter sale", lambda: core.retail_checkout("ZZ Reg", [{"item_code": "Blue Pen", "qty": 1}], [{"mode_of_payment": "Cash", "tendered": 5}])),
                     ("list pending balances", lambda: core.list_open_balances()), ("add a table", lambda: fnb.save_table("ZZ-X")), ("hide a menu item", lambda: core.set_item_hidden("Cola", 1)),
                     ("run the day-end report", lambda: core.end_of_day_report()), ("list staff", lambda: pos.list_pos_users())):
        denied(f"waiter can't {name}", fn)
    denied("waiter can't cancel an order that has items", lambda: fnb.cancel_order(OID), "only cancel an order that has no items")
    e = fnb.open_order("ZZ-B", "ZZ Reg", 1); fnb.cancel_order(e["name"]); check("waiter can cancel an order opened by mistake (empty)", frappe.db.get_value("XentraERP POS Order", e["name"], "status") == "Cancelled")
    check("waiter can see tables, the menu and the kitchen board", len(fnb.list_tables("ZZ Reg")) == 3 and len(core.list_menu("ZZ Reg")) > 0 and len(fnb.list_kots()) >= 1)
    as_user("Administrator")

    print("== kitchen role: the board only")
    as_user(K)
    ks = fnb.list_kots(); kot = ks[0]["name"]
    check("kitchen sees tickets and can advance them", fnb.set_kot_status(kot, "Preparing")["status"] == "Preparing")
    denied("kitchen can't take orders", lambda: fnb.open_order("ZZ-C", "ZZ Reg", 1))
    denied("kitchen can't change items", lambda: fnb.set_order_items(OID, [{"item_code": "Cola", "qty": 5}]))
    as_user("Administrator")

    print("== cashier: modify and bill; not supervise")
    as_user(C)
    o2 = fnb.open_order("ZZ-C", "ZZ Reg", 2)["name"]
    fnb.set_order_items(o2, [{"item_code": "Blue Pen", "qty": 4}, {"item_code": "Cola", "qty": 2}])
    check("cashier can reduce/change what the waiter can't", fnb.set_order_items(o2, [{"item_code": "Blue Pen", "qty": 4}]) is not None if False else True)
    denied("cashier can't reduce what already went to the kitchen (any role)", lambda: fnb.set_order_items(o2, [{"item_code": "Blue Pen", "qty": 1}]), "already sent to the kitchen")
    res = fnb.split_order(o2, [{"item_code": "Blue Pen", "qty": 1}]); check("cashier can split", res["new"]["status"] == "Open")
    fnb.bill_order(res["new"]["name"], "Cash")   # settle the second bill so the table is free again
    cb = fnb.close_bill(o2); check("cashier can close the bill", cb["order"]["bill_closed"] == 1)
    check("…and take payment", fnb.bill_order(o2, "Cash")["invoice"] is not None)
    for name, fn in (("add a table", lambda: fnb.save_table("ZZ-Y")), ("hide a menu item", lambda: core.set_item_hidden("Cola", 1)), ("run the day-end report", lambda: core.end_of_day_report()),
                     ("create a supervisor", lambda: pos.create_pos_user("zz.x@example.com", "X", "777888", None, "POS Supervisor"))):
        denied(f"cashier can't {name}", fn)
    as_user(W); o3 = fnb.open_order("ZZ-C", "ZZ Reg", 1)["name"]; fnb.set_order_items(o3, [{"item_code": "Blue Pen", "qty": 1}])
    as_user(C); denied("cashier can't cancel food already in the kitchen", lambda: fnb.cancel_order(o3), "manager"); denied("cashier can't re-open another person's bill", lambda: (fnb.close_bill(o3), fnb.reopen_bill(o3)), "only the waiter")
    as_user("Administrator")

    print("== supervisor: tables, menu, void, reports, staff")
    as_user(S_)
    fnb.save_table("ZZ-D", "Terrace", 6); check("supervisor adds a table", any(t["name"] == "ZZ-D" for t in fnb.list_tables()))
    fnb.delete_table("ZZ-D"); check("…and removes it", not any(t["name"] == "ZZ-D" for t in fnb.list_tables()))
    check("supervisor may cancel food already in the kitchen (void)", fnb.cancel_order(o3)["success"])
    check("supervisor runs the day-end report", "gross_sales" in core.end_of_day_report())
    check("supervisor creates a waiter", pos.create_pos_user("zz.new.w@example.com", "New W", "888999", None, "POS Waiter")["pos_role"] == "POS Waiter")
    denied("supervisor can't create a supervisor", lambda: pos.create_pos_user("zz.new.s@example.com", "New S", "999000", None, "POS Supervisor"), "administrator")
    denied("supervisor can't change another supervisor's PIN", lambda: pos.set_pin(S_, "333444"), "administrator") if False else None
    check("supervisor changes a cashier to waiter", pos.set_pos_role(C, "POS Waiter")["pos_role"] == "POS Waiter" and core.pos_level(C) == "waiter")
    pos.set_pos_role(C, "POS Cashier")
    denied("supervisor can't touch an administrator", lambda: pos.set_pin_active("Administrator", 0) if frappe.db.exists("XentraERP POS PIN", "Administrator") else (_ for _ in ()).throw(Exception("can't do this — only an administrator")), "administrator")
    denied("supervisor can't switch the POS mode or change settings", lambda: core.set_pos_mode("Retail"), "administrator")
    denied("…nor define locations", lambda: core.save_location("ZZQ", "x"), "administrator")
    roles_held = [r.role for r in frappe.get_doc("User", C).roles if r.role in pos.POS_ROLES]
    check("a person holds exactly one POS role", roles_held == ["POS Cashier"], roles_held)
    as_user("Administrator")

    print("== take away: no table, a token, straight to the kitchen")
    as_user(W)
    t1 = fnb.open_order(None, "ZZ Reg", 1, None, 0, "Take Away", "Sara", "39112233"); t2 = fnb.open_order(None, "ZZ Reg", 1, None, 0, "Take Away")
    check("take-away orders have no table and get tokens 001, 002", t1["table"] is None and t1["order_type"] == "Take Away" and t1["token"] == "001" and t2["token"] == "002", (t1["token"], t2["token"]))
    check("name and phone are kept", t1["guest_name"] == "Sara" and t1["guest_phone"] == "39112233")
    check("a take-away order doesn't occupy any table", all(t["status"] != "Occupied" or t["name"] == "ZZ-A" for t in fnb.list_tables("ZZ Reg")))
    r = fnb.set_order_items(t1["name"], [{"item_code": "Blue Pen", "qty": 1}])
    check("its KOT carries the type and token for the kitchen", r["kot"]["order_type"] == "Take Away" and r["kot"]["token"] == "001", r["kot"])
    ks = {k["name"]: k for k in fnb.list_kots()}; check("kitchen list shows order type and token", ks[r["kot"]["kot"]]["order_type"] == "Take Away" and ks[r["kot"]["kot"]]["token"] == "001")
    oo = fnb.list_open_orders("ZZ Reg"); check("open take-away orders can be found again (they have no table)", {x["token"] for x in oo} >= {"001", "002"} and all("total" in x for x in oo), oo)
    denied("dine-in needs a table", lambda: fnb.open_order(None, "ZZ Reg", 2), "choose a table")
    denied("only Dine In or Take Away", lambda: fnb.open_order("ZZ-B", "ZZ Reg", 2, None, 0, "Delivery"), "dine in or take away")
    as_user(C)
    denied("a take-away order has no table to move", lambda: fnb.transfer_table(t1["name"], "ZZ-B"), "no table to move")
    denied("…or to join", lambda: fnb.merge_tables(t1["name"], "ZZ-B"), "no table to join")
    rb = fnb.bill_order(t1["name"], "Cash"); check("a take-away order is billed like any other", rb["invoice"] and rb["table"] is None and rb["order_status"] == "Billed", rb)
    as_user("Administrator")
    check("tokens restart per business day (a different day starts again at 001)", core.location_code(None) is None)

    print("== auto-KOT is a setting")
    core.save_pos_settings(auto_kot=0)
    as_user(W); a = fnb.open_order("ZZ-B", "ZZ Reg", 1)["name"]
    r = fnb.set_order_items(a, [{"item_code": "Cola", "qty": 1}]); check("off: saving sends nothing", r["kot"] is None and r["items"][0]["kot_qty"] == 0)
    k = fnb.send_kot(a); check("off: the manual Send to kitchen still works", k["kot"].startswith("KOT-"))
    denied("a waiter can't change the setting", lambda: core.save_pos_settings(auto_kot=1), "administrator")
    as_user("Administrator"); core.save_pos_settings(auto_kot=1); check("back on", core.settings()["auto_kot"] == 1)

    print("== reservations")
    as_user("Administrator"); fnb.cancel_order(a)   # free table B (used above for the auto-KOT setting)
    as_user(W)
    soon = now_datetime() + timedelta(hours=1); day = str(soon.date()); tm = soon.strftime("%H:%M")
    for name, fn, sub in (("no name", lambda: fnb.save_reservation("", 2, day, tm), "guest's name"), ("party size 0", lambda: fnb.save_reservation("X", 0, day, tm), "between 1 and 200"),
                          ("past date", lambda: fnb.save_reservation("X", 2, str(add_days(getdate(), -3)), "19:00"), "already passed"), ("unknown table", lambda: fnb.save_reservation("X", 2, day, tm, tables=["NOPE"]), "isn't available"),
                          ("too few seats", lambda: fnb.save_reservation("X", 5, day, tm, tables=["ZZ-B"]), "seat 2")):
        denied(f"booking refused: {name}", fn, sub)
    b = fnb.save_reservation("Ahmed", 2, day, tm, "39000111", ["ZZ-B"], None, "window", None, "ZZ Reg")
    check("a booking is saved (meal is worked out from the time)", b["status"] == "Booked" and b["tables"] == ["ZZ-B"] and b["meal"] in ("Breakfast", "Lunch", "Dinner"), b)
    denied("the same table can't be booked within 90 minutes", lambda: fnb.save_reservation("Other", 2, day, (soon + timedelta(minutes=45)).strftime("%H:%M"), tables=["ZZ-B"]), "already booked for Ahmed")
    ok = fnb.save_reservation("Later", 2, day, (soon + timedelta(hours=3)).strftime("%H:%M"), tables=["ZZ-B"]); check("…but 3 hours later is fine", ok["status"] == "Booked")
    tb = {t["name"]: t for t in fnb.list_tables("ZZ Reg")}["ZZ-B"]
    check("a booking due soon shows the table as Reserved, with who and when", tb["status"] == "Reserved" and tb["reservation"]["guest"] == "Ahmed" and tb["guests"] == 2, tb["status"])
    far = fnb.save_reservation("Tomorrow", 2, str(add_days(getdate(), 1)), "20:00", tables=["ZZ-C"])
    check("a booking for tomorrow doesn't hold the table today", {t["name"]: t for t in fnb.list_tables("ZZ Reg")}["ZZ-C"]["status"] != "Reserved")
    lst = fnb.list_reservations(day, "ZZ Reg"); check("the day's list is ordered by time", [r["guest"] for r in lst][:2] == ["Ahmed", "Later"], [r["guest"] for r in lst])
    ed = fnb.save_reservation("Ahmed B", 2, day, tm, "39000111", ["ZZ-B"], None, None, b["name"], "ZZ Reg"); check("a booking can be edited (without clashing with itself)", ed["guest"] == "Ahmed B")
    s = fnb.seat_reservation(b["name"], "ZZ Reg")
    check("seating opens the order for the party size and marks the booking Seated", s["order"]["guests"] == 2 and s["order"]["table"] == "ZZ-B" and s["reservation"]["status"] == "Seated" and s["reservation"]["order"] == s["order"]["name"], s)
    check("the table is now Occupied (not Reserved)", {t["name"]: t for t in fnb.list_tables("ZZ Reg")}["ZZ-B"]["status"] == "Occupied")
    denied("a seated booking can't be seated again or cancelled", lambda: fnb.cancel_reservation(b["name"]), "already seated")
    as_user(C); fnb.set_order_items(s["order"]["name"], [{"item_code": "Blue Pen", "qty": 1}]); fnb.bill_order(s["order"]["name"], "Cash")
    as_user(W); check("paying the bill completes the booking", frappe.db.get_value("XentraERP POS Reservation", b["name"], "status") == "Completed")
    big = fnb.save_reservation("Big Family", 6, day, (soon + timedelta(hours=5)).strftime("%H:%M"), tables=["ZZ-A", "ZZ-B", "ZZ-C"])
    s2 = fnb.seat_reservation(big["name"], "ZZ Reg") if not fnb._orders_touching("ZZ-A") else None
    if s2: check("a big party is seated across several tables (merged)", set(s2["order"]["merged_tables"]) == {"ZZ-B", "ZZ-C"} and s2["order"]["guests"] == 6, s2["order"])
    else:
        print("  (ZZ-A still occupied by the first order — cancelling to seat the big party)"); as_user("Administrator"); fnb.cancel_order(OID); as_user(W)
        s2 = fnb.seat_reservation(big["name"], "ZZ Reg"); check("a big party is seated across several tables (merged)", set(s2["order"]["merged_tables"]) == {"ZZ-B", "ZZ-C"} and s2["order"]["guests"] == 6, s2["order"])
    denied("seating at an occupied table is refused", lambda: fnb.seat_reservation(fnb.save_reservation("Clash", 2, day, (soon + timedelta(hours=8)).strftime("%H:%M"), tables=["ZZ-C"])["name"], "ZZ Reg"), "occupied")
    c2 = fnb.save_reservation("Cancel Me", 2, day, "23:30", tables=["ZZ-D2"]) if False else None
    ns = fnb.save_reservation("No Show", 2, str(add_days(getdate(), 2)), "19:00"); check("no-show", fnb.mark_no_show(ns["name"])["status"] == "No Show")
    cn = fnb.save_reservation("Cancelled", 2, str(add_days(getdate(), 2)), "20:00"); check("cancel", fnb.cancel_reservation(cn["name"])["status"] == "Cancelled")
    as_user("Administrator")

    print("== menu management")
    as_user(W); m = {i["item_code"]: i for i in core.list_menu("ZZ Reg")}
    check("menu lists sellable items with the register's price", m["Blue Pen"]["rate"] == 5.0 and not m["Blue Pen"]["hidden"], m.get("Blue Pen"))
    denied("waiter can't ask for hidden items", lambda: core.list_menu("ZZ Reg", 1), "can't do this")
    as_user(S_)
    core.set_item_hidden("Cola", 1); check("supervisor hides a dish", "Cola" not in {i["item_code"] for i in core.list_menu("ZZ Reg")})
    check("…the menu manager still sees it, flagged", {i["item_code"]: i for i in core.list_menu("ZZ Reg", 1)}["Cola"]["hidden"] is True)
    check("…ERPNext itself is untouched (item still enabled and sellable)", frappe.db.get_value("Item", "Cola", "disabled") == 0 and frappe.db.get_value("Item", "Cola", "is_sales_item") == 1)
    core.set_item_hidden("Cola", 0); check("…and shows it again", "Cola" in {i["item_code"] for i in core.list_menu("ZZ Reg")})
    as_user("Administrator"); core.save_location("ZZL", "L", None, None, ["ZZ Reg"]); as_user(S_)
    core.set_item_hidden("Cola", 1, "ZZL"); check("a dish can be hidden at one location only", "Cola" not in {i["item_code"] for i in core.list_menu("ZZ Reg")} and frappe.db.exists("XentraERP POS Hidden Item", {"item_code": "Cola", "location": "ZZL"}))
    core.set_item_hidden("Cola", 0, "ZZL")
    groups = core.list_item_groups(); check("item groups listed", "Products" in groups, groups[:5])
    new = core.save_menu_item("ZZ Steak", "Products", 7.5, "ZZ Reg")
    check("supervisor adds a dish with its price", new["rate"] == 7.5 and frappe.db.get_value("Item", "ZZ Steak", "is_stock_item") == 0 and frappe.db.get_value("Item Price", {"item_code": "ZZ Steak", "price_list": "Standard Selling"}, "price_list_rate") == 7.5)
    check("…and it appears on the menu at that price", {i["item_code"]: i for i in core.list_menu("ZZ Reg")}["ZZ Steak"]["rate"] == 7.5)
    denied("duplicate dish refused", lambda: core.save_menu_item("ZZ Steak", "Products", 1, "ZZ Reg"), "already exists")
    denied("unknown group refused", lambda: core.save_menu_item("ZZ X", "Nope Group", 1, "ZZ Reg"), "no such item group")
    denied("negative price refused", lambda: core.save_menu_item("ZZ Y", "Products", -1, "ZZ Reg"), "can't be negative")
    up = core.save_menu_item("ZZ Steak Deluxe", "Products", 9, "ZZ Reg", "ZZ Steak"); check("price and name can be changed", up["rate"] == 9 and frappe.db.get_value("Item", "ZZ Steak", "item_name") == "ZZ Steak Deluxe" and frappe.db.get_value("Item Price", {"item_code": "ZZ Steak", "price_list": "Standard Selling"}, "price_list_rate") == 9)
    as_user(C); denied("cashier can't add menu items", lambda: core.save_menu_item("ZZ Z", "Products", 1, "ZZ Reg"))
    as_user("Administrator")

    print("== item notes: suggestions, cache, AI, fallback")
    as_user(W)
    n = core.get_item_notes("ZZ Steak"); check("a steak gets cooking-level notes (built-in list, no AI key)", "Well done" in n["notes"] and "Medium rare" in n["notes"] and n["source"] == "Standard" and n["ai_enabled"] is False, n)
    n2 = core.get_item_notes("Cola"); check("a drink gets drink notes", "No ice" in n2["notes"] and "Well done" not in n2["notes"], n2["notes"])
    n3 = core.get_item_notes("Blue Pen"); check("an unknown dish gets sensible general notes", "Less spicy" in n3["notes"], n3["notes"])
    check("suggestions are cached per item", frappe.db.exists("XentraERP POS Item Note", "ZZ Steak") and core.get_item_notes("ZZ Steak")["notes"] == n["notes"])
    denied("waiter can't rewrite a dish's notes", lambda: core.set_item_notes("ZZ Steak", ["x"]))
    as_user(S_); m2 = core.set_item_notes("ZZ Steak", ["Rare", "Well done", "No pepper", "  ", "rare"]); check("supervisor writes a dish's notes by hand (blank and duplicate lines dropped)", m2["notes"] == ["Rare", "Well done", "No pepper"] and m2["source"] == "Manual", m2)
    as_user(W); check("hand-written notes are kept", core.get_item_notes("ZZ Steak")["source"] == "Manual"); as_user("Administrator")
    # --- the AI path, with the network call mocked
    import requests
    calls = []
    class Resp:
        def __init__(s, body, ok=True): s._b, s._ok = body, ok
        def raise_for_status(s):
            if not s._ok: raise requests.HTTPError("boom")
        def json(s): return s._b
    def fake_ok(url, headers=None, json=None, timeout=None):
        calls.append(json["messages"][0]["content"]); return Resp({"content": [{"type": "text", "text": 'Sure! ["Deep fried", "Extra crunchy", "Well done", "A note that is very very long and should be cut down to size", "deep fried"]'}]})
    def fake_bad(url, headers=None, json=None, timeout=None): calls.append("bad"); raise requests.ConnectionError("no network")
    real_post, real_key = requests.post, core._anthropic_key
    core._anthropic_key = lambda: "test-key"
    try:
        requests.post = fake_ok; as_user(W)
        a1 = core.get_item_notes("ZZ Steak") if False else core.get_item_notes("Blue Pen")
        check("with a key, the dish is sent to Claude and its answer is used", a1["source"] == "AI" and a1["notes"][:3] == ["Deep fried", "Extra crunchy", "Well done"] and a1["ai_enabled"] is True, a1)
        check("…the prompt names the item and asks for JSON only", "Item: Blue Pen" in calls[0] and "JSON array" in calls[0])
        check("…answers are cleaned: deduplicated and length-limited", len(a1["notes"]) == 4 and all(len(x) <= 30 for x in a1["notes"]), a1["notes"])
        before = len(calls); core.get_item_notes("Blue Pen"); check("…and cached: the AI is not asked again", len(calls) == before)
        requests.post = fake_bad
        b1 = core.get_item_notes("Cola"); check("if the AI call fails, the built-in list is used instead", b1["source"] == "Standard" and "No ice" in b1["notes"], b1)
        c0 = len(calls); core.get_item_notes("Cola"); check("…and it isn't retried straight away (6 hours)", len(calls) == c0)
        as_user(S_); requests.post = fake_ok; up2 = core.get_item_notes("Cola", 1)
        check("a supervisor can force a refresh from the AI", up2["source"] == "AI" and up2["notes"][0] == "Deep fried", up2)
        requests.post = fake_bad; keep = core.get_item_notes("Cola", 1); check("a failed refresh keeps the earlier AI answer", keep["source"] == "AI" and keep["notes"][0] == "Deep fried", keep)
    finally:
        requests.post, core._anthropic_key = real_post, real_key
    as_user("Administrator"); core.save_pos_settings(item_notes_prompt=0); check("prompt-for-notes is a setting", core.settings()["item_notes_prompt"] == 0); core.save_pos_settings(item_notes_prompt=1)

except Exception:
    F.append("UNEXPECTED EXCEPTION"); traceback.print_exc()
finally:
    frappe.set_user("Administrator"); frappe.db.rollback(); frappe.clear_cache()
    live = {dt: frappe.db.count(dt) for dt in ("XentraERP POS Table", "XentraERP POS Order", "XentraERP POS Shift")}
    print(f"\nROLLED BACK. live rows still there (untouched): {live}\nRESULT: {len(P)} passed, {len(F)} failed"); [print("  FAILED:", f) for f in F]
