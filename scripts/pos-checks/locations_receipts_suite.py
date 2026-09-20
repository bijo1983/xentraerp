import traceback
import frappe
frappe.init(site="197349.xentraerp.local", sites_path=".")
frappe.connect(); frappe.set_user("Administrator")
frappe.db.commit = lambda *a, **k: None   # everything is rolled back at the end
from custom_erp.api import pos, pos_fnb as fnb, pos_core as core
from frappe.utils import add_days, getdate, nowdate, flt

PASS, FAIL = [], []
def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name); print(("  PASS " if cond else "  FAIL ") + name + (f"   [{detail}]" if (detail and not cond) else ""))
def raises(fn, contains=None):
    try: fn()
    except Exception as e:
        m = str(e); return (contains is None or contains.lower() in m.lower()), m[:170]
    return False, "no exception raised"
def expect_error(name, fn, contains=None):
    ok, m = raises(fn, contains); check(name, ok, m)
def as_user(u): frappe.set_user(u)
def one(dt, name, field): return frappe.db.get_value(dt, name, field)

try:
    print("== fixtures")
    cash1, cash2 = "zz.c1@example.com", "zz.c2@example.com"
    for u in (cash1, cash2):
        frappe.get_doc({"doctype": "User", "email": u, "first_name": "ZZ " + u[3:5], "send_welcome_email": 0, "enabled": 1}).insert(ignore_permissions=True)
    company = frappe.get_all("Company", pluck="name")[0]
    frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": "ZZ Card", "type": "Bank", "accounts": [{"company": company, "default_account": "Cash - JC"}]}).insert(ignore_permissions=True)
    for n in ("ZZ Main Reg", "ZZ Other Reg"):
        d = frappe.get_doc({"doctype": "POS Profile", "name": n, "company": company, "warehouse": "Stores - JC", "currency": "BHD", "customer": "Test Customer",
            "selling_price_list": "Standard Selling", "payments": [{"mode_of_payment": "Cash", "default": 1}, {"mode_of_payment": "ZZ Card"}],
            "write_off_account": "Write Off - JC", "write_off_cost_center": "Main - JC", "account_for_change_amount": "Cash - JC", "update_stock": 0})
        d.insert(ignore_permissions=True)
    core.set_exchange_rate("USD", "BHD", 0.377)
    for it in ("Blue Pen", "Cola"): frappe.db.set_value("Item", it, "is_stock_item", 0)
    pos.set_pin(cash1, "482913"); pos.set_pin(cash2, "735120")
    fnb.set_pos_mode("F&B")
    check("fixtures", True)

    print("== locations: setup, validation, permissions")
    as_user(cash1)
    expect_error("cashier can't define locations", lambda: core.save_location("ZZM", "ZZ Main", "Main - JC", "Stores - JC", ["ZZ Main Reg"]), "administrator")
    as_user("Administrator")
    for bad in ("m", "ZZ MAIN", "ZZ-M", "TOOLONGCODE1"):
        expect_error(f"bad location code {bad!r} rejected", lambda b=bad: core.save_location(b, "x"), "2-8 letters")
    expect_error("unknown register rejected", lambda: core.save_location("ZZM", "ZZ Main", None, None, ["No Such"]), "no such register")
    expect_error("unknown cost center rejected", lambda: core.save_location("ZZM", "ZZ Main", "Nope - XX", None, []), "no such cost center")
    core.save_location("zzm", "ZZ Main", "Main - JC", "Stores - JC", ["ZZ Main Reg"])
    core.save_location("ZZO", "ZZ Other", "Main - JC", "Stores - JC", ["ZZ Other Reg"])
    locs = {l["code"]: l for l in core.list_locations()}
    check("location code is normalised to upper case and listed with its registers", locs["ZZM"]["profiles"] == ["ZZ Main Reg"] and locs["ZZO"]["profiles"] == ["ZZ Other Reg"], locs)
    expect_error("a register can serve only one location", lambda: core.save_location("ZZO", "ZZ Other", "Main - JC", "Stores - JC", ["ZZ Other Reg", "ZZ Main Reg"]), "already belongs")
    for dt, tag in (("Sales Invoice", "ZZM-INV-.YYYY.-"), ("POS Invoice", "ZZM-POS-.YYYY.-"), ("Payment Entry", "ZZM-RCT-.YYYY.-")):
        check(f"numbering series registered for {dt}", tag in (frappe.get_meta(dt, cached=False).get_field("naming_series").options or ""), tag)
    check("register -> location lookup", core.location_of("ZZ Main Reg").location_code == "ZZM" and core.location_of("ZZ Other Reg").location_code == "ZZO")
    profs = {p["name"]: p for p in frappe.get_attr("custom_erp.api.pos.list_pos_profiles")()}
    check("register list carries each register's location", profs["ZZ Main Reg"]["location"] == "ZZM" and profs["ZZ Other Reg"]["location_name"] == "ZZ Other", {k: v.get("location") for k, v in profs.items()})

    print("== tables and kitchen are per location")
    fnb.save_table("ZZ-M1", "Main", 4, location="ZZM"); fnb.save_table("ZZ-O1", "Bar", 2, location="ZZO"); fnb.save_table("ZZ-S1", "Shared", 2)
    expect_error("table with unknown location rejected", lambda: fnb.save_table("ZZ-X", location="NOPE"), "no such location")
    names = lambda reg: sorted(t["name"] for t in fnb.list_tables(reg) if t["name"].startswith("ZZ-"))
    check("a register sees its own location's tables plus shared ones", names("ZZ Main Reg") == ["ZZ-M1", "ZZ-S1"] and names("ZZ Other Reg") == ["ZZ-O1", "ZZ-S1"], (names("ZZ Main Reg"), names("ZZ Other Reg")))
    check("no register given -> every table (admin view)", len(names(None)) == 3)
    as_user(cash1)
    sh1 = core.open_shift("ZZ Main Reg", {"BHD": 50})
    check("shift is stamped with its location", sh1["location"] == "ZZM", sh1)
    expect_error("can't seat another location's table", lambda: fnb.open_order("ZZ-O1", "ZZ Main Reg", 2), "belongs to location ZZO")
    as_user(cash2)
    sh2 = core.open_shift("ZZ Other Reg", {"BHD": 20})
    o_oth = fnb.open_order("ZZ-O1", "ZZ Other Reg", 2)
    check("order is stamped with its location", o_oth["location"] == "ZZO", o_oth)
    fnb.set_order_items(o_oth["name"], [{"item_code": "Blue Pen", "qty": 1}]); k_oth = fnb.send_kot(o_oth["name"])["kot"]
    check("KOT carries the location", one("XentraERP KOT", k_oth, "location") == "ZZO")
    as_user(cash1)
    o_m = fnb.open_order("ZZ-M1", "ZZ Main Reg", 2); fnb.set_order_items(o_m["name"], [{"item_code": "Blue Pen", "qty": 1}]); k_m = fnb.send_kot(o_m["name"])["kot"]
    kn = lambda reg: [k["name"] for k in fnb.list_kots(None, reg)]
    check("each location's kitchen sees only its own tickets", k_m in kn("ZZ Main Reg") and k_oth not in kn("ZZ Main Reg") and k_oth in kn("ZZ Other Reg") and k_m not in kn("ZZ Other Reg"))
    check("no register given -> all tickets", k_m in kn(None) and k_oth in kn(None))
    fnb.cancel_order(o_m["name"]) if core.is_manager() else None
    as_user("Administrator"); fnb.cancel_order(o_m["name"]); fnb.cancel_order(o_oth["name"]); as_user(cash1)

    print("== POS Invoice mode: bills carry the location code")
    st = core.settings(); check("default checkout document is POS Invoice", st["checkout_document"] == "POS Invoice", st)
    o = fnb.open_order("ZZ-M1", "ZZ Main Reg", 2); fnb.set_order_items(o["name"], [{"item_code": "Blue Pen", "qty": 2}])
    r = fnb.bill_order(o["name"], "Cash")
    inv = frappe.get_doc("POS Invoice", r["invoice"])
    check("POS Invoice number carries the location code", r["invoice"].startswith("ZZM-POS-"), r["invoice"])
    check("invoice cost center and location come from the location", inv.cost_center == "Main - JC" and r["location"] == "ZZM", (inv.cost_center, r["location"]))
    check("tender ledger carries the location", frappe.db.get_value("XentraERP POS Tender", {"invoice": r["invoice"]}, "location") == "ZZM")
    as_user(cash2)
    r2 = core.retail_checkout("ZZ Other Reg", [{"item_code": "Blue Pen", "qty": 1}], [{"mode_of_payment": "Cash", "tendered": 5}])
    check("another location's bills are numbered with its own code", r2["invoice"].startswith("ZZO-POS-"), r2["invoice"])
    as_user(cash1)

    print("== checkout setting")
    as_user("Administrator")
    expect_error("invalid checkout document rejected", lambda: core.save_pos_settings(checkout_document="Receipt Only"), "must be one of")
    as_user(cash1); expect_error("cashier can't change the checkout document", lambda: core.save_pos_settings(checkout_document="Draft Invoice + Receipt"), "administrator")
    as_user("Administrator"); core.save_pos_settings(checkout_document="Draft Invoice + Receipt")
    check("checkout document saved", core.draft_mode() is True); as_user(cash1)

    print("== draft invoice + receipt (F&B)")
    def si(name): return frappe.get_doc("Sales Invoice", name)
    def receipts(inv): return frappe.get_all("Payment Entry Reference", filters={"reference_doctype": "Sales Invoice", "reference_name": inv}, fields=["parent", "allocated_amount"])
    o = fnb.open_order("ZZ-M1", "ZZ Main Reg", 2); OID = o["name"]
    fnb.set_order_items(OID, [{"item_code": "Blue Pen", "qty": 2}])
    cb = fnb.close_bill(OID); draft = cb["totals"]["invoice"]
    check("closing the check creates a DRAFT Sales Invoice", si(draft).docstatus == 0 and draft.startswith("ZZM-INV-"), draft)
    check("the draft carries the location's cost center and remark", si(draft).items[0].cost_center == "Main - JC" and "ZZM" in (si(draft).remarks or ""))
    check("order points at the draft", frappe.db.get_value("XentraERP POS Order", OID, "draft_invoice") == draft)
    check("nothing is posted to the books yet (no GL entries for a draft)", frappe.db.count("GL Entry", {"voucher_no": draft}) == 0)
    fnb.reopen_bill(OID)
    check("re-opening discards the draft", not frappe.db.exists("Sales Invoice", draft) and not frappe.db.get_value("XentraERP POS Order", OID, "draft_invoice"))
    cb = fnb.close_bill(OID); draft = cb["totals"]["invoice"]
    r = fnb.bill_order(OID, payments=[{"mode_of_payment": "Cash", "tendered": 20}])
    inv = si(r["invoice"]); rc = receipts(inv.name)
    check("the SAME draft is submitted on completion", r["invoice"] == draft and inv.docstatus == 1, (r["invoice"], draft))
    check("invoice is Paid with nothing outstanding", inv.status == "Paid" and abs(inv.outstanding_amount) < 0.001, (inv.status, inv.outstanding_amount))
    check("one receipt (Payment Entry) against it, allocating the amount due, not the cash handed over", len(rc) == 1 and abs(rc[0].allocated_amount - 10) < 0.001, rc)
    pe = frappe.get_doc("Payment Entry", rc[0].parent)
    check("receipt is submitted, a Receive, with the chosen mode of payment and the location series", pe.docstatus == 1 and pe.payment_type == "Receive" and pe.mode_of_payment == "Cash" and pe.name.startswith("ZZM-RCT-"), (pe.docstatus, pe.mode_of_payment, pe.name))
    check("receipt posts to the mode's account", pe.paid_to == "Cash - JC" and frappe.db.count("GL Entry", {"voucher_no": pe.name}) >= 2)
    tn = frappe.get_all("XentraERP POS Tender", filters={"invoice": inv.name}, fields=["tendered", "receipt", "invoice_doctype", "location", "shift"], order_by="creation asc")
    check("tender ledger: cash in, change out, linked to the receipt and shift", sorted(round(t.tendered, 3) for t in tn) == [-10.0, 20.0] and any(t.receipt == pe.name for t in tn) and all(t.invoice_doctype == "Sales Invoice" and t.location == "ZZM" and t.shift == sh1["name"] for t in tn), tn)
    check("order Billed, table free", frappe.db.get_value("XentraERP POS Order", OID, "status") == "Billed" and {t["name"]: t for t in fnb.list_tables("ZZ Main Reg")}["ZZ-M1"]["status"] == "Available")

    print("== split tender across methods and currencies (receipts per leg)")
    def new_order(qty): 
        x = fnb.open_order("ZZ-M1", "ZZ Main Reg", 2)["name"]; fnb.set_order_items(x, [{"item_code": "Blue Pen", "qty": qty}]); return x
    x = new_order(2)
    r = fnb.bill_order(x, payments=[{"mode_of_payment": "Cash", "tendered": 8}, {"mode_of_payment": "ZZ Card", "tendered": 4}])
    rc = receipts(r["invoice"]); amts = sorted(round(c.allocated_amount, 3) for c in rc)
    check("card is taken in full, cash absorbs the change: receipts 4 (card) + 6 (cash)", amts == [4.0, 6.0] and abs(r["change"] - 2) < 0.001, (amts, r["change"]))
    check("each receipt has its own mode of payment", sorted(frappe.db.get_value("Payment Entry", c.parent, "mode_of_payment") for c in rc) == ["Cash", "ZZ Card"])
    x = new_order(2)
    r = fnb.bill_order(x, payments=[{"mode_of_payment": "Cash", "currency": "USD", "tendered": 10}, {"mode_of_payment": "Cash", "tendered": 6.23}])
    rc = receipts(r["invoice"])
    check("multi-currency: two receipts, invoice Paid", len(rc) == 2 and si(r["invoice"]).status == "Paid", (len(rc), si(r["invoice"]).status))
    check("USD leg noted on its receipt", any("USD" in (frappe.db.get_value("Payment Entry", c.parent, "remarks") or "") for c in rc))

    print("== partial payment: submitted, Partly Paid, balance stays open")
    x = new_order(4)          # 20.000
    n_si = frappe.db.count("Sales Invoice")
    expect_error("a short payment without the partial option is refused", lambda: fnb.bill_order(x, payments=[{"mode_of_payment": "Cash", "tendered": 8}]), "short by 12")
    check("…and leaves no stray draft behind", frappe.db.count("Sales Invoice") == n_si)
    r = fnb.bill_order(x, payments=[{"mode_of_payment": "Cash", "tendered": 8}], allow_partial=1)
    inv = si(r["invoice"])
    check("invoice is SUBMITTED and Partly Paid, balance 12", inv.docstatus == 1 and inv.status == "Partly Paid" and abs(inv.outstanding_amount - 12) < 0.001, (inv.docstatus, inv.status, inv.outstanding_amount))
    check("response says partial with the balance", r["partial"] is True and abs(r["balance"] - 12) < 0.001 and r["order_status"] == "Part Paid", r)
    check("order is Part Paid and the table stays occupied", frappe.db.get_value("XentraERP POS Order", x, "status") == "Part Paid" and {t["name"]: t for t in fnb.list_tables("ZZ Main Reg")}["ZZ-M1"]["status"] == "Occupied")
    check("the floor shows it as part-paid", {t["name"]: t for t in fnb.list_tables("ZZ Main Reg")}["ZZ-M1"]["orders"][0]["part_paid"] is True)
    check("only 8 has been received in the books", len(receipts(inv.name)) == 1 and abs(receipts(inv.name)[0].allocated_amount - 8) < 0.001)
    expect_error("a part-paid order's items are locked", lambda: fnb.set_order_items(x, [{"item_code": "Blue Pen", "qty": 1}]), "part paid")
    expect_error("a part-paid order can't be cancelled", lambda: fnb.cancel_order(x), "part paid")
    op = fnb.get_order(x); check("order payload shows the balance", abs(op["balance"] - 12) < 0.001 and op["draft_invoice"] == inv.name, op)
    bt = fnb.bill_totals(x); check("bill_totals returns the balance", abs(bt["due"] - 12) < 0.001 and bt.get("partial"), bt)
    ob = core.list_open_balances("ZZ Main Reg"); mine = [b for b in ob if b["invoice"] == inv.name]
    check("pending balances list shows it (with its table and amounts)", mine and abs(mine[0]["balance"] - 12) < 0.001 and abs(mine[0]["paid"] - 8) < 0.001 and mine[0]["table"] == "ZZ-M1" and mine[0]["status"] == "Partly Paid", mine)
    check("…and not on another register's list", inv.name not in [b["invoice"] for b in core.list_open_balances("ZZ Other Reg")])

    print("== finish billing on complete payment")
    r = fnb.bill_order(x, payments=[{"mode_of_payment": "Cash", "tendered": 5}], allow_partial=1)
    check("second partial: still Partly Paid, balance 7, 2 receipts", r["partial"] and abs(r["balance"] - 7) < 0.001 and len(receipts(inv.name)) == 2 and frappe.db.get_value("XentraERP POS Order", x, "status") == "Part Paid", r)
    r = fnb.bill_order(x, payment_method="Cash")
    inv.reload()
    check("paying the rest (single method shortcut) completes it: Paid, balance 0", inv.status == "Paid" and abs(inv.outstanding_amount) < 0.001 and r["partial"] is False, (inv.status, inv.outstanding_amount))
    check("order Billed, table free, gone from pending balances", frappe.db.get_value("XentraERP POS Order", x, "status") == "Billed" and {t["name"]: t for t in fnb.list_tables("ZZ Main Reg")}["ZZ-M1"]["status"] == "Available" and inv.name not in [b["invoice"] for b in core.list_open_balances()])
    check("three receipts in total, each Submitted", len(receipts(inv.name)) == 3 and all(frappe.db.get_value("Payment Entry", c.parent, "docstatus") == 1 for c in receipts(inv.name)))
    x = new_order(4); r = fnb.bill_order(x, payments=[{"mode_of_payment": "Cash", "tendered": 10}], allow_partial=1)
    r2 = fnb.bill_order(x, payments=[{"mode_of_payment": "Cash", "tendered": 20}])
    check("overpaying the last balance gives change (10 owed, 20 handed over)", abs(r2["change"] - 10) < 0.001 and si(r["invoice"]).status == "Paid", r2)
    expect_error("an already-paid order can't be billed again", lambda: fnb.bill_order(x, "Cash"), "already billed")

    print("== retail: partial payment and settling from the pending list")
    r = core.retail_checkout("ZZ Main Reg", [{"item_code": "Blue Pen", "qty": 2}], [{"mode_of_payment": "Cash", "tendered": 3}], None) if False else None
    try:
        core.retail_checkout("ZZ Main Reg", [{"item_code": "Blue Pen", "qty": 2}], [{"mode_of_payment": "Cash", "tendered": 3}])
        check("retail short payment refused by default", False)
    except Exception as e:
        check("retail short payment refused by default", "short by" in str(e))
    n0 = len(core.list_open_balances("ZZ Main Reg"))
    rr = frappe.get_attr("custom_erp.api.pos_core.retail_checkout")
    import inspect
    check("retail_checkout exposes allow_partial", "allow_partial" in inspect.signature(rr).parameters)
    if True:
        r = rr("ZZ Main Reg", [{"item_code": "Blue Pen", "qty": 2}], [{"mode_of_payment": "Cash", "tendered": 3}], None, 1)
        check("retail partial: Partly Paid invoice, location series", r["partial"] and si(r["invoice"]).status == "Partly Paid" and r["invoice"].startswith("ZZM-INV-"), r)
        check("appears in pending balances (no table)", any(b["invoice"] == r["invoice"] and b["table"] is None for b in core.list_open_balances("ZZ Main Reg")))
        expect_error("settle: another register's PIN restriction is honoured", lambda: (as_user("Administrator"), pos.set_pin(cash1, "482913", pos_profile="ZZ Other Reg"), as_user(cash1), core.settle_invoice(r["invoice"], [{"mode_of_payment": "Cash", "tendered": 7}])), "restricted to the 'ZZ Other Reg'")
        as_user("Administrator"); pos.set_pin(cash1, "482913", pos_profile=""); as_user(cash1)
        expect_error("settle: not a POS invoice", lambda: core.settle_invoice("NO-SUCH-INV", [{"mode_of_payment": "Cash", "tendered": 1}]), None)
        s = core.settle_invoice(r["invoice"], [{"mode_of_payment": "Cash", "tendered": 7}])
        check("settle_invoice pays the balance: Paid", not s["partial"] and si(r["invoice"]).status == "Paid" and abs(s["balance"]) < 0.001, s)
        expect_error("settle: already fully paid", lambda: core.settle_invoice(r["invoice"], [{"mode_of_payment": "Cash", "tendered": 1}]), "already fully paid")

    print("== shift report and cash-up include invoice + receipts")
    rep = core.shift_report(sh1["name"]); cr = {c["currency"]: c for c in rep["cash"]}
    taken = flt(frappe.db.sql("select coalesce(sum(tendered),0) from `tabXentraERP POS Tender` where shift=%s and mode_type='Cash' and currency='BHD'", (sh1["name"],))[0][0])
    check("expected drawer = opening + net cash taken across POS Invoices, invoices and receipts", abs(cr["BHD"]["expected"] - (50 + taken)) < 0.001, (cr["BHD"], taken))
    check("shift sales total counts Sales Invoices too", rep["invoice_count"] >= 6 and rep["total_sales"] > 30, (rep["invoice_count"], rep["total_sales"]))

    print("== end-of-day report: locations, part-paid balances")
    x = new_order(4); pr = fnb.bill_order(x, payments=[{"mode_of_payment": "Cash", "tendered": 8}], allow_partial=1)   # leaves 12 open
    as_user("Administrator")
    bd = str(core.business_date())
    e_all = core.end_of_day_report(bd); e_m = core.end_of_day_report(bd, "ZZM"); e_o = core.end_of_day_report(bd, "ZZO")
    check("EOD by location: ZZM only counts its own bills", e_m["invoice_count"] >= 6 and e_o["invoice_count"] == 1 and e_all["invoice_count"] >= e_m["invoice_count"] + e_o["invoice_count"], (e_m["invoice_count"], e_o["invoice_count"], e_all["invoice_count"]))
    check("EOD location report is labelled", e_m["location"] == "ZZM")
    check("EOD by_location breakdown lists both", {r["location"] for r in e_all["by_location"]} >= {"ZZM", "ZZO"}, e_all["by_location"])
    check("EOD shows the part-paid balance still to collect", abs(e_m["outstanding_balance"] - 12) < 0.001, e_m["outstanding_balance"])
    check("EOD warns about part-paid invoices", any("part-paid" in w for w in e_m["warnings"]), e_m["warnings"])
    tn = frappe.db.sql("select distinct invoice, invoice_doctype from `tabXentraERP POS Tender` where business_date=%s and location='ZZM'", (bd,))
    exp = sum(flt(frappe.db.get_value(dt or "POS Invoice", n, "base_grand_total")) for n, dt in tn)
    check("EOD gross = sum of every POS Invoice and Sales Invoice for the location, from the ledger", abs(e_m["gross_sales"] - exp) < 0.001 and any(dt == "Sales Invoice" for _, dt in tn) and any(dt == "POS Invoice" for _, dt in tn), (e_m["gross_sales"], exp))
    check("EOD top items merge both invoice types", e_m["top_items"] and e_m["top_items"][0]["item_code"] == "Blue Pen" and e_m["top_items"][0]["qty"] >= 15, e_m["top_items"])
    check("EOD F&B covers include part-paid orders", e_m["fnb"]["billed_orders"] >= 5, e_m["fnb"])
    check("EOD shifts filtered by location", all(s["location"] == "ZZM" for s in e_m["shifts"]) and len(e_m["shifts"]) == 1, e_m["shifts"])

    print("== settle the leftover, POS Invoice mode can't keep balances, location lifecycle")
    as_user(cash1)
    fnb.bill_order(x, payment_method="Cash")
    as_user("Administrator"); core.save_pos_settings(checkout_document="POS Invoice"); as_user(cash1)
    expect_error("POS Invoice mode: balances aren't kept open", lambda: core.settle_invoice("X", [{"mode_of_payment": "Cash", "tendered": 1}]), "only kept open")
    as_user("Administrator")
    expect_error("a location with trading history can't be deleted", lambda: core.delete_location("ZZM"), "history")
    core.save_location("ZZM", "ZZ Main", "Main - JC", "Stores - JC", ["ZZ Main Reg"], disabled=1)
    check("a disabled location stops applying to its registers", core.location_of("ZZ Main Reg") is None)
    as_user(cash1)
    o = fnb.open_order("ZZ-M1", "ZZ Main Reg", 1); fnb.set_order_items(o["name"], [{"item_code": "Blue Pen", "qty": 1}])
    r = fnb.bill_order(o["name"], "Cash")
    check("…so its bills fall back to the standard numbering", r["invoice"].startswith("ACC-PSINV-") and r["location"] is None, r["invoice"])
    as_user("Administrator")
    core.save_location("ZZTMP", "Temp", None, None, [])
    core.delete_location("ZZTMP"); check("an unused location can be deleted", not frappe.db.exists("XentraERP POS Location", "ZZTMP"))

except Exception:
    FAIL.append("UNEXPECTED EXCEPTION"); traceback.print_exc()
finally:
    frappe.set_user("Administrator"); frappe.db.rollback(); frappe.clear_cache()
    left = sum(frappe.db.count(d) for d in ("XentraERP POS Table","XentraERP POS Order","XentraERP KOT","POS Profile","POS Invoice","XentraERP POS Location","XentraERP POS Shift","XentraERP POS Tender","Payment Entry")) - 0
    opts = frappe.get_meta("Sales Invoice", cached=False).get_field("naming_series").options
    print(f"\nROLLED BACK. leftover rows: {left}; ZZM series still in Sales Invoice options: {'ZZM-INV' in opts}")
    print(f"RESULT: {len(PASS)} passed, {len(FAIL)} failed"); [print("  FAILED:", f) for f in FAIL]
