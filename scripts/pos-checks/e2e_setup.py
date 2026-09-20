# Temporary fixtures for the HTTPS end-to-end run. Everything created here is named ZZ / zz.* so the
# cleanup can remove exactly these rows and nothing that belongs to real use of the tenant.
import frappe
frappe.init(site="197349.xentraerp.local", sites_path="."); frappe.connect(); frappe.set_user("Administrator")
from custom_erp.api import pos
company = frappe.get_all("Company", pluck="name")[0]
for key, role, pin in (("waiter","POS Waiter","246810"),("cashier","POS Cashier","357911"),("supervisor","POS Supervisor","468022"),("kitchen","POS Kitchen","579133")):
    u = f"zz.e2e.{key}@example.com"
    if not frappe.db.exists("User", u):
        frappe.get_doc({"doctype":"User","email":u,"first_name":"ZZ E2E "+key,"send_welcome_email":0,"enabled":1}).insert()
    pos.set_pin(u, pin, None, 1, role)
m = "zz.e2e.manager@example.com"
if not frappe.db.exists("User", m):
    frappe.get_doc({"doctype":"User","email":m,"first_name":"ZZ E2E mgr","send_welcome_email":0,"enabled":1,"roles":[{"role":"System Manager"}]}).insert()
pos.set_pin(m, "680244", None, 0)
if not frappe.db.exists("POS Profile","ZZ E2E Register"):
    frappe.get_doc({"doctype":"POS Profile","name":"ZZ E2E Register","company":company,"warehouse":"Stores - JC","currency":"BHD","customer":"Test Customer","selling_price_list":"Standard Selling",
      "payments":[{"mode_of_payment":"Cash","default":1}],"write_off_account":"Write Off - JC","write_off_cost_center":"Main - JC","account_for_change_amount":"Cash - JC","update_stock":0}).insert()
frappe.db.commit(); print("e2e2 fixtures created")
