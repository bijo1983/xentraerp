import frappe
from frappe import _


@frappe.whitelist(allow_guest=True)
def login(usr, pwd):
    """JWT-based login endpoint for the React frontend."""
    from frappe.auth import LoginManager

    from frappe.twofactor import should_run_2fa

    login_manager = LoginManager()
    login_manager.authenticate(usr, pwd)
    # This endpoint has no code step, so it must not become a way around two-factor sign-in.
    if should_run_2fa(login_manager.user):
        frappe.throw(_("This account signs in with an authenticator code. Use the normal sign-in."), frappe.AuthenticationError)
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
def _still_default_password(user: str) -> bool:
    """True while the user's password is still the provisioning default ('admin').

    Checked on the site the user signed in to. The old signal, XentraERP Tenant.
    admin_must_change_password, lives only on the control plane, so asking for it from a
    tenant site (where the ERP and CLINZA sign-ins run) always said "no change needed"."""
    from frappe.utils.password import passlibctx

    from custom_erp.api.provisioning import SITE_ADMIN_PASSWORD

    hashed = frappe.db.sql(
        "select password from `__Auth` where doctype='User' and fieldname='password' and name=%s",
        (user,),
    )
    try:
        return bool(hashed and hashed[0][0] and passlibctx.verify(SITE_ADMIN_PASSWORD, hashed[0][0]))
    except Exception:
        return False


def _must_change(user: str) -> bool:
    """Temporary password set by the platform admin (marker on this site) or still the default."""
    from custom_erp.api.provisioning import MUST_CHANGE_KEY

    return bool(frappe.db.get_default(MUST_CHANGE_KEY + user)) or _still_default_password(user)


def _tenant_flag_pending(user: str):
    if not frappe.db.table_exists("XentraERP Tenant"):
        return None
    rows = frappe.get_all(
        "XentraERP Tenant",
        filters={"tenant_admin_email": user, "admin_must_change_password": 1},
        fields=["name", "tenant_code"],
        limit_page_length=1,
    )
    return rows[0] if rows else None


@frappe.whitelist()
def get_login_status():
    """Tell the frontend whether the just-logged-in user must change their
    (default 'admin') password before continuing."""
    user = frappe.session.user
    pending = _tenant_flag_pending(user)
    return {
        "force_password_change": user != "Guest" and (_must_change(user) or bool(pending)),
        "tenant_code": pending.tenant_code if pending else None,
    }


@frappe.whitelist()
def change_password(new_password, current_password=None):
    """Set a new password for the current session user and clear the
    force-password-change flag on their tenant record, if any.

    Without `current_password` this only works during the forced first-login change (the
    password is still the default); otherwise the current password must be given, so a
    borrowed or stolen session can't quietly take the account over."""
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    if not new_password or len(new_password) < 8:
        frappe.throw(_("Password must be at least 8 characters."))

    from frappe.utils.password import check_password, update_password

    from custom_erp.api.provisioning import SITE_ADMIN_PASSWORD

    if new_password == SITE_ADMIN_PASSWORD:
        frappe.throw(_("Choose a different password."))
    forced = _must_change(user) or bool(_tenant_flag_pending(user))
    if not forced:
        if not current_password:
            frappe.throw(_("Enter your current password."), frappe.AuthenticationError)
        check_password(user, current_password)

    if forced:
        # Not the temporary password again.
        try:
            check_password(user, new_password, delete_tracker_cache=False)
            frappe.throw(_("Choose a new password, not your temporary one."))
        except frappe.AuthenticationError:
            pass

    update_password(user, new_password, logout_all_sessions=True)
    from custom_erp.api.provisioning import mark_must_change_password

    mark_must_change_password(user, False)

    if frappe.db.table_exists("XentraERP Tenant"):
        frappe.db.set_value("XentraERP Tenant", {"tenant_admin_email": user}, "admin_must_change_password", 0)
    frappe.db.commit()
    return {"success": True}
