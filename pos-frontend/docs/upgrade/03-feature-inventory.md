# 03 — Feature inventory against the owner's brief

Status: **Exists** = implemented end-to-end (server + UI); **Partial** = some of it, or server-only, or with a
material limitation; **Missing** = not implemented. Evidence is file:line on `feature/pos-app` @ `543c34a`
(`pos_core` = `custom_erp_app/custom_erp/api/pos_core.py`, `pos_fnb` = `.../pos_fnb.py`, `pos` = `.../pos.py`,
views/components under `pos-frontend/src/`).

## Landing / auth

| Requirement | Status | Evidence / note |
|---|---|---|
| Public landing page with login on the right | Missing | `/login` is a centred two-step card (`views/LoginView.vue`) |
| Organization code step | Exists | `stores/auth.ts:53-63` → `signup.tenant_lookup` (`signup.py:234-265`); also returns admin email to guests |
| Staff PIN login | Exists | `pos.py:123-172`; 6–8 digits, HMAC-SHA256 keyed with site key (`pos.py:28-36`) |
| Optional management login (password) | Missing in POS | Admins use a PIN; password login only in ERP app |
| MFA for management | Missing | PIN path bypasses Frappe 2FA (`pos.py:155-159`, `frappe/auth.py:144-149`) |
| Rate limiting | Partial | 8 failures/15 min per IP in redis (`pos.py:95-120`); no nginx limit; no per-user/per-device limit |
| Lockout | Partial | per IP only; message mentions admin unlock but no unlock function exists |
| Secure hashing | Partial | keyed HMAC (fast hash, required for user-less lookup); no per-user salt; key = site encryption key |
| Session management / expiry | Partial | Frappe `sid`; no idle lock; register selection not persisted (`stores/auth.ts:34`) |
| Session revocation | Partial | Frappe logout; PIN deactivation blocks POS methods (`pos_core.py:93-100`) but not REST role reads |
| Device management / registration | Missing | no device entity; any browser can log in |
| Login history | Partial | Frappe Activity Log for successes (on_login feed); failed PIN attempts not logged |

## App shell

| Requirement | Status | Evidence |
|---|---|---|
| Branch/location shown | Partial | location derived per register (`pos.py:297-299`); shown on register picker |
| Register | Exists | `RegisterSelectView.vue`; restriction honoured (`:17-21`) |
| Shift status | Exists | `SessionMenu.vue:34` |
| User / role | Exists | `get_pos_settings.role/level/caps` (`pos_core.py:161-164`), SessionMenu |
| Online status | Missing | `@capacitor/network` installed (`package.json:20`) but unused |
| Printer status | Partial | Terminal printer settings; no global indicator |
| Sync status | Missing | no offline queue to sync |

## F&B

| Requirement | Status | Evidence |
|---|---|---|
| Order types: dine-in, takeaway | Exists | `pos_fnb.py:362-378` |
| Delivery, pickup, drive-through, room service, online | Missing | only `Dine In`/`Take Away` allowed (`pos_fnb.py:362`) |
| Floor plan with statuses | Exists | `pos_fnb.py:115-195`, `FloorPlan.vue`; statuses Available/Reserved/Occupied/Disabled (no "bill printed", "needs cleaning") |
| Merge tables / bills | Exists | `pos_fnb.py:622-717` |
| Split bill by item/qty | Exists | `pos_fnb.py:720-771` |
| Split equally | Missing | — |
| Transfer table | Exists | `pos_fnb.py:595-619` |
| Transfer items between bills | Missing | only split to a new bill |
| Modifiers (with min/max), combos | Missing | free-text notes only (`pos_fnb.py:456`, `pos_core.py:1239-1374`) |
| Reservations | Exists | `pos_fnb.py:933-1091` (extra to brief) |

## Kitchen

| Requirement | Status | Evidence |
|---|---|---|
| KDS screen | Exists | `KitchenView.vue`, `pos_fnb.list_kots` (`:558-574`) |
| Kitchen stations / routing | Missing | one kitchen per location (`pos_fnb.py:570-572`) |
| KOT statuses | Exists | New/Preparing/Ready/Served/Cancelled (`pos_fnb.py:28-33`) |
| Item-level status | Missing | status per ticket only |
| Course firing / hold-fire | Missing | — |
| Idempotent KOT | Exists | delta via `kot_qty` under order lock (`pos_fnb.py:497-527`) |
| KOT printing | Partial | device-side, memory dedupe (`KitchenView.vue:49-57`); no reprint, no printed flag, no station printers |

## Bill operations

| Requirement | Status | Evidence |
|---|---|---|
| Hold / resume | Partial | F&B orders stay open by nature; retail has no park/resume |
| Split by item / qty | Exists | `split_order` |
| Split equal | Missing | — |
| Discounts (line / bill) | Missing | no discount field anywhere; only rate override if `allow_rate_change` (`pos_core.py:1210`, `pos_fnb.py:455`) with no approval or audit |
| Service charge | Missing | only if configured as a tax row in the POS Profile tax template |
| Void (item) | Missing | sent quantities cannot be reduced (`pos_fnb.py:473-475`) |
| Void (order) | Partial | `cancel_order` (supervisor when KOT sent, `pos_fnb.py:783-784`); no reason/approver recorded |
| Comp | Missing | — |
| Reopen with authorization | Partial | closed check re-open by own waiter or supervisor (`pos_fnb.py:835-851`); no reopen of a billed/paid invoice; no approval record |
| Reprint | Partial | retail "Print again" for last sale (`TerminalView.vue:371`); none in F&B; no invoice lookup |
| Digital receipt | Missing | — |
| Pro-forma / pre-bill | Partial | `close_bill` returns totals shown on screen (`OrderView.vue:210-217`); nothing printable |

## Retail

| Requirement | Status | Evidence |
|---|---|---|
| Dedicated retail POS | Partial | `/terminal` (`TerminalView.vue`) — basic grid + cart |
| Barcode / SKU search | Partial | client-side text match on code/name over first 200 items (`TerminalView.vue:98-105,143-149`); no barcode field or scanner handling |
| Variants | Missing | — |
| UOM | Missing | stock UOM only |
| Serial / batch / expiry | Missing | — |
| Price lists | Partial | register's selling price list (`pos_core.py:219-231`) |
| Promotions / pricing rules | Missing | explicitly not applied (`pos_core.py:220-222`) |
| Coupons | Missing | — |
| Customer pricing | Missing | customer prices excluded (`pos_core.py:226`) |
| Loyalty | Missing | — |
| Gift cards | Missing | — |
| Store credit | Missing | — |
| Salesperson | Missing | — |
| Park / resume | Missing | cart in component memory (`TerminalView.vue:48`) |

## Returns

| Requirement | Status | Evidence |
|---|---|---|
| Returns / exchanges | Missing | EOD reads `is_return` (`pos_core.py:1517,1524`) but nothing creates one |
| Eligible-quantity checks | Missing | — |
| Return approvals | Missing | — |

## Payments

| Requirement | Status | Evidence |
|---|---|---|
| Cash | Exists | `pos_core.py:822-863` |
| Card (manual, standalone machine) | Partial | recorded as a Mode of Payment; no last-4 / approval-reference capture. Owner decision 2026-10-19: no terminal/provider integration in this upgrade |
| Split payment | Exists | multiple legs (`PayDialog.vue`, `_build_legs`) |
| Multi-currency cash | Exists | `pos_core.py:451-493,837-841` (extra to brief) |
| Wallet / transfer | Partial | any configured Mode of Payment, no reference/verification |
| Credit (on account) | Partial | partial payment leaves a Partly Paid Sales Invoice in draft mode (`pos_core.py:1079-1110`) |
| Gift card | Missing | — |
| BHD 3-decimal correctness | Partial | ERPNext computes totals; float arithmetic + 0.0005 tolerance + hard-coded `toFixed(3)` (see `01-audit.md` §15) |
| Payment idempotency | Missing | retail checkout and settlement have no idempotency key (`pos_core.py:1123-1151,1223-1236`) |
| Pending / failed / uncertain states | Missing | every leg is final at submit |
| No card data stored | Exists (by absence) | no card fields anywhere |

## Shift / register / cash

| Requirement | Status | Evidence |
|---|---|---|
| Opening float (per currency) | Exists | `pos_core.py:565-605` |
| Cash in / out, petty cash, safe drop | Missing | CLAUDE.md "Not built" |
| Denomination count | Missing | single amount per currency (`ShiftView.vue:85`) |
| Blind close | Missing | expected amount shown before count (`ShiftView.vue:119,168`; `pos_core.py:647`) |
| Variance | Exists | `pos_core.py:694-697` |
| Variance approval | Missing | — |
| X report | Partial | `shift_report` live totals (`pos_core.py:633-663`) |
| Z report | Partial | closed shift payload; no numbered, immutable Z |
| Business-day close | Partial | business date + EOD report (`pos_core.py:137-142,1491-1610`); no day-close action/lock |
| ERPNext POS Opening/Closing Entries | Missing | none created → POS Invoices never consolidated (see 04 C1) |

## Inventory

| Requirement | Status | Evidence |
|---|---|---|
| Stock deduction | Partial | Draft Invoice mode posts stock if POS Profile `update_stock` (`pos_core.py:993`); POS Invoice mode never posts (unconsolidated) |
| Recipes / ingredients | Missing | — (ERPNext BOM unused) |
| Food cost | Missing | — |
| Wastage | Missing | — |

## Customers & loyalty

| Requirement | Status | Evidence |
|---|---|---|
| Customer selection at POS | Missing in UI | server accepts `customer` (`pos_core.py:1224`, `pos_fnb.py:353`); terminal shows profile default (`TerminalView.vue:340`) |
| Customer create | Missing | — |
| Loyalty | Missing | — |
| Privacy controls | Missing | all POS roles can read every Customer via REST (`pos.py:321`); guest name/phone stored in clear on orders/reservations |

## RBAC

| Requirement | Status | Evidence |
|---|---|---|
| Backend-enforced roles | Exists | `pos_core.require_cap` on every method (`pos_core.py:85-90`) |
| ~15 roles | Partial | 5 levels: kitchen, waiter, cashier, supervisor, admin (`pos_core.py:48-58`) |
| Granular permissions | Partial | 12 coarse caps; one POS role per person (`pos.py:338-346`) |
| Location scoping | Partial | most methods; gaps on `get_order`, `bill_totals`, `set_kot_status`, `list_open_balances` |

## Approvals

| Requirement | Status | Evidence |
|---|---|---|
| Configurable manager approval (PIN or login) | Missing | actions require the logged-in user to hold the cap; no "manager override" flow |
| Before/after recording | Missing | — |

## Audit

| Requirement | Status | Evidence |
|---|---|---|
| Central append-only audit log | Missing | none; doctypes not tracked, all editable by System Manager |
| Viewer | Missing | — |
| Audited exports | Missing | — |

## Reports

| Requirement | Status | Evidence |
|---|---|---|
| End of day | Exists | `pos_core.py:1491-1610` |
| Shift | Exists | `pos_core.py:633-663` |
| Executive / F&B / retail / finance dashboards | Partial | EOD covers parts; ERP has standard ERPNext reports (`erp-frontend/src/app/(erp)/reports`) |
| Filters | Partial | date + location only |
| Drill-down | Missing in POS | exists in ERP report runner |
| Exports CSV/Excel/PDF | Missing in POS | — |
| Reconciliation with transactions | Partial | EOD uses `BILLED` and the tender ledger; no automated tender-vs-invoice check |
| Decimal-safe math | Partial | float sums (`pos_core.py:1536-1605`) |

## Multi-tenant

| Requirement | Status | Evidence |
|---|---|---|
| Isolation | Exists (structural) | site/DB per tenant; per-site sessions |
| Tenant resolution validation | Missing | unvalidated cookie/header → Host (`erp-frontend/src/lib/tenancy/registry.ts:35-44`) |
| Module entitlement | Partial | checked at PIN login only, fails open (`pos.py:44-92,126-127`) |
| Automated cross-tenant tests | Missing | — |

## Security baseline

| Requirement | Status | Evidence |
|---|---|---|
| HSTS / CSP / X-Frame-Options / Referrer-Policy | Missing | `scripts/nginx-pos.xentraerp.net.conf` |
| CORS | Exists (same-origin) | no CORS headers; API is same-origin |
| CSRF | Partial | not enforced by Frappe for API sessions (`frappe/auth.py:72-82`); relies on SameSite=Lax |
| XSS | Partial | Vue templating escapes; print HTML escapes (`receipt.ts:110-112`, `kot.ts`) |
| Rate limits | Partial | PIN only |
| Secrets | Partial | Anthropic key optional in site config (`pos_core.py:1284-1287`) |
| Idempotency | Partial | KOT yes; payments no |

## Offline

| Requirement | Status | Evidence |
|---|---|---|
| Offline queue | Missing | no service worker; Capacitor shell loads remote URL (`capacitor.config.ts:13-21`). Owner decision 2026-10-19: offline selling is out of scope for this upgrade (deferred phase) |
| Online/offline indicator and blocking sales while offline | Missing | no network status anywhere; a sale attempted offline fails with a raw fetch error |

## Performance

| Requirement | Status | Evidence |
|---|---|---|
| Busy-counter performance | Partial | polling 6–8 s, N+1 KOT load, missing indexes (`01-audit.md` §19) |

## Responsive

| Requirement | Status | Evidence |
|---|---|---|
| Terminals / tablets / desktop | Partial | 900/960 px breakpoints, coarse-pointer sizing (`assets/pos.css:896-1105`); never browser-tested |

## Accessibility / i18n

| Requirement | Status | Evidence |
|---|---|---|
| Accessibility | Partial | few ARIA attributes; zoom disabled (`index.html:6-9`) |
| English | Exists | hard-coded |
| Arabic / RTL | Missing | no i18n layer, no `dir` |

## Error / system states

| Requirement | Status | Evidence |
|---|---|---|
| Error messages | Partial | server messages surfaced raw (`lib/api.ts:15-22`) |
| Connection lost / backend down | Partial | `index.html` 10 s fallback; Next returns 502 JSON; no in-app banner |
| Session expired | Partial | next navigation → login; mid-action calls fail with raw error |
| Empty / loading states | Partial | per view (e.g. `TerminalView.vue:43,120-124`) |
| Maintenance / subscription expired | Partial | PIN login error text only |

## Tests

| Requirement | Status | Evidence |
|---|---|---|
| Backend integration | Exists | `scripts/pos-checks/*_suite.py` (rolled back on live tenant) |
| HTTP e2e | Exists | `scripts/pos-checks/e2e_http.py` |
| Frontend unit / component | Missing | no runner in `package.json` |
| Browser e2e | Missing | — |
| Security / cross-tenant | Missing | — |
| Accessibility | Missing | — |
| Concurrency / duplicate submission | Missing | — |

## Deployment

| Requirement | Status | Evidence |
|---|---|---|
| Deployment docs | Partial | `CLAUDE.md` POS section; `pos-frontend/MOBILE_DEPLOYMENT.md`; build-and-swap procedure |
| Rollback plan | Partial | old `dist` kept by hand (`dist-old/`, `pos-frontend-dist.bak-20261007/`); backend is a live symlink to the working tree |
