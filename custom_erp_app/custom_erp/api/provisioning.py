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


def _company_abbr(company_name: str) -> str:
	words = [w for w in company_name.replace("-", " ").replace("_", " ").split() if w]
	abbr = "".join(w[0] for w in words[:4]).upper() or "CO"
	return abbr[:5]


def run_default_setup(company_name: str, country: str | None, time_zone: str | None):
	"""Auto-configure a fresh site's locale and default masters, the same
	things ERPNext's own Setup Wizard would create — a default Company
	(whose insert already cascades into a default Chart of Accounts,
	warehouses, and Cost Center via ERPNext's own Company controller),
	System Settings locale, and Global Defaults. Country/currency/timezone
	come from frappe.geo.country_info, the same reference data the Setup
	Wizard itself uses to auto-fill those fields from a chosen country.

	Idempotent — safe to re-run (e.g. from the admin "Manage" action) on a
	tenant whose provisioning partially failed or is missing pieces; it
	only creates what doesn't already exist. Only ever invoked via
	`bench --site <site> execute` (see _run_default_setup_on_site) for a
	guaranteed, isolated site context."""
	from frappe.geo.country_info import get_country_info

	info = dict(get_country_info(country)) if country else {}
	currency = info.get("currency")
	tz = time_zone or (info.get("timezones") or [None])[0]

	# Currency lives on Company/Global Defaults, not System Settings —
	# only country/time_zone/number_format/date_format belong here.
	settings_values = {
		k: v
		for k, v in {
			"country": country,
			"time_zone": tz,
			"number_format": info.get("number_format"),
			"date_format": info.get("date_format"),
		}.items()
		if v
	}
	if settings_values:
		frappe.get_single("System Settings").db_set(settings_values)

	# ERPNext's Company controller assumes certain master data already
	# exists when it creates default warehouses/accounts (e.g. the
	# "Transit" Warehouse Type) — normally seeded by the Setup Wizard, not
	# by installing the app. Since we're skipping the wizard UI, call its
	# fixture installer directly first. Idempotent — only inserts records
	# that don't already exist, so safe to re-run.
	if not frappe.db.exists("Warehouse Type", "Transit"):
		from erpnext.setup.setup_wizard.operations.install_fixtures import install as install_erpnext_fixtures

		install_erpnext_fixtures(country=country)

	if company_name and not frappe.db.exists("Company", company_name):
		company = frappe.get_doc(
			{
				"doctype": "Company",
				"company_name": company_name,
				"abbr": _company_abbr(company_name),
				"default_currency": currency or "USD",
				"country": country or "United States",
			}
		)
		company.insert(ignore_permissions=True)
		frappe.db.set_default("company", company.name)
		frappe.db.set_single_value("Global Defaults", "default_company", company.name)
		if currency:
			frappe.db.set_single_value("Global Defaults", "default_currency", currency)
		if country:
			frappe.db.set_single_value("Global Defaults", "country", country)

	frappe.db.commit()


def _run_default_setup_on_site(site_name: str, company_name: str, country: str | None, time_zone: str | None):
	"""Run run_default_setup on the target site as an isolated `bench
	execute` subprocess, guaranteeing the correct site context."""
	kwargs = json.dumps({"company_name": company_name, "country": country, "time_zone": time_zone})
	subprocess.run(
		[
			"bench", "--site", site_name, "execute",
			"custom_erp.api.provisioning.run_default_setup",
			"--kwargs", kwargs,
		],
		cwd=BENCH_DIR,
		check=True,
		capture_output=True,
		text=True,
		timeout=180,
	)


def get_default_setup_status():
	"""Report which default masters exist on whichever site this runs
	against, for the admin "Manage" panel. Only ever invoked via
	`bench --site <site> execute`."""
	return {
		"company": frappe.db.count("Company") > 0,
		"chart_of_accounts": frappe.db.count("Account") > 0,
		"warehouse": frappe.db.count("Warehouse") > 0,
		"cost_center": frappe.db.count("Cost Center") > 0,
		"currency_set": bool(frappe.db.get_single_value("Global Defaults", "default_currency")),
		"time_zone_set": bool(frappe.db.get_single_value("System Settings", "time_zone")),
	}


def _get_default_setup_status_on_site(site_name: str) -> dict:
	result = subprocess.run(
		["bench", "--site", site_name, "execute", "custom_erp.api.provisioning.get_default_setup_status"],
		cwd=BENCH_DIR,
		check=True,
		capture_output=True,
		text=True,
		timeout=60,
	)
	# `bench execute` prints the return value as a Python repr on stdout.
	import ast

	return ast.literal_eval(result.stdout.strip().splitlines()[-1])


@frappe.whitelist()
def reconfigure_tenant_defaults(tenant_name: str):
	"""Re-run default-setup on an already-provisioned tenant's site — the
	"Manage" action for a tenant where something didn't get created
	properly the first time. Safe to call repeatedly."""
	_require_system_manager()

	tenant = frappe.get_doc("XentraERP Tenant", tenant_name)
	if not tenant.site_name or tenant.provisioning_status != "Completed":
		frappe.throw("This tenant's site isn't provisioned yet.")

	try:
		_run_default_setup_on_site(
			tenant.site_name, tenant.organization_name, tenant.country, tenant.time_zone
		)
	except subprocess.CalledProcessError as e:
		frappe.throw((e.stderr or e.stdout or str(e))[:2000])

	return get_tenant_setup_status(tenant_name)


@frappe.whitelist()
def get_tenant_setup_status(tenant_name: str):
	"""Status of default masters on a tenant's site, for the admin panel."""
	_require_system_manager()

	tenant = frappe.get_doc("XentraERP Tenant", tenant_name)
	if not tenant.site_name or tenant.provisioning_status != "Completed":
		frappe.throw("This tenant's site isn't provisioned yet.")

	try:
		return _get_default_setup_status_on_site(tenant.site_name)
	except subprocess.CalledProcessError as e:
		frappe.throw((e.stderr or e.stdout or str(e))[:2000])


def _run_site_creation(tenant_name: str, site_name: str):
	"""Background job: actually shell out to bench to create + set up the site."""
	root_pw = _mariadb_root_password()

	tenant_admin_email = frappe.db.get_value("XentraERP Tenant", tenant_name, "tenant_admin_email")
	tenant_admin_name = frappe.db.get_value("XentraERP Tenant", tenant_name, "tenant_admin_name")
	tenant_org_name = frappe.db.get_value("XentraERP Tenant", tenant_name, "organization_name")
	tenant_country = frappe.db.get_value("XentraERP Tenant", tenant_name, "country")
	tenant_time_zone = frappe.db.get_value("XentraERP Tenant", tenant_name, "time_zone")

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
		# `bench new-site --install-app` runs each app's install hooks, but
		# ERPNext's own fixture data (Warehouse Type, UOM, etc. — the master
		# records its Company controller assumes already exist when it
		# creates default warehouses/accounts) is only synced by `migrate`,
		# not by the app install itself. Skipping this makes Company
		# creation below fail with e.g. "Could not find Warehouse Type: Transit".
		subprocess.run(
			["bench", "--site", site_name, "migrate"],
			cwd=BENCH_DIR,
			check=True,
			capture_output=True,
			text=True,
			timeout=600,
		)

		_run_default_setup_on_site(site_name, tenant_org_name, tenant_country, tenant_time_zone)

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
