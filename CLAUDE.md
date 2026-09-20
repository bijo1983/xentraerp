# XentraERP — Server & Environment Notes

Persistent notes about the production server so future sessions don't have
to rediscover this from scratch. Update this file whenever server topology
changes.

## POS app (feature/pos-app branch, PR #4) — action needed on deploy

The new `pos.xentraerp.net` app (Vue 3, `pos-frontend/`) gates its login on
the tenant's subscription via `custom_erp.api.pos._tenant_has_module`, which
checks `XentraERP Tenant.enabled_modules` on the **control-plane site** by
making a plain internal HTTP call from whichever tenant site the login runs
on (Frappe sites are separate databases — there's no direct cross-site
query). **This check silently does nothing (fails open) until
`XENTRAERP_CONTROL_PLANE_HOST` is set** (in `common_site_config.json`/
`site_config.json`, or as an env var for the bench worker process) to the
control-plane site's actual hostname. Until then, every tenant can use POS
regardless of subscription. Confirm which site is actually the control
plane in this deployment (CLAUDE.md's "Architecture decisions" section
below says `erp.badmintonbooking.com` — verify before setting this) before
configuring it. Same fail-open error gets logged via `frappe.log_error` on
every login attempt until it's set, so `bench --site <x> execute
frappe.get_all --args '["Error Log"]'` (or the admin portal, once it reads
error logs) will show it happening.

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
  - **`xentraerp.net` / `www.xentraerp.net`** (`sites-available/xentraerp.
    net`, added 2026-09-20) → `proxy_pass http://localhost:8083` — this is
    the erp-frontend pm2 process and the ONLY public hostname for the app.
    Single `location /` block; the Next.js app itself proxies `/api/*`
    through to the Frappe backend on `:8001` internally (see gunicorn note
    above), nginx doesn't split that out. Let's Encrypt cert
    `xentraerp.net` (webroot `/var/www/html`, expires 2026-12-19,
    auto-renewed). **DNS**: the zone lives in DigitalOcean
    (`doctl compute domain records list xentraerp.net`), with the
    nameservers at the registrar (GoDaddy) pointed to
    `ns1/2/3.digitalocean.com`. Do not move DNS back to GoDaddy's — its
    hidden Websites + Marketing product injected two stray AWS A records
    (`3.33.130.190`, `15.197.148.33`) that couldn't be removed from the
    panel.
  - `erp.badmintonbooking.com` — **removed from nginx 2026-09-20** (no
    redirect, per user; sole user, still in development). Original config
    backed up at `/root/erp.nginx.bak-1789898088`; its cert
    (`/etc/letsencrypt/live/erp.badmintonbooking.com`) was left in place.
    **Do NOT confuse with the Frappe *site* of the same name in
    `sites/`** — that is the control-plane site, and
    `ERP_BACKEND_HOST=erp.badmintonbooking.com` in `erp-frontend/.env.local`
    is the internal Host header used to select it, not a public URL. Leave
    both unchanged.
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

- URL scheme for tenants: `https://xentraerp.net/<tenant_code>/...`
  (moved from `erp.badmintonbooking.com` on 2026-09-20)
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
- **Fixed 2026-09-14**: `DynamicForm`/`ChildTable`'s Check-field checkboxes
  used `checked={!!value}`. Frappe's `default` on a Check field is a
  *string* (`"0"`/`"1"`), and `"0"` is truthy in JS — so every Check field
  with a default (checked or not) rendered as checked until the user
  touched it. Fixed by using the existing `isTruthyDocValue` helper in
  `meta-compiler.ts` (already correct, already used for `depends_on`
  evaluation — just not exported/reused for the checkbox itself). This
  was purely a *display* bug — the actual value stored in form state was
  always the correct raw string, so an untouched checkbox still submitted
  correctly; it just looked wrong on screen.
- **CORRECTION, fixed 2026-09-14**: originally reported as
  `frappe.exceptions.ValidationError: "Customer Provided Item" cannot be
  Purchase Item also` when saving a *plain, untouched* new Item. This
  entry previously diagnosed it as an inherent, unfixable limitation of
  the generic form (no per-doctype `item.js` client script to auto-toggle
  `is_purchase_item`) — **that diagnosis was wrong.** The real cause,
  found by scripting an end-to-end test creation of a plain Item ("Blue
  Pen") against the live API and bisecting the payload field by field:
  `DynamicForm` sent every Check field's default straight from Frappe's
  meta as the raw *string* `"0"`/`"1"`. Frappe's own Python validate()
  hooks routinely do `if self.some_check_field:` — and Python treats the
  non-empty string `"0"` as truthy, exactly like JS does. So
  `is_customer_provided_item: "0"` (correctly unchecked, never touched by
  the user) still made `if self.is_customer_provided_item:` evaluate
  true server-side, entering the block that then throws on
  `is_purchase_item` also being set. **Confirmed the same bug also
  produced the two entries below** (`has_variants` → "Attribute table is
  mandatory", `is_fixed_asset` → "Fixed Asset Item must be a non-stock
  item") purely from checking the corresponding box true-to-Python
  despite the field actually defaulting to unchecked — i.e. these looked
  like three unrelated per-doctype validation quirks but were one root
  cause. See the coercion fix below (in the same fields/commit as the
  "Attribute table is mandatory" entry) — this is fully fixed now, not a
  workaround-only limitation.
- **Fixed 2026-09-14**: reported as `frappe.exceptions.ValidationError:
  Attribute table is mandatory` when saving an Item with "Has Variants"
  checked. Root cause was more fundamental than the checkbox display bug
  above: `DynamicForm`'s/`ChildTable`'s field-inclusion filter excluded
  any field with `hidden: 1` in its DocType meta **unconditionally**,
  before `depends_on` ever got a chance to evaluate. But `hidden: 1` +
  `depends_on` is a standard Frappe authoring idiom for "hidden by
  default, conditionally revealed" — Item's `attributes` table (child
  doctype `Item Variant Attribute`) is exactly that: `hidden: 1` in meta,
  `depends_on: eval:(doc.has_variants || doc.variant_of) &&
  doc.variant_based_on==='Item Attribute'`, and ERPNext's own `item.js`
  (`erpnext.item.toggle_attributes`) reveals it with that identical
  condition. Because the field was excluded at compile time, there was
  **no way for a user to ever see or fill in the Attributes table**
  through our UI, even after checking "Has Variants" — so saving would
  always hit the server's `validate_attributes()` mandatory check with no
  way to satisfy it. Fixed by changing the exclusion condition from
  `!f.hidden` to `(!f.hidden || f.depends_on)` in both `dynamic-form.tsx`
  (`buildTabs`) and `child-table.tsx` (`visibleFields`) — a field is now
  only permanently excluded when it's hidden *and* has no `depends_on` to
  possibly reveal it; existing per-field `evalDependsOn()` calls at render
  time (already present in both files) handle the actual show/hide.
  **Addendum**: this fix alone was necessary but not sufficient — a
  *plain* new Item, "Has Variants" never touched (default `"0"`), was
  *still* hitting this exact error. That second half is the Check-field
  string-truthiness bug described below/above (`has_variants: "0"` sent
  as a string made Python's `if not (self.has_variants or ...)` guard
  evaluate the *inverse* — treating the item as if it did have variants
  — so `validate_attributes()` ran and demanded a table for an item that
  was never marked as a template in the first place). Both fixes were
  required together; verified by scripting an actual Item creation
  ("Blue Pen") against the live API with the pre-fix payload (failed with
  this exact error), then with the fix applied (succeeded), see below.
- **Fixed 2026-09-14 (the real, systemic root cause behind the three
  entries above)**: `DynamicForm`'s default-population effect and
  `ChildTable`'s `addRow` copied a Check field's Frappe `default` — always
  the *string* `"0"` or `"1"` — directly into form/row state verbatim.
  On save that string went straight into the JSON payload posted to
  `/api/resource/<doctype>`. ERPNext's own Python validate() hooks
  overwhelmingly use bare `if self.some_check_field:` rather than
  `if self.some_check_field == 1:` — and Python, like JS, treats the
  non-empty string `"0"` as truthy. Result: **every Check field on a
  brand-new, completely untouched record was seen as `True` by backend
  validation, regardless of whether its real default was 0 or 1** —
  reproduced live via `frappe.desk.form.load.getdoctype` → build the
  exact payload `DynamicForm` would send → `POST /api/resource/Item`:
  failed with "Attribute table is mandatory" (`has_variants: "0"`); after
  coercing just that one field to a real `0`, failed on the *next* one,
  "Fixed Asset Item must be a non-stock item" (`is_fixed_asset: "0"`);
  coercing all Check fields to real integers, the create succeeded
  cleanly. This is NOT Item-specific — it's inherent to any doctype whose
  Python validate() reads a Check field with bare truthiness, which is
  most of ERPNext. **Fix**: both call sites now convert a Check field's
  string default to a real `0`/`1` integer before storing it
  (`dv === '1' ? 1 : 0`) instead of passing the raw string through —
  `dynamic-form.tsx`'s defaults effect and `child-table.tsx`'s `addRow`.
  (The checkbox's `onChange` already sent real numbers; only the
  *default*-population path had this bug. Values loaded from an existing
  saved record are unaffected — Frappe's GET response already returns
  Check fields as real integers, only `default` in meta is a string.)
  Verified end-to-end: deleted the diagnostic "Blue Pen" Item, rebuilt
  and redeployed, re-ran the same live-API simulation using the deployed
  code's exact coercion logic — new "Blue Pen" Item created successfully
  with `is_fixed_asset`, `has_variants`, `is_customer_provided_item` etc.
  all correctly `0` and no validation errors. Also corrects the "Customer
  Provided Item" entry above, which had wrongly been diagnosed as an
  unfixable per-doctype client-script gap — it was this same bug.
  Verified against live `getdoctype` meta for `Item` that `attributes`
  carries both `hidden: 1` and the expected `depends_on` string. This is
  a general fix, not Item-specific — the same
  hidden-by-default-plus-depends_on pattern is common across ERPNext
  doctypes, so other "check a box to reveal a table/section" flows were
  likely broken the same way and should now work.
- **Fixed 2026-09-14**: reported as "no option to edit/view/update saved
  data in masters/transactions view, no filter available" — plus a
  requested visual redesign. Two real bugs, one shared component:
  `DoctypeList` (`erp-frontend/src/components/dynamic/doctype-list.tsx`),
  which powers most masters/transactions list pages (Suppliers, Leads,
  Opportunities, Quotations, Delivery Notes, Sales/Purchase Invoices,
  Purchase Receipts, Material Requests, Journal Entries, Payments, Chart
  of Accounts, Cost Centers, and — after this fix — Customers, Items,
  Sales Orders, Purchase Orders) had a row `onClick` that correctly
  navigated to `/app/<doctype>/<name>` (the already-working `DynamicForm`
  edit view), but **every `<td>` also called `e.stopPropagation()`
  unconditionally** — since a `<td>` covers the entire clickable cell
  area, this made the row click completely unreachable in practice on
  every page using it. Fixed by scoping `stopPropagation` to just the
  link-column's own button. Filtering genuinely didn't exist anywhere
  (`useFrappeList` already supported a `filters` param, nothing passed
  one) — added a debounced free-text search box (`"like"` filter) plus
  optional status/kind dropdown filters to `DoctypeList`, wired real
  ERPNext status enums (pulled from the actual doctype JSON, not
  guessed) into every transaction list. Also migrated Customers/Items/
  Sales Orders/Purchase Orders off their old hand-rolled, click-dead,
  filter-less react-table code onto `DoctypeList` (~450 duplicated lines
  → a few lines of column config each). Separately did a visual pass
  requested as "Microsoft Dynamics + Linear + Notion + Apple" —
  refined `globals.css` tokens around the existing brand navy/blue
  anchors (didn't replace brand color), added `--sidebar-*`/`--success`/
  `--warning` tokens and a shadow-elevation scale, new theme-aware
  `Badge`/`Select` UI primitives, restyled Sidebar (active-item
  indicator bar)/Header (blur + pill user chip)/Card/Button. Verified:
  `tsc --noEmit` clean, full build succeeds, and the exact filter query
  `DoctypeList` sends was tested against the live API on tenant
  197349 (a `"like"` search for "Blue" on `Item.item_name` correctly
  returned "Blue Pen"). **Not verified visually** — no headless browser
  available on this box; a real look in a browser is still recommended
  before calling the redesign itself done, only the mechanics are
  confirmed.
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
- **Added 2026-09-14**: standard ERPNext list-view features that were
  entirely missing — requested as "kanban view, report view, per-column
  filters, bulk actions, import/export, print". All built into
  `DoctypeList` (`erp-frontend/src/components/dynamic/`) so they apply
  to every masters/transactions page at once: row selection + bulk
  delete/bulk-field-update toolbar (via Frappe's own
  `frappe.desk.reportview.delete_items` / `frappe.client.bulk_update`),
  per-column filters, CSV export/import (`lib/csv.ts`, `import-
  dialog.tsx` — import is flat-fields-only, no child tables), a List/
  Report/Kanban view toggle (`kanban-board.tsx`, opt-in via a
  `kanbanField` prop, wired into Leads/Opportunities/Sales Orders/
  Purchase Orders/Quotations), and Print (`print-panel.tsx` — an in-app
  preview around Frappe's own `frappe.utils.print_format.download_pdf`,
  deliberately **not** a from-scratch print-format reimplementation,
  since Frappe's print formats already encode the letterhead/tax-
  layout rules real accounting documents need). New `Dialog` UI
  primitive. Verified: clean `tsc`/build, and `bulk_update`/
  `delete_items` tested directly against the live API.
- **Fixed 2026-09-14**: reported as "item created is not visible in
  sales order" + "showing all columns of an item, enforce only
  required columns... in transactions screens". Two related
  `ChildTable` gaps: (1) it rendered every non-hidden field of the
  child doctype as a grid column — Sales Order Item has ~30 fields,
  real Frappe Desk's grid shows only the 6 marked `in_list_view`
  (item_code, delivery_date, qty, rate, amount, warehouse). Added
  `in_list_view` to `CompiledField`/`compileMeta` and restrict the
  compact grid to `in_list_view`-or-`reqd` fields (fallback to all if a
  doctype flags none), with a new per-row "More fields" detail dialog
  so nothing is actually inaccessible. (2) Picking an Item only set
  `item_code` — sibling fields (item_name/description/uom/rate/amount)
  stayed blank, which is almost certainly what read as "not visible."
  `ChildTable` now fetches the Item master on selection and populates
  matching row fields, recomputing amount as qty×rate — deliberately
  the Item master's own defaults, **not** ERPNext's full price-list/
  tax pricing engine (documented as a known simplification). Added
  `ItemPickerDialog` (Enter-key or search-icon triggered) for
  code/name/description + Item Group + Brand + variant-attribute
  search (a two-step lookup through `Item Variant Attribute`, since
  attribute values live in that child table, not on `Item` itself).
  `LinkField` gained a generic `onOpenPicker` hook (button + Enter) for
  this. **Verified end-to-end** by creating a real Sales Order
  (`SAL-ORD-2026-00001`) against tenant 197349 with a Blue Pen line
  using the exact field mapping `ChildTable` now produces — item_name/
  uom/rate/amount all correctly populated. That verification also
  surfaced the Price List provisioning gap fixed immediately below.
- **Fixed 2026-09-14**: `provisioning.py`'s `run_default_setup` created
  Company/Chart of Accounts/Warehouse/Cost Center but never a Price
  List, and never set Selling/Buying Settings' default price list
  (normally the Setup Wizard's job, skipped here). Every transaction
  doctype's `validate()` needs a price list to resolve a rate
  (`get_item_details` → `get_price_list_rate` →
  `validate_conversion_rate`), so **saving any Sales/Purchase Order,
  Quotation, or Invoice failed on every tenant provisioned before this
  fix** — found via tenant 197349 (zero Price List records). Now
  creates "Standard Selling"/"Standard Buying" Price Lists and sets
  them as the Selling/Buying Settings defaults, idempotently (verified
  by re-running against 197349 after manually creating the two price
  lists there: no duplicates, no errors). `get_default_setup_status`
  also reports a new `price_list` key for the admin "Manage" panel.
  **Not yet backfilled for any tenant other than 197349** — if more
  tenants exist by the time this is read, re-run `reconfigure_tenant_
  defaults` for each (idempotent, safe) to pick up the fix.
- **Fixed 2026-09-14**: reported as the Currency field dropdown "showing
  down" (not visible) on a long Sales Order form, and Item search in
  the transaction grid "doesn't filter". Same root cause in both:
  `LinkField`'s suggestion dropdown used `position: 'fixed'` together
  with `top: rect.bottom + window.scrollY` /
  `left: rect.left + window.scrollX`. `getBoundingClientRect()` is
  already viewport-relative, and so is `fixed` positioning — adding
  `window.scrollY`/`scrollX` double-counts the scroll offset, so on a
  form scrolled down any distance the dropdown rendered far below the
  visible viewport. The backend search itself was always correct
  (verified live — Item's `search_fields` includes `item_name`/
  `description`, and `search_link` matched "Blue Pen" on the substring
  "en"); the suggestions were just being rendered off-screen. Fixed by
  dropping the scroll-offset addition. Also added a targeted smart-
  defaults effect in `DynamicForm` (new records only) that fetches
  Global Defaults once and fills `company`/`currency`/
  `price_list_currency` (+ `selling_price_list`/`buying_price_list`
  from Selling/Buying Settings, and a 1:1 conversion rate) for whichever
  of those fields actually exist on the doctype and aren't already set
  — these were blank on every new transaction because they're not in
  the doctype's own field `default` metadata (Frappe Desk fills them
  via a client script this generic form doesn't run).
- **Fixed 2026-09-14**: reported as Rate not editable on a Sales Order
  line, and amounts showing "Rs" (INR) throughout despite BHD set as
  the company's default currency. (1) Sales Order Item's `rate` field
  is gated on `depends_on: eval: doc.type != ""` — `type` is never
  actually present on the row. Real JS: `undefined != ""` is `true`
  (undefined is never loosely equal to any string, even `""`), so real
  Frappe Desk always shows the field; `meta-compiler.ts`'s `evalAtom`
  coerced the absent field to `""` before comparing
  (`String(actualRaw ?? '')`), making `"" != ""` evaluate `false` —
  the opposite result, rendering Rate as a plain "—" instead of an
  editable input. Fixed to match real JS semantics (undefined/null
  never loosely-equals a concrete literal) — a general correctness
  fix, likely affecting other fields elsewhere gated the same way, not
  just this one. (2) `formatCurrency()` in `lib/utils.ts` hardcoded
  `currency = 'INR'` as its default, and **every** call site across
  the app relied on that default — none ever passed the tenant's real
  currency. Added `primeCurrency()` (fetches `Global Defaults` once,
  cached at module scope since `formatCurrency` is called from many
  non-hook contexts like react-table cell renderers), kicked off from
  the `(erp)/layout.tsx` mount effect; `formatCurrency`'s default now
  reads that cache. Also switched the hardcoded `'en-IN'` Intl locale
  (Indian lakh/crore grouping — wrong for a non-Indian tenant) to
  `'en-US'` for currency and date formatting.
- **Added 2026-09-14**: two `DoctypeList` UX fixes reported directly —
  (1) per-column filters existed (added earlier the same day) but were
  hidden behind a "Column filters" toggle button that wasn't
  discoverable; made the filter row always visible whenever any column
  supports it. (2) added a real "Columns" picker (button next to the
  List/Report/Kanban toggle) listing every field on the doctype not
  already in the page's curated set — checking one adds it as an extra
  column across List **and** Report view, CSV export, and Report-mode
  grouping sums, persisted per-doctype in `localStorage` (no backend
  concept of a saved list-view column set exists here, so this is
  browser-local, not synced across devices/users — worth a real
  backend-backed "saved views" feature later if that matters).
- **Added 2026-09-14**: three requested `DynamicForm` improvements.
  (1) **Quick-create**: `QuickCreateDialog` + `LinkField`'s new
  `allowCreate` (default true) — every Link field's dropdown now
  offers "+ Create new `<target>` '`<query>`'", asking only for the
  target doctype's own mandatory fields, generic across the whole app
  (Customer/Supplier/Item/any master), not hardcoded per doctype.
  (2) **Tabs**: `buildTabs` now promotes any *labeled* Section Break
  to its own tab (not just real Tab Break fields) — real ERPNext
  doctypes put almost everything into one giant first tab using named
  sections instead of real tabs; this generically splits Accounting
  Dimensions/Taxes/Currency and Price List/etc. into their own tabs
  for any doctype. This surfaced (and fixed) a real bug in
  `meta-compiler.ts`: `compileMeta`'s label fallback
  (`f.label || f.fieldname`) gave unlabeled Section Breaks a
  fieldname-junk "label" (e.g. `section_break_31`), which the new
  promotion logic then turned into junk-named tabs — fixed by only
  falling back to fieldname for fields that are actually rendered as
  labeled controls. Tabs with an unfilled required field now show a
  small destructive-colored dot. Verified against live Sales Order
  meta: 22 cleanly-labeled tabs, no fieldname junk. (3) **Right
  drawer**: `RecordDrawer` — Comments (real `Comment` doctype CRUD),
  Activity (`Version` doctype, best-effort diff summary), Connections.
  Connections deliberately does **not** use the doctype's own `links`
  meta array (sparse — Customer only lists "Party Specific Item") but
  `__dashboard` instead (server-built from each doctype's own
  `<doctype>_dashboard.py get_data()` — the actual source Frappe
  Desk's Connections tab uses, with grouped categories and correct
  per-doctype link fieldnames, e.g. Quotation uses `party_name` not
  `customer`) — verified live against Customer's dashboard data and a
  real linked-record count.
- **Added 2026-09-14**: (1) `RecordDrawer` is now always-visible for an
  existing record (a normal sticky flex column next to the form) rather
  than a click-to-open overlay — reported directly ("not on clicking").
  Still collapsible. (2) `DOCUMENT_MAPPERS`
  (`erp-frontend/src/lib/document-mappers.ts`) — ERPNext's "Create >"
  chaining actions (Quotation → Sales Order, Sales Order → Delivery
  Note/Sales Invoice, Purchase Order → Purchase Receipt/Purchase
  Invoice, Lead → Opportunity/Customer, etc.), surfaced as a "Create"
  dropdown in `DynamicForm`'s toolbar once the source doc is submitted.
  **This table is hand-maintained, not doctype-meta-driven** — real
  Frappe Desk determines available chaining actions from each doctype's
  own client script (`.js`), which isn't exposed over the REST API at
  all, so there's no generic way to discover this; each entry here was
  checked to exist/be whitelisted against this bench's ERPNext source,
  and `make_delivery_note` verified live end-to-end. A mapped (but
  unsaved) target doc from the backend gets handed to the target's New
  page via `lib/mapped-doc.ts` (sessionStorage, since a URL can't carry
  a full document payload and there's no backend "staged document"
  concept) — nothing is created until that New form is actually saved.
  If a future doctype needs this and isn't in the table, it needs a
  manually-added entry, not just a data change.

- **Fixed 2026-09-20**: print/PDF failed with HTTP 417 (`PDF generation
  failed because of broken image links`, wkhtmltopdf `ContentNotFoundError`)
  on every doctype — it can never have worked on this box. Cause: Frappe's
  `/assets` static serving (`SharedDataMiddleware`) only exists in the dev
  server (`bench start`); under production gunicorn (`:8001`) nothing serves
  `/assets` or `/files` — Frappe expects nginx to. wkhtmltopdf fetches the
  print stylesheet from `frappe.utils.get_url()`, which is `host_name` from
  site config (`http://197349.xentraerp.local:8001`), got a 404, and Frappe
  reports that as "broken image links". (Diagnosis trap: the 404 is also
  written to the `website_404` redis hash, and a hand-made `curl` can give
  inconsistent 200/404 depending on that cache and query string —
  reproduce with wkhtmltopdf directly, not curl.) **Fix**: new internal-only
  nginx listener `127.0.0.1:8002`
  (`sites-available/frappe-internal`) that serves `/assets` and per-site
  `/files` from disk and proxies everything else to gunicorn; tenant
  `197349.xentraerp.local`'s `host_name` set to `...:8002` (was `...:8001`;
  roll back with `bench --site <site> set-config host_name <old>`).
  Verified: PDF for `SAL-ORD-2026-00002` generates (valid `%PDF-`, 21 KB).
  **Every new tenant site needs the same `host_name` (`http://<site>:8002`)
  — `provisioning.py` does not set it yet, so new tenants will hit this
  again until it does.** `erp.badmintonbooking.com` / `demo.innovegicit.com`
  have no `host_name` set and were not changed.
- **Changed 2026-09-20**: `consolidateTabs` in `dynamic-form.tsx` had folded
  *every* non-table tab (Accounting Dimensions, Terms, Address, More Info,
  ...) into the Items tab. Now only the price sections — Currency and Price
  List, Additional Discount (and Coupon Code), Totals, matched by
  `PRICE_TAB_LABEL` — go into Items, so pricing reads on one page; all other
  folded tabs return to a trailing "More Details" tab. Not verified visually
  (no browser on this box).

- **Added 2026-09-20 — backend names hidden from public URLs.** Requested:
  nothing framework-branded visible when inspecting network traffic.
  `src/lib/method-alias.ts` maps public method names to the backend's in the
  `/api/method` and `/api/erp` proxies: `xentraerp.<x>` -> `frappe.<x>`,
  `xentraerp.erp.<x>` -> `erpnext.<x>`; every frontend method string was
  renamed (e.g. `/api/method/xentraerp.utils.print_format.download_pdf`).
  Legacy `frappe.*` names are still *accepted* by the proxy (a stale cached
  page keeps working) — they're just never emitted. Error responses (>= 400)
  through all three proxies are scrubbed: `exc` (traceback) dropped, and
  `frappe.`/`erpnext.` module paths in `exc_type`/`exception`/
  `_server_messages` aliased. Verified: shipped client bundles contain no
  `frappe.*`/`erpnext.*` method strings. **Not hidden**: the session cookie
  names (`sid`, `system_user`, ...) are Frappe's standard ones and are passed
  through as-is; `/api/resource/<DocType>` URLs necessarily contain ERPNext
  doctype names. If a new frontend call to a backend method is added, use the
  `xentraerp.` name (a bare `frappe.*` string would work but re-leaks it).
- **Added 2026-09-20 — print designer.** Requested: position/remove fields,
  global + custom header/footer, HTML-based printing. `PrintPanel` >
  Customize now opens `print-designer.tsx` beside the live preview. A layout
  (which header fields, side/order; item columns, order/label/align/width;
  total rows; header/footer; font size) is compiled by `lib/print-layout.ts`
  to the Jinja of a REAL Print Format (`custom_format: 1`), and the layout
  JSON is embedded in that html as a `{# xentra-layout:v1 ... #}` Jinja
  comment so the template can be reopened and edited. A Print Format without
  that marker (hand-written, or older) opens in the raw HTML editor;
  `standard: Yes` formats can't be edited in place, so they start a new
  template. **Global header/footer = Frappe Letter Head** (the `is_default`
  one applies to every print; `letter-head-dialog.tsx` manages them; the
  print toolbar picks default / a specific one / none via the PDF endpoint's
  `letterhead` / `no_letterhead` params). Frappe forces `source = Image` on
  Letter Head insert, so the dialog re-saves it as HTML after creating.
  Custom per-template header/footer is written into the template; a footer
  is wrapped in `<div id="footer-html" class="visible-pdf">` (that id is what
  Frappe lifts into the repeating PDF footer). Don't add the `page-break`
  class to the root div — it forces a blank trailing page. Verified on
  tenant 197349 by rendering real PDFs (field removal, reordering,
  custom header/footer on every page, chosen/none/default letter head) and
  the Letter Head create/update/default flow as `admin@jjc.com`. **The
  designer UI itself has not been exercised in a browser** (none on this box).
  Old `lib/print-template.ts` (fixed field-picker) was removed.

## POS app (deployed 2026-09-21) — Retail + F&B

**Live at `https://pos.xentraerp.net`** (DNS in the DigitalOcean zone, Let's Encrypt cert, nginx site
`pos.xentraerp.net` = `scripts/nginx-pos.xentraerp.net.conf`; static Vue build from
`/home/xentraerp/pos-frontend/dist`, `/api/*` proxied to the same Next.js process on `:8083`). Rebuild with
`cd pos-frontend && npm ci && npm run build` — no restart needed, nginx serves the new `dist` directly.

- **Backend code is live-linked**: `bench/apps/custom_erp/custom_erp` is a symlink into
  `/home/xentraerp/custom_erp_app`, so whatever is checked out there IS production. Never leave it on a
  half-merged/dirty branch. After Python changes: `supervisorctl restart innovegic-bench-web:innovegic-bench-frappe-web`;
  after DocType changes: `bench --site 197349.xentraerp.local migrate` (then `supervisorctl status`).
  New DocTypes only exist on sites that were migrated (tenant `197349`; `demo.innovegicit.com` doesn't have
  `custom_erp`; the control-plane site was not migrated — the POS Invoice validate hook would error there if a POS
  Invoice were ever saved).
- **Modules**: `custom_erp/api/pos.py` (PIN login, set_pin, profiles), `pos_core.py` (settings, business date,
  shifts, multi-currency checkout, reports), `pos_fnb.py` (tables, orders, KOT, split/merge/close bill).
  DocTypes: XentraERP POS PIN / POS Settings (Single) / POS Table / POS Order (+Item) / KOT (+Item) / POS Shift
  (+Cash) / POS Tender.
- **Mode**: `XentraERP POS Settings.pos_mode` = Retail | F&B, flipped by a System Manager (`set_pos_mode`, refuses to
  leave F&B while table orders are open). F&B methods refuse to run in Retail. Also: `require_shift`, `pos_247`,
  `previous_day_billing` + `previous_day_until` (sales after midnight until the cut-off post to the previous
  business day; a table keeps the business date it was opened on).
- **Checkout is server-side only** (`pos_core.post_invoice`): ERPNext refuses a POS Invoice with no payment row, so
  "create draft then attach payment" (the original retail `charge()`) could never work. Payments can be split across
  methods/currencies (rate from Currency Exchange only — never an online fetch); change only from cash; each leg is
  written to XentraERP POS Tender, which drives per-currency shift cash-up and the end-of-day report.
- **GOTCHA (bug found by live HTTP test, not by in-process tests)**: never use `frappe.set_user()` to elevate inside a
  request — it overwrites `session.sid` and wipes the form dict, which logged the cashier out after every bill.
  `pos_core._elevated()` swaps only `session.user`. ERPNext's `set_missing_values` checks the *session user's* read
  access to the Customer, which a cashier role lacks — hence the elevation, done after the cashier's own checks.
- **Stock items need stock**: ERPNext refuses to POS-sell a stock item with no stock in the register's warehouse
  ("not available under warehouse …"). The tenant's sample items (Blue Pen, Cola) are stock items with none.
- **Security**: PIN = 6-8 digits, HMAC-SHA256 keyed with the site encryption key; lockout is per client IP
  (8 wrong / 15 min) — this only works because the Next proxies forward nginx's `X-Real-IP` as `X-Forwarded-For`
  (Frappe trusts the first XFF entry, so never forward a client-supplied one). A PIN session carries that user's full
  roles across the API, so cashier users should hold a restricted role.
- **Module gate**: `common_site_config.json` has `control_plane_host = erp.badmintonbooking.com`; `pin_login` asks the
  control plane whether the tenant's `enabled_modules` includes `pos`. It fails OPEN (and logs) if the control plane is
  unreachable, by design. `pos` is in tenant 197349's list.
- **Checkout document (setting `checkout_document`)**: `POS Invoice` (default — one submitted POS Invoice, must be
  paid in full) or `Draft Invoice + Receipt` (F&B `close_bill` creates a *Draft Sales Invoice*; on payment it is
  submitted and one Payment Entry receipt per payment leg is created against it, non-cash legs first so change comes out
  of cash). ERPNext can only attach a receipt to a *submitted Sales Invoice*, never to a Draft or a POS Invoice — that is
  why the draft is submitted at completion. **Partial payment** (`allow_partial=1`, draft mode only): invoice is
  submitted, shows Partly Paid (due_date is +30 days so it doesn't flip to Overdue), the order becomes `Part Paid`
  (table stays occupied, items locked, can't be cancelled) and is finished by `bill_order` again / `settle_invoice`
  (retail) — `list_open_balances` is the pending list. Reopening a closed check discards its draft.
- **Locations** (`XentraERP POS Location`: code, cost centre, warehouse, registers): each location's invoices, POS
  invoices and receipts get their own naming series (`<CODE>-INV-.YYYY.-`, `-POS-`, `-RCT-`), added to the doctypes'
  `naming_series` options via Property Setter on first use (Frappe rejects a series that isn't an option). The
  location's cost centre/warehouse override the register's. Location is stamped on shift/order/KOT/tender; tables can
  belong to a location and each location has its own kitchen; the EOD report can filter/break down by location. A
  register belongs to at most one location; no locations = standard ERPNext numbering. Disabled location = fallback.
- **Staff & roles**: `POS Cashier` role (created on demand, READ-only on Item/Item Price/Item Group/POS Profile/Mode of
  Payment/Customer/Price List/Currency — what the POS screens read over REST; everything that writes goes through
  server methods). `create_pos_user` / `set_pin` (gives the role) / `set_pin_active` / `list_pos_users`, all
  System-Manager-only, surfaced in the POS app under Settings → Staff & PINs. Administrators' PINs don't get the role.
- **Gotchas found while building this**: `default` is a reserved SQL word (the original `list_pos_profiles`
  `order_by="default desc"` crashed as soon as a register existed — backtick it); a document whose owner is changed in
  the DB but not in memory can't be submitted ("Value cannot be changed for Created By"); ERPNext regenerates Payment
  Entry remarks unless `custom_remarks=1`; a POS-created invoice built under the elevated scope must be re-owned to the
  cashier (done) or reports attribute sales to Administrator.
- Not built: cash pay-in/pay-out/drops, cash-only float transfers between shifts, per-tender refunds UI, printing a KOT
  to a kitchen printer (KOTs show on the kitchen screen), customer-specific pricing rules at the POS.
- Tests: `scripts/pos-checks/` (see README there): `backend_suite.py` (183), `locations_receipts_suite.py` (91), `staff_suite.py` (28), all rolled back, plus `e2e_http.py` (64, over HTTPS; run `e2e_setup.py` first and `e2e_cleanup.py` after). The UI screens were type-checked and built, and every API they call
  is covered by the suites, but the Vue screens have not been driven in a browser (none on this box).

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
- **Found 2026-09-14: `npm run build` corrupts the live site if run while
  someone is actively using it.** `next build` overwrites `.next/` *in
  place*, but the currently-running `pm2` process (`xentraerp`) keeps
  reading from that same directory the whole time the build is in
  progress — there is no atomic swap. A user actively browsing during a
  rebuild hit a real, reproducible failure: a `500` on
  `/app/Sales%20Order/new`, then `net::ERR_CONNECTION_TIMED_OUT` on
  every subsequent page (dashboard, purchase-receipts, sales,
  favicon.ico, even direct `/api/resource/...` XHRs) — all from the
  browser's own console. Server-side, `xentraerp-error.log` shows the
  matching signature: `TypeError: Cannot read properties of undefined
  (reading 'entryCSSFiles')` / `(reading 'clientModules')` — the running
  process trying to read route-manifest data mid-overwrite. **This was
  transient**: re-checked minutes later (same session, no further
  changes) and every page the user listed returned a clean `200`, and
  the error-log entries had stopped growing — this resolves on its own
  once a build finishes and the following `pm2 restart` completes, it
  just means anyone browsing during that window gets a real, visible
  outage on this constrained 2 vCPU/4GB box (already showing memory
  pressure most of this session — `free -h` has repeatedly shown
  85-93% RAM used with 2+GB in swap even at idle, so a build's own
  CPU/memory draw hits an already-tight machine hard).

  **Safer rebuild procedure** (not yet adopted as the default — worth
  switching to before the next deploy if a real user might be on the
  site at the time): build to a fresh directory and swap it in with a
  rename instead of overwriting `.next` live —
  ```
  cd /home/xentraerp/erp-frontend
  mv .next .next-old-$(date +%s)   # old process keeps serving from the
                                    # renamed dir via its already-open fds
  npm run build                    # writes a completely fresh .next
  export PATH="/root/.nvm/versions/node/v18.20.8/bin:$PATH"
  pm2 restart xentraerp            # new process picks up the fresh .next
  rm -rf .next-old-*               # clean up once confirmed healthy
  ```
  This avoids the read/write collision entirely — the live process's
  already-open file descriptors keep working after the directory is
  renamed out from under them (standard Unix semantics), so it keeps
  serving correctly from the old build until the moment `pm2 restart`
  swaps it for the new one. Until this is adopted as the default, avoid
  rebuilding during hours the tenant admin might actually be testing, or
  give a heads-up before doing so.

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
| Dynamic doctype list/form/child-table rendering, `depends_on` support, list-row click-through to edit, list filtering (search + per-column + dropdown), bulk select/delete/update, CSV export/import, print (via Frappe's own PDF rendering), List/Report/Kanban view toggle, item picker with attribute search + auto-populate on transaction lines | Real, working (this session's fixes). |
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
