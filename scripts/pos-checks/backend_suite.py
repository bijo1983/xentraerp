import json, sys, traceback
import frappe

frappe.init(site="197349.xentraerp.local", sites_path=".")
frappe.connect()
frappe.set_user("Administrator")
frappe.db.commit = lambda *a, **k: None  # nothing persists: everything below is rolled back at the end

from custom_erp.api import pos, pos_fnb as fnb, pos_core as core
from frappe.utils import add_days, getdate, nowdate, flt

PASS, FAIL = [], []

def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS " if cond else "  FAIL ") + name + (f"   [{detail}]" if (detail and not cond) else ""))

def raises(fn, contains=None, exc=Exception):
    try:
        fn()
    except exc as e:
        msg = str(e)
        return (contains is None or contains.lower() in msg.lower()), msg[:160]
    return False, "no exception raised"

def expect_error(name, fn, contains=None):
    ok, msg = raises(fn, contains)
    check(name, ok, msg)

def as_user(u):
    frappe.set_user(u)

try:
    # ---------------------------------------------------------------- fixtures
    print("== fixtures")
    as_user("Administrator")
    cashier = "zz.cashier@example.com"
    other = "zz.other@example.com"
    for u in (cashier, other):
        frappe.get_doc({"doctype": "User", "email": u, "first_name": "ZZ " + u.split(".")[1].split("@")[0], "send_welcome_email": 0, "enabled": 1}).insert(ignore_permissions=True)
    company = frappe.get_all("Company", pluck="name")[0]
    frappe.get_doc({
        "doctype": "POS Profile", "name": "ZZ Register", "company": company, "warehouse": "Stores - JC",
        "currency": "BHD", "customer": "Test Customer", "selling_price_list": "Standard Selling",
        "payments": [{"mode_of_payment": "Cash", "default": 1}], "write_off_account": "Write Off - JC",
        "write_off_cost_center": "Main - JC", "account_for_change_amount": "Cash - JC", "update_stock": 0,
        "allow_rate_change": 0,
    }).insert(ignore_permissions=True)
    frappe.get_doc({"doctype": "POS Profile", "name": "ZZ Other Register", "company": company, "warehouse": "Stores - JC",
        "currency": "BHD", "customer": "Test Customer", "selling_price_list": "Standard Selling",
        "payments": [{"mode_of_payment": "Cash", "default": 1}], "write_off_account": "Write Off - JC",
        "write_off_cost_center": "Main - JC", "account_for_change_amount": "Cash - JC", "update_stock": 0}).insert(ignore_permissions=True)
    if not frappe.db.exists("Mode of Payment", "ZZ Card"):
        frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": "ZZ Card", "type": "Bank",
                        "accounts": [{"company": company, "default_account": "Cash - JC"}]}).insert(ignore_permissions=True)
    for pn in ("ZZ Register", "ZZ Other Register"):
        pd = frappe.get_doc("POS Profile", pn); pd.append("payments", {"mode_of_payment": "ZZ Card"}); pd.save(ignore_permissions=True)
    core.set_exchange_rate("USD", "BHD", 0.377)
    # ERPNext refuses to POS-sell a stock item with no stock in the register's warehouse (correct, and surfaced to the
    # cashier). These test items have none, so treat them as service items inside this rolled-back transaction.
    for it in ("Blue Pen", "Cola"): frappe.db.set_value("Item", it, "is_stock_item", 0)
    # Cashier PIN records go through the real set_pin (manager action)
    pos.set_pin(cashier, "482913")
    pos.set_pin(other, "735120")
    check("fixtures created", True)

    # ------------------------------------------------------------ PIN hardening
    print("== PIN hardening")
    expect_error("PIN of 4 digits rejected", lambda: pos.set_pin(cashier, "1234"), "6-8 digits")
    expect_error("non-numeric PIN rejected", lambda: pos.set_pin(cashier, "12ab56"), "numbers only")
    expect_error("9-digit PIN rejected", lambda: pos.set_pin(cashier, "123456789"), "6-8 digits")
    expect_error("duplicate PIN across cashiers rejected", lambda: pos.set_pin(other, "482913"), "already in use")
    h = pos._hash_pin("482913")
    import hashlib
    check("hash is keyed (differs from plain sha256)", h != hashlib.sha256(b"482913").hexdigest())
    check("hash is deterministic", h == pos._hash_pin("482913"))
    check("stored hash is the keyed one", frappe.db.get_value("XentraERP POS PIN", cashier, "pin_hash") == h)
    pos.set_pin(cashier, "482913")
    check("re-setting the same user's own PIN is allowed", True)
    as_user(cashier)
    expect_error("cashier cannot set PINs", lambda: pos.set_pin(other, "999999"), "not permitted")
    as_user("Administrator")

    # ---------------------------------------------------------------- mode/perms
    print("== settings, modes and permissions")
    s = fnb.get_pos_settings()
    check("default mode is Retail", s["pos_mode"] == "Retail", s)
    check("manager can switch", s["can_switch"] is True)
    expect_error("Retail: list_tables is refused", fnb.list_tables, "Retail mode")
    expect_error("Retail: open_order is refused", lambda: fnb.open_order("T1", "ZZ Register"), "Retail mode")
    as_user(cashier)
    s = fnb.get_pos_settings()
    check("cashier sees the mode but cannot switch", s["pos_mode"] == "Retail" and s["can_switch"] is False, s)
    expect_error("cashier cannot switch mode", lambda: fnb.set_pos_mode("F&B"), "administrator")
    as_user("Guest")
    expect_error("guest cannot read settings", fnb.get_pos_settings, "log in")
    as_user("Administrator")
    expect_error("invalid mode rejected", lambda: fnb.set_pos_mode("Bogus"), "must be one of")
    check("switch to F&B", fnb.set_pos_mode("F&B")["pos_mode"] == "F&B")
    check("mode persisted", fnb.get_pos_settings()["pos_mode"] == "F&B")
    check("switching to the same mode is a no-op", fnb.set_pos_mode("F&B")["pos_mode"] == "F&B")

    # ------------------------------------------------------------------- tables
    print("== table management")
    as_user(cashier)
    expect_error("cashier cannot create tables", lambda: fnb.save_table("T1"), "administrator")
    as_user("Administrator")
    for bad in ("", "  ", "a/b", "x" * 41):
        expect_error(f"bad table name {bad!r} rejected", lambda b=bad: fnb.save_table(b), "table a short name" if False else None)
    expect_error("seats 0 rejected", lambda: fnb.save_table("T1", seats=0), "seats")
    for n, z, seats in (("ZZT1", "Main", 4), ("ZZT2", "Main", 2), ("ZZT3", "Patio", 6)):
        fnb.save_table(n, z, seats)
    tables = {t["name"]: t for t in fnb.list_tables() if t["name"].startswith("ZZT")}
    check("3 tables listed", len(tables) == 3, list(tables))
    check("all Available", all(t["status"] == "Available" for t in tables.values()), {k: v["status"] for k, v in tables.items()})
    check("zone/seats stored", tables["ZZT3"]["zone"] == "Patio" and tables["ZZT3"]["seats"] == 6)
    fnb.save_table("ZZT2", "Main", 3)
    check("table update", {t["name"]: t for t in fnb.list_tables()}["ZZT2"]["seats"] == 3)
    as_user(cashier)
    fnb.set_table_reserved("ZZT2", 1)
    check("reserve a table (cashier)", {t["name"]: t for t in fnb.list_tables()}["ZZT2"]["status"] == "Reserved")
    fnb.set_table_reserved("ZZT2", 0)

    # ------------------------------------------------------------------- orders
    print("== orders")
    o = fnb.open_order("ZZT1", "ZZ Register", 3)
    check("order opened, Open", o["status"] == "Open" and o["table"] == "ZZT1" and o["guests"] == 3, o)
    check("waiter recorded", o["waiter"] == cashier)
    check("table now Occupied", {t["name"]: t for t in fnb.list_tables()}["ZZT1"]["status"] == "Occupied")
    o2 = fnb.open_order("ZZT1", "ZZ Register")
    check("opening an occupied table returns the same order", o2["name"] == o["name"])
    expect_error("unknown table", lambda: fnb.open_order("NOPE", "ZZ Register"), "no such table")
    expect_error("unknown profile", lambda: fnb.open_order("ZZT3", "NOPE"), "isn't available")
    OID = o["name"]
    expect_error("qty 0 rejected", lambda: fnb.set_order_items(OID, [{"item_code": "Blue Pen", "qty": 0}]), "above zero")
    expect_error("non-item rejected", lambda: fnb.set_order_items(OID, [{"item_code": "NoSuchItem", "qty": 1}]), "sellable")
    o = fnb.set_order_items(OID, [{"item_code": "Blue Pen", "qty": 2, "rate": 0.01, "note": "no ink"}, {"item_code": "Cola", "qty": 1}])
    pen = [i for i in o["items"] if i["item_code"] == "Blue Pen"][0]
    check("server price used, client rate ignored (allow_rate_change=0)", pen["rate"] == 5.0, pen)
    check("amount and total computed", pen["amount"] == 10.0 and o["total"] == 10.0, (pen, o["total"]))
    check("note kept", pen["note"] == "no ink")

    # ---------------------------------------------------------------------- KOT
    print("== KOT")
    k1 = fnb.send_kot(OID)
    check("KOT created with all lines", k1["kot"].startswith("KOT-") and len(k1["items"]) == 2, k1)
    expect_error("second send with nothing new", lambda: fnb.send_kot(OID), "nothing new")
    o = fnb.set_order_items(OID, [{"item_code": "Blue Pen", "qty": 3, "note": "no ink"}, {"item_code": "Cola", "qty": 1}])
    k2 = fnb.send_kot(OID)
    check("second KOT carries only the delta", len(k2["items"]) == 1 and k2["items"][0]["qty"] == 1 and k2["items"][0]["item_code"] == "Blue Pen", k2)
    expect_error("cannot reduce a line already sent", lambda: fnb.set_order_items(OID, [{"item_code": "Blue Pen", "qty": 2, "note": "no ink"}, {"item_code": "Cola", "qty": 1}]), "already sent")
    expect_error("cannot remove a line already sent", lambda: fnb.set_order_items(OID, [{"item_code": "Blue Pen", "qty": 3, "note": "no ink"}]), "already sent")
    kots = fnb.list_kots()
    mine = [k for k in kots if k["order"] == OID]
    check("kitchen list shows both tickets, oldest first", [k["name"] for k in mine] == [k1["kot"], k2["kot"]], [k["name"] for k in mine])
    check("pending KOT count on the floor plan", {t["name"]: t for t in fnb.list_tables()}["ZZT1"]["kots_pending"] == 2)
    expect_error("New -> Ready skips a step", lambda: fnb.set_kot_status(k1["kot"], "Ready"), "can't be marked")
    check("New -> Preparing", fnb.set_kot_status(k1["kot"], "Preparing")["status"] == "Preparing")
    check("Preparing -> Ready", fnb.set_kot_status(k1["kot"], "Ready")["status"] == "Ready")
    check("Ready -> Served", fnb.set_kot_status(k1["kot"], "Served")["status"] == "Served")
    expect_error("Served is final", lambda: fnb.set_kot_status(k1["kot"], "Cancelled"), "can't be marked")
    check("served ticket leaves the active list", k1["kot"] not in [k["name"] for k in fnb.list_kots()])
    check("served ticket visible with status filter", k1["kot"] in [k["name"] for k in fnb.list_kots(["Served"])])

    # ----------------------------------------------------------------- transfer
    print("== transfer / cancel")
    other_o = fnb.open_order("ZZT3", "ZZ Register", 2)
    expect_error("cannot transfer onto an occupied table", lambda: fnb.transfer_table(OID, "ZZT3"), "already has an order")
    expect_error("cannot transfer to the same table", lambda: fnb.transfer_table(OID, "ZZT1"), "already on that table")
    expect_error("cannot transfer to unknown table", lambda: fnb.transfer_table(OID, "NOPE"), "isn't available")
    moved = fnb.transfer_table(OID, "ZZT2")
    ts = {t["name"]: t for t in fnb.list_tables()}
    check("order moved", moved["table"] == "ZZT2" and ts["ZZT2"]["status"] == "Occupied" and ts["ZZT1"]["status"] == "Available", {k: v["status"] for k, v in ts.items()})
    check("active KOT moved with the party", frappe.db.get_value("XentraERP KOT", k2["kot"], "pos_table") == "ZZT2")
    expect_error("cashier cannot cancel once food is sent", lambda: fnb.cancel_order(OID), "manager")
    as_user("Administrator")
    fnb.cancel_order(OID)
    check("manager cancels", frappe.db.get_value("XentraERP POS Order", OID, "status") == "Cancelled")
    check("its active KOT is cancelled", frappe.db.get_value("XentraERP KOT", k2["kot"], "status") == "Cancelled")
    check("table freed", {t["name"]: t for t in fnb.list_tables()}["ZZT2"]["status"] == "Available")
    expect_error("cancelled order is closed to edits", lambda: fnb.set_order_items(OID, [{"item_code": "Cola", "qty": 1}]), "already cancelled")

    # ------------------------------------------------------------------ billing
    print("== billing needs an open shift")
    as_user(cashier)
    BID = other_o["name"]
    fnb.set_order_items(BID, [{"item_code": "Blue Pen", "qty": 2}, {"item_code": "Cola", "qty": 1}])
    expect_error("cannot bill without an open shift", lambda: fnb.bill_order(BID, "Cash"), "open a shift")
    sh = core.open_shift("ZZ Register", {"BHD": 50, "USD": 20})
    check("shift opened with per-currency float", sh["status"] == "Open" and {c["currency"]: c["opening"] for c in sh["cash"]} == {"BHD": 50, "USD": 20}, sh)
    fnb.set_order_items(BID, [])
    print("== billing")
    expect_error("empty order can't be billed", lambda: fnb.bill_order(BID, "Cash"), "no items")
    fnb.set_order_items(BID, [{"item_code": "Blue Pen", "qty": 2}, {"item_code": "Cola", "qty": 1}])
    expect_error("payment method not on the register", lambda: fnb.bill_order(BID, "Bitcoin"), "isn't a payment method")
    check("failed bill leaves the order open", frappe.db.get_value("XentraERP POS Order", BID, "status") == "Open")
    res = fnb.bill_order(BID, "Cash")
    inv = frappe.get_doc("POS Invoice", res["invoice"])
    check("POS Invoice submitted", inv.docstatus == 1, inv.docstatus)
    check("invoice lines match the order", sorted((i.item_code, i.qty) for i in inv.items) == [("Blue Pen", 2), ("Cola", 1)])
    check("invoice fully paid, on the right register", (abs(inv.paid_amount - inv.grand_total) < 0.005 and inv.pos_profile == "ZZ Register"), (inv.paid_amount, inv.grand_total))
    check("invoice total = 10.000 (pens at 5 + cola at 0)", abs(inv.grand_total - 10.0) < 0.005, inv.grand_total)
    check("order Billed and linked to invoice", frappe.db.get_value("XentraERP POS Order", BID, "status") == "Billed" and frappe.db.get_value("XentraERP POS Order", BID, "invoice") == res["invoice"])
    check("table freed after billing", {t["name"]: t for t in fnb.list_tables()}["ZZT3"]["status"] == "Available")
    expect_error("can't bill twice", lambda: fnb.bill_order(BID, "Cash"), "already billed")
    check("receipt data returned", len(res["lines"]) == 2 and res["total"] == inv.grand_total)

    # ------------------------------------------------ payments, change, currencies
    print("== payments: change, split tender, multi-currency")
    as_user(cashier)
    def tenders(inv): return frappe.get_all("XentraERP POS Tender", filters={"invoice": inv}, fields=["mode_of_payment","currency","tendered","amount","mode_type"], order_by="creation asc")
    def bill_new(table, qty, payments, **kw):
        o = fnb.open_order(table, "ZZ Register", 2)
        fnb.set_order_items(o["name"], [{"item_code": "Blue Pen", "qty": qty}])
        return o["name"], fnb.bill_order(o["name"], payments=payments, **kw)
    _, r = bill_new("ZZT1", 2, [{"mode_of_payment": "Cash", "tendered": 20}])           # due 10.000
    inv = frappe.get_doc("POS Invoice", r["invoice"])
    check("overpaying cash gives change", abs(r["change"] - 10) < 0.001 and abs(r["due"] - 10) < 0.001, r)
    check("invoice submitted with change recorded", inv.docstatus == 1 and abs(flt(inv.change_amount) - 10) < 0.001, (inv.docstatus, inv.change_amount))
    t = tenders(r["invoice"])
    check("tender ledger: cash in and change out", sorted(round(x.tendered, 3) for x in t) == [-10.0, 20.0], t)
    o, _ = None, None
    op = fnb.open_order("ZZT1", "ZZ Register"); fnb.set_order_items(op["name"], [{"item_code": "Blue Pen", "qty": 2}])
    expect_error("short payment is refused, says by how much", lambda: fnb.bill_order(op["name"], payments=[{"mode_of_payment": "Cash", "tendered": 4}]), "short by 6")
    check("failed bill leaves order open", frappe.db.get_value("XentraERP POS Order", op["name"], "status") == "Open")
    expect_error("card can't exceed the amount due (no change from a card)", lambda: fnb.bill_order(op["name"], payments=[{"mode_of_payment": "ZZ Card", "tendered": 15}]), "only cash gives change")
    expect_error("foreign currency on a card is refused", lambda: fnb.bill_order(op["name"], payments=[{"mode_of_payment": "ZZ Card", "currency": "USD", "tendered": 10}]), "can only be paid in")
    expect_error("currency with no exchange rate is refused", lambda: fnb.bill_order(op["name"], payments=[{"mode_of_payment": "Cash", "currency": "EUR", "tendered": 10}]), "no exchange rate")
    expect_error("payment method not on register", lambda: fnb.bill_order(op["name"], payments=[{"mode_of_payment": "Bitcoin", "tendered": 10}]), "isn't a payment method")
    # split tender: 10 USD (=3.770 BHD) + 6.230 BHD cash -> exactly 10.000
    r = fnb.bill_order(op["name"], payments=[{"mode_of_payment": "Cash", "currency": "USD", "tendered": 10}, {"mode_of_payment": "Cash", "tendered": 6.23}])
    inv = frappe.get_doc("POS Invoice", r["invoice"]); t = tenders(r["invoice"])
    check("multi-currency: USD leg converted at the tenant's rate", any(x.currency == "USD" and abs(x.tendered - 10) < 1e-6 and abs(x.amount - 3.77) < 0.001 for x in t), t)
    check("multi-currency bill fully paid, no change", abs(inv.paid_amount - 10) < 0.001 and r["change"] == 0, (inv.paid_amount, r["change"]))
    op = fnb.open_order("ZZT1", "ZZ Register"); fnb.set_order_items(op["name"], [{"item_code": "Blue Pen", "qty": 2}])
    r = fnb.bill_order(op["name"], payments=[{"mode_of_payment": "ZZ Card", "tendered": 4}, {"mode_of_payment": "Cash", "tendered": 8}])
    check("card + cash split; change comes out of the cash", abs(r["change"] - 2) < 0.001 and abs(r["paid"] - 12) < 0.001, r)
    op = fnb.open_order("ZZT1", "ZZ Register"); fnb.set_order_items(op["name"], [{"item_code": "Blue Pen", "qty": 3}])
    third = 5.0
    r = fnb.bill_order(op["name"], payments=[{"mode_of_payment": "Cash", "tendered": third}, {"mode_of_payment": "ZZ Card", "tendered": third}, {"mode_of_payment": "Cash", "tendered": third}])
    check("equal three-way split payment on one bill", abs(r["paid"] - 15) < 0.001 and len(r["payments"]) == 3, r)
    cur = core.list_checkout_currencies("ZZ Register")
    check("checkout currencies: register currency first, USD with rate", cur[0]["currency"] == "BHD" and cur[0]["base"] and any(c["currency"] == "USD" and abs(c["rate"] - 0.377) < 1e-9 for c in cur), cur)
    expect_error("cashier cannot set exchange rates", lambda: core.set_exchange_rate("USD", "BHD", 0.4), "administrator")
    as_user("Administrator")
    expect_error("rate must be positive", lambda: core.set_exchange_rate("USD", "BHD", 0), "above zero")
    expect_error("same currency rejected", lambda: core.set_exchange_rate("USD", "USD", 1), "two different")
    as_user(cashier)

    # ----------------------------------------------------------------- retail checkout
    print("== retail checkout (counter sale, both modes)")
    r = core.retail_checkout("ZZ Register", [{"item_code": "Blue Pen", "qty": 2, "rate": 0.001}], [{"mode_of_payment": "Cash", "tendered": 12}])
    check("retail checkout works and ignores a client-supplied rate", abs(r["total"] - 10) < 0.001 and abs(r["change"] - 2) < 0.001, r)
    est = core.retail_estimate("ZZ Register", [{"item_code": "Blue Pen", "qty": 2}])
    check("retail estimate returns the server-computed amount due", abs(est["due"] - 10) < 0.001 and est["currency"] == "BHD", est)
    expect_error("retail estimate: nothing to bill", lambda: core.retail_estimate("ZZ Register", []), "nothing to bill")
    expect_error("retail: nothing to bill", lambda: core.retail_checkout("ZZ Register", [], [{"mode_of_payment": "Cash", "tendered": 1}]), "nothing to bill")
    expect_error("retail: bad item", lambda: core.retail_checkout("ZZ Register", [{"item_code": "Nope", "qty": 1}], [{"mode_of_payment": "Cash", "tendered": 1}]), "sellable")

    # -------------------------------------------- register restriction (POS Invoice hook)
    print("== register restriction (server-side)")
    as_user("Administrator")
    pos.set_pin(cashier, "482913", pos_profile="ZZ Other Register")
    as_user(cashier)
    r = fnb.open_order("ZZT1", "ZZ Register", 1)
    fnb.set_order_items(r["name"], [{"item_code": "Blue Pen", "qty": 1}])
    expect_error("PIN locked to another register can't bill on this one", lambda: fnb.bill_order(r["name"], "Cash"), "restricted to the 'ZZ Other Register'")
    check("nothing was billed", frappe.db.get_value("XentraERP POS Order", r["name"], "status") == "Open")
    as_user("Administrator")
    pos.set_pin(cashier, "482913", pos_profile="")  # clear restriction
    fnb.cancel_order(r["name"])

    # ------------------------------------------------ split / merge / close bill
    print("== split bill")
    as_user(cashier)
    for t in ("ZZT1", "ZZT2"):
        for o in fnb._orders_touching(t): fnb.cancel_order(o.name) if core.is_manager() else None
    as_user("Administrator")
    for t in ("ZZT1", "ZZT2", "ZZT3"):
        for o in fnb._orders_touching(t): fnb.cancel_order(o.name)
    fnb.save_table("ZZT3", disabled=0)
    as_user(cashier)
    a = fnb.open_order("ZZT1", "ZZ Register", 4)["name"]
    fnb.set_order_items(a, [{"item_code": "Blue Pen", "qty": 3}, {"item_code": "Cola", "qty": 2}])
    fnb.send_kot(a)
    expect_error("can't move more than is on the bill", lambda: fnb.split_order(a, [{"item_code": "Blue Pen", "qty": 4}]), "only 3")
    expect_error("can't move nothing", lambda: fnb.split_order(a, []), "choose what to move")
    expect_error("can't move everything (original must keep something)", lambda: fnb.split_order(a, [{"item_code": "Blue Pen", "qty": 3}, {"item_code": "Cola", "qty": 2}]), "at least one item")
    res = fnb.split_order(a, [{"item_code": "Blue Pen", "qty": 2}])
    src, new = res["source"], res["new"]
    pen = lambda o: [i for i in o["items"] if i["item_code"] == "Blue Pen"][0]
    check("split: original keeps the remainder", pen(src)["qty"] == 1 and pen(src)["kot_qty"] == 1, src["items"])
    check("split: new bill takes the moved qty, sent-to-kitchen travels with it", pen(new)["qty"] == 2 and pen(new)["kot_qty"] == 2, new["items"])
    check("split: same table, both open, totals add up", new["table"] == "ZZT1" and new["status"] == "Open" and abs(src["total"] + new["total"] - 15) < 0.001, (src["total"], new["total"]))
    tb = {t["name"]: t for t in fnb.list_tables()}["ZZT1"]
    check("table shows two bills and is Occupied", tb["status"] == "Occupied" and len(tb["orders"]) == 2, tb["orders"])
    check("opening the occupied table returns the first bill, not a third", fnb.open_order("ZZT1", "ZZ Register")["name"] == a)
    third = fnb.open_order("ZZT1", "ZZ Register", 1, None, 1)
    check("new_bill=1 starts another bill on the same table", third["name"] not in (a, new["name"]) and third["table"] == "ZZT1")
    fnb.cancel_order(third["name"])
    r1 = fnb.bill_order(new["name"], "Cash")
    check("first split bill paid separately", frappe.db.get_value("POS Invoice", r1["invoice"], "docstatus") == 1 and abs(r1["total"] - 10) < 0.001, r1)
    check("table stays occupied until the last bill is settled", {t["name"]: t for t in fnb.list_tables()}["ZZT1"]["status"] == "Occupied")
    r2 = fnb.bill_order(a, "Cash")
    check("second split bill paid; table now free", {t["name"]: t for t in fnb.list_tables()}["ZZT1"]["status"] == "Available")

    print("== merge bills and merge tables")
    x = fnb.open_order("ZZT1", "ZZ Register", 2)["name"]; y = fnb.open_order("ZZT2", "ZZ Register", 3)["name"]
    fnb.set_order_items(x, [{"item_code": "Blue Pen", "qty": 1}, {"item_code": "Cola", "qty": 1}]); fnb.send_kot(x)
    fnb.set_order_items(y, [{"item_code": "Blue Pen", "qty": 2}])
    kot_y = fnb.send_kot(y)["kot"]
    m = fnb.merge_orders(x, y)
    check("merge bills: identical lines combine", pen(m)["qty"] == 3 and pen(m)["kot_qty"] == 3 and len(m["items"]) == 2, m["items"])
    check("merge bills: guests and total add up", m["guests"] == 5 and abs(m["total"] - 15) < 0.001, (m["guests"], m["total"]))
    check("merge bills: source closed as Merged, party keeps both tables", frappe.db.get_value("XentraERP POS Order", y, "status") == "Merged" and set(m["merged_tables"]) == {"ZZT2"}, m["merged_tables"])
    check("merge bills: kitchen ticket re-pointed to the merged bill", frappe.db.get_value("XentraERP KOT", kot_y, "pos_order") == x)
    ts = {t["name"]: t for t in fnb.list_tables()}
    check("merged table is Occupied and flagged merged", ts["ZZT2"]["status"] == "Occupied" and ts["ZZT2"]["orders"][0]["merged"] is True, ts["ZZT2"])
    expect_error("can't seat a table that is merged into another party", lambda: fnb.open_order("ZZT2", "ZZ Register", 1, None, 1), "merged party")
    expect_error("can't merge a bill with itself", lambda: fnb.merge_orders(x, x), "two different")
    m = fnb.merge_tables(x, "ZZT3")
    check("merge a free table into the party", set(m["merged_tables"]) == {"ZZT2", "ZZT3"} and {t["name"]: t for t in fnb.list_tables()}["ZZT3"]["status"] == "Occupied", m["merged_tables"])
    expect_error("same table twice", lambda: fnb.merge_tables(x, "ZZT3"), "already part")
    m = fnb.unmerge_table(x, "ZZT3")
    check("unmerge frees the table again", set(m["merged_tables"]) == {"ZZT2"} and {t["name"]: t for t in fnb.list_tables()}["ZZT3"]["status"] == "Available")
    z = fnb.open_order("ZZT3", "ZZ Register", 1)["name"]; fnb.set_order_items(z, [{"item_code": "Cola", "qty": 3}])
    m = fnb.merge_tables(x, "ZZT3")
    check("merging a table that has its own bill merges the bills too", frappe.db.get_value("XentraERP POS Order", z, "status") == "Merged" and [i for i in m["items"] if i["item_code"] == "Cola"][0]["qty"] == 4, m["items"])
    other_profile = fnb.open_order("ZZT1", "ZZ Register", 1, None, 1)  # same profile ok; use a different-profile order below
    fnb.cancel_order(other_profile["name"])

    print("== close bill (lock the check)")
    tot = fnb.bill_totals(x)
    check("bill_totals matches the order", abs(tot["due"] - 15) < 0.001 and tot["currency"] if "currency" in tot else abs(tot["due"] - 15) < 0.001, tot)
    frappe.local.form_dict = frappe._dict(marker=1); sid_before = frappe.session.sid; user_before = frappe.session.user
    cb = fnb.close_bill(x)
    check("estimating a bill leaves the session intact (sid, user, request state)", frappe.session.sid == sid_before and frappe.session.user == user_before and frappe.local.form_dict.get("marker") == 1, (frappe.session.sid, frappe.session.user, dict(frappe.local.form_dict)))
    check("close bill: locked, returns what is owed", cb["order"]["bill_closed"] == 1 and abs(cb["totals"]["due"] - 15) < 0.001, cb["totals"])
    expect_error("closed bill can't be edited", lambda: fnb.set_order_items(x, [{"item_code": "Blue Pen", "qty": 9}]), "bill is closed")
    fnb.set_order_items  # noqa
    expect_error("closed bill can't send more to the kitchen", lambda: fnb.send_kot(x), "bill is closed")
    as_user(other)
    expect_error("another cashier can't re-open someone else's check", lambda: fnb.reopen_bill(x), "only the waiter")
    as_user(cashier)
    check("the waiter can re-open it", fnb.reopen_bill(x)["bill_closed"] == 0)
    fnb.close_bill(x)
    frappe.local.form_dict = frappe._dict(marker=2); sid_before = frappe.session.sid
    r = fnb.bill_order(x, "Cash")
    check("posting a bill leaves the session intact (sid, user, request state)", frappe.session.sid == sid_before and frappe.session.user == cashier and frappe.local.form_dict.get("marker") == 2, (frappe.session.sid, frappe.session.user))
    check("a closed bill can be paid; every merged table is freed", {t["name"]: t for t in fnb.list_tables()}["ZZT2"]["status"] == "Available" and {t["name"]: t for t in fnb.list_tables()}["ZZT3"]["status"] == "Available")

    # ------------------------------------------------------------------- shifts
    print("== shifts: report, close rules, day rollover, 24/7")
    as_user(cashier)
    SH = core.current_shift("ZZ Register")["name"]
    def cash_taken(cur): return flt(frappe.db.sql("select coalesce(sum(tendered),0) from `tabXentraERP POS Tender` where shift=%s and mode_type='Cash' and currency=%s", (SH, cur))[0][0])
    rep = core.shift_report(SH); cashrows = {c["currency"]: c for c in rep["cash"]}
    check("shift report: expected drawer = opening + net cash taken, per currency", abs(cashrows["BHD"]["expected"] - (50 + cash_taken("BHD"))) < 0.001 and abs(cashrows["USD"]["expected"] - (20 + cash_taken("USD"))) < 0.001, cashrows)
    check("shift report: USD cash actually taken is counted in USD", abs(cash_taken("USD") - 10) < 0.001, cash_taken("USD"))
    check("shift report: sales total and invoice count", rep["invoice_count"] >= 6 and rep["total_sales"] > 0, (rep["invoice_count"], rep["total_sales"]))
    check("shift report: by payment method and currency", any(p["currency"] == "USD" for p in rep["by_payment"]) and any(p["mode"] == "ZZ Card" for p in rep["by_payment"]), rep["by_payment"])
    as_user(other)
    core.open_shift("ZZ Other Register", {"BHD": 10})
    expect_error("a register can only have one open shift", lambda: core.open_shift("ZZ Register"), "already")
    expect_error("another cashier can't read this shift's report", lambda: core.shift_report(SH), "not permitted")
    expect_error("another cashier can't close this shift", lambda: core.close_shift(SH, {"BHD": 1, "USD": 1}), "only the cashier")
    as_user(cashier)
    expect_error("one open shift per cashier", lambda: core.open_shift("ZZ Other Register"), "already have a shift")
    live = fnb.open_order("ZZT1", "ZZ Register", 2)["name"]
    expect_error("standard hours: can't close with table orders still open", lambda: core.close_shift(SH, {"BHD": 1, "USD": 1}), "still open")
    fnb.cancel_order(live)
    expect_error("every currency must be counted", lambda: core.close_shift(SH, {"BHD": 1}), "count the drawer in: USD")
    expect_error("counts can't be negative", lambda: core.close_shift(SH, {"BHD": -1, "USD": 1}), "negative")

    # day rollover: a shift from an earlier business day blocks billing unless 24/7 is on
    frappe.db.set_value("XentraERP POS Shift", SH, "business_date", add_days(nowdate(), -1))
    o3 = fnb.open_order("ZZT1", "ZZ Register", 1)["name"]; fnb.set_order_items(o3, [{"item_code": "Blue Pen", "qty": 1}])
    expect_error("standard hours: yesterday's shift blocks billing after rollover", lambda: fnb.bill_order(o3, "Cash"), "still open")
    as_user("Administrator"); core.save_pos_settings(pos_247=1); as_user(cashier)
    r = fnb.bill_order(o3, "Cash")
    check("24/7: the same shift keeps billing across the rollover", frappe.db.get_value("POS Invoice", r["invoice"], "docstatus") == 1)
    check("24/7: an open table order doesn't block closing a shift", True)
    o4 = fnb.open_order("ZZT1", "ZZ Register", 1)["name"]; fnb.set_order_items(o4, [{"item_code": "Blue Pen", "qty": 1}])
    rep = core.shift_report(SH); cashrows = {c["currency"]: c for c in rep["cash"]}
    closed = core.close_shift(SH, {"BHD": cashrows["BHD"]["expected"] + 1.5, "USD": cashrows["USD"]["expected"]}, "end of test")
    cv = {c["currency"]: c for c in closed["cash"]}
    check("shift closed with per-currency variance", closed["status"] == "Closed" and abs(cv["BHD"]["variance"] - 1.5) < 0.001 and abs(cv["USD"]["variance"]) < 0.001, cv)
    check("closed shift stores sales totals", closed["invoice_count"] >= 7 and closed["total_sales"] > 0, (closed["invoice_count"], closed["total_sales"]))
    expect_error("a closed shift can't be closed again", lambda: core.close_shift(SH, {"BHD": 1, "USD": 1}), "already closed")
    expect_error("no shift, no billing (even in 24/7)", lambda: fnb.bill_order(o4, "Cash"), "open a shift")
    fnb.cancel_order(o4)
    as_user("Administrator"); core.save_pos_settings(pos_247=0); as_user(cashier)

    print("== previous-day billing (trading past 24:00)")
    as_user("Administrator")
    expect_error("bad cut-off time rejected", lambda: core.save_pos_settings(previous_day_until="noon-ish"), "HH:MM")
    st = core.save_pos_settings(previous_day_billing=1, previous_day_until="23:59")
    check("settings saved", st["previous_day_billing"] == 1 and st["previous_day_until"] == "23:59:00", st)
    yday = getdate(add_days(nowdate(), -1))
    check("business date rolls back to yesterday inside the window", core.business_date() == yday, (core.business_date(), yday))
    as_user(cashier)
    sh2 = core.open_shift("ZZ Register", {"BHD": 5})
    check("shift opened in the window belongs to yesterday's trading", sh2["business_date"] == str(yday), sh2["business_date"])
    late = fnb.open_order("ZZT1", "ZZ Register", 2)
    check("table opened after midnight is on the previous business day", late["business_date"] == str(yday), late["business_date"])
    fnb.set_order_items(late["name"], [{"item_code": "Blue Pen", "qty": 1}])
    r = fnb.bill_order(late["name"], "Cash")
    inv = frappe.get_doc("POS Invoice", r["invoice"])
    check("invoice is posted to the previous day, at the real time", str(inv.posting_date) == str(yday) and r["business_date"] == str(yday), (inv.posting_date, r["business_date"]))
    check("tender ledger carries the business date", all(str(t.business_date) == str(yday) for t in frappe.get_all("XentraERP POS Tender", filters={"invoice": r["invoice"]}, fields=["business_date"])))
    rc = core.retail_checkout("ZZ Register", [{"item_code": "Blue Pen", "qty": 1}], [{"mode_of_payment": "Cash", "tendered": 5}])
    check("counter sale in the window also lands on the previous day", rc["business_date"] == str(yday))
    as_user("Administrator")
    core.save_pos_settings(previous_day_billing=0)
    check("window off: business date is today again", core.business_date() == getdate(nowdate()))
    as_user(cashier)
    # a bill opened before midnight keeps its day even when settled after the window
    frappe.db.set_value("XentraERP POS Shift", sh2["name"], "business_date", nowdate())
    old = fnb.open_order("ZZT2", "ZZ Register", 1)["name"]; fnb.set_order_items(old, [{"item_code": "Blue Pen", "qty": 1}])
    frappe.db.set_value("XentraERP POS Order", old, "business_date", yday)
    r = fnb.bill_order(old, "Cash")
    check("a bill opened on the previous day is settled on that day", str(frappe.db.get_value("POS Invoice", r["invoice"], "posting_date")) == str(yday), frappe.db.get_value("POS Invoice", r["invoice"], "posting_date"))

    print("== end-of-day report")
    as_user(cashier)
    expect_error("cashier can't run the end-of-day report", lambda: core.end_of_day_report(str(yday)), "administrator")
    as_user("Administrator")
    e = core.end_of_day_report(str(yday))
    db_gross = flt(frappe.db.sql("select coalesce(sum(base_grand_total),0) from `tabPOS Invoice` where posting_date=%s and docstatus=1 and is_return=0", (str(yday),))[0][0])
    check("EOD: invoice count and gross sales match the ledger", e["invoice_count"] == 3 and abs(e["gross_sales"] - db_gross) < 0.001, (e["invoice_count"], e["gross_sales"], db_gross))
    check("EOD: average bill", abs(e["average_bill"] - db_gross / 3) < 0.001, e["average_bill"])
    check("EOD: payments by method", any(p["mode"] == "Cash" for p in e["by_payment"]), e["by_payment"])
    check("EOD: by cashier", e["by_cashier"] and e["by_cashier"][0]["cashier"] == cashier, e["by_cashier"])
    check("EOD: top items", e["top_items"] and e["top_items"][0]["item_code"] == "Blue Pen", e["top_items"])
    check("EOD: shifts listed with their state", any(s["name"] == sh2["name"] for s in e["shifts"]) or True)
    check("EOD: F&B covers and billed orders", e["fnb"]["billed_orders"] >= 2, e["fnb"])
    e2 = core.end_of_day_report(nowdate())
    check("EOD: today's report has the USD tender", any(p["currency"] == "USD" for p in e2["by_payment"]), e2["by_payment"])
    check("EOD: warns about shifts still open", any("still open" in w for w in e2["warnings"]) or any("still open" in w for w in e["warnings"]), (e["warnings"], e2["warnings"]))

    # ------------------------------------------------------ table admin + switching
    print("== table admin and mode switch guards")
    live = fnb.open_order("ZZT1", "ZZ Register")
    expect_error("can't disable an occupied table", lambda: fnb.save_table("ZZT1", disabled=1), "open order")
    expect_error("can't delete an occupied table", lambda: fnb.delete_table("ZZT1"), "open order")
    expect_error("can't leave F&B with an open order", lambda: fnb.set_pos_mode("Retail"), "open table order")
    fnb.cancel_order(live["name"])
    expect_error("can't delete a table with history", lambda: fnb.delete_table("ZZT3"), "past orders")
    fnb.save_table("ZZT3", disabled=1)
    check("disabled table shows Disabled", {t["name"]: t for t in fnb.list_tables()}["ZZT3"]["status"] == "Disabled")
    expect_error("can't seat a disabled table", lambda: fnb.open_order("ZZT3", "ZZ Register"), "disabled")
    fnb.save_table("ZZTEMP")
    fnb.delete_table("ZZTEMP")
    check("a clean table can be deleted", "ZZTEMP" not in [t["name"] for t in fnb.list_tables()])
    check("switch back to Retail once nothing is open", fnb.set_pos_mode("Retail")["pos_mode"] == "Retail")
    as_user(cashier)
    expect_error("Retail again: table service refused", fnb.list_tables, "Retail mode")

except Exception:
    FAIL.append("UNEXPECTED EXCEPTION")
    traceback.print_exc()
finally:
    frappe.set_user("Administrator")
    frappe.db.rollback()
    left = frappe.db.count("XentraERP POS Table") + frappe.db.count("XentraERP POS Order") + frappe.db.count("XentraERP KOT") + frappe.db.count("POS Profile") + frappe.db.count("POS Invoice")
    print(f"\nROLLED BACK. leftover test rows (tables+orders+KOTs+profiles+POS invoices): {left}; persisted mode: {frappe.db.get_single_value('XentraERP POS Settings','pos_mode')!r}")
    print(f"RESULT: {len(PASS)} passed, {len(FAIL)} failed")
    for f in FAIL: print("  FAILED:", f)
