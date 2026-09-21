# POS checks

Run from `/home/frappe/innovegic-bench/sites` with the bench Python (tenant `197349.xentraerp.local`).

**The tenant is in real use** (real tables, orders, shifts, staff). Nothing here may touch those rows:

- The four `*_suite.py` files run inside a transaction that is **never committed and always rolled back**, and each
  starts by clearing the live POS state *inside that transaction only* so the checks start from an empty tenant.
  `../env/bin/python /home/xentraerp/scripts/pos-checks/<suite>.py`
  - `backend_suite.py` — modes, tables, KOT, split/merge, shifts, multi-currency, previous-day billing, EOD, PIN rules
  - `locations_receipts_suite.py` — locations & numbering, Draft Invoice + Receipt, partial payment, location-scoped kitchen
  - `staff_suite.py` — POS Cashier role and staff/PIN management
  - `roles_takeaway_reservations_suite.py` — Waiter/Cashier/Supervisor/Kitchen rights, take-away, auto-KOT,
    reservations, menu management, item notes (incl. the AI path with the network call mocked)
- `e2e_setup.py` → `e2e_http.py` → `e2e_cleanup.py` drive the same flows over real HTTPS with PIN logins, one person per
  role. Setup creates `zz.e2e.*` users and a `ZZ E2E Register`; the run records the tenant's settings first and restores
  exactly those; **cleanup removes only ZZ-marked rows** (an earlier version deleted every table/order — never use that on
  a tenant in real use).
