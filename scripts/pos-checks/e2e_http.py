import json, sys, requests
B = "https://pos.xentraerp.net"
S_DIR = "/home/xentraerp/scripts/pos-checks"
OK, BAD = [], []
def check(name, cond, detail=""):
    (OK if cond else BAD).append(name); print(("  PASS " if cond else "  FAIL ") + name + (f"  [{detail}]" if not cond and detail else ""))
def sess():
    s = requests.Session(); s.cookies.set("xentra_tenant", "197349", domain="pos.xentraerp.net"); return s
def call(s, method, **args):
    r = s.post(f"{B}/api/method/{method}", json=args, headers={"Accept": "application/json"}, timeout=60)
    try: j = r.json()
    except Exception: j = {}
    return r.status_code, j
def msg(j):
    try: return json.loads(json.loads(j["_server_messages"])[0])["message"]
    except Exception: return str(j)[:150]
P = "custom_erp.api."

print("== the site"); s0 = requests.Session()
r = s0.get(B + "/"); check("index served over HTTPS", r.status_code == 200 and 'id="app"' in r.text)
check("SPA deep link /floor works (fallback to index)", s0.get(B + "/floor").status_code == 200 and 'id="app"' in s0.get(B + "/order/POSORD-00001").text)
asset = [l for l in r.text.split('"') if l.startswith("/assets/") and l.endswith(".js")][0]
ra = s0.get(B + asset); check("hashed asset cached hard", ra.status_code == 200 and "immutable" in ra.headers.get("cache-control", ""))
check("HTTP redirects to HTTPS", requests.get("http://pos.xentraerp.net/", allow_redirects=False).status_code == 301)
lk = requests.Session(); rlk = lk.post(B + "/api/method/" + P + "signup.tenant_lookup", json={"tenant_code": "197349"}); check("tenant lookup (control plane, no tenant cookie) works", rlk.status_code == 200 and "organization_name" in rlk.text, rlk.text[:120])

print("== PIN login through the proxy")
cash, mgr = sess(), sess()
code, j = call(cash, P + "pos.pin_login", pin="246810"); check("cashier PIN login", code == 200 and j["message"]["user"]["name"] == "zz.e2e.cashier@example.com", (code, msg(j)))
code, j = call(mgr, P + "pos.pin_login", pin="135790"); check("manager PIN login", code == 200 and "System Manager" in j["message"]["user"]["roles"], (code, msg(j)))
check("session cookie issued", "sid" in cash.cookies.get_dict() and cash.cookies.get_dict()["sid"] != "Guest")
code, j = call(cash, "xentraerp.auth.get_logged_user"); check("aliased method name reaches the backend", code == 200 and j["message"] == "zz.e2e.cashier@example.com", (code, j))
code, j = call(sess(), P + "pos.pin_login", pin="000000"); check("wrong PIN refused", code >= 400 and "Incorrect PIN" in msg(j), msg(j))

print("== mode toggle: only a tenant admin")
code, j = call(cash, P + "pos_core.get_pos_settings"); check("cashier sees Retail mode, no switch", code == 200 and j["message"]["pos_mode"] == "Retail" and j["message"]["can_switch"] is False, j)
code, j = call(cash, P + "pos_core.set_pos_mode", mode="F&B"); check("cashier cannot switch mode (403)", code == 403, (code, msg(j)))
code, j = call(cash, P + "pos_fnb.list_tables"); check("Retail: table service refused", code >= 400 and "Retail mode" in msg(j), msg(j))
code, j = call(mgr, P + "pos_core.set_pos_mode", mode="F&B"); check("admin switches to F&B", code == 200 and j["message"]["pos_mode"] == "F&B", (code, msg(j)))
code, j = call(cash, P + "pos_core.get_pos_settings"); check("cashier now sees F&B", j["message"]["pos_mode"] == "F&B")

print("== F&B flow")
code, j = call(mgr, P + "pos_fnb.save_table", table_name="ZZE1", zone="Main", seats=4); check("admin adds a table", code == 200, msg(j))
code, j = call(cash, P + "pos_fnb.save_table", table_name="ZZE9"); check("cashier cannot add tables (403)", code == 403)
code, j = call(cash, P + "pos_fnb.list_tables"); tab = [t for t in j["message"] if t["name"] == "ZZE1"][0]; check("table listed, Available", tab["status"] == "Available")
code, j = call(cash, P + "pos_fnb.open_order", table="ZZE1", pos_profile="ZZ E2E Register", guests=3); oid = j["message"]["name"]; check("seat the table", code == 200 and oid.startswith("POSORD-"), msg(j))
code, j = call(cash, P + "pos_fnb.set_order_items", order=oid, items=json.dumps([{"item_code": "Blue Pen", "qty": 2, "note": "test"}])); check("add items, server prices them", code == 200 and j["message"]["total"] == 10.0, msg(j))
code, j = call(cash, P + "pos_fnb.send_kot", order=oid); kot = j["message"]["kot"]; check("send to kitchen creates a KOT", code == 200 and kot.startswith("KOT-"), msg(j))
code, j = call(cash, P + "pos_fnb.list_kots"); check("kitchen sees the ticket", any(k["name"] == kot and k["status"] == "New" for k in j["message"]))
for st in ("Preparing", "Ready", "Served"):
    code, j = call(cash, P + "pos_fnb.set_kot_status", kot=kot, status=st); check(f"KOT -> {st}", code == 200 and j["message"]["status"] == st, msg(j))
code, j = call(cash, P + "pos_fnb.close_bill", order=oid); check("close bill returns what is owed", code == 200 and j["message"]["totals"]["due"] == 10.0, msg(j))
code, j = call(cash, "xentraerp.auth.get_logged_user"); check("cashier is STILL logged in after close bill (session not clobbered)", code == 200 and j["message"] == "zz.e2e.cashier@example.com", (code, j))
code, j = call(cash, P + "pos_fnb.set_order_items", order=oid, items="[]"); check("closed bill is locked", code >= 400 and "bill is closed" in msg(j), msg(j))
code, j = call(cash, P + "pos_fnb.bill_order", order=oid, payment_method="Cash"); check("billing without an open shift is refused with a clear message", code == 417 and "shift" in msg(j).lower(), msg(j))
code, j = call(cash, P + "pos_core.list_checkout_currencies", pos_profile="ZZ E2E Register"); check("checkout currencies listed", code == 200 and j["message"][0]["base"] is True, msg(j))
code, j = call(cash, "xentraerp.auth.get_logged_user"); check("cashier still logged in after a refused bill", code == 200 and j["message"] == "zz.e2e.cashier@example.com", (code, j))
code, j = call(cash, P + "pos_fnb.cancel_order", order=oid); check("cashier can't cancel after sending to kitchen (clear message)", code >= 400 and "manager" in msg(j).lower(), msg(j))
code, j = call(mgr, P + "pos_fnb.cancel_order", order=oid); check("manager cancels the order", code == 200, msg(j))

print("== registers, cashier access, staff and locations")
code, j = call(cash, P + "pos.list_pos_profiles"); reg = [r for r in j.get("message", []) if r["name"] == "ZZ E2E Register"]
check("register list works (was a reserved-word SQL bug)", code == 200 and reg and reg[0]["payment_methods"] == ["Cash"], msg(j))
ri = cash.get(B + "/api/resource/Item", params={"fields": json.dumps(["name", "item_name"]), "limit_page_length": 5}, headers={"Accept": "application/json"})
check("a cashier can read the item grid (POS Cashier role)", ri.status_code == 200 and len(ri.json().get("data", [])) > 0, ri.text[:150])
rw = cash.post(B + "/api/resource/Item", json={"item_code": "ZZ-HACK", "item_name": "x", "item_group": "Products", "stock_uom": "Nos"}, headers={"Accept": "application/json"})
check("…but cannot create items", rw.status_code in (403, 417) and "ZZ-HACK" not in rw.text.replace("permission", ""), rw.status_code)
code, j = call(cash, P + "pos.list_pos_users"); check("cashier cannot list staff (403)", code == 403)
code, j = call(mgr, P + "pos.create_pos_user", email="zz.e2e.staff@example.com", full_name="ZZ E2E Staff", pin="864209", pos_profile="ZZ E2E Register"); check("admin creates a staff member with a PIN", code == 200, msg(j))
staff = sess(); code, j = call(staff, P + "pos.pin_login", pin="864209"); check("the new staff member signs in with their PIN", code == 200 and j["message"]["pos_profile"] == "ZZ E2E Register" and "POS Cashier" in j["message"]["user"]["roles"], msg(j))
code, j = call(mgr, P + "pos.list_pos_users"); check("admin sees staff with PIN status", code == 200 and any(u["user"] == "zz.e2e.staff@example.com" and u["active"] for u in j["message"]))
code, j = call(mgr, P + "pos.set_pin_active", user="zz.e2e.staff@example.com", active=0); check("admin switches a PIN off", code == 200)
code, j = call(sess(), P + "pos.pin_login", pin="864209"); check("…and that PIN no longer signs in", code >= 400 and "Incorrect PIN" in msg(j), msg(j))
code, j = call(mgr, P + "pos_core.save_location", location_code="zze", location_name="ZZ E2E Site", cost_center="Main - JC", warehouse="Stores - JC", profiles=json.dumps(["ZZ E2E Register"])); check("admin defines a location for the register", code == 200 and j["message"]["code"] == "ZZE", msg(j))
code, j = call(cash, P + "pos.list_pos_profiles"); reg = [r for r in j["message"] if r["name"] == "ZZ E2E Register"][0]; check("the register now shows its location", reg["location"] == "ZZE" and reg["location_name"] == "ZZ E2E Site", reg)
code, j = call(cash, P + "pos_core.save_location", location_code="ZZX", location_name="x"); check("cashier cannot define locations (403)", code == 403)
code, j = call(mgr, P + "pos_fnb.save_table", table_name="ZZE2", zone="Main", seats=2, location="ZZE"); check("admin puts a table in the location", code == 200, msg(j))
code, j = call(mgr, P + "pos_fnb.save_table", table_name="ZZE3", zone="Elsewhere", seats=2, location="ZZE")
code, j = call(cash, P + "pos_fnb.list_tables", pos_profile="ZZ E2E Register"); check("the register's floor shows its location's tables", code == 200 and {"ZZE2", "ZZE3"} <= {t["name"] for t in j["message"]}, msg(j))

print("== draft invoice lifecycle over HTTP")
code, j = call(mgr, P + "pos_core.save_pos_settings", checkout_document="Draft Invoice + Receipt"); check("admin switches checkout to Draft Invoice + Receipt", code == 200 and j["message"]["checkout_document"] == "Draft Invoice + Receipt", msg(j))
code, j = call(cash, P + "pos_core.get_pos_settings"); check("cashier's app sees the new checkout mode", j["message"]["checkout_document"] == "Draft Invoice + Receipt")
code, j = call(cash, P + "pos_fnb.open_order", table="ZZE2", pos_profile="ZZ E2E Register", guests=2); o2 = j["message"]["name"]
check("order is stamped with the location", code == 200 and j["message"]["location"] == "ZZE", msg(j))
call(cash, P + "pos_fnb.set_order_items", order=o2, items=json.dumps([{"item_code": "Blue Pen", "qty": 2}]))
code, j = call(cash, P + "pos_fnb.close_bill", order=o2); dinv = j["message"]["totals"].get("invoice", "")
check("closing the check creates a Draft Sales Invoice numbered with the location code", code == 200 and dinv.startswith("ZZE-INV-"), (code, msg(j), dinv))
import subprocess
def probe(n):
    r = subprocess.run(["/home/frappe/innovegic-bench/env/bin/python", S_DIR + "/e2e_probe.py", n], cwd="/home/frappe/innovegic-bench/sites", capture_output=True, text=True)
    return json.loads([l for l in r.stdout.splitlines() if l.startswith("{")][-1])
pr = probe(dinv)
check("it really is a Draft (docstatus 0) with the location's cost center", pr["exists"] and pr["docstatus"] == 0 and pr["cost_center"] == "Main - JC", pr)
code, j = call(cash, "xentraerp.auth.get_logged_user"); check("cashier still logged in after creating a draft", code == 200 and j["message"] == "zz.e2e.cashier@example.com")
code, j = call(cash, P + "pos_fnb.reopen_bill", order=o2); check("re-opening the check", code == 200, msg(j))
check("…discards the draft invoice", probe(dinv)["exists"] is False)
code, j = call(cash, P + "pos_core.list_open_balances", pos_profile="ZZ E2E Register"); check("pending balances endpoint answers (nothing pending)", code == 200 and j["message"] == [], msg(j))
code, j = call(cash, P + "pos_core.settle_invoice", invoice="NOPE-1", payments=json.dumps([{"mode_of_payment": "Cash", "tendered": 1}])); check("settling a non-POS invoice is refused", code >= 400 and "isn't a POS invoice" in msg(j), msg(j))
code, j = call(cash, P + "pos_core.retail_checkout", pos_profile="ZZ E2E Register", items=json.dumps([{"item_code": "Blue Pen", "qty": 1}]), payments=json.dumps([{"mode_of_payment": "Cash", "tendered": 1}]), allow_partial=1); check("part payment without a shift gets the shift message", code == 417 and "shift" in msg(j).lower(), msg(j))
call(mgr, P + "pos_fnb.cancel_order", order=o2)
code, j = call(mgr, P + "pos_core.save_pos_settings", checkout_document="POS Invoice"); check("admin switches back to POS Invoice", code == 200 and j["message"]["checkout_document"] == "POS Invoice")
code, j = call(cash, P + "pos_core.retail_checkout", pos_profile="ZZ E2E Register", items=json.dumps([{"item_code": "Blue Pen", "qty": 1}]), payments=json.dumps([{"mode_of_payment": "Cash", "tendered": 1}]), allow_partial=1); check("part payment is refused in POS Invoice mode", code >= 400 and ("Draft Invoice" in msg(j) or "shift" in msg(j).lower()), msg(j))
code, j = call(mgr, P + "pos_fnb.delete_table", table="ZZE2"); call(mgr, P + "pos_fnb.delete_table", table="ZZE3")

print("== reports and admin")
code, j = call(cash, P + "pos_core.end_of_day_report"); check("cashier cannot run end-of-day (403)", code == 403)
code, j = call(mgr, P + "pos_core.end_of_day_report"); check("admin runs end-of-day", code == 200 and "gross_sales" in j["message"] and "fnb" in j["message"], msg(j))
code, j = call(mgr, P + "pos_core.save_pos_settings", pos_247=1); check("admin saves 24/7", code == 200 and j["message"]["pos_247"] == 1, msg(j))
code, j = call(mgr, P + "pos_core.save_pos_settings", pos_247=0)

print("== restore")
code, j = call(mgr, P + "pos_fnb.delete_table", table="ZZE1")
code, j = call(mgr, P + "pos_core.set_pos_mode", mode="Retail"); check("admin switches back to Retail", code == 200 and j["message"]["pos_mode"] == "Retail", msg(j))
for s in (cash, mgr): call(s, "logout")
print(f"\nE2E RESULT: {len(OK)} passed, {len(BAD)} failed"); [print("  FAILED:", b) for b in BAD]
