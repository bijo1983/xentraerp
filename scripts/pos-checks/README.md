# POS checks

Run from `/home/frappe/innovegic-bench/sites` with the bench Python (they use tenant `197349.xentraerp.local`).

- `backend_suite.py` — ~180 checks of the POS engine (modes, tables, KOT, split/merge, shifts, multi-currency,
  previous-day billing, end-of-day report, PIN rules). Runs inside a transaction that is **rolled back**, so nothing
  persists: `../env/bin/python /home/xentraerp/scripts/pos-checks/backend_suite.py`
- `e2e_setup.py` → `e2e_http.py` → `e2e_cleanup.py` — the same flow driven over real HTTPS through
  nginx → Next.js → Frappe with PIN login and cookies (this is what caught the session-clobbering bug that in-process
  tests cannot see). Setup creates temporary users/PINs/register; cleanup removes them.
