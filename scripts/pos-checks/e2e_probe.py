import sys, json, frappe
frappe.init(site="197349.xentraerp.local", sites_path="."); frappe.connect()
n = sys.argv[1]
row = frappe.db.get_value("Sales Invoice", n, ["docstatus", "naming_series"], as_dict=True)
cc = frappe.db.get_value("Sales Invoice Item", {"parent": n}, "cost_center") if row else None
print(json.dumps({"exists": bool(row), "docstatus": row.docstatus if row else None, "cost_center": cc}))
