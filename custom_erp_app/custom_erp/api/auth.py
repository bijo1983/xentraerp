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


@frappe.whitelist()
def get_login_status():
    """Tell the frontend whether the just-logged-in user must change their
    (default 'admin') password before continuing — set on tenant approval."""
    pending = frappe.get_all(
        "XentraERP Tenant",
        filters={"tenant_admin_email": frappe.session.user, "admin_must_change_password": 1},
        fields=["name", "tenant_code"],
        limit_page_length=1,
    )
    return {
        "force_password_change": bool(pending),
        "tenant_code": pending[0].tenant_code if pending else None,
    }


@frappe.whitelist()
def change_password(new_password):
    """Set a new password for the current session user and clear the
    force-password-change flag on their tenant record, if any."""
    if not new_password or len(new_password) < 8:
        frappe.throw(_("Password must be at least 8 characters."))

    from frappe.utils.password import update_password

    update_password(frappe.session.user, new_password)

    frappe.db.set_value(
        "XentraERP Tenant",
        {"tenant_admin_email": frappe.session.user},
        "admin_must_change_password",
        0,
    )
    frappe.db.commit()
    return {"success": True}
