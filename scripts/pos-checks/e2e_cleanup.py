import frappe
frappe.init(site="197349.xentraerp.local", sites_path="."); frappe.connect(); frappe.set_user("Administrator")
# 1) Item Price behaviour behind the new Item "Prices" card (rolled back)
buy = frappe.get_doc({"doctype":"Item Price","item_code":"Blue Pen","price_list":"Standard Buying","price_list_rate":3.5}).insert()
sell = frappe.get_doc({"doctype":"Item Price","item_code":"Cola","price_list":"Standard Selling","price_list_rate":2.25}).insert()
print("Item Price: purchase price stored on the buying list ->", buy.buying, buy.selling, buy.currency, buy.price_list_rate)
print("Item Price: selling price stored on the selling list  ->", sell.buying, sell.selling, sell.currency, sell.price_list_rate)
dup = None
try: frappe.get_doc({"doctype":"Item Price","item_code":"Blue Pen","price_list":"Standard Buying","price_list_rate":3.5}).insert()
except Exception as e: dup = type(e).__name__
print("Item Price: exact duplicate is refused ->", dup)
frappe.db.rollback()
# 2) remove the end-to-end fixtures
for dt in ("XentraERP KOT","XentraERP POS Order"):
    for n in frappe.get_all(dt, pluck="name"): frappe.delete_doc(dt, n, force=1, ignore_permissions=True)
for n in frappe.get_all("XentraERP POS Table", pluck="name"): frappe.delete_doc("XentraERP POS Table", n, force=1, ignore_permissions=True)
for u in ("zz.e2e.cashier@example.com","zz.e2e.manager@example.com"):
    if frappe.db.exists("XentraERP POS PIN", u): frappe.delete_doc("XentraERP POS PIN", u, force=1, ignore_permissions=True)
if frappe.db.exists("POS Profile","ZZ E2E Register"): frappe.delete_doc("POS Profile","ZZ E2E Register", force=1, ignore_permissions=True)
for u in ("zz.e2e.cashier@example.com","zz.e2e.manager@example.com"):
    frappe.db.sql("delete from tabSessions where user=%s",(u,))
    if frappe.db.exists("User", u): frappe.delete_doc("User", u, force=1, ignore_permissions=True)
frappe.db.commit()
left = {dt: frappe.db.count(dt) for dt in ("XentraERP POS Table","XentraERP POS Order","XentraERP KOT","XentraERP POS Shift","XentraERP POS Tender","XentraERP POS PIN","POS Profile","POS Invoice")}
print("remaining after cleanup:", left)
print("mode:", frappe.db.get_singles_dict("XentraERP POS Settings").get("pos_mode") or "Retail (unset)", "| 24/7:", frappe.db.get_singles_dict("XentraERP POS Settings").get("pos_247"))
print("Users:", [u for u in frappe.get_all("User", pluck="name") if u.startswith("zz")] or "no test users left")
