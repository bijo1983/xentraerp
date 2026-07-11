# XentraERP — Site-per-Tenant Architecture & Runbook

## The principle

A tenant **owns their environment**. After they subscribe, their admin has
**full control** of a **dedicated ERPNext site** — their own database,
their own `Administrator` — with **hard isolation** from every other
tenant. This is the model Frappe Cloud itself uses. It is the only way to
give a tenant admin "full control of the site they own" without exposing
other tenants' data (a `System Manager` on a *shared* site can always see
every company — see the earlier Stock Settings incident).

## How the pieces fit

```
Browser  ──/jjcompany──▶  XentraERP frontend (Next.js)
                              │  reads xentra_tenant cookie = "jjcompany"
                              ▼
                     resolveTenant("jjcompany")           ← registry
                              │  → backend { host: jjcompany.<domain>, ip, port }
                              ▼
              /api/erp/[...] proxy sets  Host: jjcompany.<domain>
                              ▼
                    bench (one process, many sites)
                     ├── jjcompany.<domain>   ← tenant's OWN site + DB
                     ├── acme.<domain>        ← another tenant, isolated
                     └── erp.badmintonbooking.com  ← control-plane / admin
```

- **One bench, many sites.** Frappe selects the site by the **Host header**.
  Each site is a separate database → physical isolation.
- **The proxy already routes per-tenant** via `resolveTenant().backend.host`.
- **The registry is dynamic:** `src/lib/tenancy/registry.ts` reads
  `data/tenants.json` (or `XENTRA_TENANTS_FILE`). The provisioning script
  writes to it, so a new tenant routes **without redeploying** the frontend.

## Control-plane record

Each tenant is a `Xentra Tenant` record on the admin site, now carrying its
site binding: `tenancy_model` (`site`), `site_name`, `backend_host`
(Host header), `backend_ip`, `backend_port`. This is the human-visible
source of truth; `tenants.json` is the machine-readable routing copy.

## Provisioning a tenant (on subscription)

Run on the **ERPNext/bench host**, as the **frappe/bench user** (not root):

```bash
./scripts/provision-tenant.sh \
  --slug jjcompany \
  --site jjcompany.badmintonbooking.com \
  --company "JJ Consultancy and IT Services" \
  --admin-password 'StrongPassphrase123!' \
  --registry /home/xentraerp/erp-frontend/data/tenants.json
```

The script:
1. `bench new-site <site>` — new DB, isolated.
2. `bench --site <site> install-app erpnext`.
3. `bench --site <site> set-admin-password` — the tenant admin credential.
4. Appends/updates the routing entry in `tenants.json` (upsert by slug).

Then, one-time infra:
- Add **DNS** (or nginx `server_name`) for `<site>` → this server; reload nginx.
- Make sure the site host is in bench's DNS multitenant setup
  (`bench config dns_multitenant on` if using subdomains).

The tenant admin now signs in at `https://<frontend>/<slug>` as
**`Administrator`** of their own site with the password you set — full
control, nothing shared.

## Where the halves live

| Concern | Owner | Where |
|---|---|---|
| Routing per tenant → own site | Frontend | `registry.ts`, proxy (done) |
| Tenant record + site binding | Control plane | `Xentra Tenant` doctype (done) |
| Dynamic registry file | Frontend | `data/tenants.json` (written by script) |
| Create the actual site | **Server ops** | `scripts/provision-tenant.sh` (run on host) |
| DNS / nginx for the site host | **Server ops** | your infra |

The browser **cannot** run `bench` — site creation is intentionally a
server-side operation. The frontend's job is to route to, and manage the
lifecycle metadata of, sites that the provisioning step creates.

## Lifecycle notes

- **Suspend/expire:** flip `Xentra Tenant.status`; enforcement can drop the
  registry entry (or return 503) so a lapsed tenant can't reach their site.
- **Backups/upgrades:** per-site `bench backup` / `bench --site <s> migrate`.
- **Cost:** one site per tenant is heavier than a shared company. For very
  small tenants you can still choose `tenancy_model = company`; the routing
  layer supports both. Site is the default for true ownership.

## Migrating the existing company

`JJ Consultancy and IT Services` currently shares `erp.badmintonbooking.com`
with the SaaS control plane. Because Frappe backup/restore is **site-level**
(not per-company), the clean split is a **clone-then-split**: keep the
current site as the control-plane/admin site, and clone it into a new
tenant site that carries all the ERP data.

Run on the bench host (as the frappe user):

```bash
./scripts/migrate-company-to-site.sh \
  --source erp.badmintonbooking.com \
  --slug jjcompany \
  --new-site jjcompany.badmintonbooking.com \
  --company "JJ Consultancy and IT Services" \
  --admin-password 'StrongPassphrase123!' \
  --registry /home/xentraerp/erp-frontend/data/tenants.json
```

What it does:
1. `bench backup --with-files` the source site.
2. `bench new-site` the tenant site and `restore` the backup into it — an
   exact copy of all ERP data.
3. Set the tenant admin password on the new site.
4. **Drop the `Xentra` control-plane doctypes** from the tenant copy (the
   tenant must not see SaaS billing/admin data).
5. Upsert the routing entry in `tenants.json`.

The source site is left intact and keeps serving as the control plane.
**Verify** `/jjcompany` loads the tenant's data and its admin can open
Settings **before** removing the operational data from the source site.
Add DNS/nginx for `jjcompany.badmintonbooking.com` and reload nginx.
