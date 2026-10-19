# 05 — Upgrade architecture and phased plan

Goal: turn the existing POS into a production-ready multi-tenant F&B + Retail platform **without rebuilding what
works**. Stack stays: ERPNext v14 + `custom_erp` (Frappe) backend, Vue 3 + Pinia + Capacitor frontend in
`pos-frontend/`, served at **https://pos.xentraerp.net** (owner decision — not open), via the existing Next.js
proxy and per-tenant Frappe sites.

## 0. Decisions already made by the owner (2026-10-19)

| # | Decision | Consequence in this plan |
|---|---|---|
| A | Domain stays `https://pos.xentraerp.net` | no DNS/cert work; the brief's `pos.xentraerp.com` is dropped |
| B | Uncommitted live changes in `/home/xentraerp` are pushed to GitHub later, after deployment | Phase 0 captures live state on a branch before any upgrade work merges; nothing is pushed from the server by this work |
| C | Money precision comes from the company's default currency's ERPNext `Currency` record (BHD/KWD/OMR 3, AED/SAR/USD 2, JPY 0) — never hard-coded — in frontend, backend, rounding, reports, receipts. Multi-currency payment stays: any enabled currency at the configured Currency Exchange rate; each tender stored in its own currency at its own precision plus the company-currency equivalent at company precision; change in company currency | Phase 2 money module |
| D | Offline selling is out of scope; deferred to a later phase. Until then the app shows online/offline status and blocks selling while offline, and never claims offline capability | Phase 1 shell indicator + block; Phase 9 (deferred) |
| E | No card terminal / payment provider integration now. Tenders = cash, manual card (standalone machine; optional last 4 digits and approval/reference no.; never PAN/CVV), existing multi-currency cash, existing ERPNext Mode of Payment setup. Payment layer stays pluggable | Phase 2/5 tender model |

## 1. Target architecture

```
Browser / Capacitor shell (pos.xentraerp.net)
  Vue 3 + Pinia + vue-router (existing app, restructured)
  ├─ design system (tokens, components, i18n EN/AR, RTL)
  ├─ shell: org/location/register/shift/user/role/online/printer status
  ├─ workspaces: Retail, F&B (floor, order, KDS), Cash (shift/register), Manager (approvals, reports, audit)
  └─ services: api client (idempotency keys, error codes), money formatter (server-supplied precision),
     printer drivers (BLE ESC/POS, browser), network monitor
        │  same-origin /api/*
nginx (headers, rate limits) → Next.js proxy (tenant registry validation, IP forwarding, error scrub)
        │  Host: <tenant>.xentraerp.local
Frappe/ERPNext v14 site per tenant
  custom_erp
  ├─ pos_auth      (PIN + identity, device registry, lockout, sessions, management login + TOTP)
  ├─ pos_core      (existing: settings, business date, shifts, checkout)  ← refactored, not replaced
  ├─ pos_money     (Decimal, per-currency precision from Currency record)
  ├─ pos_tx        (idempotent transaction envelope, tender ledger v2, pluggable tender handlers)
  ├─ pos_fnb       (existing: tables, orders, KOT, reservations) + modifiers, courses, stations
  ├─ pos_retail    (barcode/variants/UOM/batch/serial via ERPNext, returns, park/resume)
  ├─ pos_cash      (cash movements, denomination counts, blind close, Z, day close)
  ├─ pos_approval  (policies, manager override, before/after)
  ├─ pos_audit     (append-only, hash-chained events, viewer, audited exports)
  └─ pos_reports   (EOD/X/Z/finance/F&B/retail; Decimal; exports)
ERPNext doctypes reused: Sales Invoice, Payment Entry, (POS Invoice + POS Opening/Closing Entry if kept),
Item/Item Price/Price List/Pricing Rule/Coupon Code/Loyalty Program/Customer/UOM/Batch/Serial No/BOM/Stock Entry
Control plane (xentraerp.net site): tenant registry + entitlements (authenticated server-to-server)
```

Principles:

1. **Keep the APIs that work.** Every existing whitelisted method keeps its name and arguments (01 §3.1). New
   behaviour is added as optional arguments (e.g. `client_txn_id`) or new methods. Deprecations go through one
   release with both paths.
2. **Server stays authoritative** for price, tax, rounding, discounts, change, permissions.
3. **ERPNext does accounting and stock.** The POS never re-implements GL, stock valuation, pricing rules,
   loyalty or returns logic that ERPNext has; it calls ERPNext and records POS-specific facts (tenders, shifts,
   approvals, audit).
4. **Every money-moving call is idempotent** and writes an audit event in the same transaction.
5. **Feature flags per tenant/location** (POS Settings / Location) so each phase ships dark and is switched on
   per tenant.

## 2. Build vs reuse from ERPNext

| Area | Reuse from ERPNext v14 | Build in custom_erp |
|---|---|---|
| Accounting | Sales Invoice, Payment Entry, Journal Entry (cash movements to safe/bank), POS Closing Entry if POS Invoice kept | tender ledger v2, reconciliation checks |
| Inventory/stock | Stock Ledger via `update_stock`, Warehouse, Stock Entry (wastage = Material Issue), Batch, Serial No, UOM conversion | location→warehouse mapping (exists), POS stock lookup endpoint |
| Recipes / food cost | BOM (+ BOM-based backflush via Stock Entry "Manufacture"/"Material Issue" on sale) | consumption posting job per day/shift, food-cost report |
| Price lists | Price List, Item Price (exists) | — |
| Promotions | Pricing Rule, Promotional Scheme, Coupon Code (`apply_pricing_rule` in `calculate_taxes_and_totals` path) | approval for manual discounts, discount reasons |
| Loyalty | Loyalty Program, Loyalty Point Entry (works on Sales/POS Invoice) | customer lookup UI, redemption as a tender handler |
| Returns | `make_sales_return` / `is_return` + `return_against`; ERPNext validates returned qty ≤ sold qty | eligibility UI, approval, refund tender, return reasons |
| Gift cards / store credit | none native (Customer credit via unallocated Payment Entry / credit note is possible) | gift card doctype + liability account; store credit via credit notes |
| Customers | Customer, Contact | minimal-field search API, consent flags, masking |
| Roles | Frappe Role, User | POS permission matrix (caps) — extend `pos_core.CAPS` |
| Taxes | Sales Taxes and Charges Template | service charge as a template row or POS line |

## 3. Design-system approach

- Keep Vue; replace the single 1,113-line `pos.css` + 145 inline styles with: design tokens (CSS custom
  properties already exist at `pos.css:1-40` — formalise them: colour, spacing, radius, type scale, elevation,
  motion, status colours), **logical properties only** (`margin-inline-start`, etc.) for RTL, and a small
  component kit in `src/ui/` (Button, IconButton with required label, Field, Select, NumberPad, MoneyInput,
  Dialog with focus trap/Escape/`aria-modal`, Sheet, Tabs, Table, Badge/StatusPill (icon + text, not colour
  only), Toast, EmptyState, ErrorState, Skeleton).
- Touch first: 44 px minimum targets, three layouts (counter terminal ≥1280, tablet 768–1279, phone <768),
  tested in Playwright at those widths.
- i18n: `vue-i18n` with EN/AR catalogs; `dir` set on `<html>` from locale; numbers/dates through one formatter
  with Latin digits by default (owner can choose Arabic-Indic); backend error codes translated client-side.
- Money: one `formatMoney(amount, currencyMeta)` where `currencyMeta` (decimals, symbol, number format) is
  delivered by the server from the `Currency` record; no `toFixed` literals (lint rule).
- Self-host fonts (removes Google Fonts dependency and simplifies CSP).
- Storybook-free: a `/ui-kit` dev-only route renders every component state for review.

## 4. Database-change plan (outline)

All changes are additive DocType JSON changes applied by `bench migrate`; no destructive column changes in the
first phases. Old fields stay until a later cleanup release.

| Phase | Change |
|---|---|
| 1 | `XentraERP POS Device` (id, name, location, registered_by, token hash, last_seen, revoked); `XentraERP POS Login Attempt` (insert-only: tenant, user?, device, ip, result, at); PIN: add `failed_count`, `locked_until`; Settings: idle timeout |
| 2 | `XentraERP POS Transaction` (client_txn_id **unique**, kind, status Pending/Committed/Failed, request hash, result JSON, invoice, user, device); Tender v2 fields: `tender_currency_precision`, `base_amount` (company ccy), `card_last4` (4 digits, optional), `approval_ref`, `transaction` link; indexes on Tender(shift, business_date, invoice); `XentraERP POS Audit Event` (insert-only, `prev_hash`, `hash`) |
| 3 | `XentraERP POS Approval Policy` (action, role, threshold, method PIN/login) and `XentraERP POS Approval` (action, requested_by, approved_by, reason, before JSON, after JSON) |
| 4 | Order Item: `status` (Active/Voided/Comped), `void_reason`, `course`, `station`, `modifiers` (child table); `XentraERP POS Modifier Group` (min/max) + options; `XentraERP POS Station`; Order: `order_type` options extended; `service_charge` |
| 5 | `XentraERP POS Cash Movement` (type In/Out/Drop/Petty, amount, currency, reason, approval); Shift Cash: denomination child table, `blind` flag; `XentraERP POS Z Report` (immutable snapshot, sequence per register); `XentraERP POS Business Day` (date, location, status Open/Closed) |
| 6 | Retail: `XentraERP POS Parked Sale`; return reasons; gift card doctype + ledger |
| later | convert `location`/`invoice` Data fields to Link/Dynamic Link (needs data migration) |

Data migrations are idempotent patches in `custom_erp/patches/` (none exist yet — add `patches.txt`), each
with a dry-run mode, run first on a staging copy of the tenant DB.

## 5. API-change plan (outline)

- **Unchanged contracts:** all methods in `01-audit.md` §3.1.
- **Additive:** `client_txn_id` (optional now, required after Phase 2 grace) on `retail_checkout`,
  `settle_invoice`, `bill_order`, `open_order` (take-away), `close_shift`, cash movements; response includes
  `transaction`, `replayed: bool`.
- **New namespaces:** `pos_auth.*` (identify, pin_login v2, device register/revoke, lock/unlock, sessions,
  management login), `pos_approval.*`, `pos_audit.*` (list, export), `pos_cash.*`, `pos_retail.*` (scan,
  search, variants, stock, park/resume, return eligibility, create return), `pos_reports.*`.
- **Error contract:** `{code, message, details}` with stable codes (`PERMISSION_DENIED`, `APPROVAL_REQUIRED`,
  `DUPLICATE_TXN`, `SHIFT_REQUIRED`, `STOCK_UNAVAILABLE`, `OFFLINE_BLOCKED`, …) via a decorator; old message
  strings still in `message`.
- **Reads:** replace direct REST reads of Item/Item Price/Customer with whitelisted, field-limited methods, then
  remove Customer read from POS roles (H6).
- **Tender handler interface (pluggable, decision E):** `TenderHandler` registry keyed by Mode of Payment type —
  `validate(leg)`, `capture(leg) -> status`, `refund(leg)`; implemented now: `cash` (any enabled currency,
  change in company currency), `manual_card` (optional `card_last4` `^\d{4}$`, optional `approval_ref`; anything
  longer than 4 digits rejected), `other` (bank transfer/wallet as manual reference). A future terminal handler can
  return `Pending` and complete asynchronously; the transaction envelope already has the states.

## 6. Phases

Each phase ships behind flags, is deployed with the procedure in §7, and can be rolled back independently.
Sizes: S ≈ ≤1 week, M ≈ 2–3 weeks, L ≈ 4–6 weeks of one developer.

### Phase 0 — Baseline and safety net (S)

- **Scope:** (1) Capture production state: create branch `release/live-2026-10-19` on GitHub from the live tree
  (HEAD `543c34a` + uncommitted changes + untracked plan files, excluding `.env.local`, logs and build
  backups) — **done by the owner at the time agreed (decision B)**; all upgrade branches rebase onto it so the
  entitlement API (`tenant_entitlements`) is not reverted. (2) Staging site on a separate small server or, if
  memory allows, a second bench site restored from a sanitized backup of tenant 197349. (3) CI: Python suites run
  against staging, `vue-tsc` + Vitest + Playwright skeleton. (4) Release procedure: deploy backend from a git tag
  (not a dirty working tree), keep previous `dist/` for instant rollback.
- **Migrations:** none.
- **Risk:** low. **Rollback:** n/a.

### Phase 1 — Design system, landing page with right-side login, auth & session hardening (L)

- **Scope (as the brief asks):**
  - Design system (§3) and app shell with status bar: organization, location, register, shift, user/role,
    **online/offline** (`@capacitor/network` + `navigator.onLine` + heartbeat), printer.
  - **Offline guard (decision D):** when offline, a banner "Offline — selling is paused until the connection
    returns"; Pay/Save/KOT/close-shift buttons disabled; no queueing; no offline claims in copy.
  - Public landing page at `/` (product summary, contact) with the **login panel on the right** (stacked below
    on phones); steps: organization code → staff identify (name tile or staff no.) → PIN. Management login (email
    + password + TOTP via Frappe's 2FA) as a separate tab.
  - Auth hardening (C3, H4, H5, H7, M8, M9): identity + PIN; per-user, per-device and per-IP throttles with
    progressive lockout and admin unlock; no PIN for System Manager accounts (management login only);
    device registration by a manager (device token in Capacitor Preferences / HttpOnly cookie); login attempt log;
    idle lock to PIN pad; session revocation on PIN deactivation; tenant slug validation + session-tenant binding
    in the Next proxy; `tenant_lookup` no longer returns admin email; entitlement check moved to authenticated
    server-to-server and checked per request with cached last-known value; nginx security headers + `limit_req`.
  - i18n plumbing (EN complete, AR catalog started, RTL layout works).
- **Migrations:** Device, Login Attempt, PIN lockout fields, Settings idle timeout.
- **Risk:** medium — locks out staff if misconfigured. Mitigation: flag `auth_v2` per tenant; existing PIN login
  kept until all devices are registered; break-glass management login.
- **Rollback:** flip `auth_v2` off; previous `dist/`; new doctypes are unused when off.

### Phase 2 — Money correctness, idempotency, ledger and audit core (M)

- **Scope:** C1, C2, H1, H3, M5, M6.
  - `pos_money`: `Decimal`, precision from the company currency's `Currency` record (decision C); per-tender
    currency precision; zero-tolerance settlement; set site `currency_precision` to company decimals.
  - Transaction envelope with `client_txn_id` (unique), replay returns stored result; invoice row lock in
    `settle_invoice`.
  - Tender v2 (tender ccy amount @ its precision, rate, company-ccy `base_amount` @ company precision, manual
    card last-4/approval ref) and pluggable tender handlers (decision E).
  - Accounting path decided by D1: either Draft Invoice + Receipt only, or POS Opening/Closing Entries with
    consolidation; backfill/consolidate existing unconsolidated POS Invoices; EOD reconciliation warnings.
  - Append-only audit events written by every money/permission action; owner set correctly before insert;
    Tender/Shift immutable after insert.
  - Server-rendered receipt payload (VAT no., tax lines, cashier, reprint marker).
- **Migrations:** Transaction, Audit Event, Tender fields + indexes, patch to backfill `base_amount`.
- **Risk:** high (touches posting). Mitigation: shadow mode — compute v2 amounts alongside v1 and log
  differences for a week before switching; accountant sign-off.
- **Rollback:** flag `money_v2`; additive fields; consolidation entries can be cancelled in ERPNext.

### Phase 3 — RBAC expansion and approvals (M)

- **Scope:** map the brief's ~15 roles onto a granular permission matrix (extend `CAPS` into per-action
  permissions, keep the 5 existing levels as presets); approval policies (action, threshold, PIN or login),
  manager override dialog, before/after recorded; location-scoping gaps (M4); audit viewer + audited CSV export.
- **Migrations:** Approval Policy, Approval; role records.
- **Risk:** medium. **Rollback:** policies default to "no approval required" = current behaviour.

### Phase 4 — F&B workspace upgrade (L)

- **Scope:** order types (delivery, pickup, drive-through, room service, online — data + UI; no aggregator
  integrations), floor statuses, item-level void/comp with approval, discounts (line/bill) with reasons/limits,
  service charge, split equal, transfer items, modifiers/combos with min/max, courses + fire/hold, kitchen
  stations and per-item status, KDS realtime via Frappe socket.io, KOT printed flag + reprint, pro-forma print,
  reopen of a paid bill = return + re-ring with approval, digital receipt (link/QR to a server-rendered receipt).
- **Migrations:** Order Item fields, Modifier Group, Station, Settings.
- **Risk:** medium (live F&B tenant). Mitigation: flag per location; train on staging.
- **Rollback:** flags; new fields unused.

### Phase 5 — Shift, register and cash control (M)

- **Scope:** cash in/out, petty cash, safe drop (Journal Entry to safe/bank account), denomination count, blind
  close, variance thresholds with approval, X report, numbered immutable Z, business-day open/close per
  location (blocks back-dated sales after close), tender handlers' reconciliation (manual card totals vs
  standalone machine settlement entry).
- **Migrations:** Cash Movement, denomination table, Z Report, Business Day.
- **Risk:** medium. **Rollback:** flag `cash_v2`.

### Phase 6 — Retail POS (L)

- **Scope:** barcode/SKU scan (keyboard-wedge + camera via Capacitor), server item search with pagination,
  variants, UOM, batch/serial/expiry (ERPNext validation), price lists, Pricing Rules/promotions, coupons,
  customer selection + customer pricing, loyalty (ERPNext Loyalty Program, redemption as tender handler),
  gift cards, store credit (credit notes), salesperson (Sales Team), park/resume.
- **Returns/exchanges:** from a receipt or invoice lookup; eligible quantity = sold − already returned (ERPNext
  `return_against` validation + pre-check); approval policy; refund through tender handlers (cash, manual card
  refund reference, store credit).
- **Migrations:** Parked Sale, gift card, return reasons.
- **Risk:** medium-high (stock/accounting). **Rollback:** flag `retail_v2`; old `/terminal` stays routable.

### Phase 7 — Inventory for F&B, customers & privacy (M)

- **Scope:** recipes via BOM, theoretical consumption posting per shift/day, wastage entry (Material Issue with
  reason), food-cost report; customer data minimisation, masking in POS, consent flags, export/delete on request.
- **Risk:** medium. **Rollback:** flags; stock entries can be cancelled.

### Phase 8 — Reports, performance, accessibility, hardening (M)

- **Scope:** executive, F&B, retail, finance/control reports in `Decimal` with filters, drill-down, CSV/Excel/PDF
  exports (audited), reconciliation tests (report totals = GL/tender sums); indexes, batched floor/KDS queries,
  realtime instead of polling; full AR translation + RTL QA; axe/Playwright a11y suite; security tests
  (authz matrix, cross-tenant, rate limits); deployment + rollback runbook.
- **Risk:** low-medium.

### Phase 9 — Offline selling (deferred; not in this upgrade)

Planned separately (decision D). Prerequisites already delivered by earlier phases so they don't block it:
idempotency keys and the transaction envelope (Phase 2), device-scoped local transaction references
(device id + sequence, Phase 1/2), server-side duplicate detection (unique `client_txn_id`), and — still to build —
an encrypted local queue (Capacitor secure storage / IndexedDB with WebCrypto), conflict rules for prices/stock,
and a sync status in the shell.

## 7. Deployment and rollback (every phase)

1. Merge to a release branch based on the Phase 0 live-capture branch; tag.
2. Staging: restore sanitized backup, `bench migrate`, run Python suites + Playwright; accountant check for
   money phases.
3. Production window outside trading hours (the tenant trades past midnight — agree a window): DB backup
   (`bench backup --with-files`), checkout tag in `/home/xentraerp`, `bench --site 197349.xentraerp.local migrate`,
   `supervisorctl restart innovegic-bench-web:innovegic-bench-frappe-web`, `supervisorctl status`; frontend
   build to `dist-new` and atomic swap (existing CLAUDE.md procedure). Flags off.
4. Enable flags for the tenant; monitor Error Log and audit events.
5. Rollback: flags off → previous `dist/` → previous tag + restart; DB restore only if a migration corrupted data
   (migrations are additive, so normally not needed).

Memory: the 4 GB server already runs ERP, Next.js and ScheduleVerse; builds must run one at a time, and a
staging bench on the same box may not fit — see decision D7.

## 8. Decisions the owner still has to make

| # | Decision | Options / recommendation |
|---|---|---|
| D1 | Accounting path for POS sales (C1) | (a) Draft Invoice + Receipt only (posts immediately, one Sales Invoice per bill — recommended for simplicity), or (b) keep POS Invoice with Opening/Closing Entries and consolidation; plus how to treat the existing unconsolidated POS Invoice(s) |
| D2 | Role catalogue: which of the brief's ~15 roles exist and how they map to existing caps | Proposed default: Kitchen→kitchen; Waiter/Host→waiter(+reserve); Cashier→cashier; Shift Supervisor/Floor Manager→supervisor; Store/Branch Manager→supervisor+approvals+reports; Finance/Auditor→reports+audit (read-only); Tenant Admin→admin; others to be listed by the owner |
| D3 | Approval policy defaults | which actions need approval (void after KOT, comp, discount > X%, refund, reopen paid bill, cash out, variance > X), and PIN vs password approval |
| D4 | Management login MFA method | TOTP (Frappe built-in) recommended; SMS/email OTP alternatives |
| D5 | Device policy | require registered devices for all PIN logins vs. only for selling roles |
| D6 | VAT/receipt content and e-invoicing obligations per country (Bahrain NBR first) | needed before Phase 2 receipt work |
| D7 | Staging environment | separate droplet (recommended) vs. second site on the production box |
| D8 | Arabic translation source and digit style | professional translation vs. in-house; Latin vs Arabic-Indic digits |
| D9 | Customer data retention and consent wording | needed for Phase 7 |
| D10 | Gift card / store credit accounting | liability accounts and expiry rules |
| D11 | Landing page content and branding | copy, imagery, contact details for the public page |

Not open (decided): domain (A), live-code push timing (B), currency precision rule (C), offline scope (D),
payment providers (E).
