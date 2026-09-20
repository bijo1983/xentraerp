import frappe, traceback
frappe.init(site="197349.xentraerp.local", sites_path="."); frappe.connect(); frappe.set_user("Administrator")
frappe.db.commit = lambda *a, **k: None

def quarantine():
    """The tenant is in real use. Inside this (never-committed, rolled-back) transaction, clear the live POS
    state so the checks start from an empty tenant. Nothing here can reach the real rows: commit is disabled
    above and the run always ends in rollback."""
    for t in ("XentraERP KOT Item","XentraERP KOT","XentraERP POS Order Item","XentraERP POS Order","XentraERP POS Table","XentraERP POS Shift Cash",
              "XentraERP POS Shift","XentraERP POS Tender","XentraERP POS Reservation","XentraERP POS Hidden Item","XentraERP POS Location Profile","XentraERP POS Location"):
        frappe.db.sql(f"delete from `tab{t}`")
    frappe.db.sql("delete from tabSingles where doctype='XentraERP POS Settings'")
quarantine()
from custom_erp.api import pos
P, F = [], []
def check(n, c, d=""): (P if c else F).append(n); print(("  PASS " if c else "  FAIL ") + n + (f"  [{d}]" if d and not c else ""))
def err(fn, sub):
    try: fn()
    except Exception as e: return sub.lower() in str(e).lower()
    return False
try:
    prof = frappe.get_doc({"doctype":"POS Profile","name":"ZZ S Reg","company":frappe.get_all("Company",pluck="name")[0],"warehouse":"Stores - JC","currency":"BHD","customer":"Test Customer","selling_price_list":"Standard Selling","payments":[{"mode_of_payment":"Cash","default":1}],"write_off_account":"Write Off - JC","write_off_cost_center":"Main - JC","account_for_change_amount":"Cash - JC"}).insert(ignore_permissions=True)
    check("role created on demand with read permissions", pos.ensure_pos_role() == "POS Cashier" and frappe.db.exists("Role", "POS Cashier"))
    for dt in pos.POS_ROLE_READS:
        check(f"POS Cashier can read {dt}", bool(frappe.db.exists("Custom DocPerm", {"parent": dt, "role": "POS Cashier", "read": 1})), dt)
    check("role is read-only (no write/create anywhere)", not frappe.db.exists("Custom DocPerm", {"role": "POS Cashier", "write": 1}) and not frappe.db.exists("Custom DocPerm", {"role": "POS Cashier", "create": 1}))
    r = pos.create_pos_user("zz.new@example.com", "ZZ New Cashier", "482913", "ZZ S Reg", "POS Cashier")
    u = "zz.new@example.com"
    check("create_pos_user makes a user with the POS Cashier role", frappe.db.exists("User", u) and "POS Cashier" in [x.role for x in frappe.get_doc("User", u).roles])
    pin = frappe.get_doc("XentraERP POS PIN", u)
    check("…with a PIN locked to the chosen register", pin.active == 1 and pin.pos_profile == "ZZ S Reg" and pin.pin_hash == pos._hash_pin("482913"))
    check("…and no welcome email / password login is set up", not frappe.db.get_value("User", u, "send_welcome_email"))
    check("cashier can read items (the POS item grid works)", frappe.has_permission("Item", "read", user=u) and frappe.has_permission("Item Price", "read", user=u) and frappe.has_permission("POS Profile", "read", user=u))
    check("…but can NOT write items or prices", not frappe.has_permission("Item", "write", user=u) and not frappe.has_permission("Item Price", "create", user=u) and not frappe.has_permission("POS Invoice", "create", user=u))
    frappe.set_user(u)
    check("as the cashier, the item list query returns rows", len(frappe.get_list("Item", fields=["name"], limit_page_length=5)) > 0)
    check("cashier cannot list staff / PINs", err(pos.list_pos_users, "can't do this"))
    check("cashier cannot create staff", err(lambda: pos.create_pos_user("zz.x@example.com", "X", "111222"), "can't do this"))
    check("cashier cannot deactivate a PIN", err(lambda: pos.set_pin_active(u, 0), "can't do this"))
    frappe.set_user("Administrator")
    check("duplicate email refused", err(lambda: pos.create_pos_user(u, "Again", "999888"), "already exists"))
    check("bad PIN refused at creation (and no user left behind)", err(lambda: pos.create_pos_user("zz.bad@example.com", "Bad", "12"), "6-8 digits") and not frappe.db.exists("User", "zz.bad@example.com"))
    check("bad email refused", err(lambda: pos.create_pos_user("nope", "X", "111222"), "email"))
    staff = {x["user"]: x for x in pos.list_pos_users()}
    check("list_pos_users shows PIN status, register and role", staff[u]["has_pin"] and staff[u]["active"] and staff[u]["pos_profile"] == "ZZ S Reg" and staff[u]["is_cashier_role"], staff.get(u))
    check("existing user + set_pin gains the role too", (frappe.get_doc({"doctype":"User","email":"zz.old@example.com","first_name":"Old","send_welcome_email":0}).insert(ignore_permissions=True), pos.set_pin("zz.old@example.com", "735120"), "POS Cashier" in frappe.get_roles("zz.old@example.com"))[2])
    pos.set_pin_active(u, 0); check("PIN can be switched off", frappe.db.get_value("XentraERP POS PIN", u, "active") == 0 and not {x["user"]: x for x in pos.list_pos_users()}[u]["active"])
    pos.set_pin_active(u, 1); check("…and back on", frappe.db.get_value("XentraERP POS PIN", u, "active") == 1)
    check("resetting a PIN keeps the person and changes the hash", (pos.set_pin(u, "246810"), frappe.db.get_value("XentraERP POS PIN", u, "pin_hash") == pos._hash_pin("246810"))[1])
    mgr = frappe.get_doc({"doctype":"User","email":"zz.mgr@example.com","first_name":"Mgr","send_welcome_email":0,"roles":[{"role":"System Manager"}]}).insert(ignore_permissions=True)
    pos.set_pin("zz.mgr@example.com", "135790")
    check("an administrator's PIN doesn't get downgraded to the cashier role set", "POS Cashier" not in [x.role for x in frappe.get_doc("User", "zz.mgr@example.com").roles])
except Exception:
    F.append("UNEXPECTED"); traceback.print_exc()
finally:
    frappe.set_user("Administrator"); frappe.db.rollback(); frappe.clear_cache()
    print(f"\nROLLED BACK; role still present: {bool(frappe.db.exists('Role','POS Cashier'))}\nRESULT: {len(P)} passed, {len(F)} failed"); [print('  FAILED:', f) for f in F]
