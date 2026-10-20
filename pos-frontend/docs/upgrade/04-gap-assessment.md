# 04 — Security and technical gap assessment

Ranked by risk. **Critical** = money or books can be wrong or lost today, or a single weakness gives broad
access. **High** = likely to cause loss, fraud or a breach under normal use. **Medium** = real weakness with
limited blast radius or needing another failure. **Low** = hygiene.

Evidence refers to `feature/pos-app` @ `543c34a` (identical to production for POS code; see `01-audit.md` §23).
Money and duplicate-risk items are marked **[$]**.

## Critical

### C1 [$] POS Invoice sales never reach the general ledger or the stock ledger

- **Evidence:** default `checkout_document = "POS Invoice"` (`pos_core.py:119`); `post_invoice` submits a POS
  Invoice (`pos_core.py:921-945`). ERPNext 14 `POSInvoice.on_submit` makes no GL or stock entries
  (`erpnext/accounts/doctype/pos_invoice/pos_invoice.py:61-78`); they are only posted when a POS Closing Entry
  consolidates them. The app never creates POS Opening/Closing Entries. Live tenant: 1 submitted POS Invoice,
  0 consolidated, 0 POS Closing Entries.
- **Impact:** revenue, VAT, cash/bank balances and COGS are missing from the books for every sale taken in this
  mode; stock is not decremented; ERPNext's stock availability check treats unconsolidated POS quantities as
  reserved, so stock items will eventually be refused at the till. EOD looks right because it reads the POS
  Invoices directly, so the gap is invisible in the POS.
- **Fix:** either (a) make `Draft Invoice + Receipt` (Sales Invoice + Payment Entry, which do post) the only
  checkout path, or (b) create a POS Opening Entry at `open_shift` and a POS Closing Entry at `close_shift`
  (which consolidates into Sales Invoices), plus a one-off backfill for existing unconsolidated invoices. Add a
  reconciliation check (EOD warning when any submitted POS Invoice for the day is unconsolidated). Decide with the
  accountant (owner decision D1 in `05`).

### C2 [$] Retail checkout and balance settlement are not idempotent

- **Evidence:** `retail_checkout` (`pos_core.py:1223-1236`) and `settle_invoice` (`:1123-1151`) take no request
  id, hold no lock, and have no unique constraint on the tender ledger. The UI only disables the button while the
  request is in flight (`TerminalView.vue:207-240`).
- **Impact:** a timeout, proxy 502 after commit, double-tap on a slow tablet, or a cashier retrying after an error
  posts a second invoice and second tender rows (or a second Payment Entry on a part-paid balance). Cash: shift
  shows phantom sales and a negative variance. Card: the customer may be charged twice on the external terminal
  while the POS records two sales. F&B `bill_order` is protected by an order row lock and status check
  (`pos_fnb.py:302-313,887`) except for repeated part payments on a `Part Paid` order.
- **Fix:** client generates a UUID per checkout attempt; server stores it on a new `XentraERP POS Transaction`
  (unique index) and returns the stored result on replay; lock the Sales Invoice row in `settle_invoice`; add a
  unique key (transaction id, leg index) on tenders.

### C3 PIN-only, user-less login grants System Manager sessions without 2FA

- **Evidence:** `pin_login` finds the user from the PIN alone (`pos.py:134-140`) and calls `post_login()`
  directly (`pos.py:155-159`), skipping Frappe's 2FA (`frappe/auth.py:144-149`). `set_pin` does not refuse
  System Manager users (`pos.py:191-249`); `get_pos_settings` gives System Managers every cap
  (`pos_core.py:73-74`). The throttle is 8 attempts per 15 min per client IP (`pos.py:95-120`), stored per site.
- **Impact:** every active PIN is a target for every guess (with N staff, each guess hits with probability
  N/10^6 for 6 digits). Rotating IPs bypasses the throttle; a shop's shared NAT is locked out by a few typos. A
  guessed administrator PIN yields a full System Manager session on the tenant's REST API (all ERP data, user
  management, `set_rounding`, `set_exchange_rate`, deletion of tender rows). Failed attempts leave no trace.
- **Fix:** require identity + PIN (staff picker or staff number), throttle per user and per device and per
  tenant in addition to IP, progressive lockout with admin unlock, log every attempt; refuse PINs for System
  Manager users (management login = password + TOTP); register devices (device token issued by a manager) and
  only accept PIN logins from registered devices; idle lock.

## High

### H1 [$] Money arithmetic in binary floats with tolerances and hard-coded precision

- **Evidence:** `01-audit.md` §15/§15.1 — `flt(tendered * rate, prec)` (`pos_core.py:853`), underpayment
  tolerance `10**-prec/2` (`:855-861`), float inverse exchange rates (`:470`), `flt(..., 3)` variance (`:697`),
  frontend `toFixed(3)`/`toFixed(2)`/`0.0005`, precision from site-wide setting instead of the company currency.
- **Impact:** accepted underpayments up to half the smallest unit; foreign tenders not rounded to their own
  currency; wrong decimals for any non-3-dp company (AED/SAR/USD) and for 2-dp foreign cash; EOD/shift totals can
  drift by rounding from the ledger; a non-BHD tenant gets 3-dp variances.
- **Fix:** one backend money module using `decimal.Decimal` with precision from the company currency's
  `Currency` record (`fraction_units` / `smallest_currency_fraction_value` / `number_format`) and per-currency
  precision for tenders; store `tendered` (tender currency, its precision), `rate`, and `base_amount` (company
  precision); zero tolerance (exact match after rounding); frontend formats with precision supplied by the
  server, never `toFixed(n)` literals. Set the site `currency_precision` to the company currency's decimals.

### H2 [$] Rate override and price edits without approval or audit

- **Evidence:** when the POS Profile allows rate change, any cashier's client-supplied rate is used
  (`pos_core.py:1210`, `pos_fnb.py:455`); supervisors change menu prices directly on the price list as
  Administrator (`pos_core.py:1449-1485`); System Managers change exchange rates (`:496-518`) and rounding
  (`rounding.py:66-95`) with no record of old/new values.
- **Impact:** under-ringing and sweet-hearting are possible and undetectable from POS data; a changed exchange
  rate silently changes how much foreign cash settles a bill.
- **Fix:** replace free rate edits with discount reasons and limits per role, manager approval above limits,
  append-only audit events with before/after.

### H3 No central append-only audit trail; operational records are mutable

- **Evidence:** no audit doctype; POS doctypes have `track_changes = 0` and full System Manager CRUD
  (`01-audit.md` §11, §13); ownership rewritten with `db.set_value(..., "owner", …)` after building as
  Administrator (`pos_core.py:943,1021,1072,1106`); voids/re-opens/cancellations record no reason or approver.
- **Impact:** disputes, fraud and variances cannot be investigated; tender rows can be edited or deleted via
  REST by any System Manager (including a PIN-logged-in one, C3).
- **Fix:** `XentraERP POS Audit Event` (insert-only, no write/delete permission for any role, hash-chained),
  written by a single `audit()` helper from every sensitive method; make Tender/Shift rows read-only after
  insert (permissions + `validate` guard); keep `owner` = cashier by setting it before insert.

### H4 Tenant resolution trusts an unvalidated client cookie/header

- **Evidence:** `tenantSlug()` reads `x-xentra-tenant` or cookie `xentra_tenant` (`erp-frontend/src/app/api/
  method/[...path]/route.ts:6-8`); `resolveTenant` builds `Host: <slug>.xentraerp.local` without validation
  (`erp-frontend/src/lib/tenancy/registry.ts:35-44`); empty slug → control plane.
- **Impact:** today isolation still holds because Frappe sessions are per-site, but any change to session or
  cookie handling (e.g. shared token auth, a site alias, a wildcard site) would turn this into cross-tenant
  access. It also lets anyone point PIN guessing at any tenant by changing a cookie.
- **Fix:** validate slug format (`^[0-9]{6}$` or registry), resolve only to known, active tenant sites (cached
  registry from the control plane), drop the header override for browser traffic, bind the session to the tenant
  (store tenant code in session data and reject mismatches), add automated cross-tenant tests.

### H5 Guest endpoints disclose tenant data

- **Evidence:** `signup.tenant_lookup` returns `admin_email` to unauthenticated callers (`signup.py:262-265`);
  `tenants.get_enabled_modules` (`tenants.py:200`) and, in production, `get_entitlements` (uncommitted) are guest.
  Tenant codes are 6-digit numbers.
- **Impact:** enumeration of all tenants, their admin emails (phishing/credential stuffing) and subscriptions.
- **Fix:** return only an opaque "found" + display name to the POS; move entitlement checks to an authenticated
  server-to-server call (shared secret header or loopback-only check); rate-limit lookups.

### H6 POS sessions have broad REST reach

- **Evidence:** POS roles have READ on Customer, Item, Item Price, POS Profile, etc. (`pos.py:321`); the session is
  a normal Frappe session usable on `/api/resource/*`.
- **Impact:** any waiter can export the full customer list (names, phones, emails, addresses). Combined with
  C3, an admin PIN exposes everything.
- **Fix:** move POS reads behind whitelisted, field-limited methods (`list_menu` already exists) and drop
  Customer read from POS roles; customer search returns minimal fields with masking.

### H7 No HTTP security headers on pos.xentraerp.net

- **Evidence:** `scripts/nginx-pos.xentraerp.net.conf` (identical to the live vhost) sets no HSTS, CSP,
  X-Frame-Options/`frame-ancestors`, Referrer-Policy, Permissions-Policy.
- **Impact:** click-jacking of payment/void buttons, no HSTS downgrade protection, no CSP backstop against XSS.
- **Fix:** add headers in nginx (CSP allowing self + Google Fonts, or self-host fonts), HSTS with a staged
  max-age, `frame-ancestors 'none'`; nginx `limit_req` on `/api/method/custom_erp.api.pos.pin_login` and
  `tenant_lookup`.

### H8 Module entitlement fails open and is checked only at login

- **Evidence:** `pos.py:44-92,126-127` (None → allow); no check in `require_pos_user`/`require_cap`.
- **Impact:** a suspended or downgraded tenant keeps selling until sessions expire; if the control plane is
  unreachable every tenant is entitled.
- **Fix:** check entitlement (cached) in `require_pos_user`; fail closed for new logins after a grace period with
  a cached last-known value; surface "subscription inactive" state in the UI.

## Medium

| ID | Gap | Evidence | Impact | Fix |
|---|---|---|---|---|
| M1 [$] | Shift close is not blind, has no denomination count and no variance approval | `ShiftView.vue:119,168`, `pos_core.py:647,694-697` | cashier sees expected cash and can match the count; large variances close silently | blind count by denomination; variance threshold per role → manager approval; immutable Z record |
| M2 [$] | No cash in/out, drops, petty cash | CLAUDE.md "Not built"; `_cash_taken` only sums tenders (`pos_core.py:608-614`) | any legitimate cash movement shows as variance; masks theft | `XentraERP POS Cash Movement` with reasons/approval, included in expected |
| M3 [$] | Concurrent edit on an order: last writer wins for unsent lines | `set_order_items` replace semantics (`pos_fnb.py:434-491`) | two terminals editing one table can drop each other's unsent items (not money once sent, but lost orders) | optimistic version (`modified`) check; per-line operations |
| M4 [$] | Location scoping gaps | `get_order` (`pos_fnb.py:415-420`), `bill_totals` (`:854-867`), `set_kot_status` (`:577-589`), `list_open_balances` (`pos_core.py:1154-1190`) | staff at one branch can read other branches' orders/balances and advance their KOTs | call `require_user_location` in each |
| M5 [$] | Mixed currencies in totals | `BILLED` uses `base_*` (company), tender `amount` is register currency (`pos_core.py:620,853,1531`) | wrong EOD/shift totals if a register's currency ≠ company currency | store both currencies explicitly (see H1) |
| M6 [$] | Receipts not compliant / not authoritative | `receipt.ts:34-56`; client-computed line amounts (`TerminalView.vue:228`) | Bahrain VAT invoices need VAT number, tax breakdown; client lines can disagree with posted invoice | server-rendered receipt payload from the posted invoice; tax lines, VAT no., cashier, reprint marker |
| M7 | Kitchen tickets can be missed | in-memory dedupe, first load skipped (`KitchenView.vue:49-57`) | tickets created while the kitchen screen was down never auto-print | server `printed_at` per device/station, reprint, alert on unacknowledged tickets |
| M8 | No CSRF token for API sessions | `frappe/auth.py:72-82` | relies on SameSite=Lax; any future cross-site cookie change exposes state-changing calls | send and enforce a CSRF token (generate on login, check in a `before_request` hook for POS methods) |
| M9 | PIN deactivation does not end sessions; no idle lock | `pos.py:403-411`; no idle handling in app | a departed employee's open session keeps REST reads; unattended till stays logged in | revoke sessions on deactivate (`frappe.sessions.clear_sessions(user)`); idle lock to PIN pad |
| M10 | Kiosk/AI notes call | `pos_core.py:1290-1321` sends dish names to Anthropic when a key is set | low data sensitivity; external dependency in a till flow (6 s timeout, cached) | keep optional; document; never send customer data |
| M11 | Validate hook ineffective for POS-created invoices | runs as Administrator inside `_elevated` (`pos.py:272-279`, `pos_core.py:741-748`) | only direct REST saves are restricted; POS path relies on earlier check (which exists) | pass the real user explicitly (flag on doc) |
| M12 | Error messages from backend shown raw; scrubbing only on Next proxy | `lib/api.ts:15-22` | leaks internal wording; poor UX | error code mapping |
| M13 | No automated frontend, concurrency or cross-tenant tests; suites run against the live tenant DB | `scripts/pos-checks/README.md` | regressions in money paths can ship; tests risk live data | staging site cloned from a sanitized backup; CI on a disposable bench |

## Low

| ID | Gap | Evidence | Fix |
|---|---|---|---|
| L1 | Zoom disabled, missing dialog semantics, icon buttons without labels | `index.html:6-9`; `PayDialog.vue`, `NewOrderDialog.vue` | a11y pass, axe in CI |
| L2 | No i18n/RTL | all templates | i18n layer, logical CSS properties |
| L3 | Floor date uses UTC (`toISOString`) | `FloorView.vue:41,76-81` | use business date from server |
| L4 | Polling cost and N+1 | `FloorView.vue:68`, `KitchenView.vue:67`, `pos_fnb.py:573-574` | batch queries; Frappe realtime (socket.io) for KOT/floor events |
| L5 | Missing indexes | Tender(shift, business_date, invoice), Order(status), KOT(status, location), PIN(pin_hash) | add via DocType `search_index` |
| L6 | `Data` instead of `Link` for location/invoice references | `01-audit.md` §11 | convert to Link / Dynamic Link |
| L7 | Register choice lost on reload | `stores/auth.ts:34` | persist per device |
| L8 | Google Fonts loaded from a third party | `index.html:12-16` | self-host |
| L9 | Duplicated helpers (`money()` ×6, receipt builders ×2) | `01-audit.md` §22 | shared modules |
| L10 | Live backend = symlinked working tree with uncommitted changes | CLAUDE.md; `git status` | release from tagged commits (see `05` Phase 0) |

## Things that are already sound (keep)

- Server-side pricing, tax, rounding and change (`pos_core.py:791-863`) — the client cannot set a price unless the
  register allows it.
- Single posting path for retail and F&B (`post_invoice`), transactional (one request = one DB transaction).
- KOT idempotency via `kot_qty` and order row locks (`pos_fnb.py:47-49,289-299,497-527`).
- Capability checks on every method (`require_cap`) and location scoping on most.
- Keyed PIN hash and PIN-collision prevention (`pos.py:28-36,211-217`).
- Tender ledger per currency, change only from cash (`pos_core.py:848-893`).
- Forwarding of the real client IP from nginx only (`route.ts:28-34`).
