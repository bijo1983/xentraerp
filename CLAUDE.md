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

## Outstanding / in-progress as of 2026-09-13

- Need nginx config + `ps -ef` process tree + confirmation of which branch/
  commit is actually deployed, to give exact deploy commands.
- Multiple fixes committed to `claude/erpnext-erp-fixes` (child-table schema
  fix, tenant admin role grants, error surfacing in list hooks, depends_on
  support, grid sizing) are NOT yet deployed to production — pending a safe
  merge of that branch into the server's diverged `main` and a rebuild +
  process restart.
