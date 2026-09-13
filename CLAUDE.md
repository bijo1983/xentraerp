# XentraERP — Server & Environment Notes

Persistent notes about the production server so future sessions don't have
to rediscover this from scratch. Update this file whenever server topology
changes.

## Production server

- Host: `ubuntu-s-2vcpu-4gd-innovgicit` (DigitalOcean droplet, 2 vCPU / 4GB)
- Logged in as `root` (bench itself warns not to run bench as root, but that's
  how this box is currently operated)

## Directory layout

- `/home/frappe/innovegic-bench` — the Frappe bench (multi-tenant, single
  bench hosting multiple sites via Host header, no per-tenant DNS/site
  isolation beyond the `sites/` folder)
  - `sites/` contains: `197349.xentraerp.local` (a live tenant, admin
    `admin@jjc.com`), `demo.innovegicit.com`, `erp.badmintonbooking.com`
  - Backend process: **gunicorn**, listening on `127.0.0.1:8001`
- `/home/xentraerp` — git checkout of `custom_erp_app` (the Frappe app:
  tenants.py, signup.py, provisioning.py, etc.) and `erp-frontend` (the
  Next.js multi-tenant frontend). This is a SEPARATE git repo from
  `bijo1983/badmintonbooking_updated`.
  - `git remote`: `https://github.com/bijo1983/xentraerp.git`
  - **IMPORTANT**: as of 2026-09-13, this checkout's local `main` branch has
    DIVERGED from `origin/main` — 34 local commits not on GitHub, and 1
    commit on `origin/main` not present locally. Do NOT force-push or hard
    reset this without explicit user confirmation; merge carefully.
  - All of this session's fixes live on `origin/claude/erpnext-erp-fixes`,
    NOT on `main`. Deploying them requires merging/checking out that branch
    on the server — a plain `git pull` on `main` will not bring them in.
  - `erp-frontend/.env.local` exists on the server but is untracked
    (gitignored) — holds the real backend URL config for this environment.
    Don't overwrite it blindly; read it before assuming defaults.

## Frontend serving (erp-frontend)

- No `pm2`, no matching `systemd` unit found for it (checked both).
- A raw `next-server` process was found listening on port `:8083` — likely
  started via a bare `next start` in a screen/tmux/nohup session, not a
  managed process. Exact start command/session not yet confirmed.
- Additional Docker containers were observed listening on `:3000`, `:3001`,
  `:8081` (via `docker-proxy`) — purpose/relation to erp-frontend not yet
  confirmed; could be old/unrelated deployments. Verify before assuming
  these matter.
- nginx listens on `:80`/`:443` and terminates TLS for
  `erp.badmintonbooking.com` (and presumably the other site hostnames) —
  the exact nginx site config mapping hostname → backend port was requested
  from the user but not yet confirmed (pending `grep` of
  `/etc/nginx/sites-enabled/`).

## Known application facts

- URL scheme for tenants: `https://erp.badmintonbooking.com/<tenant_code>/...`
  — `src/middleware.ts` in erp-frontend strips the leading tenant-code path
  segment via a rewrite (not a `[tenant]` route folder) and sets an
  `xentra_tenant` cookie. Reserved first-segments (admin, api, login, app,
  etc.) are listed in `RESERVED_SEGMENTS` in that file and must stay in
  sync with `src/lib/tenant.ts`.
- Tenant `197349.xentraerp.local` / tenant code `197349`: admin user
  `admin@jjc.com`. This user needed `Sales Master Manager`, `Sales Manager`,
  and `Sales User` roles manually granted via `bench console` because
  ERPNext gates doctypes like `Customer`/`Opportunity` behind those specific
  roles, not `System Manager` alone, and not all doctypes list the
  "Master Manager" role even when they list the lower roles (Opportunity is
  an example: only lists Sales User/Sales Manager, not Sales Master
  Manager). Fixed in code going forward — see
  `custom_erp_app/custom_erp/api/tenants.py` `TENANT_ADMIN_ROLES`.
- Frappe roles are NOT hierarchical — holding a "Master Manager" role does
  not imply the "Manager"/"User" roles below it for permission purposes.

## Incident log

- **2026-09-13, ~11:33 AM**: entire `innovegic-bench` supervisor group (Redis
  cache/queue/socketio, `frappe-web` gunicorn, `node-socketio`, all workers)
  went to `STOPPED` immediately after running `bench --site <x> migrate` on
  all three sites followed by `bench build` (the exact deploy sequence
  suggested during this session). Bench's own `bench.log` shows the last
  action was gunicorn receiving `SIGTERM` at 11:33:47 with no subsequent
  start — nothing in the log proves whether `bench build`/`migrate` itself
  stopped supervisor or a manual `supervisorctl stop all` was run before the
  build and never followed by `start all`. Symptom was 502 "Backend
  unavailable" from the Next.js proxy (`api/resource/...`, `api/method/
  login`) on every request, plus `curl -I http://127.0.0.1:8001` returning
  `Connection refused`. **Fix**: `sudo supervisorctl start all`. **Lesson
  for next deploy**: after `bench build`/`migrate` on this box, always
  follow with `sudo supervisorctl status` (not just assume `bench restart`
  or the build step brings services back) before considering a deploy done.
  The erp-frontend `next-server` process on `:8083` was unaffected by this
  incident and does not need restarting when this happens again.

## Outstanding / in-progress as of 2026-09-13

- Need nginx config + `ps -ef` process tree + confirmation of which branch/
  commit is actually deployed, to give exact deploy commands.
- Multiple fixes committed to `claude/erpnext-erp-fixes` (child-table schema
  fix, tenant admin role grants, error surfacing in list hooks, depends_on
  support, grid sizing, infinite fetch-loop fix) are NOT yet deployed to
  production — pending a safe merge of that branch into the server's
  diverged `main` and a rebuild + process restart. Claude Code on the web
  has no SSH access to the droplet in this environment, so this step needs
  a human (or a session run directly on the box) to execute.

## Product architecture & SaaS roadmap (added 2026-09-13)

XentraERP's target shape is a two-plane SaaS: a **control plane** (tenant
registry, plans, modules, subscriptions, billing, entitlements, audit) and a
**tenant ERP application plane** (ERPNext itself, one plane instance per
tenant). Full 15-point architecture writeup (component/provisioning/
entitlement diagrams, entity model, phased roadmap, risks) was produced in
chat on this date — re-derive from the codebase below rather than assuming
it's written down anywhere else in-repo.

**Architecture decisions already locked in by the existing code (keep
these, don't re-litigate):**

- **Tenancy = site-per-tenant**, not shared-site. `custom_erp/api/
  provisioning.py` shells out to `bench new-site` per tenant
  (`<tenant_code>.xentraerp.local`), installs `erpnext` + `custom_erp` on
  it, and creates the tenant admin `User` there via an isolated
  `bench --site <site> execute` subprocess (in-process site-switching was
  tried and proved unreliable — see the docstring on
  `create_tenant_admin_user`). One shared bench/gunicorn process serves all
  sites; Frappe picks the DB purely from the HTTP `Host` header, resolved
  server-side in `erp-frontend/src/lib/tenancy/registry.ts`.
- **Control plane lives inside one particular Frappe site's database** (the
  "default"/pre-multi-tenant site, aliased as `sandbox` — see
  `tenancy/registry.ts`), as ordinary custom DocTypes in the `custom_erp`
  app: `XentraERP Tenant`, `XentraERP OTP`. This is *not* a separate
  control-plane database — it's the same app installed everywhere, but only
  that one site's rows are treated as the tenant directory. Document this
  explicitly if a separate control-plane DB is ever proposed instead.
- **Frontend stays Next.js/React/TypeScript**, not Vue 3. It's already a
  substantial, working App Router codebase (admin portal, tenant ERP
  screens, dynamic doctype pages, a `/api/resource`, `/api/method`,
  `/api/erp` proxy layer that forwards the Frappe session cookie and never
  exposes API secrets to the browser). Rewriting onto Vue would be pure
  cost with no documented benefit — treat "prefer Vue 3" from any future
  spec as overridden by this existing implementation.
- Tenant URL scheme is **path-prefixed**, not subdomain-per-tenant:
  `https://erp.badmintonbooking.com/<tenant_code>/...`, rewritten by
  `src/middleware.ts` into an `xentra_tenant` cookie / `x-xentra-tenant`
  header that the proxy routes use to pick the backend Host header.

**Implementation status — what's real vs. placeholder, so nobody re-demos a
mock as if it were done:**

| Area | Status |
|---|---|
| Signup (OTP infra, `complete_signup`, pending-approval email) | Real, working. OTP verification itself is currently bypassed — admin approval is the actual gate. |
| Tenant approval, per-tenant site provisioning, admin user creation, default company/CoA/warehouse setup | Real, working, idempotent (`reconfigure_tenant_defaults` can be re-run safely). |
| Tenant admin roles (`TENANT_ADMIN_ROLES` full per-module stack) | Real, working — see role-hierarchy gotcha further up this file. |
| Dynamic doctype list/form/child-table rendering, `depends_on` support | Real, working (this session's fixes). |
| Admin portal pages: Plans, Modules, Features, Reports, Subscriptions, Billing, Coupons | **UI-only mockups** — hardcoded arrays in the `.tsx` files, no backing DocTypes, no persistence. Each page literally says so in an on-page note. |
| **Module/plan entitlement enforcement** | **Does not exist anywhere.** `XentraERP Tenant.enabled_modules` is a stored comma-separated field but nothing reads it to gate navigation, routes, or API calls. Every tenant admin user's actual access today is whatever their granted Frappe roles allow — full ERPNext access, independent of plan/subscription. This is the single biggest gap vs. the SaaS vision and the top priority for the next implementation phase. |
| Billing/payment integration, usage metering, coupons, audit log, notification templates as data (vs. one-off `frappe.sendmail` calls) | Not started. |

**Next implementation phase (in priority order):** (1) `XentraERP Plan`,
`XentraERP Module`, `XentraERP Feature`, `XentraERP Report Entitlement`,
`XentraERP Subscription` DocTypes on the control-plane site, seeded from
the data currently hardcoded in the admin `.tsx` pages; (2) a real
entitlement service (`has_module`/`has_feature`/`has_report`/
`check_usage_limit`) called from every whitelisted API method that touches
a gated module, not just from the frontend nav; (3) wire the admin pages to
that data instead of the hardcoded arrays; (4) `XentraERP Audit Event`
DocType + a `doc_events`/`after_request` hook to actually persist the audit
trail section 17 of the spec calls for (today there is no audit log at
all, only ad-hoc `frappe.log_error` on failures).
