# 06 — Phase 1 implementation notes

Design system, public landing page with the real sign-in on the right, authentication and session hardening, device
and session modes (F&B order taker vs cashier), app shell and system states. Scope from `05` §6 Phase 1 plus the owner
decisions of 2026-10-19 (POS still in testing; currency precision from the company currency; no offline selling; cash
and manual card only) and the F&B device/role requirement.

## 1. Roles, device types and session modes

Enforcement stays on `pos_core.CAPS` (Waiter / Cashier / Supervisor / Kitchen / Administrator). Phase 1 adds a
**device type** (set by the administrator who approves the device) and derives a **session mode**; the device type can
only *narrow* a session's capabilities (`pos_core.session_caps()` = role caps ∩ device mask), never widen them.

| Device type | May sign in (PIN) | Session mode | Capabilities in that session |
|---|---|---|---|
| Till | Cashier, Supervisor; Waiter only if *Waiters may sign in on a till* (default on) | Cashier/Supervisor → `till`; Waiter → `order` | role caps unchanged |
| Order Taking (handheld/tablet) | Waiter, Cashier, Supervisor | Waiter/Cashier → `order`; Supervisor → `till` | Waiter/Cashier masked to `view, kot, order, reserve, modify` (no `bill`, no `shift`) |
| Kitchen Display | Kitchen, Supervisor | `kitchen` | Kitchen/Waiter/Cashier masked to `view, kot` (supervisors unmasked) |
| none (device policy off, or legacy) | anyone with a PIN | from the level (waiter → `order`, kitchen → `kitchen`, else `till`) | role caps |
| (management sign-in) | System Manager only | `manager` | all (admin) |

What each mode does in the app (`pos-frontend/src/lib/nav.ts`, unit-tested):

- **order** (F&B order taker): straight to the floor; no register picker (the register is chosen silently: device's
  register → PIN's register → first register at the location), no shift, no till management. Can open tables and
  take-away orders, add items with notes, send KOT, **request the bill** (`pos_fnb.request_bill`; the table shows "bill
  requested", its status stays `Occupied`). Cannot take payment, close bills, discount, void sent items or open/close
  shifts — refused server-side by the existing caps (HTTP 403). Orders carry the order taker as `waiter` (already the
  case in `open_order`). Modifiers are Phase 4 (notes exist today).
- **till** (cashier/supervisor): register selection (branch first when the registers span several locations), an open
  shift when `require_shift` is on, floor + bill-requested tables, payments, shift and drawer.
- **kitchen**: kitchen board only.
- **Retail**: there is no order taker. Every seller is a cashier on a till with a register and shift. An order-mode
  session at a Retail-only register lands on "nothing to do here" (`/unavailable`); waiter flows are never shown in
  Retail. (Salesperson on the sale is Phase 6.)
- The shell shows register and shift only for till/manager sessions.

## 2. API changes

All existing methods keep their names and arguments. New behaviour is additive unless marked **changed**.

| Method | Existing behaviour | New behaviour | Reason | Migration / compatibility |
|---|---|---|---|---|
| `pos.pin_login(pin)` | PIN alone finds the user; per-IP throttle; System Managers allowed; failures not logged | **changed**: optional `staff` arg → delegates to `pos_auth.pin_login`. Without `staff` the PIN-only path runs only when POS Settings `legacy_pin_login = 1` (default 0) and always refuses System Managers; every attempt is logged | C3 | old dist (PIN only) needs `legacy_pin_login = 1`; the new app never calls the PIN-only path |
| `pos_auth.pin_login(staff, pin)` (new, guest) | — | staff number + PIN; device policy; per-user (DB) and per-IP (cache) progressive lockout, hard lock at 10; generic errors; refuses administrators and roles the device type doesn't allow; logs to `XentraERP POS Login Attempt`; creates `XentraERP POS Session` | C3, M9 | — |
| `pos_auth.management_login(usr, pwd, otp?, enroll_token?)` (new, guest) | administrators used the PIN pad | password + TOTP; enrolment on first use (QR); System Manager only; uses Frappe's own per-user TOTP secret storage | C3 | administrators must enrol an authenticator at first POS sign-in |
| `pos_auth.lookup_organization(tenant_code)` (new, guest, control plane) | — | name only, generic answer for unknown/pending/suspended, per-IP limits | H5 | POS uses this instead of `tenant_lookup` |
| `signup.tenant_lookup(tenant_code)` | returned `organization_name` + **`admin_email`**; distinct messages per status | **changed**: returns `organization_name` only (site config `tenant_lookup_legacy_admin_email: 1` restores the email during a transition); generic "not found" for unknown/pending/rejected/suspended/cancelled/expired; per-IP rate limit (20 / 10 min, 8 unknown codes / 10 min) | H5 | ERP login (`erp-frontend/src/app/login/page.tsx`) now asks for the email; an ERP page cached before the deploy fails the tenant-code login until refreshed (or set the legacy flag) |
| `tenants.get_enabled_modules` | guest, no check | if control-plane site config `xentraerp_internal_token` is set, requires header `X-Xentra-Internal-Token` | H5 | tenant sites send it when the same key is in their config (put it in `common_site_config.json`) |
| `tenants.resolve_tenant_site(tenant_code)` (new) | — | server-to-server allow-list for the Next proxy (token required) | H4 | — |
| `pos._tenant_has_module` / `pos.tenant_modules()` | fail **open**, checked at login only | **changed**: fail **closed** (unknown → refused) with a 60 s cache, a 15 s retry back-off and a 24 h last-known-good fallback; checked on **every** POS call (`pos_core.require_pos_user`). Site config `pos_entitlement_check`: `closed` (default) / `open` (old) / `off` (dev) | H8 | sites without `control_plane_host` lose POS until it is set (production has it) |
| `pos_core.get_pos_settings` | — | additive keys `session` (mode, device, needs_register, default_register, idle minutes, expiry) and `company_currency` (ERPNext Currency record); `caps` now = role caps ∩ device mask | Phase 1 shell, decision C | additive |
| `pos_core.has_cap` / `require_cap` | role caps | role caps ∩ device-type mask of the POS session | device modes | sessions without a POS Session record (ERP, legacy) are not masked |
| `pos.set_pin` | allowed for System Managers (no role change) | **changed**: refuses System Managers; assigns a staff number; resets lockout | C3 | existing admin PIN rows stay but can't sign in |
| `pos.set_pin_active(user, 0)` / `save_pos_access(active=0)` | blocked new logins only | **changed**: also ends the person's sessions | M9 | — |
| `pos.list_pos_users` / `get_pos_access` | — | additive `staff_code` | — | additive |
| `pos.ensure_pos_role` | granted READ on Customer | **changed**: no Customer READ (patch removes existing rows) | H6 | POS screens don't read Customer over REST (checkout runs elevated) |
| `pos_fnb.request_bill(order, cancel=0)` (new, cap `order`) | — | flags/clears "bill requested" | F&B order taker | additive; `list_tables`, `list_open_orders`, order payload gain `bill_requested` |
| `pos_auth.*` session/device methods (new) | — | `login_context`, `register_device`, `create_device_code`, `register_this_device`, `list_devices`, `update_device`, `revoke_device`, `session_info`, `lock_session`, `unlock_session`, `logout`, `list_my_sessions`, `list_sessions`, `revoke_session`, `revoke_other_sessions`, `login_history`, `list_staff_security`, `unlock_staff`, `set_staff_code`, `reset_management_2fa` | — | — |
| `auth_hooks` (new) | — | `pos_auth.enforce_pos_session`: for sessions with a POS Session record, enforces max age, lock and device revocation on every request (incl. REST) | M9 | no effect on ERP sessions; skipped on sites without the POS tables |
| Next proxy (`erp-frontend/src/lib/tenancy/registry.ts`) | any cookie/header value became `Host: <value>.xentraerp.local` | **changed**: format check (`^[a-z0-9]{2,10}$`) + allow-list via `resolve_tenant_site` (cached 60 s; last good kept 24 h if the control plane is down; unknown → 404 `UNKNOWN_TENANT`) | H4 | needs env `XENTRA_INTERNAL_TOKEN` (and optional `XENTRA_CONTROL_PLANE_HOST`, default `ERP_BACKEND_HOST`); without the token only the format check runs (logged) |

Error contract: messages from the new code start with a stable code in brackets, e.g. `[BAD_CREDENTIALS]`, `[LOCKED]`,
`[DEVICE_NOT_REGISTERED]`, `[ROLE_NOT_ALLOWED_ON_DEVICE]`, `[ADMIN_USE_MANAGEMENT_LOGIN]`, `[POS_NOT_ENTITLED]`,
`[POS_SESSION_LOCKED]`, `[SESSION_EXPIRED]`, `[ORG_NOT_FOUND]`, `[RATE_LIMITED]`; the app strips the prefix and
reacts to the code.

## 3. DocTypes and fields (all additive; `bench migrate`)

- **New** `XentraERP POS Device` (DEV-#####): label, type (Till / Order Taking / Kitchen Display), status (Pending /
  Active / Revoked), location, register, approval-code hash + expiry, device-token hash, registered/last-seen info.
- **New** `XentraERP POS Login Attempt` (insert-only; controller refuses edit and delete; System Manager read/export):
  at, kind, result, reason, user, staff number entered, device, IP, user agent. Never PINs, passwords, codes or tokens.
- **New** `XentraERP POS Session`: SHA-256 of the session id (unique), user, kind, mode, device, locked, started /
  last seen / expires / ended, end reason.
- `XentraERP POS PIN`: `staff_code` (unique), `failed_count`, `locked_until`.
- `XentraERP POS Settings`: `require_registered_device` (1), `allow_waiter_on_till` (1), `show_staff_list` (1),
  `legacy_pin_login` (0), `require_management_2fa` (1), `idle_lock_minutes` (5), `session_max_hours` (12).
- `XentraERP POS Order`: `bill_requested`, `bill_requested_at`, `bill_requested_by`.
- Patches (`custom_erp/patches.txt`, first patches of the app): `remove_pos_customer_read`, `assign_pos_staff_codes`.

## 4. Configuration

| Where | Key | Value |
|---|---|---|
| `common_site_config.json` (bench) | `xentraerp_internal_token` | a long random secret (same value as the Next env below) |
| `common_site_config.json` | `control_plane_host` | already `erp.badmintonbooking.com` in production |
| Next.js `erp-frontend/.env.local` | `XENTRA_INTERNAL_TOKEN` | the same secret |
| Next.js `.env.local` (optional) | `XENTRA_CONTROL_PLANE_HOST` | defaults to `ERP_BACKEND_HOST` |
| control-plane site config (optional, temporary) | `tenant_lookup_legacy_admin_email` | `1` only while old ERP login pages are cached |
| dev sites only | `pos_entitlement_check` | `off` or `open` |

## 5. Manual verification (after deploy, on the testing tenant)

1. `https://pos.xentraerp.net/` shows the landing page; at 1280×800 and 1440×900 the sign-in panel is fully visible
   without scrolling; at tablet/phone width the page is one column with a sticky "Sign in".
2. Response headers: `curl -sI https://pos.xentraerp.net/ | grep -iE 'strict|content-security|x-frame|referrer|permissions'`.
   Open the browser console: no CSP violations on landing, sign-in, floor, order, terminal, receipt print, kitchen print.
3. Organization code `197349` → organization name; an unknown code → generic message; 9 wrong codes from one IP →
   "Too many attempts".
4. Unregistered browser → "Register this device". In a management session: Settings → Devices & security → Add a
   device → type *Till* → Create approval code; enter the code on the other browser → staff names appear.
5. Staff tile → PIN pad (dots only) → signed in. Wrong PIN 4× → wait message; 10× → locked until Settings → Devices &
   security → Staff sign-in → Unlock. Sign-in log shows each attempt with no PIN.
6. A System Manager's staff number + PIN → refused ("Administrators sign in with…"). Management tab → email +
   password → QR enrolment → code → in; sign out and back in → asks for the code only.
7. Waiter on an *Order Taking* device → lands on the floor, no register picker, no shift, no Pay button; "Request bill"
   marks the table; a cashier on a *Till* sees "bill requested" on the floor plan and can take payment after opening a
   shift. Waiter on a *Kitchen Display* → refused. Kitchen staff on a *Kitchen Display* → kitchen board.
8. Retail-only location: cashier on a till → counter screen; a waiter → "Nothing to do here".
9. Idle for `idle_lock_minutes` → lock screen; the same PIN unlocks; any API call while locked returns 403.
   User menu → Sessions & devices → "Sign out of all other devices" signs the other browser out on its next request.
10. Switch a PIN off in the ERP User form → that person's open POS session ends on its next request.
11. Disconnect the network → red offline banner; Pay is disabled; saving an order shows "You're offline — selling is
    paused…"; reconnect → banner clears.
12. Language → العربية: layout mirrors (RTL), digits stay Latin; theme switch (supervisor/admin) → dark POS theme on
    floor/order/terminal remains readable.
13. ERP (`xentraerp.net`) tenant-code login: code → organization name → **email** + password works.
14. `curl -s -H 'Cookie: xentra_tenant=nosuch' https://pos.xentraerp.net/api/method/ping` → 404 `UNKNOWN_TENANT`
    (with `XENTRA_INTERNAL_TOKEN` set).
