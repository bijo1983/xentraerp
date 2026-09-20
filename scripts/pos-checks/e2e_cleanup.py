# Removes ONLY the rows the end-to-end run creates (ZZ markers). Real tables, orders, shifts, staff and
# settings are never touched — the previous cleanup deleted every table/order and must not be used
# on a tenant that is in real use.
import frappe
frappe.init(site="197349.xentraerp.local", sites_path="."); frappe.connect(); frappe.set_user("Administrator")
Z = "zz.e2e."
zusers = [u for u in frappe.get_all("User", pluck="name") if u.startswith(Z)]
def rm(dt, filters):
    for n in frappe.get_all(dt, filters=filters, pluck="name"): frappe.delete_doc(dt, n, force=1, ignore_permissions=True)
rm("XentraERP KOT", {"pos_profile": "ZZ E2E Register"})
rm("XentraERP POS Reservation", {"guest_name": ["like", "ZZ%"]})
rm("XentraERP POS Order", {"pos_profile": "ZZ E2E Register"})
rm("XentraERP POS Shift", {"pos_profile": "ZZ E2E Register"})
rm("XentraERP POS Table", {"name": ["like", "ZZE%"]})
rm("XentraERP POS Hidden Item", {"item_code": ["like", "ZZ%"]})
rm("XentraERP POS Item Note", {"item_code": ["like", "ZZ%"]})
if frappe.db.exists("XentraERP POS Location", "ZZE"): frappe.delete_doc("XentraERP POS Location", "ZZE", force=1, ignore_permissions=True)
for it in frappe.get_all("Item", filters={"item_code": ["like", "ZZ E2E%"]}, pluck="name"):
    for ip in frappe.get_all("Item Price", filters={"item_code": it}, pluck="name"): frappe.delete_doc("Item Price", ip, force=1)
    frappe.delete_doc("Item", it, force=1, ignore_permissions=True)
for dt in ("Sales Invoice", "POS Invoice", "Payment Entry"):
    opts = [o for o in (frappe.get_meta(dt, cached=False).get_field("naming_series").options or "").split("\n") if o]
    keep = [o for o in opts if not o.startswith("ZZE-")]
    if keep != opts:
        frappe.make_property_setter({"doctype": dt, "doctype_or_field": "DocField", "fieldname": "naming_series", "property": "options", "value": "\n".join(keep), "property_type": "Text"}); frappe.clear_cache(doctype=dt)
for u in zusers:
    if frappe.db.exists("XentraERP POS PIN", u): frappe.delete_doc("XentraERP POS PIN", u, force=1, ignore_permissions=True)
    frappe.db.sql("delete from tabSessions where user=%s", (u,))
    if frappe.db.exists("User", u): frappe.delete_doc("User", u, force=1, ignore_permissions=True)
if frappe.db.exists("POS Profile", "ZZ E2E Register"): frappe.delete_doc("POS Profile", "ZZ E2E Register", force=1, ignore_permissions=True)
frappe.db.commit()
print("removed ZZ test rows. REAL data still present:")
print("  tables:", frappe.get_all("XentraERP POS Table", pluck="name"), "| orders:", frappe.get_all("XentraERP POS Order", pluck="name"), "| shifts:", frappe.get_all("XentraERP POS Shift", pluck="name"))
print("  PIN users:", frappe.get_all("XentraERP POS PIN", pluck="user"), "| settings:", {k: v for k, v in frappe.db.get_singles_dict("XentraERP POS Settings").items() if k in ("pos_mode","checkout_document","auto_kot","item_notes_prompt")})
print("  leftover ZZ users:", [u for u in frappe.get_all("User", pluck="name") if "zz" in u.lower()] or "none")
