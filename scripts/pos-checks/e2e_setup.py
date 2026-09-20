import frappe
frappe.init(site="197349.xentraerp.local", sites_path="."); frappe.connect(); frappe.set_user("Administrator")
from custom_erp.api import pos
company = frappe.get_all("Company", pluck="name")[0]
for u, roles in (("zz.e2e.cashier@example.com", []), ("zz.e2e.manager@example.com", ["System Manager"])):
    if not frappe.db.exists("User", u):
        d = frappe.get_doc({"doctype": "User", "email": u, "first_name": "ZZ E2E " + u.split(".")[2], "send_welcome_email": 0, "enabled": 1})
        for r in roles: d.append("roles", {"role": r})
        d.insert(ignore_permissions=True)
if not frappe.db.exists("POS Profile", "ZZ E2E Register"):
    frappe.get_doc({"doctype": "POS Profile", "name": "ZZ E2E Register", "company": company, "warehouse": "Stores - JC", "currency": "BHD",
        "customer": "Test Customer", "selling_price_list": "Standard Selling", "payments": [{"mode_of_payment": "Cash", "default": 1}],
        "write_off_account": "Write Off - JC", "write_off_cost_center": "Main - JC", "account_for_change_amount": "Cash - JC", "update_stock": 0}).insert(ignore_permissions=True)
pos.set_pin("zz.e2e.cashier@example.com", "246810")
pos.set_pin("zz.e2e.manager@example.com", "135790")
frappe.db.commit(); print("e2e fixtures created; mode now:", frappe.db.get_singles_dict("XentraERP POS Settings").get("pos_mode") or "Retail (unset)")
