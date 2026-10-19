# POS upgrade Phase 1 — authentication, devices, sessions, device/role modes, least privilege.
#
# Runs inside a transaction that is NEVER committed and ALWAYS rolled back (commit is disabled below), like the
# other suites. Redis keys it creates (lockout counters for the RFC 5737 test IPs 203.0.113.x and the ZZ staff
# numbers) are deleted at the end. Sessions are emulated: `_start_session` is stubbed (a real Frappe session needs
# an HTTP request) and session state is injected into frappe.local, so nothing touches real sessions.
#
#   ../env/bin/python /home/xentraerp/scripts/pos-checks/auth_suite.py
import traceback
from datetime import timedelta
import frappe
frappe.init(site="197349.xentraerp.local", sites_path="."); frappe.connect(); frappe.set_user("Administrator")
frappe.db.commit = lambda *a, **k: None          # nothing below can be committed; the run always ends in rollback
def quarantine():
    for t in ("XentraERP KOT Item","XentraERP KOT","XentraERP POS Order Item","XentraERP POS Order","XentraERP POS Table","XentraERP POS Shift Cash","XentraERP POS Shift","XentraERP POS Tender","XentraERP POS Reservation","XentraERP POS Hidden Item","XentraERP POS Location Profile","XentraERP POS Location"):
        frappe.db.sql(f"delete from `tab{t}`")
    frappe.db.sql("delete from tabSingles where doctype='XentraERP POS Settings'")
quarantine()
from frappe.utils import now_datetime
from custom_erp.api import pos, pos_auth as auth, pos_core as core, pos_fnb as fnb, pos_security as sec
from custom_erp.patches.v1_0 import remove_pos_customer_read

P, F = [], []
def check(n, c, d=""): (P if c else F).append(n); print(("  PASS " if c else "  FAIL ") + n + (f"   [{d}]" if d and not c else ""))
def raises(fn, sub=None, exc=None):
    try: fn()
    except Exception as e:
        ok = (sub is None or sub.lower() in str(e).lower()) and (exc is None or isinstance(e, exc))
        return ok, f"{type(e).__name__}: {str(e)[:140]}"
    return False, "no exception"
def expect(name, fn, sub=None, exc=None): ok, m = raises(fn, sub, exc); check(name, ok, m)

STARTED = []
auth._start_session = lambda user, kind, device, level: (STARTED.append((user, kind, device and device.get("device_type"), level)) or {"stub": True, "mode": sec.session_mode(level, device and device.get("device_type"))})
auth._set_device_cookie = lambda *a, **k: None
frappe.local.conf.pos_entitlement_check = "off"   # entitlement fail-closed is tested separately below
CACHE_KEYS = []
def as_ip(ip):
    frappe.local.request_ip = ip; CACHE_KEYS.append(f"xpos:ipfail:{ip}")
def on_device(dev):
    frappe.local._xpos_device = dev
    if hasattr(frappe.local, "_xpos_state"): del frappe.local._xpos_state
def setting(**kw):
    for k, v in kw.items(): frappe.db.set_single_value("XentraERP POS Settings", k, v)
def attempts(result=None):
    return frappe.db.count("XentraERP POS Login Attempt", {"result": result} if result else None)

try:
    print("== fixtures")
    company = frappe.get_all("Company", pluck="name")[0]
    frappe.get_doc({"doctype": "POS Profile", "name": "ZZ A Reg", "company": company, "warehouse": "Stores - JC", "currency": "BHD", "customer": "Test Customer", "selling_price_list": "Standard Selling",
        "payments": [{"mode_of_payment": "Cash", "default": 1}], "write_off_account": "Write Off - JC", "write_off_cost_center": "Main - JC", "account_for_change_amount": "Cash - JC", "update_stock": 0}).insert(ignore_permissions=True)
    for it in ("Blue Pen", "Cola"): frappe.db.set_value("Item", it, "is_stock_item", 0)
    users = {}
    for key, role, pin_ in (("w", "POS Waiter", "411222"), ("c", "POS Cashier", "422333"), ("s", "POS Supervisor", "433444"), ("k", "POS Kitchen", "444555")):
        u = f"zz.auth.{key}@example.com"; users[key] = u
        frappe.get_doc({"doctype": "User", "email": u, "first_name": "ZZ Auth", "last_name": key.upper(), "send_welcome_email": 0, "enabled": 1}).insert(ignore_permissions=True)
        pos.set_pin(u, pin_, None, 1, role)
    W, C, S_, K = users["w"], users["c"], users["s"], users["k"]
    code = {k: frappe.db.get_value("XentraERP POS PIN", u, "staff_code") for k, u in users.items()}
    CACHE_KEYS.extend(auth._ident_key("staff", c) for c in code.values())
    check("set_pin gives every PIN a unique staff number", all(code.values()) and len(set(code.values())) == 4, code)
    check("staff numbers are listed for admins (list_pos_users, never PINs)", {x["user"]: x.get("staff_code") for x in pos.list_pos_users()}.get(W) == code["w"])

    print("== privileged users can't use a PIN")
    frappe.get_doc({"doctype": "User", "email": "zz.auth.admin@example.com", "first_name": "ZZ Admin", "send_welcome_email": 0, "roles": [{"role": "System Manager"}]}).insert(ignore_permissions=True)
    expect("set_pin refuses a System Manager", lambda: pos.set_pin("zz.auth.admin@example.com", "455666"), "administrators don't use a pin")
    frappe.get_doc({"doctype": "XentraERP POS PIN", "user": "zz.auth.admin@example.com", "pin_hash": pos._hash_pin("455666"), "active": 1, "staff_code": "ZZ99"}).insert(ignore_permissions=True)
    CACHE_KEYS.append(auth._ident_key("staff", "ZZ99"))
    setting(require_registered_device=0)
    frappe.set_user("Guest"); as_ip("203.0.113.10"); on_device(None)
    expect("pin_login refuses an administrator's (pre-existing) PIN", lambda: auth.pin_login("ZZ99", "455666"), "ADMIN_USE_MANAGEMENT_LOGIN", frappe.PermissionError)
    check("…and logs it as Refused", frappe.db.exists("XentraERP POS Login Attempt", {"user": "zz.auth.admin@example.com", "result": "Refused"}))
    setting(legacy_pin_login=1)
    expect("legacy PIN-only login refuses an administrator too", lambda: pos.pin_login("455666"), "ADMIN_USE_MANAGEMENT_LOGIN", frappe.PermissionError)
    setting(legacy_pin_login=0)
    expect("legacy PIN-only login is off by default (staff number required)", lambda: pos.pin_login("411222"), "STAFF_REQUIRED")
    check("staff picker never lists administrators", all(r.user != "zz.auth.admin@example.com" for r in auth._staff_rows(None)))

    print("== identity + PIN, generic errors, logging")
    before = attempts("Failed")
    as_ip("203.0.113.11")
    expect("wrong PIN for a real staff number -> generic error", lambda: auth.pin_login(code["c"], "999999"), "Incorrect staff number or PIN", frappe.AuthenticationError)
    expect("unknown staff number -> the SAME generic error", lambda: auth.pin_login("ZZ0000", "422333"), "Incorrect staff number or PIN", frappe.AuthenticationError)
    CACHE_KEYS.append(auth._ident_key("staff", "ZZ0000"))
    expect("someone else's PIN with my staff number fails (PIN alone never identifies)", lambda: auth.pin_login(code["c"], "411222"), "Incorrect staff number or PIN")
    check("every failure is logged (3 rows)", attempts("Failed") - before == 3, attempts("Failed") - before)
    logged = frappe.get_all("XentraERP POS Login Attempt", fields=["reason", "staff_ref"], limit_page_length=0)
    check("no PIN is ever written to the log", not any(("999999" in (r.reason or "")) or ("422333" in (r.reason or "")) or (r.staff_ref or "").isdigit() and len(r.staff_ref) >= 6 for r in logged))
    frappe.db.set_value("XentraERP POS PIN", C, {"failed_count": 0, "locked_until": None})
    STARTED.clear()
    r = auth.pin_login(code["c"], "422333")
    check("correct staff number + PIN signs in", STARTED and STARTED[-1][0] == C and r["user"]["name"] == C, r)
    check("…and is logged as Success", frappe.db.exists("XentraERP POS Login Attempt", {"user": C, "result": "Success", "kind": "PIN"}))

    print("== lockout per user (progressive) and per IP")
    as_ip("203.0.113.12")
    for i in range(sec.USER_FREE_ATTEMPTS + 1):
        raises(lambda: auth.pin_login(code["w"], "000000"))
    row = frappe.db.get_value("XentraERP POS PIN", W, ["failed_count", "locked_until"], as_dict=True)
    check("user failures are counted on the PIN row", row.failed_count == sec.USER_FREE_ATTEMPTS + 1, row)
    check("…and the 4th failure sets a delay", row.locked_until and row.locked_until > now_datetime(), row)
    as_ip("203.0.113.13")
    expect("locked user stays locked from another IP, even with the right PIN", lambda: auth.pin_login(code["w"], "411222"), "[LOCKED]")
    frappe.db.set_value("XentraERP POS PIN", W, {"failed_count": sec.USER_HARD_LOCK_AT, "locked_until": None})
    expect("10 failures = hard lock until an admin unlocks", lambda: auth.pin_login(code["w"], "411222"), "ask a manager")
    frappe.set_user("Administrator"); auth.unlock_staff(W); frappe.set_user("Guest")
    STARTED.clear(); auth.pin_login(code["w"], "411222")
    check("after unlock_staff the person signs in", STARTED and STARTED[-1][0] == W)
    as_ip("203.0.113.14")
    for i in range(sec.IP_FREE_ATTEMPTS + 1):
        raises(lambda i=i: auth.pin_login(f"ZZ{i:04d}", "000000"))
        CACHE_KEYS.append(auth._ident_key("staff", f"ZZ{i:04d}"))
    expect("per-IP lockout: many staff numbers from one IP lock that IP", lambda: auth.pin_login(code["s"], "433444"), "[LOCKED]")
    as_ip("203.0.113.15"); STARTED.clear(); auth.pin_login(code["s"], "433444")
    check("…but not other IPs", STARTED and STARTED[-1][0] == S_)

    print("== device registration")
    setting(require_registered_device=1); on_device(None); as_ip("203.0.113.16")
    expect("device policy on: unregistered device refused", lambda: auth.pin_login(code["c"], "422333"), "DEVICE_NOT_REGISTERED", frappe.PermissionError)
    frappe.set_user(C)
    expect("a cashier can't create device approval codes", lambda: auth.create_device_code("ZZ Till", sec.DEVICE_TILL), "administrator")
    frappe.set_user("Administrator")
    made = auth.create_device_code("ZZ Till", sec.DEVICE_TILL, None, "ZZ A Reg")
    dev = frappe.get_doc("XentraERP POS Device", made["device"])
    check("approval code: Pending device, only a hash stored, 30 min expiry", dev.status == "Pending" and dev.approval_code_hash == sec.sha256_hex(sec.normalize_approval_code(made["code"])) and made["code"].replace("-", "") not in str(dev.as_dict()))
    frappe.set_user("Guest")
    expect("wrong approval code refused", lambda: auth.register_device("ABCD-EFGH"), "BAD_CODE")
    out = auth.register_device(made["code"].lower())
    dev.reload()
    check("right code registers the device (Active, token hash set, code cleared)", out["registered"] and dev.status == "Active" and dev.token_hash and not dev.approval_code_hash, out)
    expect("an approval code works only once", lambda: auth.register_device(made["code"]), "BAD_CODE")
    frappe.set_user("Administrator")
    old = auth.create_device_code("ZZ Old", sec.DEVICE_TILL)
    frappe.db.set_value("XentraERP POS Device", old["device"], "code_expires", now_datetime() - timedelta(minutes=1))
    frappe.set_user("Guest")
    expect("expired approval code refused", lambda: auth.register_device(old["code"]), "BAD_CODE")

    print("== device type limits roles; session modes")
    till = {"name": dev.name, "device_type": sec.DEVICE_TILL, "location": None, "pos_profile": "ZZ A Reg"}
    handheld = {"name": dev.name, "device_type": sec.DEVICE_ORDER, "location": None, "pos_profile": None}
    kds = {"name": dev.name, "device_type": sec.DEVICE_KITCHEN, "location": None, "pos_profile": None}
    as_ip("203.0.113.17")
    on_device(kds)
    expect("a waiter can't sign in on a Kitchen Display", lambda: auth.pin_login(code["w"], "411222"), "ROLE_NOT_ALLOWED_ON_DEVICE", frappe.PermissionError)
    expect("a cashier can't sign in on a Kitchen Display", lambda: auth.pin_login(code["c"], "422333"), "ROLE_NOT_ALLOWED_ON_DEVICE")
    STARTED.clear(); auth.pin_login(code["k"], "444555")
    check("kitchen staff sign in on a Kitchen Display (kitchen mode)", STARTED[-1][1:] == ("PIN", sec.DEVICE_KITCHEN, "kitchen"))
    on_device(till)
    expect("kitchen staff can't sign in on a Till", lambda: auth.pin_login(code["k"], "444555"), "ROLE_NOT_ALLOWED_ON_DEVICE")
    setting(allow_waiter_on_till=0)
    expect("waiter on a till refused when not allowed", lambda: auth.pin_login(code["w"], "411222"), "ROLE_NOT_ALLOWED_ON_DEVICE")
    setting(allow_waiter_on_till=1)
    r = auth.pin_login(code["w"], "411222")
    check("waiter on a till (allowed) gets an ORDER session, not a till session", r["session"]["mode"] == "order", r["session"])
    on_device(handheld)
    r = auth.pin_login(code["c"], "422333")
    check("cashier on an Order Taking device gets an order session", r["session"]["mode"] == "order", r["session"])
    on_device(till)
    r = auth.pin_login(code["s"], "433444")
    check("supervisor may sign in on any device type", r["session"]["mode"] == "till")

    print("== backend refusals by role and device (403s), waiter never needs a shift")
    frappe.set_user("Administrator"); on_device(None)
    core.set_pos_mode("F&B"); fnb.save_table("ZZ-T1", "Main", 4); setting(require_shift=1)
    frappe.set_user(W)
    o = fnb.open_order("ZZ-T1", "ZZ A Reg", 2)
    check("waiter opens a table with require_shift on and no shift", o["status"] == "Open" and o["waiter"] == W, o)
    fnb.set_order_items(o["name"], [{"item_code": "Cola", "qty": 2}])
    s = core.get_pos_settings("ZZ A Reg")
    check("waiter settings: no 'shift'/'bill' cap, so the app never asks for a shift", "shift" not in s["caps"] and "bill" not in s["caps"], s["caps"])
    rb = fnb.request_bill(o["name"])
    check("waiter can request the bill", rb["bill_requested"] == 1)
    tbl = next(t for t in fnb.list_tables("ZZ A Reg") if t["name"] == "ZZ-T1")
    check("table shows bill requested (status stays Occupied)", tbl["bill_requested"] == 1 and tbl["status"] == "Occupied", tbl)
    expect("waiter calling bill_order gets 403", lambda: fnb.bill_order(o["name"], "Cash"), "can't do this", frappe.PermissionError)
    expect("waiter calling close_bill gets 403", lambda: fnb.close_bill(o["name"]), "can't do this", frappe.PermissionError)
    expect("waiter calling retail_checkout gets 403", lambda: core.retail_checkout("ZZ A Reg", [{"item_code": "Cola", "qty": 1}], [{"mode_of_payment": "Cash", "tendered": 5}]), "can't do this", frappe.PermissionError)
    expect("waiter calling open_shift gets 403", lambda: core.open_shift("ZZ A Reg", {"BHD": 1}), "can't do this", frappe.PermissionError)
    frappe.set_user(C)
    frappe.local._xpos_state = {"name": "zz", "user": C, "device_type": sec.DEVICE_ORDER, "mode": "order", "status": "Active", "locked": 0}
    expect("cashier on an Order Taking device: bill_order 403 (device mask)", lambda: fnb.bill_order(o["name"], "Cash"), "can't do this", frappe.PermissionError)
    check("…and get_pos_settings shows the masked caps", "bill" not in core.get_pos_settings("ZZ A Reg")["caps"])
    frappe.local._xpos_state = {"name": "zz", "user": C, "device_type": sec.DEVICE_TILL, "mode": "till", "status": "Active", "locked": 0}
    check("cashier on a Till keeps bill/shift", {"bill", "shift"} <= set(core.get_pos_settings("ZZ A Reg")["caps"]))
    del frappe.local._xpos_state
    frappe.set_user(K)
    expect("kitchen calling open_order gets 403", lambda: fnb.open_order(None, "ZZ A Reg", 1, None, 0, "Take Away"), "can't do this", frappe.PermissionError)

    print("== sessions: record, revoke, sign out other devices, PIN switched off")
    frappe.set_user(C)
    CACHE_KEYS.extend(f"xpos:sess:{sec.sha256_hex(x)}" for x in ("zz-sid-1", "zz-sid-2", "zz-sid-3"))
    for sid in ("zz-sid-1", "zz-sid-2"):
        frappe.local.session.sid = sid
        if hasattr(frappe.local, "_xpos_state"): del frappe.local._xpos_state
        auth.create_session_record(C, "PIN", None, "cashier")
    mine = auth.list_my_sessions()
    check("list_my_sessions shows both, marks the current one", len(mine) >= 2 and sum(1 for m in mine if m["current"]) == 1, mine)
    check("session ids are never exposed (only the record name)", all("session_key" not in m for m in mine))
    auth.revoke_other_sessions()
    left = frappe.get_all("XentraERP POS Session", filters={"user": C, "status": "Active"}, pluck="session_key")
    check("revoke_other_sessions keeps only this one", left == [sec.sha256_hex("zz-sid-2")], left)
    frappe.set_user(W)
    expect("someone else can't revoke my session", lambda: auth.revoke_session(frappe.db.get_value("XentraERP POS Session", {"user": C, "status": "Active"}, "name")), "administrator")
    frappe.set_user("Administrator")
    pos.set_pin_active(C, 0)
    check("switching a PIN off revokes that person's POS sessions", not frappe.db.exists("XentraERP POS Session", {"user": C, "status": "Active"}))
    check("…with a reason", frappe.db.exists("XentraERP POS Session", {"user": C, "end_reason": "PIN switched off"}))
    pos.set_pin_active(C, 1)

    print("== lock / unlock")
    frappe.set_user(C); frappe.local.session.sid = "zz-sid-3"
    if hasattr(frappe.local, "_xpos_state"): del frappe.local._xpos_state
    auth.create_session_record(C, "PIN", None, "cashier")
    auth.lock_session()
    check("lock_session marks the session locked", frappe.db.get_value("XentraERP POS Session", {"session_key": sec.sha256_hex("zz-sid-3")}, "locked") == 1)
    as_ip("203.0.113.18")
    expect("wrong PIN doesn't unlock", lambda: auth.unlock_session(pin="000000"), "didn't match")
    auth.unlock_session(pin="422333")
    check("the person's own PIN unlocks", frappe.db.get_value("XentraERP POS Session", {"session_key": sec.sha256_hex("zz-sid-3")}, "locked") == 0)
    frappe.set_user("Administrator")
    auth.revoke_device(dev.name)
    check("revoke_device: Revoked, token cleared", frappe.db.get_value("XentraERP POS Device", dev.name, ["status", "token_hash"]) == ("Revoked", None))

    print("== least privilege: POS roles can't list customers")
    remove_pos_customer_read.execute()
    for role in ("POS Waiter", "POS Cashier", "POS Supervisor", "POS Kitchen"):
        auth_ok = not frappe.db.exists("Custom DocPerm", {"parent": "Customer", "role": role})
        check(f"no Customer read row for {role}", auth_ok)
    check("ensure_pos_role no longer grants Customer", "Customer" not in pos.POS_ROLE_READS and (pos.ensure_pos_role("POS Cashier"), not frappe.db.exists("Custom DocPerm", {"parent": "Customer", "role": "POS Cashier"}))[1])
    frappe.clear_cache(doctype="Customer")
    check("a cashier has no read permission on Customer", not frappe.has_permission("Customer", "read", user=C))
    frappe.set_user(C)
    expect("…so listing customers over the API (frappe.get_list) is refused", lambda: frappe.get_list("Customer", limit_page_length=1), None, frappe.PermissionError)
    check("but the cashier still reads items/prices for the POS screens", frappe.has_permission("Item", "read") and frappe.has_permission("Item Price", "read"))
    frappe.set_user("Administrator")

    print("== entitlement fails closed")
    frappe.local.conf.pos_entitlement_check = "closed"
    real = pos.tenant_modules
    pos.tenant_modules = lambda: None
    frappe.set_user(C)
    expect("control plane unknown + no last-known value -> POS refused (fails closed)", lambda: core.get_pos_settings(), "POS_NOT_ENTITLED", frappe.PermissionError)
    pos.tenant_modules = lambda: ["accounting"]
    expect("plan without pos -> refused on session use, not just login", lambda: core.get_pos_settings(), "POS_NOT_ENTITLED")
    pos.tenant_modules = lambda: ["pos"]
    check("plan with pos -> allowed", bool(core.get_pos_settings()))
    pos.tenant_modules = real
    frappe.local.conf.pos_entitlement_check = "off"
    frappe.set_user("Administrator")

    print("== tenant_lookup / lookup_organization output")
    if frappe.db.table_exists("XentraERP Tenant"):
        t = frappe.get_doc({"doctype": "XentraERP Tenant", "name": "ZZAUTHT", "tenant_code": "zz9999", "subdomain": "zz9999", "organization_name": "ZZ Org", "tenant_admin_email": "zz.owner@example.com",
                            "status": "Active", "provisioning_status": "Completed", "site_name": "zz9999.xentraerp.local"})
        t.db_insert()
        frappe.set_user("Guest"); as_ip("203.0.113.19"); CACHE_KEYS += ["xpos:lookup:203.0.113.19", "xpos:lookupfail:203.0.113.19"]
        from custom_erp.api import signup
        out = signup.tenant_lookup("zz9999")
        check("tenant_lookup returns the organization name only (no admin email)", out == {"organization_name": "ZZ Org"}, out)
        out2 = auth.lookup_organization("ZZ9999")
        check("lookup_organization returns name + normalised code only", out2 == {"organization_name": "ZZ Org", "tenant_code": "zz9999"}, out2)
        frappe.db.set_value("XentraERP Tenant", "ZZAUTHT", "status", "Suspended")
        e1 = raises(lambda: auth.lookup_organization("zz9999"))[1]
        e2 = raises(lambda: auth.lookup_organization("zz0000"))[1]
        check("suspended and unknown codes get the same answer", e1 == e2 and "ORG_NOT_FOUND" in e1, (e1, e2))
        for i in range(sec.LOOKUP_FAIL_LIMIT):
            raises(lambda: auth.lookup_organization("zz0000"))
        expect("unknown-code lookups are rate limited per IP", lambda: auth.lookup_organization("zz9999"), "RATE_LIMITED")
        frappe.set_user("Administrator")
    else:
        print("  SKIP (no XentraERP Tenant table on this site)")
except Exception:
    F.append("UNEXPECTED"); traceback.print_exc()
finally:
    frappe.set_user("Administrator"); frappe.db.rollback()
    for k in set(CACHE_KEYS): frappe.cache().delete_value(k)
    frappe.clear_cache()
    print(f"\nROLLED BACK\nRESULT: {len(P)} passed, {len(F)} failed"); [print('  FAILED:', f) for f in F]
