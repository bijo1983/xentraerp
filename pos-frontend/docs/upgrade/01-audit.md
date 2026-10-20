# 01 — POS repository and architecture audit

Audit date: 2026-10-19. Scope: the XentraERP POS (`https://pos.xentraerp.net`) — the Vue app in `pos-frontend/`
and its backend in the Frappe app `custom_erp` (`custom_erp_app/custom_erp/`), plus the parts of `erp-frontend/`
(Next.js) it depends on.

Sources:

- GitHub `bijo1983/xentraerp`, branch `feature/pos-app` at `543c34a` ("Reports: offer Regional reports under
  Accounting and a Website section"). All file:line references in this document are to that commit unless marked
  **[live]**.
- Production checkout `/home/xentraerp` (also on `feature/pos-app` @ `543c34a`, plus uncommitted changes; see §22).
- Read-only `information_schema` / `COUNT(*)` queries on the tenant database of site `197349.xentraerp.local`
  (no personal data, PIN hashes or business values were selected).
- ERPNext 14.16.1 / Frappe 14.25.4 source on the bench (`/home/frappe/innovegic-bench/apps`).

Nothing was built, run, migrated or restarted. No tests were executed.

---

## 1. Summary

The POS is a working, server-authoritative F&B + counter-sale system for a single live tenant. Prices, taxes,
rounding, payment validation, change, shift cash-up and role checks are all computed server-side, and the F&B
order/KOT model is reasonably careful (row locks, KOT quantities tracked per line). The main problems are:

1. **POS Invoices never reach the general ledger or stock ledger.** The default checkout document is ERPNext's
   `POS Invoice`, whose `on_submit` makes no GL/stock entries; ERPNext only posts them when a `POS Closing Entry`
   consolidates them into a Sales Invoice. The POS never creates POS Opening/Closing Entries (no reference anywhere
   in `custom_erp_app` or `pos-frontend`). On the live tenant: 1 submitted POS Invoice, 0 consolidated, 0 POS
   Closing Entries. See §15.
2. **No idempotency on retail checkout or part-payment settlement** — a retried request posts a second invoice /
   receipt. F&B billing is protected by an order row lock and status check. See §16.
3. **Authentication is PIN-only, user-less, per-IP throttled**, valid for System Manager accounts (bypassing
   Frappe 2FA), with no idle lock, no device binding and no failed-attempt log. See §5 and `04-gap-assessment.md`.
4. **No discounts, service charge, item void, comp, returns, refunds, cash in/out, barcode scanning, customer
   selection, loyalty, gift cards, offline mode, i18n/RTL, audit log, or frontend tests.**
5. **Tenant resolution trusts a client cookie/header** and maps it to a Frappe site name without an allow-list; the
   isolation that actually holds is Frappe's per-site database and per-site session store. See §20.

---

## 2. Frontend: framework, build, packaging

| Aspect | Finding | Evidence |
|---|---|---|
| Framework | Vue 3.5 (Composition API, `<script setup>`), Pinia 4, vue-router 5 | `pos-frontend/package.json:15-27` |
| Language/build | TypeScript ~6.0, Vite 8, `vue-tsc -b && vite build` | `package.json:8,28-39` |
| Entry | `main.ts` mounts App, Pinia, router; `bootstrapNativeShell` | `src/main.ts:1-13` |
| Dev proxy | `/api` → `VITE_API_PROXY_TARGET` or `http://127.0.0.1:8083` | `vite.config.ts:13-22` |
| Native shell | Capacitor 8 (Android/iOS), loads the **remote** site `https://pos.xentraerp.net` (no bundled copy) | `capacitor.config.ts:13,18-21` |
| Native plugins | bluetooth-le, app, keyboard, network, preferences, splash-screen, status-bar | `package.json:16-23` |
| CI | `.github/workflows/android-release.yml` (manual Android release build) | present on both branches |
| Fonts | Google Fonts loaded at runtime (Outfit, Space Grotesk, Inter) | `index.html:12-16` |
| Viewport | `maximum-scale=1.0, user-scalable=no` (blocks pinch-zoom) | `index.html:6-9` |
| Deploy | Static `dist/` served by nginx; `/api/*` proxied to Next.js `:8083` | `scripts/nginx-pos.xentraerp.net.conf:19-36` |

Size: 8 views (2,163 lines), 7 components (590 lines), 3 stores (383 lines), 6 lib files (563 lines), one global
stylesheet `src/assets/pos.css` (1,113 lines). No component library; no UI test tooling.

The live `dist/` was built 2026-10-08 04:05 UTC; the live `pos-frontend/src` is byte-identical to the GitHub
branch (`diff -rq` clean).

## 3. Backend/API dependencies

The POS has no backend of its own. Every call goes `browser → nginx (pos.xentraerp.net) → Next.js erp-frontend
proxy (:8083) → gunicorn (:8001, Host header = tenant site)`.

- Proxy: `erp-frontend/src/app/api/method/[...path]/route.ts:6-65` (methods), `.../api/resource/[...path]` (REST).
- Tenant → site: `erp-frontend/src/lib/tenancy/registry.ts:35-44`.
- Backend modules: `custom_erp/api/pos.py` (526 lines), `pos_core.py` (1,610), `pos_fnb.py` (1,091),
  `rounding.py` (95); `signup.tenant_lookup` (control plane); Frappe built-ins `get_logged_user`, `logout`, REST.
- ERPNext doctypes used directly: POS Profile, POS Invoice, Sales Invoice, Payment Entry, Item, Item Price, Item
  Group, Mode of Payment, Currency Exchange, Customer, Cost Center, Warehouse, Global Defaults, Currency.
- Hooks: `hooks.py:27-35` — POS Invoice `validate` → `pos.validate_pos_invoice_profile`; POS Profile
  `before_insert` → `rounding.profile_follows_tenant`.

### 3.1 Every whitelisted method the POS calls

| Method | Backend def | Server guard | Called from |
|---|---|---|---|
| `custom_erp.api.signup.tenant_lookup` | `signup.py:234` (guest) | none (guest) | `stores/auth.ts:56` |
| `custom_erp.api.pos.pin_login` | `pos.py:123-172` (guest) | module gate + IP throttle | `stores/auth.ts:70` |
| `xentraerp.auth.get_logged_user` (= `frappe.auth.get_logged_user`) | Frappe | session | `lib/api.ts:53` |
| `logout` | Frappe | session | `lib/api.ts:97` |
| `custom_erp.api.pos.list_pos_profiles` | `pos.py:282-309` | logged-in only (no POS check) | `RegisterSelectView.vue:16`, `AdminView.vue:214` |
| `pos_core.get_pos_settings` | `pos_core.py:145-167` | `require_pos_user` | `stores/pos.ts:88` |
| `pos_core.set_pos_mode` | `pos_core.py:170-190` | System Manager | `stores/pos.ts:100` |
| `pos_core.save_pos_settings` | `pos_core.py:193-213` | System Manager | `stores/pos.ts:104` |
| `pos_core.open_shift` | `pos_core.py:565-605` | cap `shift` | `stores/pos.ts:108` |
| `pos_core.close_shift` | `pos_core.py:666-705` | cap `shift` (+`supervise` for others') | `stores/pos.ts:113` |
| `pos_core.shift_report` | `pos_core.py:633-663` | cap `shift` | `ShiftView.vue:46` |
| `pos_core.list_checkout_currencies` | `pos_core.py:474-493` | `require_pos_user` | `PayDialog.vue:44`, `ShiftView.vue:32` |
| `pos_core.set_exchange_rate` | `pos_core.py:496-518` | System Manager | `AdminView.vue:92` |
| `pos_core.retail_estimate` | `pos_core.py:1215-1220` | cap `bill` | `TerminalView.vue:197` |
| `pos_core.retail_checkout` | `pos_core.py:1223-1236` | cap `bill` + Retail mode | `TerminalView.vue:218` |
| `pos_core.list_open_balances` | `pos_core.py:1154-1190` | cap `bill` | `TerminalView.vue:63` |
| `pos_core.settle_invoice` | `pos_core.py:1123-1151` | cap `bill` | `TerminalView.vue:73` |
| `pos_core.get_item_notes` | `pos_core.py:1324-1354` | cap `view` | `ItemNoteDialog.vue:22`, `AdminView.vue:198` |
| `pos_core.set_item_notes` | `pos_core.py:1357-1374` | cap `menu` | `AdminView.vue:203` |
| `pos_core.list_menu` | `pos_core.py:1394-1421` | cap `view` | `OrderView.vue:89`, `AdminView.vue:174` |
| `pos_core.list_item_groups` | `pos_core.py:1424-1427` | cap `view` | `AdminView.vue:175` |
| `pos_core.set_item_hidden` | `pos_core.py:1430-1446` | cap `menu` | `AdminView.vue:182` |
| `pos_core.save_menu_item` | `pos_core.py:1449-1485` | cap `menu` | `AdminView.vue:185,191` |
| `pos_core.list_locations` | `pos_core.py:368-379` | `require_pos_user` | `AdminView.vue:214` |
| `pos_core.save_location` | `pos_core.py:382-435` | System Manager | `AdminView.vue:223` |
| `pos_core.delete_location` | `pos_core.py:438-445` | System Manager | `AdminView.vue:230` |
| `pos_core.end_of_day_report` | `pos_core.py:1491-1610` | cap `reports` | `AdminView.vue:237` |
| `rounding.get_rounding` | `rounding.py:53-63` | any logged-in user | `AdminView.vue:130` |
| `rounding.set_rounding` | `rounding.py:66-95` | System Manager | `AdminView.vue:137` |
| `pos_fnb.list_tables` | `pos_fnb.py:125-195` | F&B + `view` | `FloorView.vue:52`, `OrderView.vue:82`, `AdminView.vue:100` |
| `pos_fnb.save_table` / `delete_table` | `pos_fnb.py:198-234` | cap `tables` | `AdminView.vue:107,113,119` |
| `pos_fnb.open_order` | `pos_fnb.py:351-399` | F&B + `order` | `FloorView.vue:146,153`, `OrderView.vue:313` |
| `pos_fnb.list_open_orders` | `pos_fnb.py:402-412` | F&B + `view` | `FloorView.vue:54` |
| `pos_fnb.get_order` | `pos_fnb.py:415-420` | F&B + `view` (no location check) | `OrderView.vue:77` |
| `pos_fnb.set_order_items` | `pos_fnb.py:434-491` | F&B + `order` | `OrderView.vue:188` |
| `pos_fnb.send_kot` | `pos_fnb.py:530-542` | F&B + `order` | `OrderView.vue:204` |
| `pos_fnb.list_kots` | `pos_fnb.py:558-574` | F&B + `kot` | `KitchenView.vue:47` |
| `pos_fnb.set_kot_status` | `pos_fnb.py:577-589` | F&B + `kot` (no location check) | `KitchenView.vue:73` |
| `pos_fnb.transfer_table` | `pos_fnb.py:595-619` | F&B + `modify` | `OrderView.vue:304` |
| `pos_fnb.merge_tables` / `unmerge_table` | `pos_fnb.py:622-671` | F&B + `modify` | `OrderView.vue:294,300` |
| `pos_fnb.merge_orders` | `pos_fnb.py:674-717` | F&B + `modify` | `OrderView.vue:284` |
| `pos_fnb.split_order` | `pos_fnb.py:720-771` | F&B + `modify` | `OrderView.vue:274` |
| `pos_fnb.cancel_order` | `pos_fnb.py:774-795` | `order`; `modify` if items; `supervise` if KOT sent | `OrderView.vue:329` |
| `pos_fnb.close_bill` | `pos_fnb.py:805-832` | F&B + `bill` | `OrderView.vue:212` |
| `pos_fnb.reopen_bill` | `pos_fnb.py:835-851` | `bill`; own bill or `supervise` | `OrderView.vue:221` |
| `pos_fnb.bill_totals` | `pos_fnb.py:854-867` | F&B + `order` (no location check) | `OrderView.vue:228` |
| `pos_fnb.bill_order` | `pos_fnb.py:870-930` | F&B + `bill` | `OrderView.vue:244` |
| `pos_fnb.list_reservations` | `pos_fnb.py:956-966` | F&B + `reserve` | `FloorView.vue:53` |
| `pos_fnb.save_reservation` | `pos_fnb.py:999-1039` | F&B + `reserve` | `FloorView.vue:167` |
| `pos_fnb.cancel_reservation` / `mark_no_show` | `pos_fnb.py:1051-1068` | F&B + `reserve` | `FloorView.vue:183,184` |
| `pos_fnb.seat_reservation` | `pos_fnb.py:1071-1091` | F&B + `reserve` | `FloorView.vue:178` |

Direct REST reads (`/api/resource`) from the POS: `User/<self>` (`stores/auth.ts:91`), `Item` (limit 200,
`TerminalView.vue:98`), `Item Price` (limit 500, `TerminalView.vue:108`), `Cost Center`, `Warehouse`
(`AdminView.vue:215-216`). `api.createDoc` / `api.updateDoc` exist in `lib/api.ts:65-94` but are unused.

Whitelisted but not called by the POS UI (used by the ERP User form `erp-frontend/src/components/dynamic/
pos-access-panel.tsx` or tests): `pos.set_pin`, `create_pos_user`, `set_pin_active`, `set_pos_role`,
`list_pos_users`, `get_pos_access`, `save_pos_access`, `reset_pin` (`pos.py:191-526`); `pos_core.current_shift`
(`:558`); `pos_fnb.set_table_reserved` (`:237`).

## 4. Routes and views

Router: `src/router/index.ts:5-19` (history mode, all views lazy-loaded). Guard `index.ts:27-71`:

1. First navigation calls `auth.checkSession()` once (`:31-34`).
2. Not logged in → `/login`; logged in but `pos.load()` fails → logged out to `/login` (`:36-47`).
3. Kitchen level is confined to `/kitchen` (`:52-54`).
4. `/terminal` needs cap `bill` and Retail enabled; `/shift` needs cap `shift` (`:56-57`).
5. Selling screens need a selected register; and an open shift when `require_shift` (`:58-63`).
6. F&B screens need F&B mode (`:64-66`); `/admin` needs any of tables/menu/reports/settings (`:67-69`).

These are UX guards only; every action is re-checked server-side (§12). Full map in `02-route-component-map.md`.

## 5. Authentication flow

Two steps, both in `LoginView.vue`:

1. **Organization code** → `signup.tenant_lookup` on the control-plane site (no tenant cookie yet).
   Returns `organization_name` **and `admin_email`** (`signup.py:262-265`) to an unauthenticated caller. On success
   the browser sets `xentra_tenant=<code>` (non-HttpOnly, `SameSite=Lax`, set by JS, `lib/api.ts:7-13`).
2. **PIN** (6–8 digits, pad caps at 8, `LoginView.vue:33-37`) → `pos.pin_login` on the tenant site
   (`pos.py:123-172`):
   - module gate `_tenant_has_module("pos")` via HTTP to the control plane, cached 60 s, **fails open** when
     unknown (`pos.py:44-92`);
   - throttle: 8 failures per client IP per 15 min, stored in the site's redis cache (`pos.py:21-24,95-120`). Key is
     `frappe.local.request_ip`, which comes from the first `X-Forwarded-For` value; the Next proxy sets it from
     nginx's `X-Real-IP` (`route.ts:28-34`, `nginx-pos...conf:27`);
   - lookup by `HMAC-SHA256(site encryption key, pin)` across **all** active PINs — no user identifier is entered
     (`pos.py:28-36,134-140`); PIN uniqueness is enforced at set time (`pos.py:211-217`);
   - session created with `LoginManager.post_login()` (`pos.py:155-160`). This path skips Frappe's
     `authenticate()` and `should_run_2fa` (`frappe/auth.py:128-149`), so **2FA is never applied to PIN logins**.
     A successful login is written to Activity Log by Frappe's `on_login` feed; **failed PIN attempts are not
     logged** anywhere (only the redis counter).
   - Returned to the browser: user name, email, full name, image, **all roles**, register restriction.

Management/password login: **none in the POS app.** Administrators use the same PIN pad (a System Manager can
hold a PIN; `set_pin` has no guard against it, `pos.py:243` only skips role assignment). Staff/PIN management
happens in the ERP app (`erp-frontend`, password login on `xentraerp.net`) via `pos-access-panel.tsx`.

Lockout response: "Too many incorrect PIN attempts…" (`pos.py:104-110`) — the lockout is per IP, so a shared
shop NAT is locked out as a whole while a distributed guesser is not.

## 6. Session handling

- Session = standard Frappe `sid` cookie. The proxy strips `Domain` and rewrites `SameSite=Strict` → `Lax`
  (`route.ts:50-56`). Cookies are therefore host-only on `pos.xentraerp.net`.
- Expiry = Frappe's System Settings `session_expiry` (not changed by this app). No idle timeout or screen lock in
  the POS; no "lock till" action. "Switch user" calls `logout` but keeps the org code (`stores/auth.ts:114-120`).
- The selected register (`auth.posProfile`) lives only in Pinia memory (`stores/auth.ts:34`); a reload returns to
  register selection.
- CSRF: the POS sends no `X-Frappe-CSRF-Token`. Frappe only enforces CSRF when the session has a `csrf_token`,
  which is created by the Desk boot, not by API/PIN logins (`frappe/auth.py:72-91`). Protection therefore rests on
  `SameSite=Lax` and the JSON content type.
- Session revocation: only Frappe's own (logout, disabling the user). `set_pin_active(0)` blocks new PIN logins
  but **does not end existing sessions** (`pos.py:403-411`); `require_pos_user` does re-check the active PIN on
  every POS call (`pos_core.py:93-100`), so POS methods stop, but REST reads granted by the role continue.
- A PIN session carries the user's full role set across the whole Frappe REST API, not only POS methods. The POS
  roles have READ on Item, Item Price, Item Group, POS Profile, Mode of Payment, **Customer**, Price List, Currency
  (`pos.py:321`) — every POS user can list all customers through `/api/resource/Customer`.

## 7. State management (Pinia)

| Store | State | Notes |
|---|---|---|
| `auth` (`stores/auth.ts`) | `orgName`, `user`, `restrictedProfile`, `posProfile`, `loading`, `error` | not persisted |
| `pos` (`stores/pos.ts`) | `settings` (`get_pos_settings`), `shift`, `profile`, `loaded`; getters `isFnb`, `hasRetail`, `can(cap)`, `needsShift`, `draftMode`, `canManage` | `can()` mirrors server caps (`:75`) |
| `printer` (`stores/printer.ts`) | method (bluetooth/browser), connected device, auto-KOT switches | persisted in `localStorage` (`:19-39,74`) |

Views hold their own cart/order state in component refs (e.g. `TerminalView.vue:48`, `OrderView.vue:36-57`).
There is no shared cart store, no persistence of an in-progress cart, and no request queue.

## 8. Existing F&B features

| Feature | Evidence |
|---|---|
| Tables with zone, seats, location, disabled; status derived from open orders (Available/Reserved/Occupied/Disabled) | `pos_fnb.py:115-195` |
| Visual floor plan (reference design) | `components/FloorPlan.vue`, `design-references/manage-tables-reference.png` |
| Order types Dine In / Take Away only; take-away token per business day + location | `pos_fnb.py:346-378` |
| Several bills per table (`new_bill`) | `pos_fnb.py:388-399` |
| Local cart, explicit Save; Save auto-creates KOT for unsent quantities (`auto_kot`) | `pos_fnb.py:434-491`, `OrderView.vue:184-200` |
| KOT: one doc per send, items = delta since last KOT; statuses New→Preparing→Ready→Served / Cancelled | `pos_fnb.py:28-33,497-589` |
| Kitchen screen per location, 6 s polling, optional auto-print | `KitchenView.vue:42-67` |
| Item notes with suggestion chips (rule list, or Claude Haiku if API key set) | `pos_core.py:1239-1374` |
| Waiter can add but not reduce; nobody can reduce quantities already sent to the kitchen | `pos_fnb.py:466-475` |
| Transfer, merge tables, unmerge, merge bills, split by item quantity | `pos_fnb.py:595-771` |
| Close check (locks items; draft invoice in draft mode), re-open (own bill or supervisor) | `pos_fnb.py:805-851` |
| Cancel/void whole order (supervisor if KOT sent) | `pos_fnb.py:774-795` |
| Bill with split tender, multi-currency cash, partial payment (draft mode) | `pos_fnb.py:870-930` |
| Reservations: book, edit, cancel, no-show, seat (merges tables), ±90 min clash, hold window | `pos_fnb.py:933-1091` |
| Menu management: add dish, rename, price, hide per location | `pos_core.py:1377-1485` |

Not present: delivery/pickup/drive-through/room service/online order types, modifiers/combos, courses/firing,
kitchen stations, item-level void/comp, discounts, service charge, split equally, pro-forma/pre-bill print, KOT
reprint, guest/customer selection in UI (only `customer` param server-side).

## 9. Existing retail features

| Feature | Evidence |
|---|---|
| Item grid (first 200 sellable items via REST), group filter, name/code text search | `TerminalView.vue:95-149` |
| Price from register price list (server re-prices; client rate only if `allow_rate_change`) | `pos_core.py:219-231,1193-1212` |
| Server estimate (tax + rounding) before payment | `pos_core.py:1215-1220`, `TerminalView.vue:192-205` |
| Checkout → POS Invoice or Draft Sales Invoice + Payment Entries | `pos_core.py:896-1110,1223-1236` |
| Part payments and open balances list/settlement (draft mode) | `pos_core.py:1123-1190`, `TerminalView.vue:60-86` |
| Receipt print / "Print again" (last sale only, from client data) | `TerminalView.vue:242-249,371` |

Not present: barcode/scale input, variants, UOM choice, serial/batch/expiry, customer selection, customer
pricing, promotions/pricing rules, coupons, loyalty, gift cards, store credit, salesperson, park/resume,
returns/exchanges, refunds. The terminal ignores `XentraERP POS Hidden Item` (it reads Item over REST, not
`list_menu`) and its displayed price list includes customer-specific Item Prices that the server excludes
(`TerminalView.vue:108-118` vs `pos_core.py:226`).

## 10. Printer integration

- Bluetooth ESC/POS via `@capacitor-community/bluetooth-le` (`BleClient`, falls back to Web Bluetooth in a
  browser) — `lib/bluetooth-printer.ts:31-155`; byte builder `lib/escpos.ts`; 32-column layout
  (`lib/receipt.ts:34-56`, `lib/kot.ts:23`).
- Browser print: receipt via `window.open` popup (`receipt.ts:62-108`); KOT via hidden iframe
  (`kot.ts:64-82`); silent only with Chrome `--kiosk-printing`.
- Device preference and auto-print switches in `localStorage` (`stores/printer.ts`).
- Kitchen auto-print dedupes in memory (`KitchenView.vue:49-57`): tickets created while the kitchen screen was
  closed are never auto-printed; there is no server-side "printed" flag and no KOT reprint.
- Receipt content: org name, register, time, lines, total, payment text, invoice number. **No tax breakdown, no
  VAT registration number, no customer, no cashier name printed** (field exists but unused). Line amounts on the
  retail receipt are computed client-side (`TerminalView.vue:228`) while the total comes from the server.
- Receipt `money()` falls back to `toFixed(2)` if `Intl` rejects the currency (`receipt.ts:22-27`) — wrong for BHD.
- F&B receipt print errors are swallowed (`OrderView.vue:254`).

## 11. DocTypes / database entities

All in module `Xentraerp`, all permission rows = System Manager only, none submittable, none with
`track_changes`. Row counts are exact `COUNT(*)` on tenant `197349` (2026-10-19).

| DocType | Naming | Key fields | Rows |
|---|---|---|---|
| XentraERP POS Settings (Single) | — | pos_mode, require_shift, pos_247, previous_day_billing/until, checkout_document, auto_kot, item_notes_prompt | 8 singles values |
| XentraERP POS PIN | field:user | user (unique), pin_hash, active, pos_profile, location | 2 |
| XentraERP POS Location (+ Location Profile) | field:location_code | cost_center*, warehouse, enable_retail, enable_fnb, profiles | 2 (+2) |
| XentraERP POS Table | field:table_name | zone, seats, reserved, disabled, location (Data) | 3 |
| XentraERP POS Order (+ Order Item) | POSORD-.##### | status Open/Part Paid/Billed/Cancelled/Merged, order_type, token, total (Currency), items (qty Float, rate/amount Currency, note, kot_qty), invoice, draft_invoice (Data), business_date, guest_name/phone | 15 (+17) |
| XentraERP KOT (+ KOT Item) | KOT-.##### | pos_order*, status, items (qty Float, note), location | 12 (+16) |
| XentraERP POS Shift (+ Shift Cash) | SHIFT-.##### | cashier, pos_profile, status, business_date, opened/closed_at, totals; cash rows opening/expected/counted/variance (**Float**) | 6 (+6) |
| XentraERP POS Tender | hash | invoice (Data), invoice_doctype, receipt, shift, cashier, business_date, mode, currency, tendered (Float), exchange_rate (Float), amount (Currency) | 9 |
| XentraERP POS Reservation | RES-.##### | guest_name, phone, party_size, date/time, tables (CSV), status, pos_order | 2 |
| XentraERP POS Item Note | field:item_code | notes, source AI/Standard/Manual | 12 |
| XentraERP POS Hidden Item | hash | item_code, location | 0 |

ERPNext side on the same tenant: POS Invoice 1 (1 submitted & unconsolidated), POS Opening Entry 0, POS
Closing Entry 0, Sales Invoice 6, Payment Entry 7, Sessions 26, Activity Log 128, Version 54, Access Log 52.

Storage types: Frappe stores both Float and Currency as `decimal(21,9)` (verified for Tender and Shift Cash),
so the database itself is decimal; the imprecision is in Python/JS arithmetic (§15). Indexes: only `modified`
(and `user` on PIN) — no index on Tender.shift / business_date / invoice, Order.status, KOT.status, PIN.pin_hash.
Links stored as `Data` (no referential integrity): `location` on Table/Order/KOT/Tender/Shift/Hidden Item,
`invoice`/`draft_invoice`/`receipt`/`invoice_doctype`.

## 12. Roles, capabilities and security controls

- Levels: `pos_core.pos_level` (`:67-78`) → admin (System Manager) > supervisor > cashier > waiter > kitchen;
  an active PIN with no POS role is a waiter.
- Caps (`pos_core.py:48-58`): kitchen {view, kot}; waiter {view, kot, order, reserve}; cashier + {modify, bill,
  shift}; supervisor + {supervise, tables, menu, reports}; admin + {settings}.
- Enforcement: `require_cap` (`:85-90`) on each method (§3.1); `require_manager` (System Manager) for settings,
  locations, currencies, rounding, staff/PIN management.
- Location scoping: `user_location` / `enforce_user_location` / `require_user_location` (`pos_core.py:307-340`),
  applied to registers, shifts, orders (`_open_order`, `pos_fnb.py:297-298`). Not applied to `get_order`,
  `bill_totals`, `set_kot_status`, `list_open_balances`, `list_reservations` without a profile.
- Register lock: PIN `pos_profile` enforced in `enforce_register_restriction` (`pos_core.py:751-757`) and the
  POS Invoice validate hook (`pos.py:256-279`). The hook reads `frappe.session.user`, which is `Administrator`
  inside `_elevated()` (`pos_core.py:741-748`), so it is effectively a no-op for POS-created invoices (the check
  is done beforehand) and only constrains direct REST saves.
- Elevation: ERPNext logic runs as `Administrator` via `_elevated()`; ownership is rewritten afterwards with
  `frappe.db.set_value(..., "owner", cashier)` (`pos_core.py:943,1021,1072,1106`) — the Version trail shows
  Administrator.
- No HTTP security headers on the POS vhost (no HSTS, CSP, X-Frame-Options, Referrer-Policy) and no nginx rate
  limiting (`scripts/nginx-pos.xentraerp.net.conf`, identical to `/etc/nginx/sites-available/pos.xentraerp.net`).

## 13. Audit logging

There is no central audit log. What exists:

- Frappe Activity Log for successful logins/logouts (Frappe built-in).
- `User` comments "POS PIN set by …" / "POS access changed by …" (`pos.py:247,499`).
- `frappe.log_error` on entitlement and AI failures.
- Operational records that double as partial trail: KOT `created_by`, Order `waiter`, Tender `cashier`,
  Shift notes. None of these doctypes has `track_changes`; all are editable/deletable by System Manager through
  REST, so none is append-only. Voids, re-opens, cancellations, price edits, exchange-rate changes, rounding
  changes, mode switches and shift variances record no reason, approver or before/after values.

## 14. Reporting

- End of day (`pos_core.end_of_day_report`, `:1491-1610`): gross/net/tax/rounding, outstanding, returns (read
  only — the POS never creates returns), by payment & currency, by location, by cashier, top 10 items, shifts with
  variance, F&B covers, warnings. UI: `AdminView.vue` "End of day" tab; also in ERP at
  `erp-frontend/src/app/(erp)/reports/pos-end-of-day/page.tsx`.
- Shift report (`pos_core.py:633-663`).
- Sales are measured with `BILLED = if(base_rounded_total <> 0, base_rounded_total, base_grand_total)`
  (`:620`) — company-currency values, while tenders are in register currency.
- No exports from the POS (CSV/Excel/PDF), no date ranges, no drill-down, no reconciliation check between tender
  ledger and invoices.

## 15. Currency and decimal handling (BHD = 3 decimals)

Backend (`flt()` = Python float, rounded with Frappe's rounding to the stated precision):

| Path | Code | Note |
|---|---|---|
| Invoice totals, tax, rounding | ERPNext `calculate_taxes_and_totals` under `_elevated` (`pos_core.py:797-807,925-928`) | authoritative; precision from `inv.precision("grand_total")` |
| Bill rounding | `rounding.py:33-36,66-95`; ERPNext rounds to `Currency.smallest_currency_fraction_value` (0 = whole unit) | changing it edits the company Currency record globally (`:80`); `step not in STEPS` compares floats (`:75`) |
| Payment legs | `amount = flt(tendered * rate, prec)` (`pos_core.py:853`); `paid = flt(sum)`; tolerance `10**-prec/2` (`:855-861`) | accepts underpayment up to half a fils (0.0005) |
| Exchange rate | `Currency Exchange` lookup; inverse = `1.0 / rate` (`:451-471`) | float inverse; no rounding of rate |
| Change | `flt(max(0, paid-due), prec)`; change only from cash (`:859-862`) | change always in register currency |
| Order lines | `amount = flt(qty) * flt(rate)`; `total = sum(...)` unrounded (`pos_fnb.py:321-324,484`) | display only; invoice recomputed by ERPNext |
| Merge match | `flt(t.rate) == flt(r.rate)` (`pos_fnb.py:693`) | float equality |
| Split | `1e-9` epsilons (`pos_fnb.py:744-761`) | |
| Shift cash | `expected = opening + Σ cash tendered`; `variance = flt(counted-expected, 3)` (`pos_core.py:695-697`) | hard-coded 3 decimals regardless of currency |
| EOD | float sums; `average_bill = gross/len(sales)` unrounded (`:1573-1605`); `> 0.0005` threshold (`:1582`) | |
| Totals in shift/EOD | `BILLED` uses `base_*` (company currency); tender `amount` is register currency | mixes currencies if a register's currency ≠ company currency |

Frontend:

| Path | Code |
|---|---|
| Money display | `Intl.NumberFormat(undefined, {style:'currency', currency})` — BHD shows 3 decimals; locale from browser (`TerminalView.vue:155`, `OrderView.vue:59`, `PayDialog.vue:62`, `ShiftView.vue:54`, `receipt.ts:24`) |
| Fallback | `n.toFixed(2)` (`receipt.ts:26`) |
| Fixed 3 dp | `.toFixed(3)` in `PayDialog.vue:67,77`, `ShiftView.vue:125,151,155,166-168`, `AdminView.vue:333,460,465,470-475` — wrong for 2-dp foreign cash (USD) |
| Arithmetic | `received = Σ Number(tendered) * rate` (`PayDialog.vue:54`), `short = received + 0.0005 < due` (`:57`), subtotal `rate*qty` (`TerminalView.vue:152`, `OrderView.vue:65`), receipt line `rate*qty` (`TerminalView.vue:228`) |
| Fill remaining in foreign currency | `(owed / rate).toFixed(3)` (`PayDialog.vue:77`) — can round down, producing an underpayment the server tolerates (≤0.0005) |
| Opening/closing counts | `Number(input) || 0` (`ShiftView.vue:68,85`) — no denomination count |

Live configuration noted in CLAUDE.md: tenant 197349 BHD had `smallest_currency_fraction_value = 0` with
rounding on (2.500 billed as 2.000) until the rounding setting was added; rounding is now a tenant setting.

### 15.1 Where decimal precision comes from today

Owner decision (2026-10-19): precision must come from the company's default currency's ERPNext `Currency`
record (`fraction_units`, `smallest_currency_fraction_value`, `number_format`) — never a hard-coded 2 or 3 — in
frontend and backend, rounding, reports and receipts; foreign tenders at their own currency's precision. Current
state against that rule:

| Location | Source of precision | Conforms? |
|---|---|---|
| Invoice totals, `prec` used in `_settle`, receipts, balances (`pos_core.py:800,927,949,1087,1136`) | `doc.precision("grand_total")` → Frappe `get_field_precision` (`frappe/model/meta.py:726-741`): site-wide `currency_precision` default, else site-wide `number_format`; **not** the document's currency | No — one precision for all currencies on the site |
| Payment tolerance `10 ** -prec / 2` (`pos_core.py:855-861,1104,1109,1138,1146,1150`) | same site-wide `prec` | No |
| Foreign tendered amount `flt(raw.tendered)` (`pos_core.py:832`) | not rounded at all | No |
| Tender `amount` (`pos_core.py:853`) | register-invoice precision; no separate company-currency equivalent stored | No |
| Shift variance `flt(..., 3)` (`pos_core.py:697`) | **hard-coded 3** | No |
| EOD part-paid threshold `> 0.0005` (`pos_core.py:1582`) | **hard-coded** (assumes 3 dp) | No |
| Shift Cash / Tender `Float` fields | site `float_precision` (default 3) | No |
| Bill rounding steps `STEPS = (0.005, …, 1.0)` (`rounding.py:21`) | hard-coded list, 0.005 only meaningful for 3-dp currencies | No |
| Rounding step stored on `Currency.smallest_currency_fraction_value` (`rounding.py:80`) | company currency record | Yes (source), but edits a shared master |
| Frontend `Intl.NumberFormat(..., {currency})` (Terminal, Order, PayDialog, Shift, receipt) | browser CLDR/ISO 4217 defaults (BHD 3, USD 2, JPY 0) — **not** ERPNext's Currency record | Partly (matches ISO, ignores tenant config) |
| `toFixed(3)` (`PayDialog.vue:67,77`; `ShiftView.vue:125,151,155,166-168`; `AdminView.vue:333,460,465,470-475`) | **hard-coded 3** | No |
| `toFixed(2)` fallback (`receipt.ts:26`) | **hard-coded 2** | No |
| `0.0005` thresholds (`PayDialog.vue:57`, `ShiftView.vue:121`, `AdminView.vue:471`) | **hard-coded** | No |
| ERP EOD page (`erp-frontend/src/app/(erp)/reports/pos-end-of-day/page.tsx:84,144,175`) | hard-coded `toFixed(2)` fallback and `toFixed(3)` | No |
| Quantities `1e-9` epsilons (`pos_fnb.py:744-761`) | hard-coded (quantities, not money) | n/a |

Note for the design: in Frappe/ERPNext v14, Currency-field precision is **site-wide**, not per currency. A
per-currency precision has to be computed by our own helper from the `Currency` record and applied explicitly
(the ERPNext documents will still round with the site-wide setting, so the site's `currency_precision` must be
set to the company currency's decimals).

**POS Invoice ledger gap.** ERPNext 14 `POSInvoice.on_submit` (`erpnext/accounts/doctype/pos_invoice/
pos_invoice.py:61-78`) creates loyalty/coupon effects only — no GL entries, no stock ledger. Consolidation needs
POS Opening + POS Closing Entries, which this POS never creates. With the default `checkout_document = POS
Invoice`, retail and F&B sales are missing from the books and from stock, and ERPNext's
`validate_stock_availablility` counts unconsolidated POS Invoice quantities as reserved, so stock items will
progressively appear unavailable. Draft Invoice + Receipt mode does post (Sales Invoice + Payment Entries).

## 16. Idempotency

| Operation | Protection | Retry outcome |
|---|---|---|
| `retail_checkout` | none (no request id, no lock) | **second invoice + tenders** |
| `settle_invoice` (retail balance) | none on the invoice; ERPNext outstanding check at Payment Entry | second receipt while balance remains (partial) |
| `bill_order` | `select … for update` on the order + status check (`pos_fnb.py:302-313,887`) | second call refused once Billed; while Part Paid a retry takes another payment |
| `set_order_items` | order row lock; replace semantics | same payload → same result; concurrent edits: last writer wins for unsent lines |
| KOT (`_make_kot`) | delta `qty - kot_qty` under order lock (`pos_fnb.py:497-527`) | retry creates nothing ("Nothing new") — idempotent |
| `open_order` Dine In | table row lock; returns existing order (`pos_fnb.py:382-390`) | idempotent; Take Away is not (new token each call) |
| `open_shift` | one open shift per user / per register (`pos_core.py:572-576`) | refused |
| `close_shift` | status check | refused |
| Frontend | buttons disabled while `busy/charging` | protects double-click only |

No `Idempotency-Key`, no client request id stored on Tender/Invoice, no unique constraint on Tender
(invoice, leg). Payment "pending/failed/uncertain" states do not exist — all non-cash methods are recorded as
paid at submit time.

## 17. Multi-tenant isolation

- Model: one Frappe site + MariaDB database per tenant (`<code>.xentraerp.local`); one shared gunicorn; the
  control plane is the `xentraerp.net` site.
- Resolution: the Next proxy takes the tenant from header `x-xentra-tenant` **or** cookie `xentra_tenant`
  (`route.ts:6-8`) and sets `Host: <slug>.xentraerp.local` (`registry.ts:39-43`) with **no format check or
  allow-list**; an empty slug or `sandbox` routes to the control-plane site. The value is client-controlled.
- What actually isolates: Frappe selects the database from Host; `sid` sessions are stored per site, so a
  session from tenant A is not valid on tenant B; redis cache keys (e.g. the PIN throttle) are site-namespaced.
- Guest surface reachable for any slug: `pin_login` on every tenant site (one shared 8/15-min-per-IP throttle per
  site); `tenant_lookup` and `tenants.get_enabled_modules` (`tenants.py:200`) on the control plane.
- Entitlement: `pos` module is checked only at PIN login, fails open, and is cached 60 s; existing sessions and
  System Manager password sessions are not re-checked.
- No automated cross-tenant tests.

## 18. Test coverage

`scripts/pos-checks/` (Python, run on the bench against the live tenant inside rolled-back transactions):
`backend_suite.py` (~184 checks), `locations_receipts_suite.py` (~90), `access_location_suite.py` (~76),
`roles_takeaway_reservations_suite.py` (~74), `staff_suite.py` (~22); `e2e_http.py` (~68, real HTTPS with PIN
logins, creates `zz.e2e.*` users). Counts are `check(` occurrences. Not covered: concurrency/duplicate submission,
POS Invoice consolidation, cross-tenant access, frontend (no unit, component, e2e or accessibility tests; no
test runner in `package.json`). The Vue screens have never been driven in a browser (CLAUDE.md).

## 19. Performance

- Floor polls 3 endpoints every 8 s (`FloorView.vue:44-68`); `list_tables` loads all open orders, all held
  reservations and active KOTs on every call (`pos_fnb.py:125-195`).
- Kitchen polls every 6 s; `list_kots` does one `get_doc` per ticket (N+1, `pos_fnb.py:573-574`).
- `_orders_touching` scans all open orders per table operation (`pos_fnb.py:71-72`).
- `list_menu` loads up to 2,000 items and the whole price list per order screen (`pos_core.py:1405-1421`).
- Retail terminal: first 200 items / 500 prices only, client-side search (`TerminalView.vue:98-118`).
- Missing DB indexes noted in §11. Server is 2 vCPU / 4 GB shared with ERP, Next.js and another product.
- No websocket/realtime; Frappe socketio exists on the bench but is unused.

## 20. Responsive design and accessibility

- Breakpoints: 900 px and 960 px plus `pointer: coarse` sizing (`pos.css:896,982,1004,1105`).
- 145 inline `style=` attributes across views/components (e.g. AdminView 48, OrderView 27), bypassing tokens.
- Accessibility: a handful of `aria-label`/`role="dialog"` (SessionMenu, ConfirmSheet, Terminal printer button);
  other modals (`PayDialog`, `NewOrderDialog`, `ReservationDialog`, `ItemNoteDialog`) have no dialog role, focus
  trap or Escape handling; icon-only buttons (`✕`, `⌕`) lack labels; pinch-zoom disabled (`index.html:6-9`);
  status conveyed by colour pills; no visible focus styling audit; no automated a11y checks.

## 21. i18n / RTL

None. All strings are hard-coded English in templates and in backend error messages; `<html lang="en">`; no
`dir` handling; CSS uses physical `left/right` properties; number/date formats use the browser locale.

## 22. Reusable components, duplication and code quality

Reusable today: `PayDialog` (used by retail and F&B), `SessionMenu`, `ConfirmSheet`, `lib/escpos.ts` builder,
`lib/api.ts` wrapper, `pos_core.post_invoice` (single posting path for both modes), `_elevated`, location
helpers, `require_cap`.

Duplication: `money()` defined in 6 places; receipt construction duplicated in `TerminalView.vue:221-231` and
`OrderView.vue:246-253`; `_open_order`/`_payable_order` near-identical (`pos_fnb.py:289-313`); POS role tuples
defined twice with different shapes (`pos.py:316` vs `pos_core.py:48`); invoice dict building duplicated between
`_profile_invoice` and `_draft_invoice_doc` (`pos_core.py:761-788,968-1006`); retail and F&B load items through
different APIs (REST vs `list_menu`). Large single-file views (AdminView 480 lines, OrderView 490).

## 23. GitHub vs live differences

**`feature/pos-app` vs `origin/main`:** `main` has 4 commits not on `feature/pos-app` (`8afbe03`, `f50d531`,
`1b3a428`, `ff85097`): three merge commits and the Android workflow, whose file already exists on
`feature/pos-app`. `feature/pos-app` has 1 commit not on `main` (`543c34a`, Regional/Website reports mapping in
`reports.py:31-32`, catalog changes). **No POS code differs between the two branches.**

**Live `/home/xentraerp` vs GitHub `feature/pos-app`:** same HEAD (`543c34a`), POS frontend source and
`pos_core.py` / `pos_fnb.py` identical. Uncommitted (from `/root/work/xentraerp-live-uncommitted-20261019.patch`
and `git status`):

| File | Change | POS relevance |
|---|---|---|
| `custom_erp/api/pos.py` | `tenant_modules()` replaced by `tenant_entitlements()` returning `{modules, reports}` from control-plane `tenants.get_entitlements`; cache key `xentraerp_tenant_entitlements`; `tenant_modules()` now wraps it | **PIN login gate** calls this — production calls `get_entitlements`, GitHub calls `get_enabled_modules` |
| `custom_erp/api/reports.py` | report gate uses plan report bundles | ERP reports (incl. POS-module reports) |
| `custom_erp/api/tenants.py` | new guest endpoint `get_entitlements(tenant_code)` (plan modules + report bundles; returns empty for non Trial/Active tenants) | control plane; guest-readable |
| `xentraerp_tenant.py` | tenant inherits plan modules/max_users on save | control plane |
| untracked `api/plans.py`, DocTypes `XentraERP Plan`, `Plan Module`, `Plan Report`, `Module Price` | plan management (System Manager-guarded) | not POS |
| `erp-frontend/src/app/admin/{modules,plans,reports,tenants}/page.tsx`, `src/lib/plans.ts` | admin UI for plans | not POS |
| untracked `pos-frontend/dist-old/`, `pos-frontend-dist.bak-20261007/` | old builds | rollback copies |

Consequence: deploying GitHub `feature/pos-app` over production as-is would revert the entitlement API and
remove the plan DocTypes' code. Owner decision (recorded 2026-10-19): the live changes will be pushed to GitHub
later, after deployment; `05` plans a capture step first.
