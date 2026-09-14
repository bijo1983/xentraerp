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

- **CORRECTION (2026-09-14): it IS managed by pm2, under a non-default
  Node version — the earlier "no pm2, no systemd" note was wrong.** pm2's
  God Daemon runs as PID 1 (started ~Jun 29) but the `pm2` CLI binary is
  only on `PATH` for `/root/.nvm/versions/node/v18.20.8/bin` (and v16) —
  **not** the default `v22.23.1`, which is why earlier `which pm2` /
  `pm2 list` checks under the default shell PATH came up empty. Use:
  `export PATH="/root/.nvm/versions/node/v18.20.8/bin:$PATH" && pm2 list`.
  The managed process is named **`xentraerp`** (fork mode, cwd
  `/home/xentraerp/erp-frontend`).
- **Investigated 2026-09-14 (the ~9951-restart question above): root
  cause found and fixed.** It was not app instability — grepping
  `/root/.pm2/logs/xentraerp-error.log` (189k lines) showed **8,533 of
  the crashes were `Error: listen EADDRINUSE: address already in use
  :::8083`**, i.e. a self-inflicted crash loop: the process previously
  had **no `restart_delay`/backoff/`max_restarts`** (all unset), so every
  time someone followed the *old, wrong* manual-restart recipe that used
  to be documented here (`pkill -f next-server` + `nohup npm run start`)
  while pm2 was already supervising the same process, pm2's own
  auto-restart raced the manual command for port 8083 — whichever lost
  got `EADDRINUSE`, exited(1), and pm2 retried **instantly**, forever,
  until the port happened to free up. `pm2.log` shows this running at
  ~50 restarts/minute for hours on 2026-09-03 (7,498 restarts that single
  day) and similarly on 2026-06-29 (3,418, likely initial setup). A
  smaller contributor: 1,296 "Could not find a production build" errors
  from a restart racing an in-progress `next build`. (The "Failed to
  find Server Action" lines in that log, 4,249 of them, are unrelated —
  per-request errors from stale clients after a rebuild, not restart
  triggers.) **Fix applied**: `/home/xentraerp/erp-frontend/
  ecosystem.config.js` now defines the `xentraerp` app explicitly with
  `restart_delay: 3000`, `exp_backoff_restart_delay: 200`,
  `max_restarts: 15`, `min_uptime: '10s'` — replaces the ad hoc `pm2
  start` that had none of this. Applied via `pm2 delete xentraerp && pm2
  start ecosystem.config.js && pm2 save` (restart counter reset to 0 in
  the process, confirmed via `pm2 jlist`). Going forward, always restart
  via `pm2 restart xentraerp` (reads this file) or `cd erp-frontend &&
  pm2 start ecosystem.config.js` if the process was deleted — never the
  manual pkill/nohup recipe, which is what caused this in the first
  place.
- **Correct restart procedure: `pm2 restart xentraerp`** (after the PATH
  export above), not the manual `pkill -f next-server` + `nohup npm run
  start` recipe previously documented here — that recipe actively fights
  pm2 (pm2 auto-restarts the killed process, racing the manual nohup start
  for the port and throwing `EADDRINUSE`). Superseded/removed from
  "Outstanding" below.
- nginx listens on `:80`/`:443` and terminates TLS — mapping confirmed
  2026-09-14 by grepping `/etc/nginx/sites-available/` (the actual
  config files; `/etc/nginx/sites-enabled/*` are symlinks to these):
  - `erp.badmintonbooking.com` (`sites-available/erp`) → `proxy_pass
    http://localhost:8083` — this is the erp-frontend pm2 process. Single
    `location /` block; the Next.js app itself proxies `/api/*` through to
    the Frappe backend on `:8001` internally (see gunicorn note above),
    nginx doesn't split that out.
  - `badmintonbooking.com` / `www.badmintonbooking.com`
    (`sites-available/badmintonbooking.com`) — **unrelated app**, not
    erp-frontend: `location /api/` and `/health` → `:3001`
    (badmintonbooking API), `location /` (everything else) → `:8081`
    (badmintonbooking frontend). This resolves the earlier "Docker
    containers on :3001/:8081, purpose not confirmed" note — they belong
    to this separate site, not erp-frontend.
  - `gamematrix360.innovegicit.com` (`sites-available/gamematrix360.
    innovegicit.com`) → `:8360` — also unrelated to erp-frontend/XentraERP.
  - Port `:3000` (from the old Docker-container observation) is not
    referenced by any current nginx site config — still unexplained, low
    priority.

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
- **Fixed 2026-09-14**: `TENANT_ADMIN_ROLES` in `custom_erp_app/custom_erp/
  api/tenants.py` was missing **"Item Manager"**. Found via `bench
  console` on `197349.xentraerp.local` — `admin@jjc.com` had
  `frappe.has_permission("Item", "create") == False` despite holding Stock
  Manager/User, Manufacturing Manager/User, etc.; none of those grant
  create on `Item` (its DocType permissions give `create=1` only to
  "Item Manager" specifically — same "doctype gates on one specific role"
  gotcha as the Opportunity/Sales Master Manager case above). Practical
  effect before the fix: the "New Item" button (wired up in commit
  `3952d9a`) navigated to a working form fine, but clicking Save would
  fail with a permission error for every tenant admin. Customer/Sales
  Order/Sales Invoice create were unaffected (verified `has_permission`
  True on those). Added to `TENANT_ADMIN_ROLES` and granted directly to
  `admin@jjc.com` on `197349.xentraerp.local` (verified `has_permission
  == True` after). At the time of this fix there was only one fully
  provisioned tenant (`XentraERP Tenant` name `128014`, code `197349`) —
  no other existing tenant admins needed backfilling. Note for future
  provisioning: `create_tenant_admin_user` in `provisioning.py` *does*
  auto-backfill any `TENANT_ADMIN_ROLES` additions like this one for an
  existing user, but it also unconditionally resets that user's password
  to the `admin` default on every re-run (`update_password(...)` in the
  `else` branch) — that's why this fix granted the role directly instead
  of re-invoking that function, to avoid clobbering the tenant admin's
  password. Worth a follow-up: split password-reset out of the role-
  backfill path so re-running it for a role fix doesn't also silently
  reset credentials.

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

- ~~Need nginx config confirmation (mapping hostname → backend port)~~ —
  **confirmed 2026-09-14**, see "Frontend serving" section above.
- **Deployed, as of 2026-09-13 ~12:02 PM**: `/home/xentraerp` on the server
  is pulled to the tip of `origin/claude/erpnext-erp-fixes` (`git pull`
  reported "Already up to date" from `/home/xentraerp`, meaning the
  `bench --site <x> migrate` run on all three sites at 11:30 AM already
  picked up the backend fixes — child-table schema fix, tenant admin role
  grants, error surfacing, `depends_on` support, grid sizing, infinite
  fetch-loop fix). `erp-frontend` was rebuilt (`npm run build`) and the
  `next-server` process on `:8083` restarted (new PID) to pick up the
  latest commit, which included a fix for the Password-login button
  getting stuck on "Signing in..." on page load (see git log — the
  `useAuthStore.loading` initial-state bug). **Confirmed working**: login
  tested successfully after this deploy. `main` is still diverged from
  `origin/main` as noted above — this deploy was done by checking out/
  pulling the feature branch directly, not by touching `main`.
- ~~Process-restart procedure for `erp-frontend` going forward: `pkill -f
  "next-server"` then `nohup npm run start -- -p 8083 ...`~~ —
  **superseded 2026-09-14**: it actually runs under pm2 (process name
  `xentraerp`). Restart with `pm2 restart xentraerp` after putting the
  v18 nvm bin dir on `PATH` — see "Frontend serving" section above for the
  full explanation and command. Don't use the manual pkill/nohup recipe;
  it fights pm2's own auto-restart.

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
