import frappe
from frappe import _


@frappe.whitelist(allow_guest=True)
def login(usr, pwd):
    """JWT-based login endpoint for the React frontend."""
    from frappe.auth import LoginManager

    login_manager = LoginManager()
    login_manager.authenticate(usr, pwd)
    login_manager.post_login()

    user = frappe.get_doc("User", frappe.session.user)

    api_key = user.api_key
    api_secret = frappe.generate_hash(length=15)

    if not api_key:
        api_key = frappe.generate_hash(length=15)
        user.api_key = api_key

    user.api_secret = api_secret
    user.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "token": f"{api_key}:{api_secret}",
        "user": {
            "name": user.name,
            "email": user.email,
            "full_name": user.full_name,
            "user_image": user.user_image,
            "roles": [r.role for r in user.roles],
        },
    }


@frappe.whitelist()
def get_current_user():
    """Return current user info."""
    user = frappe.get_doc("User", frappe.session.user)
    return {
        "name": user.name,
        "email": user.email,
        "full_name": user.full_name,
        "user_image": user.user_image,
        "roles": [r.role for r in user.roles],
    }
