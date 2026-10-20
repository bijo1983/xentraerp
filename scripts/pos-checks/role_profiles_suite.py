import frappe, json, traceback
frappe.init(site="197349.xentraerp.local", sites_path="."); frappe.connect(); frappe.set_user("Administrator")
frappe.db.commit = lambda *a, **k: None
# POS role profiles (custom_erp/api/pos_roles.py): seeding, validation, mapping to staff, the
# rights a profile gives at the till, and the old pos_role API still working. Runs in a
# transaction that is never committed and always rolled back (the tenant is in real use).
from custom_erp.api import pos, pos_core, pos_roles
P, F = [], []
def check(n, c, d=""): (P if c else F).append(n); print(("  PASS " if c else "  FAIL ") + n + (f"  [{d}]" if d and not c else ""))
def err(fn, sub):
    try: fn()
    except Exception as e: return sub.lower() in str(e).lower()
    return False
def caps_as(user):
    frappe.set_user(user); pos_roles.clear_request_cache()
    try: return set(pos_core.session_caps()), pos_core._role_label()
    finally: frappe.set_user("Administrator"); pos_roles.clear_request_cache()
def new_user(email, roles=()):
    return frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0, "roles": [{"role": r} for r in roles]}).insert(ignore_permissions=True)
try:
    frappe.cache().delete_value(pos_roles.SEED_FLAG)
    pos_roles.ensure_defaults(force=True)
    frappe.clear_cache(doctype="User")
    names = {p["name"] for p in pos_roles.summary()}
    want = {"Waiter", "Host", "Cashier", "Kitchen", "Shift Supervisor", "Floor Manager", "Branch Manager", "Auditor"}
    check("standard catalogue seeded", want <= names, names)
    check("four POS roles exist", all(frappe.db.exists("Role", r) for r in pos_roles.LEVEL_ROLE.values()))
    check("User has the hidden profile link field", frappe.get_meta("User").has_field(pos_roles.USER_FIELD))
    n_before = frappe.db.count(pos_roles.DOCTYPE)
    check("seeding again adds nothing", pos_roles.ensure_defaults(force=True) == 0 and frappe.db.count(pos_roles.DOCTYPE) == n_before)
    # tenant edits survive re-seeding
    pos_roles.save_role_profile("Host", "Waiter", ["view", "reserve"], "Edited by tenant", 0, name="Host")
    pos_roles.ensure_defaults(force=True)
    h = frappe.get_doc(pos_roles.DOCTYPE, "Host")
    check("re-seeding keeps a tenant's edit", h.rights == "view, reserve" and h.description == "Edited by tenant", h.rights)
    check("summary flags it as changed from standard", next(p for p in pos_roles.summary() if p["name"] == "Host")["modified_from_standard"])
    pos_roles.reset_role_profile("Host")
    check("reset restores the standard rights", frappe.get_doc(pos_roles.DOCTYPE, "Host").rights == "view, order, reserve")

    # validation
    check("rights above the access level are refused", err(lambda: pos_roles.save_role_profile("ZZ Bad", "Waiter", ["view", "bill"]), "can't include"))
    check("unknown right refused", err(lambda: pos_roles.save_role_profile("ZZ Bad", "Cashier", ["view", "fly"]), "unknown pos right"))
    check("'settings' is never grantable", err(lambda: pos_roles.save_role_profile("ZZ Bad", "Supervisor", ["settings"]), "unknown pos right"))
    check("bad level refused", err(lambda: pos_roles.save_role_profile("ZZ Bad", "Owner", ["view"]), "access level"))
    pos_roles.save_role_profile("ZZ Barista", "Cashier", ["bill", "shift", "kot"], "Coffee bar")
    b = frappe.get_doc(pos_roles.DOCTYPE, "ZZ Barista")
    check("custom profile created, 'view' added, rights ordered", b.rights == "view, kot, bill, shift" and not b.is_standard, b.rights)
    check("profiles can't be renamed", err(lambda: pos_roles.save_role_profile("ZZ Other", "Cashier", ["view"], name="ZZ Barista"), "renamed"))
    check("duplicate name refused", err(lambda: pos_roles.save_role_profile("ZZ Barista", "Cashier", ["view"]), "already exists"))
    check("standard profile can't be deleted", err(lambda: pos_roles.delete_role_profile("Waiter"), "can't be deleted"))

    # mapping to staff and the rights it gives
    u = "zz.host@example.com"; new_user(u)
    r = pos.save_pos_access(u, role_profile="Host")
    check("save_pos_access maps the profile", r["role_profile"] == "Host" and r["role_label"] == "Host", r.get("role_profile"))
    check("…and grants its level's POS role only", "POS Waiter" in frappe.get_roles(u) and not any(x in frappe.get_roles(u) for x in ("POS Cashier", "POS Supervisor", "POS Kitchen")))
    pos.set_pin(u, "481516")
    caps, label = caps_as(u)
    check("Host has exactly its rights at the till", caps == {"view", "order", "reserve"} and label == "Host", (caps, label))
    frappe.set_user(u); pos_roles.clear_request_cache()
    check("Host refused kitchen tickets with a profile-specific message", err(lambda: pos_core.require_cap("kot"), "host profile doesn't include"))
    check("Host refused billing with the level message", err(lambda: pos_core.require_cap("bill"), "it needs a cashier"))
    frappe.set_user("Administrator"); pos_roles.clear_request_cache()

    a = "zz.audit@example.com"; new_user(a); pos.save_pos_access(a, role_profile="Auditor"); pos.set_pin(a, "623451")
    caps, label = caps_as(a)
    check("Auditor: supervisor level, reports only", "POS Supervisor" in frappe.get_roles(a) and caps == {"view", "reports"} and label == "Auditor", caps)

    c = "zz.barista@example.com"; new_user(c); pos.save_pos_access(c, role_profile="ZZ Barista"); pos.set_pin(c, "735126")
    check("custom profile applies", caps_as(c)[0] == {"view", "kot", "bill", "shift"})
    pos_roles.save_role_profile("ZZ Barista", "Cashier", ["view", "kot", "bill", "shift", "modify"], "Coffee bar", 0, name="ZZ Barista")
    check("editing the profile changes holders' rights immediately", "modify" in caps_as(c)[0])
    pos_roles.save_role_profile("ZZ Barista", "Supervisor", ["view", "kot", "bill", "shift", "modify", "reports"], "Coffee bar", 0, name="ZZ Barista")
    check("raising the level re-grants holders the new POS role", "POS Supervisor" in frappe.get_roles(c) and "POS Cashier" not in frappe.get_roles(c))
    check("…and the new rights apply", "reports" in caps_as(c)[0])
    check("a profile with staff can't be deleted", err(lambda: pos_roles.delete_role_profile("ZZ Barista"), "still have this profile"))
    pos_roles.save_role_profile("ZZ Barista", "Supervisor", ["view", "kot", "bill", "shift", "modify", "reports"], "Coffee bar", 1, name="ZZ Barista")
    check("disabled profile: holders fall back to their level's standard rights", caps_as(c)[0] == pos_core.CAPS["supervisor"] and caps_as(c)[1] == "Supervisor")
    check("disabled profile can't be assigned", err(lambda: pos.save_pos_access(a, role_profile="ZZ Barista"), "disabled"))

    # a person whose POS role was changed by hand in the ERP (level no longer matches the profile)
    pos._give_pos_role(u, "POS Cashier")
    check("level mismatch falls back to the level's rights", caps_as(u)[0] == pos_core.CAPS["cashier"])

    # defaults and old callers
    w = "zz.walkin@example.com"; new_user(w); pos.reset_pin(w)
    check("reset_pin for someone new gives the Waiter profile (least privilege)", pos_roles.profile_of(w).name == "Waiter" and "POS Waiter" in frappe.get_roles(w))
    w2 = "zz.api@example.com"; new_user(w2); pos.set_pin(w2, "918274")
    check("set_pin with no role keeps its documented default: Cashier profile", pos_roles.profile_of(w2).name == "Cashier" and "POS Cashier" in frappe.get_roles(w2))
    o = "zz.old@example.com"; new_user(o, ["POS Cashier"]); pos.set_pin(o, "564738")
    check("someone with a plain POS role keeps it and its full rights", pos_roles.profile_of(o) is None and caps_as(o)[0] == pos_core.CAPS["cashier"])
    pos.save_pos_access(o, pos_role="POS Supervisor")
    check("old pos_role argument maps to the matching standard profile", pos_roles.profile_of(o).name == "Branch Manager" and caps_as(o)[0] == pos_core.CAPS["supervisor"])
    r = pos.create_pos_user("zz.k@example.com", "ZZ Kitchen", "102938", None, "POS Kitchen")
    check("create_pos_user with an old role gets the Kitchen profile", r["role_profile"] == "Kitchen" and "POS Kitchen" in frappe.get_roles("zz.k@example.com"))
    r = pos.create_pos_user("zz.fm@example.com", "ZZ Floor", "564731", None, role_profile="Floor Manager")
    check("create_pos_user with a profile", r["role_profile"] == "Floor Manager" and "POS Supervisor" in frappe.get_roles("zz.fm@example.com"))
    staff = {x["user"]: x for x in pos.list_pos_users()}
    check("list_pos_users shows profile and label", staff["zz.fm@example.com"]["role_profile"] == "Floor Manager" and staff["zz.fm@example.com"]["role_label"] == "Floor Manager")
    acc = pos.get_pos_access("zz.fm@example.com")
    check("get_pos_access offers profiles and the rights catalogue", acc["role_profile"] == "Floor Manager" and len(acc["role_profiles"]) >= 8 and len(acc["rights_catalogue"]) == len(pos_roles.RIGHTS) and "tables" in acc["rights"])
    check("get_pos_access_options works without a user", len(pos.get_pos_access_options()["role_profiles"]) >= 8)
    mgr = "zz.mgr@example.com"; new_user(mgr, ["System Manager"])
    check("administrators can't be given a profile", err(lambda: pos.save_pos_access(mgr, role_profile="Cashier"), "administrator role"))
    check("administrators keep every right", caps_as(mgr)[0] == pos_core.CAPS["admin"])

    # only administrators manage profiles
    frappe.set_user(u)
    check("staff can't list profiles", err(pos_roles.list_role_profiles, "administrator"))
    check("staff can't change profiles", err(lambda: pos_roles.save_role_profile("Waiter", "Supervisor", ["view", "reports"], name="Waiter"), "administrator"))
    frappe.set_user("Administrator")

    # migration patch: existing plain-role staff get the matching profile, rights unchanged
    p = "zz.legacy@example.com"; new_user(p, ["POS Supervisor"])
    from custom_erp.patches.v1_0 import seed_pos_role_profiles
    seed_pos_role_profiles.execute()
    check("patch maps a plain Supervisor to Branch Manager", frappe.db.get_value("User", p, pos_roles.USER_FIELD) == "Branch Manager")
    check("…with identical rights", caps_as(p)[0] == pos_core.CAPS["supervisor"])
except Exception:
    F.append("UNEXPECTED"); traceback.print_exc()
finally:
    frappe.set_user("Administrator"); frappe.db.rollback(); frappe.clear_cache(); frappe.cache().delete_value(pos_roles.SEED_FLAG)
    print(f"\nROLLED BACK\nRESULT: {len(P)} passed, {len(F)} failed"); [print('  FAILED:', f) for f in F]
