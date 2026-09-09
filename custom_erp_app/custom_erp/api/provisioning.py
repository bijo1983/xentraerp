"""Per-tenant Frappe site provisioning.

Each tenant gets its own Frappe site (own database) on the same bench —
same shared app code, isolated data. Frappe resolves which site's
database to use purely from the HTTP Host header string (no real DNS
needed since traffic never leaves 127.0.0.1), so sites are named
deterministically as "<tenant_code>.<TENANT_SITE_SUFFIX>" and the
frontend's tenancy registry constructs that same hostname from the
tenant code in the URL — see erp-frontend/src/lib/tenancy/registry.ts.
"""

import json
import os
import subprocess

import frappe
from frappe.utils import now_datetime

TENANT_SITE_SUFFIX = os.environ.get("TENANT_SITE_SUFFIX", "xentraerp.local")
BENCH_DIR = os.environ.get("XENTRAERP_BENCH_DIR", os.path.expanduser("~/innovegic-bench"))
SITE_ADMIN_PASSWORD = "admin"


def _mariadb_root_password() -> str:
	pw = frappe.conf.get("mariadb_root_password") or os.environ.get("MARIADB_ROOT_PASSWORD")
	if not pw:
		frappe.throw(
			"MariaDB root password not configured. Set 'mariadb_root_password' in "
			"site_config.json (or common_site_config.json) or the MARIADB_ROOT_PASSWORD "
			"environment variable for the bench worker process."
		)
	return pw


def _require_system_manager():
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def provision_tenant_site(tenant_name: str):
	"""Kick off background creation of this tenant's dedicated Frappe site."""
	_require_system_manager()

	tenant = frappe.get_doc("XentraERP Tenant", tenant_name)
	if tenant.site_name and tenant.provisioning_status == "Completed":
		frappe.throw(f"Site '{tenant.site_name}' is already provisioned for this tenant.")
	if tenant.status not in ("Trial", "Active"):
		frappe.throw("Approve the tenant before provisioning its site.")

	site_name = f"{tenant.tenant_code}.{TENANT_SITE_SUFFIX}"
	tenant.db_set("site_name", site_name)
	tenant.db_set("provisioning_status", "In Progress")
	tenant.db_set("provisioning_error", "")

	frappe.enqueue(
		"custom_erp.api.provisioning._run_site_creation",
		queue="long",
		timeout=1200,
		tenant_name=tenant_name,
		site_name=site_name,
		enqueue_after_commit=True,
	)
	frappe.db.commit()

	return {"site_name": site_name, "provisioning_status": "In Progress"}


def create_tenant_admin_user(email: str, first_name: str):
	"""Create (or reset) the tenant administrator's User on whichever site
	this runs against. Only ever invoked via `bench --site <site> execute`
	(see _create_admin_user_on_site) — in-process frappe.init()/connect()
	site-switching inside a background worker proved unreliable (a prior
	provisioning run reported success but the user ended up on the wrong
	site's database), so this always runs as its own isolated OS process
	with the correct site context guaranteed by bench itself."""
	if not frappe.db.exists("User", email):
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": first_name,
				"send_welcome_email": 0,
				"user_type": "System User",
				"new_password": SITE_ADMIN_PASSWORD,
			}
		)
		user.append("roles", {"role": "System Manager"})
		user.flags.ignore_password_policy = True
		user.insert(ignore_permissions=True)
	else:
		from frappe.utils.password import update_password

		update_password(email, SITE_ADMIN_PASSWORD)
	frappe.db.commit()


def _create_admin_user_on_site(site_name: str, email: str, first_name: str):
	"""Run create_tenant_admin_user on the target site as an isolated
	`bench execute` subprocess, guaranteeing the correct site context."""
	kwargs = json.dumps({"email": email, "first_name": first_name})
	subprocess.run(
		[
			"bench", "--site", site_name, "execute",
			"custom_erp.api.provisioning.create_tenant_admin_user",
			"--kwargs", kwargs,
		],
		cwd=BENCH_DIR,
		check=True,
		capture_output=True,
		text=True,
		timeout=120,
	)


def _run_site_creation(tenant_name: str, site_name: str):
	"""Background job: actually shell out to bench to create + set up the site."""
	root_pw = _mariadb_root_password()

	tenant_admin_email = frappe.db.get_value("XentraERP Tenant", tenant_name, "tenant_admin_email")
	tenant_admin_name = frappe.db.get_value("XentraERP Tenant", tenant_name, "tenant_admin_name")

	try:
		subprocess.run(
			[
				"bench", "new-site", site_name,
				"--mariadb-root-password", root_pw,
				"--admin-password", SITE_ADMIN_PASSWORD,
				"--install-app", "erpnext",
			],
			cwd=BENCH_DIR,
			check=True,
			capture_output=True,
			text=True,
			timeout=1100,
		)
		subprocess.run(
			["bench", "--site", site_name, "install-app", "custom_erp"],
			cwd=BENCH_DIR,
			check=True,
			capture_output=True,
			text=True,
			timeout=300,
		)

		_create_admin_user_on_site(
			site_name, tenant_admin_email, tenant_admin_name or "Administrator"
		)

		frappe.db.set_value(
			"XentraERP Tenant",
			tenant_name,
			{
				"provisioning_status": "Completed",
				"site_provisioned_on": now_datetime(),
				"provisioning_error": "",
			},
		)
		frappe.db.commit()

		tenant_code, org_name, trial_end = frappe.db.get_value(
			"XentraERP Tenant", tenant_name, ["tenant_code", "organization_name", "trial_end_date"]
		)
		try:
			login_url = f"{frappe.utils.get_url()}/login?tenant={tenant_code}"
			frappe.sendmail(
				recipients=[tenant_admin_email],
				subject="Your XentraERP workspace is ready",
				message=(
					f"<p>Your organization <b>{org_name}</b> is ready to go.</p>"
					f"<p>Sign in with tenant code <b>{tenant_code}</b> at "
					f"<a href='{login_url}'>the sign-in page</a>. "
					f"Use password <b>{SITE_ADMIN_PASSWORD}</b> for your first login — "
					f"you'll be asked to set a new one.</p>"
					f"<p>Your free trial runs until {trial_end}.</p>"
				),
				now=True,
			)
		except Exception:
			frappe.log_error(title="XentraERP site-ready email failed")

	except subprocess.CalledProcessError as e:
		error = (e.stderr or e.stdout or str(e))[:2000]
		frappe.db.set_value(
			"XentraERP Tenant",
			tenant_name,
			{"provisioning_status": "Failed", "provisioning_error": error},
		)
		frappe.db.commit()
		frappe.log_error(title=f"Tenant site provisioning failed: {site_name}", message=error)

	except Exception as e:
		frappe.db.set_value(
			"XentraERP Tenant",
			tenant_name,
			{"provisioning_status": "Failed", "provisioning_error": str(e)[:2000]},
		)
		frappe.db.commit()
		frappe.log_error(title=f"Tenant site provisioning failed: {site_name}")
