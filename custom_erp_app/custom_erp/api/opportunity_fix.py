import frappe


def fix_opportunity_from(doc, method=None):
    """Ensure opportunity_from is set to a valid value before saving Opportunity."""
    if doc.doctype != "Opportunity":
        return
    valid = {"Lead", "Customer", "Prospect"}
    if doc.opportunity_from not in valid:
        if doc.party_name:
            if frappe.db.exists("Lead", doc.party_name):
                doc.opportunity_from = "Lead"
            elif frappe.db.exists("Customer", doc.party_name):
                doc.opportunity_from = "Customer"
            elif frappe.db.exists("Prospect", doc.party_name):
                doc.opportunity_from = "Prospect"
            else:
                doc.opportunity_from = "Lead"
        else:
            doc.opportunity_from = "Lead"
