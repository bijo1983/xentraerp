import frappe
from frappe.utils import now_datetime
from frappe.utils.password import update_password

DEFAULT_ADMIN_PASSWORD = "admin"


def _require_system_manager():
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Not permitted", frappe.PermissionError)


def _ensure_tenant_admin_user(tenant):
	"""Create (or reset) the Frappe User the tenant administrator signs in as.

	Single shared Frappe instance for now (no per-tenant site isolation yet),
	so this grants System Manager so the admin can manage their own tenant's
	Users under Settings. Password is always reset to the known default on
	approval; admin_must_change_password forces a change on first login.
	"""
	email = tenant.tenant_admin_email
	if not frappe.db.exists("User", email):
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": tenant.tenant_admin_name or tenant.organization_name,
				"send_welcome_email": 0,
				"user_type": "System User",
				"new_password": DEFAULT_ADMIN_PASSWORD,
			}
		)
		user.append("roles", {"role": "System Manager"})
		# The default 'admin' password is intentionally simple for first login
		# (admin_must_change_password forces it to be replaced immediately) —
		# bypass Frappe's password-strength policy for this one insert only.
		user.flags.ignore_password_policy = True
		user.insert(ignore_permissions=True)
	else:
		update_password(email, DEFAULT_ADMIN_PASSWORD)

	tenant.db_set("admin_must_change_password", 1)


@frappe.whitelist()
def list_tenants(search: str | None = None, status: str | None = None, limit: int = 100):
	"""Return tenants for the Super Admin portal, restricted to System Manager."""
	_require_system_manager()

	filters: dict = {}
	if search:
		filters["organization_name"] = ["like", f"%{search}%"]
	if status:
		filters["status"] = status

	return frappe.get_all(
		"XentraERP Tenant",
		filters=filters,
		fields=[
			"name",
			"organization_name",
			"subdomain",
			"tenant_code",
			"plan",
			"status",
			"provisioning_status",
			"max_users",
			"trial_end_date",
			"tenant_admin_name",
			"tenant_admin_email",
			"creation",
		],
		order_by="creation desc",
		limit_page_length=limit,
	)


@frappe.whitelist()
def approve_tenant(tenant_name: str):
	"""Approve a Pending Approval tenant, activating its trial."""
	_require_system_manager()

	tenant = frappe.get_doc("XentraERP Tenant", tenant_name)
	if tenant.status != "Pending Approval":
		frappe.throw(f"Tenant is '{tenant.status}', not Pending Approval.")

	tenant.status = "Trial"
	tenant.provisioning_status = "Completed"
	tenant.approved_by = frappe.session.user
	tenant.approved_on = now_datetime()
	tenant.save(ignore_permissions=True)
	frappe.db.commit()

	_ensure_tenant_admin_user(tenant)
	frappe.db.commit()

	try:
		login_url = f"{frappe.utils.get_url()}/login?tenant={tenant.tenant_code}"
		frappe.sendmail(
			recipients=[tenant.tenant_admin_email],
			subject="Your XentraERP account is now active",
			message=(
				f"<p>Good news — your organization <b>{tenant.organization_name}</b> "
				f"has been approved.</p>"
				f"<p>Sign in with tenant code <b>{tenant.tenant_code}</b> at "
				f"<a href='{login_url}'>the sign-in page</a>. "
				f"Use password <b>{DEFAULT_ADMIN_PASSWORD}</b> for your first login — "
				f"you'll be asked to set a new one.</p>"
				f"<p>Your free trial runs until {tenant.trial_end_date}.</p>"
			),
			now=True,
		)
	except Exception:
		frappe.log_error(title="XentraERP tenant approval email failed")

	return {"status": tenant.status, "trial_end_date": str(tenant.trial_end_date)}


@frappe.whitelist()
def reject_tenant(tenant_name: str, reason: str | None = None):
	"""Reject a Pending Approval tenant."""
	_require_system_manager()

	tenant = frappe.get_doc("XentraERP Tenant", tenant_name)
	if tenant.status != "Pending Approval":
		frappe.throw(f"Tenant is '{tenant.status}', not Pending Approval.")

	tenant.status = "Rejected"
	if reason:
		tenant.notes = f"{tenant.notes or ''}\nRejected: {reason}".strip()
	tenant.save(ignore_permissions=True)
	frappe.db.commit()

	try:
		frappe.sendmail(
			recipients=[tenant.tenant_admin_email],
			subject="Update on your XentraERP signup",
			message=(
				f"<p>We're unable to activate <b>{tenant.organization_name}</b> at this time.</p>"
				+ (f"<p>{reason}</p>" if reason else "")
				+ "<p>Contact support if you believe this is a mistake.</p>"
			),
			now=True,
		)
	except Exception:
		frappe.log_error(title="XentraERP tenant rejection email failed")

	return {"status": tenant.status}


@frappe.whitelist()
def tenant_stats():
	"""Aggregate counts for the admin dashboard."""
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Not permitted", frappe.PermissionError)

	rows = frappe.get_all("XentraERP Tenant", fields=["status"])
	counts = {"total": len(rows)}
	for row in rows:
		key = (row.status or "Draft").lower().replace(" ", "_")
		counts[key] = counts.get(key, 0) + 1
	return counts
