# POS checks

Run from `/home/frappe/innovegic-bench/sites` with the bench Python (tenant `197349.xentraerp.local`).

**The tenant is in real use** (real tables, orders, shifts, staff). Nothing here may touch those rows:

- The four `*_suite.py` files run inside a transaction that is **never committed and always rolled back**, and each
  starts by clearing the live POS state *inside that transaction only* so the checks start from an empty tenant.
  `../env/bin/python /home/xentraerp/scripts/pos-checks/<suite>.py`
  - `backend_suite.py` — modes, tables, KOT, split/merge, shifts, multi-currency, previous-day billing, EOD, PIN rules
  - `locations_receipts_suite.py` — locations & numbering, Draft Invoice + Receipt, partial payment, location-scoped kitchen
  - `staff_suite.py` — POS Cashier role and staff/PIN management
  - `access_location_suite.py` — the User form's POS access (role, register, PIN set/reset, on/off), a person's location scoping
    (registers, shifts, orders, day-end report), location ↔ cost center rules, and Retail / F&B / both per location
  - `roles_takeaway_reservations_suite.py` — Waiter/Cashier/Supervisor/Kitchen rights, take-away, auto-KOT,
    reservations, menu management, item notes (incl. the AI path with the network call mocked)
  - `role_profiles_suite.py` — POS role profiles: standard catalogue seeded (and re-seeding keeps a tenant's edits),
    rights limited to the access level, mapping a profile to staff, the exact rights it gives at the till, disable /
    level-change fallbacks, old `pos_role` callers, administrators, and the migration patch for existing staff.
    Run after `bench migrate` (the patch creates the table and the User field).
  - `auth_suite.py` — **POS upgrade Phase 1**: staff number + PIN, per-user / per-IP progressive lockout, generic
    errors, login log (no PINs logged), administrators refused at PIN sign-in, device approval codes (one use,
    expiry, revoke), device type ↔ role rules and session modes, Waiter/order-device 403s on bill/pay/shift, a waiter
    never needs a shift, request-bill, session records / revoke / sign out other devices / PIN switched off, screen
    lock + unlock, Customer read removed from POS roles, entitlement fails closed, `tenant_lookup` /
    `lookup_organization` output and rate limit. Sessions are emulated (no HTTP); its redis keys (test IPs
    `203.0.113.x`, ZZ staff numbers) are deleted at the end.
- `unit/test_pos_security.py` — pure-Python unit tests of the auth policy (`custom_erp/api/pos_security.py`); no bench
  needed: `python3 -m unittest discover -s scripts/pos-checks/unit -v` from the repo root.
- `e2e_setup.py` → `e2e_http.py` → `e2e_cleanup.py` drive the same flows over real HTTPS with PIN logins, one person per
  role. Setup creates `zz.e2e.*` users and a `ZZ E2E Register`; the run records the tenant's settings first and restores
  exactly those; **cleanup removes only ZZ-marked rows** (an earlier version deleted every table/order — never use that on
  a tenant in real use).

**Phase 1 note on `e2e_http.py`:** it signs in with the old PIN-only call and includes an administrator PIN. After
Phase 1 that needs, for the duration of the run only, POS Settings `legacy_pin_login = 1` and
`require_registered_device = 0`, and its administrator checks will fail by design (administrators no longer have
PINs). It has not been rewritten for staff numbers + management sign-in yet.
