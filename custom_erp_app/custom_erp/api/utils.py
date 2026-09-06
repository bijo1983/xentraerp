import frappe


def replace_user_placeholders(doc, method=None):
    """Replace __user placeholder with the current logged-in user."""
    user = frappe.session.user
    for field in doc.meta.fields:
        val = doc.get(field.fieldname)
        if val == "__user":
            doc.set(field.fieldname, user)
