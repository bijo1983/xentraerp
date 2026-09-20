import frappe
frappe.init(site="197349.xentraerp.local", sites_path="."); frappe.connect(); frappe.set_user("Administrator")
# 2) remove the end-to-end fixtures
for dt in ("XentraERP KOT","XentraERP POS Order"):
    for n in frappe.get_all(dt, pluck="name"): frappe.delete_doc(dt, n, force=1, ignore_permissions=True)
for n in frappe.get_all("XentraERP POS Table", pluck="name"): frappe.delete_doc("XentraERP POS Table", n, force=1, ignore_permissions=True)
for n in frappe.get_all("XentraERP POS Shift", filters={"pos_profile": "ZZ E2E Register"}, pluck="name"): frappe.delete_doc("XentraERP POS Shift", n, force=1, ignore_permissions=True)
if frappe.db.exists("XentraERP POS Location", "ZZE"): frappe.delete_doc("XentraERP POS Location", "ZZE", force=1, ignore_permissions=True)
# the location's numbering series was added to the doctypes' naming_series options: take it back out
for dt in ("Sales Invoice", "POS Invoice", "Payment Entry"):
    opts = [o for o in (frappe.get_meta(dt, cached=False).get_field("naming_series").options or "").split("\n") if o]
    keep = [o for o in opts if not o.startswith("ZZE-")]
    if keep != opts:
        frappe.make_property_setter({"doctype": dt, "doctype_or_field": "DocField", "fieldname": "naming_series", "property": "options", "value": "\n".join(keep), "property_type": "Text"}); frappe.clear_cache(doctype=dt)
for u in ("zz.e2e.cashier@example.com","zz.e2e.manager@example.com","zz.e2e.staff@example.com"):
    if frappe.db.exists("XentraERP POS PIN", u): frappe.delete_doc("XentraERP POS PIN", u, force=1, ignore_permissions=True)
if frappe.db.exists("POS Profile","ZZ E2E Register"): frappe.delete_doc("POS Profile","ZZ E2E Register", force=1, ignore_permissions=True)
for u in ("zz.e2e.cashier@example.com","zz.e2e.manager@example.com","zz.e2e.staff@example.com"):
    frappe.db.sql("delete from tabSessions where user=%s",(u,))
    if frappe.db.exists("User", u): frappe.delete_doc("User", u, force=1, ignore_permissions=True)
frappe.db.commit()
print("series options now:", {dt: (frappe.get_meta(dt, cached=False).get_field("naming_series").options or "").split("\n") for dt in ("Sales Invoice","POS Invoice","Payment Entry")})
left = {dt: frappe.db.count(dt) for dt in ("XentraERP POS Location","XentraERP POS Table","XentraERP POS Order","XentraERP KOT","XentraERP POS Shift","XentraERP POS Tender","XentraERP POS PIN","POS Profile","POS Invoice")}
print("remaining after cleanup:", left)
print("mode:", frappe.db.get_singles_dict("XentraERP POS Settings").get("pos_mode") or "Retail (unset)", "| 24/7:", frappe.db.get_singles_dict("XentraERP POS Settings").get("pos_247"))
print("Users:", [u for u in frappe.get_all("User", pluck="name") if u.startswith("zz")] or "no test users left")
