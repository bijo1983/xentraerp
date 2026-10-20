app_name = "custom_erp"
app_title = "Custom ERP"
app_publisher = "Custom"
app_description = "Custom ERP API and Business Logic for React Frontend"
app_email = "admin@example.com"
app_license = "MIT"

# Website context for CORS (allow React frontend)
website_context = {
    "favicon": "/assets/custom_erp/images/favicon.ico",
}

# Allow guest access to login endpoint
guest_methods = ["custom_erp.api.auth.login"]

# POS sessions (POS upgrade Phase 1): on every request made with a POS session, enforce
# its maximum age, screen lock and device revocation. Sessions without a POS Session
# record (ERP logins) are not affected. See custom_erp.api.pos_auth.enforce_pos_session.
auth_hooks = ["custom_erp.api.pos_auth.enforce_pos_session"]

# CORS settings — configure allowed origins in site_config.json:
#   "allow_cors": ["http://localhost:3000", "https://your-frontend.com"]

# Document event hooks
doc_events = {
    "*": {
        # Replace __user placeholder before validation (belt-and-suspenders;
        # Frappe's document.py _validate_links patch also handles this)
        "validate": "custom_erp.api.utils.replace_user_placeholders",
        "before_save": "custom_erp.api.utils.replace_user_placeholders",
    },
    "POS Invoice": {
        # A PIN restricted to one register must actually be enforced
        # server-side, not just steered client-side by the POS app.
        "validate": "custom_erp.api.pos.validate_pos_invoice_profile",
    },
    "User": {
        # Frappe v14 crashes building the welcome email when no outgoing email
        # account exists, and the user is never created.
        "before_insert": "custom_erp.api.users.skip_welcome_email_without_mail",
        # The ERP user form and Frappe Role Profiles rebuild the roles table without the
        # (non-desk) POS roles; put the person's POS role back so they don't drop to Waiter.
        "validate": "custom_erp.api.pos_roles.keep_pos_role",
    },
    "POS Profile": {
        # A new register follows the tenant's bill-rounding setting (ERPNext defaults it to rounding on).
        "before_insert": "custom_erp.api.rounding.profile_follows_tenant",
    },
}
