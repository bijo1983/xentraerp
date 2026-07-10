# XentraERP — Product Architecture & Implementation Blueprint

**A white-labelled, metadata-driven SaaS ERP frontend on a standard ERPNext / Frappe backend.**

> Audience: Product Managers, ERPNext Consultants, Backend & Frontend Developers, Database Architects, Integration Engineers, DevOps.
> Guiding principle: **The backend stays 100% standard ERPNext.** XentraERP never forks ERPNext business logic — it *reflects* ERPNext metadata and *drives* ERPNext APIs. This keeps every tenant upgrade-safe.

---

## 1. Executive Summary

XentraERP is a modern SaaS front-end that turns ERPNext into a branded, product-grade experience without duplicating ERPNext's engine. ERPNext already contains the accounting ledger, stock ledger, tax engine, workflow engine, permission engine, naming series, and country-specific masters. XentraERP's job is **presentation + orchestration**, not reimplementation.

The differentiator is that XentraERP is **metadata-driven**. Instead of hand-coding every form, XentraERP fetches each DocType's schema (`frappe.get_meta`) at runtime and renders forms, list views, child-table grids, workflow buttons, and permissions dynamically. When ERPNext adds a field or a tenant adds a Custom Field, it appears in XentraERP automatically — no redeploy.

Onboarding is automatic: an organization signs up → a tenant record is created → an ERPNext site/company is provisioned (or connected) → country-driven defaults (currency, Chart of Accounts, tax templates) are installed by ERPNext's own setup wizard APIs → XentraERP runs a **metadata sync** and **mapping engine** pass → the tenant's screens light up. A human never wires a field.

Why this matters commercially: one codebase serves every tenant and every ERPNext version; customization is data (mappings), not code; and white-label branding is per-tenant configuration.

---

## 2. Product Vision

XentraERP is a multi-tenant SaaS ERP UX layer with these non-negotiable properties:

- **Multi-tenant**: one XentraERP app instance serves many organizations, each bound to its own ERPNext site/company.
- **Organization-wise configuration**: branding, enabled modules, currency, country, fiscal year — all per tenant.
- **Automatic metadata sync**: DocType schemas, workflows, permissions, and naming series are pulled from ERPNext, not maintained by hand.
- **Dynamic rendering**: forms and lists are generated from metadata; the "field map" is data.
- **No hardcoded mapping where avoidable**: fieldname is the contract between backend and frontend.
- **ERPNext-standard compatibility**: XentraERP calls only public Frappe/ERPNext APIs; no core patches.
- **Upgrade-safe**: a mapping is versioned; an ERPNext upgrade triggers a re-sync + diff, not a rewrite.
- **White-label branding**: logo, palette, product name, email templates per tenant.
- **Role-aware**: dashboards, screens, and workflow actions respect ERPNext role permissions.

**Architectural stance:** XentraERP is a *thin, smart client*. The source of truth is always ERPNext. XentraERP caches metadata and mappings; it never becomes a second ledger.

---

## 3. SaaS Onboarding Workflow

Each stage lists Purpose, Backend action, Frontend action, Data required, ERPNext DocTypes, Automation logic, Validation, Failure handling.

### 3.1 Organization Signup
- **Purpose**: capture the new org and admin identity.
- **Backend**: create a `Tenant` row in XentraERP's control DB (status = `provisioning`).
- **Frontend**: signup form (org name, admin email, country, industry, plan).
- **Data**: org name, admin name/email, country, currency preference, plan.
- **ERPNext DocTypes**: none yet.
- **Automation**: generate tenant slug, verify email, create control-plane records.
- **Validation**: unique slug, valid email, allowed country.
- **Failure**: rollback tenant row; resend verification; show retryable error.

### 3.2 Tenant Creation
- **Purpose**: reserve isolation boundary.
- **Backend**: allocate tenant config (backend URL, DB schema/site name, encryption key slot).
- **Frontend**: "Setting up your workspace" progress screen (SSE/websocket driven).
- **Data**: tenant id, plan limits.
- **DocTypes**: none.
- **Automation**: pick provisioning strategy (site-per-tenant vs company-per-tenant — see §4).
- **Validation**: quota available on the target ERPNext cluster.
- **Failure**: queue for capacity; alert DevOps.

### 3.3 ERPNext Site Provisioning
- **Purpose**: give the tenant an ERPNext backend.
- **Backend**: `bench new-site <slug>.erp… --install-app erpnext` **or** bind to a shared site + new Company (multi-company model).
- **Frontend**: progress + ETA.
- **Data**: admin password, site config, region.
- **DocTypes**: created implicitly by ERPNext install.
- **Automation**: bench orchestration job (Nomad/K8s Job/Ansible); generate API key/secret for the service user.
- **Validation**: site reachable, `/api/method/ping` returns `pong`.
- **Failure**: destroy half-provisioned site; retry idempotently by slug.

### 3.4 Company Setup
- **Purpose**: create the legal entity; this drives currency + CoA + tax.
- **Backend**: call ERPNext setup wizard: `frappe.client.insert` on **Company**, or `erpnext.setup.setup_wizard.setup_wizard.setup_complete`.
- **Frontend**: company details form (name, abbr, country, default currency).
- **Data**: company name, abbreviation, country, currency, tax id.
- **DocTypes**: **Company**, **Global Defaults**.
- **Automation**: on Company insert, ERPNext auto-creates the country CoA, warehouses, and cost center.
- **Validation**: abbr unique; country valid; currency valid.
- **Failure**: surface ERPNext validation exception verbatim; allow edit + retry.

### 3.5 Fiscal Year Setup
- **Purpose**: define the posting calendar.
- **Backend**: insert/confirm **Fiscal Year**; set in **Accounts Settings**/**Global Defaults**.
- **Frontend**: date range picker (defaulted from country).
- **DocTypes**: **Fiscal Year**, **Accounts Settings**.
- **Automation**: default to country's standard FY; mark current.
- **Validation**: no overlap; start < end.
- **Failure**: block go-live until a valid current FY exists.

### 3.6 Chart of Accounts Setup
- **Purpose**: provide the ledger tree.
- **Backend**: ERPNext auto-installs the country CoA template on Company creation; optionally import a custom CoA.
- **Frontend**: read-only CoA tree preview; option to pick a template.
- **DocTypes**: **Account**, **Chart of Accounts** (template).
- **Automation**: `create_charts` runs inside Company hook.
- **Validation**: root types present (Asset/Liability/Income/Expense/Equity).
- **Failure**: fall back to standard template; log which template applied.

### 3.7 Currency Setup
- **Purpose**: base + allowed transaction currencies.
- **Backend**: set Company `default_currency`; enable **Currency** rows; seed **Currency Exchange**.
- **Frontend**: base currency (locked to Company) + multi-currency toggle.
- **DocTypes**: **Currency**, **Currency Exchange**.
- **Automation**: base currency from country; enable currency if disabled.
- **Validation**: exchange rate exists for non-base currencies at posting.
- **Failure**: warn on missing rate; allow manual entry.

### 3.8 Tax Setup
- **Purpose**: country-correct tax.
- **Backend**: install regional tax templates; create **Tax Category**, **Item Tax Template**, **Sales/Purchase Taxes and Charges Template**.
- **Frontend**: tax profile summary; default tax template selector.
- **DocTypes**: **Sales Taxes and Charges Template**, **Purchase Taxes and Charges Template**, **Item Tax Template**, **Tax Category**, **Tax Rule**.
- **Automation**: map country → tax template pack (VAT/GST/Sales Tax).
- **Validation**: at least one default sales + purchase tax template.
- **Failure**: allow zero-tax start; flag for review.

### 3.9 Warehouse Setup
- **Purpose**: stock locations.
- **Backend**: ERPNext seeds default warehouses; add tenant warehouses.
- **Frontend**: warehouse list + quick add.
- **DocTypes**: **Warehouse**.
- **Automation**: default "Stores/Finished Goods" per company abbr.
- **Validation**: at least one enabled warehouse.
- **Failure**: block stock transactions until present.

### 3.10 Role & User Setup
- **Purpose**: seed access.
- **Backend**: create admin **User**, assign **Role Profile**; create service user for API.
- **Frontend**: invite users, assign roles.
- **DocTypes**: **User**, **Role**, **Role Profile**, **Has Role**.
- **Automation**: default role profiles per module pack.
- **Validation**: exactly one System Manager (tenant admin).
- **Failure**: re-send invites; enforce min one admin.

### 3.11 Module Activation
- **Purpose**: enable only the modules the plan/tenant wants.
- **Backend**: store enabled modules in Tenant config; optionally toggle ERPNext **Module Onboarding**/domains.
- **Frontend**: module switches (Sales, Purchase, Accounts, CRM, Stock…).
- **DocTypes**: **Domain Settings**, **Module Def** (read).
- **Automation**: plan → default module set.
- **Validation**: dependencies (Sales needs Accounts).
- **Failure**: prevent disabling a dependency in use.

### 3.12 DocType Metadata Fetch
- **Purpose**: learn every enabled DocType's schema.
- **Backend (XentraERP service)**: call `frappe.desk.form.load.getdoctype` / `frappe.get_meta` per DocType; store snapshot.
- **Frontend**: none (background); progress %.
- **DocTypes**: all enabled + their child tables + linked DocTypes.
- **Automation**: BFS from module DocTypes → follow Link/Table fields.
- **Validation**: schema hash recorded; all mandatory link targets resolvable.
- **Failure**: retry per DocType; quarantine unreadable ones.

### 3.13 Field Mapping Engine Execution
- **Purpose**: turn metadata into a render schema (see §6, §16).
- **Backend**: run mapping pipeline; persist `Field Mapping` rows (versioned).
- **Frontend**: none.
- **Automation**: fieldname-first matching; auto-create frontend field defs for unmapped fields.
- **Validation**: every mandatory backend field has a frontend control.
- **Failure**: flag unmapped mandatory fields; block screen activation.

### 3.14 Frontend Form Generation
- **Purpose**: produce the render-ready form schema (sections/columns/tabs/grids).
- **Backend**: compile layout from `fieldtype` sequence (Section/Column/Tab breaks).
- **Frontend**: dynamic form renderer consumes schema.
- **Automation**: group fields by breaks; map fieldtype → component (§7).
- **Validation**: renderer smoke-test per DocType.
- **Failure**: fall back to a flat single-column layout.

### 3.15 Workflow Mapping
- **Purpose**: expose ERPNext workflows as buttons/state trackers.
- **Backend**: fetch **Workflow**, **Workflow State**, **Workflow Transition** for each DocType.
- **Frontend**: state tracker + transition buttons filtered by role.
- **DocTypes**: **Workflow**, **Workflow Action**, **Workflow State**, **Workflow Transition**.
- **Automation**: bind transitions to `next_state` + `allowed` role.
- **Validation**: every state reachable; submit/cancel handled.
- **Failure**: default to docstatus-based Save/Submit/Cancel if no workflow.

### 3.16 Permission Mapping
- **Purpose**: enforce ERPNext permissions in the UI.
- **Backend**: fetch effective perms (`frappe.permissions.get_doc_permissions` / `has_permission`) per role/DocType.
- **Frontend**: hide/disable per read/write/create/submit/cancel/amend.
- **DocTypes**: **DocPerm**, **Custom DocPerm**, **User Permission**.
- **Automation**: compute per-tenant, per-role permission matrix.
- **Validation**: never render a create button the role lacks.
- **Failure**: fail closed (hide) on ambiguity.

### 3.17 Dashboard Setup
- **Purpose**: seed KPIs.
- **Backend**: fetch **Dashboard**, **Dashboard Chart**, **Number Card**; or map to XentraERP widget defs.
- **Frontend**: render module dashboards (§24).
- **DocTypes**: **Dashboard**, **Dashboard Chart**, **Number Card**.
- **Automation**: default widget pack per module.
- **Validation**: charts return data (or show empty-state).
- **Failure**: hide broken widget, log.

### 3.18 Initial Master Data Import
- **Purpose**: load starter masters.
- **Backend**: bulk insert via **Data Import** or batched `frappe.client.insert`.
- **Frontend**: CSV/XLSX upload wizard with column-map preview.
- **DocTypes**: Item, Customer, Supplier, Price List, etc. (§12).
- **Automation**: dedupe on naming/keys; validate links.
- **Validation**: row-level error report.
- **Failure**: partial-commit with downloadable error file.

### 3.19 Validation
- **Purpose**: pre-go-live health check.
- **Backend**: run checks (FY, currency, warehouse, tax, one admin, mappings complete).
- **Frontend**: readiness checklist with pass/fail.
- **Automation**: block go-live until green.
- **Failure**: link each fail to its fix screen.

### 3.20 Go-Live Readiness
- **Purpose**: flip tenant to `active`.
- **Backend**: set Tenant status; enable production API rate limits; start webhook subscriptions.
- **Frontend**: welcome dashboard.
- **Automation**: schedule first incremental sync.
- **Failure**: keep in `staging` if any check regresses.

---

## 4. ERPNext Backend Integration Architecture

**Tenancy model (choose per plan):**
- **Site-per-tenant** (strong isolation): each org gets its own Frappe site + DB. Best for enterprise/compliance.
- **Company-per-tenant on a shared site** (density): one site, many Companies, isolation via User Permissions + company scoping. Best for SMB volume.
XentraERP's control plane stores which model + backend URL each tenant uses.

**Layers:**
- **API Gateway** — single ingress; per-tenant routing by subdomain/JWT claim; rate limiting; WAF.
- **Auth**: XentraERP session (JWT) ↔ ERPNext. Prefer **token auth** (`Authorization: token <api_key>:<api_secret>`) for the per-tenant *service user*; use **OAuth2** (Frappe OAuth) for end-user delegated calls when you need true per-user attribution. Store keys in a secrets manager (Vault/KMS), encrypted at rest, one key set per tenant.
- **Middleware / BFF** — the current `/api/erp/[...path]` proxy grows into a tenant-aware BFF: injects the correct backend URL + credentials, strips secrets from the client, normalizes errors.
- **Metadata Sync Service** — pulls DocType meta, workflows, perms; writes to the mapping repo + cache.
- **Field Mapping Service** — runs the mapping pipeline (§16); versioned output.
- **Master Data Sync Service** — pull/refresh masters; dedupe.
- **Transaction Sync Service** — for read models/reporting mirrors (optional; keep ERPNext authoritative).
- **Error Logging + Audit Trail Service** — every backend call logged with tenant, user, DocType, latency, result; immutable audit for compliance.
- **Queue / Scheduler** — background jobs (BullMQ/Celery/RQ) for sync, imports, webhook processing, retries with backoff.
- **Webhook Listener** — subscribes to ERPNext **Webhook** doctype events (on insert/update/submit/cancel) for near-real-time cache invalidation.
- **Caching Layer** — Redis: DocType meta keyed by `tenant:doctype:schema_hash`; permission matrix; link-field option lists (short TTL). Metadata is cache-heavy, invalidated by webhook or version bump.

**Communication rules:** all traffic server-to-server over TLS; the browser never holds ERPNext credentials; every request carries tenant context; idempotency keys on writes.

---

## 5. DocType Discovery & Metadata Fetching Engine

**Primary API:** `GET/POST /api/method/frappe.desk.form.load.getdoctype?doctype=<DT>` returns the DocType + its meta (docfields, links, permissions, and related metadata). Complement with `frappe.client.get_list("DocField", filters=…)`, `frappe.get_meta`, and `frappe.desk.form.load.getdoc` for defaults.

**Fields captured per DocType field:** `fieldname`, `label`, `fieldtype`, `options` (Link target / Select options / Table child DocType), `reqd`, `read_only`, `hidden`, `default`, `depends_on`, `mandatory_depends_on`, `read_only_depends_on`, `in_list_view`, `in_standard_filter`, `precision`, `fetch_from`, `fetch_if_empty`, `permlevel`.

**Captured per DocType:** `module`, `istable` (child?), `issingle` (settings?), `is_submittable`, `autoname`/naming series, `title_field`, `search_fields`, `sort_field`/`sort_order`, `track_changes`, permitted roles (DocPerm), workflow (if any), print formats, list/report view config, and child-table structures (recursively fetched).

**Discovery algorithm:** start from enabled modules → list their DocTypes (`Module Def` → DocTypes) → for each, fetch meta → enqueue every `Link` target and `Table` child DocType → dedupe by name → stop when closure complete. Store a **schema snapshot** with a content hash so re-syncs are diffable.

**Consumption by frontend:** the snapshot is compiled into a **render schema** (see §7) delivered to the dynamic form/list renderer. The frontend never hardcodes fields — it iterates the schema.

---

## 6. Dynamic Field Mapping Engine

**Contract:** `fieldname` is the stable key. XentraERP maps ERPNext `fieldname` → a frontend field descriptor. Label/type are secondary signals for humanized display and component choice.

**Matching strategy (in priority order):**
1. **By fieldname** (exact) — the default, upgrade-stable path.
2. **By label** — fallback for renamed/custom fields; fuzzy + synonym dictionary.
3. **By fieldtype** — decides the component (see §7).
4. **By DocType / module / business function** — namespacing so the same fieldname in different DocTypes maps independently.
5. **By child table** — child DocType fields map into grid columns.
6. **By linked DocType** — Link fields become searchable async selects bound to the target DocType.
7. **By naming series** — `naming_series` renders a series picker.
8. **By required / validation rules** — `reqd`, `mandatory_depends_on`, `precision` → client validators.
9. **By frontend component type** — resolved component id stored in mapping.
10. **By workflow stage** — field editability per state.
11. **By user role** — permlevel + role visibility.
12. **By tenant configuration** — per-tenant overrides (hide, relabel, reorder) layered on top without touching core.

**Output:** versioned `Field Mapping` rows (§17). Unmapped fields auto-generate a default descriptor so nothing is dropped.

**Mapping examples (representative fieldnames):**

- **Sales — Sales Order**: `customer` (Link→Customer), `transaction_date` (Date), `delivery_date` (Date), `currency` (Link→Currency), `items` (Table→Sales Order Item: `item_code`, `qty`, `rate`, `amount`, `delivery_date`), `taxes` (Table→Sales Taxes and Charges), `grand_total` (Currency, read-only computed), `status`/workflow_state.
- **Sales — Quotation**: `quotation_to` (Select: Customer/Lead), `party_name` (Dynamic Link), `valid_till` (Date), `items`, `taxes`.
- **Sales — Sales Invoice**: `customer`, `posting_date`, `due_date`, `items`, `taxes`, `payment_schedule` (Table), `outstanding_amount` (read-only).
- **Sales — Lead / Opportunity**: `lead_name`/`company_name`, `status`, `source`, `opportunity_from`, `expected_closing`, `probability`.
- **Purchase — Purchase Order**: `supplier` (Link→Supplier), `schedule_date`, `items` (Purchase Order Item), `taxes` (Purchase Taxes and Charges).
- **Purchase — Material Request**: `material_request_type` (Select), `items` (with `schedule_date`, `warehouse`).
- **Purchase — Purchase Invoice / Receipt**: `supplier`, `posting_date`, `items`, `taxes`, `bill_no`/`bill_date`.
- **Accounts — Journal Entry**: `voucher_type` (Select), `posting_date`, `accounts` (Table→Journal Entry Account: `account`, `debit_in_account_currency`, `credit_in_account_currency`, `party_type`, `party`, `cost_center`).
- **Accounts — Payment Entry**: `payment_type` (Receive/Pay/Internal), `party_type`, `party`, `paid_amount`, `references` (Table), `mode_of_payment`.
- **Accounts — Account / Cost Center / Fiscal Year / Tax Template**: tree + settings forms.
- **CRM — Contact/Address/Communication/ToDo/Event**: `email_id`, `phone`, `address_line1`, `reference_doctype`+`reference_name` (Dynamic Link), `status`, `date`.
- **Master Data — Item**: `item_code`, `item_name`, `item_group` (Link), `stock_uom` (Link→UOM), `standard_rate` (Currency), `is_sales_item`/`is_purchase_item` (Check), `item_defaults` (Table). Plus **Item Group/UOM/Warehouse/Price List/Item Price/Customer Group/Supplier Group/Territory/Sales Person/Tax Category/Terms and Conditions**.
- **Settings (Single DocTypes)**: **System/Selling/Buying/Accounts/Stock Settings**, **Naming Series**, **Workflow**, **Role Permission Manager** (rendered via DocPerm), **Print/Email/Notification Settings** — all `issingle=1`, rendered as settings pages.

---

## 7. Frontend Dynamic Form Generation

**Component map (ERPNext `fieldtype` → XentraERP control):**

| Fieldtype | Component |
|---|---|
| Data / Small Text | Text input |
| Int / Float | Number input (with precision) |
| Currency | Currency input (symbol from field/company currency) |
| Percent | Number input with % adornment |
| Date | Date picker |
| Datetime / Time | DateTime / Time picker |
| Select | Native/searchable select from `options` |
| Link | Async searchable combobox → target DocType |
| Dynamic Link | Combobox whose target is another field's value |
| Check | Checkbox/switch |
| Text / Small Text / Long Text | Textarea |
| Text Editor / HTML Editor | Rich text editor |
| Attach / Attach Image | File upload (Frappe file API) |
| Table / Table MultiSelect | Child-table grid / multi-select chips |
| Code / JSON | Code editor |
| Section Break | Section container |
| Column Break | Column split within a section |
| Tab Break | Tab |
| Read Only | Rendered disabled |
| Password | Masked input |

**Layout engine:** iterate fields in order; `Tab Break` opens a tab, `Section Break` a section (with optional collapsible + label), `Column Break` splits the current section into columns. This reproduces ERPNext's form layout faithfully.

**Behaviors:**
- **Child tables**: inline editable grid; add/remove rows; per-column component from child DocType meta; column totals; row-level `fetch_from` (e.g., item rate) resolved on item select.
- **Linked DocType search**: async combobox calls `frappe.client.get_list` (or `search_link`) with `search` + filters; paginated; shows `title_field`.
- **Dependent dropdowns**: evaluate `depends_on` / `mandatory_depends_on` / `read_only_depends_on` (Frappe `eval:` expressions) against the live form model to show/require/lock fields; Dynamic Links re-target on parent change.
- **Validation**: `reqd` → required; `mandatory_depends_on` → conditional required; type + precision validators; server errors surfaced inline from ERPNext response.
- **Role-based visibility**: fields above a user's permlevel are hidden/locked; create/submit buttons gated by the permission matrix.
- **Stage-wise field lock**: on submittable/workflow docs, `docstatus`/workflow_state determines which fields are editable (e.g., locked after Submit).
- **Action buttons**: Save (insert/update), Submit, Cancel, Amend (from cancelled), plus workflow transition buttons; Print/Download (server-rendered print format → PDF); role-filtered.

---

## 8. Standard ERPNext Sales Module Mapping

For each flow: **DocTypes → XentraERP screen → key fields → child tables → workflow → validation → API → permissions → reports.**

- **Lead → Opportunity**: Lead, Opportunity → CRM pipeline screens → `status`, `source`, `opportunity_from` → — → workflow states (Open→Qualified/Converted) → dup email check → `insert`/`apply_workflow` → CRM roles → Lead Funnel.
- **Opportunity → Quotation**: Opportunity, Quotation → Quotation builder → `party_name`, `items`, `valid_till` → `items`, `taxes` → Draft→Submitted → item/price present → `insert`+`submit` → Sales User → Quotation Trends.
- **Quotation → Sales Order**: get_mapped_doc via `make_sales_order` → SO screen → `customer`, `delivery_date` → `items`, `taxes` → Draft→To Deliver and Bill → credit limit + stock → `insert`+`submit` → Sales User/Manager → Sales Order Analysis.
- **Sales Order → Delivery Note**: `make_delivery_note` → DN screen → `items` with warehouse → stock ledger impact → per-item qty ≤ ordered → submit → Stock User → Delivery pending.
- **SO/DN → Sales Invoice**: `make_sales_invoice` → SI screen → `posting_date`, `due_date`, `payment_schedule` → GL + AR impact → billed qty ≤ delivered → submit → Accounts User → AR aging.
- **Sales Invoice → Payment Entry**: `get_payment_entry` → Payment screen → `paid_amount`, `references` → GL impact → allocation ≤ outstanding → submit → Accounts User → Collections.
- **Cross-cutting**: **credit limit** (Customer/Company setting, block/warn on submit), **pricing rules** (`Pricing Rule` auto-applied server-side; XentraERP shows resulting rate), **taxes** (templates → `taxes` grid, computed by ERPNext), **sales team commission** (`sales_team` child), **payment terms** (`payment_schedule`), **advance payment** (Payment Entry against order), **outstanding tracking** (`outstanding_amount`), **returns/credit note** (`is_return` Sales Invoice / Delivery Note return).
- **Reports**: Sales Order Analysis, Sales Register, Item-wise Sales, AR Summary/Aging, Customer Ledger.

---

## 9. Standard ERPNext Purchase Module Mapping

- **Material Request**: Material Request → MR screen → `material_request_type`, `items(schedule_date, warehouse)` → Draft→Submitted/Ordered → qty>0 → submit → Purchase User → Requested Items to Order.
- **Supplier Quotation**: from MR via `make_supplier_quotation` → `items`, `taxes` → compare screen → validate supplier → submit → Purchase User → Supplier Quotation comparison.
- **Purchase Order**: `make_purchase_order` → PO screen → `supplier`, `schedule_date`, `items`, `taxes` → Draft→To Receive and Bill → budget/approval → submit → Purchase Manager → Purchase Order Analysis.
- **Purchase Receipt**: `make_purchase_receipt` → PR screen → `items` (accepted/rejected qty, warehouse) → stock + (landed cost) impact → qty ≤ ordered → submit → Stock User → Received Items to Bill.
- **Purchase Invoice**: `make_purchase_invoice` → PI screen → `bill_no`, `bill_date`, `posting_date`, `items`, `taxes` → GL + AP impact → billed ≤ received → submit → Accounts User → AP aging.
- **Payment Entry**: `get_payment_entry` → Payment screen → `party`, `paid_amount`, `references` → GL impact → allocation ≤ outstanding → submit → Accounts User → Payments Made.
- **Cross-cutting**: supplier master + supplier pricing (`Item Price` buying), tax handling (Purchase Taxes templates), **landed cost** (`Landed Cost Voucher`), **purchase returns / debit note** (`is_return`), **approval workflow** (Workflow on PO/PI), **budget validation** (`Budget` + Accounts Settings action: Stop/Warn/Ignore).
- **Reports**: Purchase Register, Purchase Order Analysis, Item-wise Purchase, AP Summary/Aging, Supplier Ledger.

---

## 10. Standard ERPNext Accounts Module Mapping

**Setup surfaces**: Company (default accounts), Fiscal Year, Chart of Accounts (Account tree), Cost Centers (tree), Bank Account, Payment Terms Template, Tax templates.

**Transactions**: Journal Entry, Payment Entry, Sales Invoice, Purchase Invoice — all producing **GL Entry** (read-only ledger XentraERP surfaces but never writes directly).

**Reports (via ERPNext report APIs)**: Trial Balance, Profit & Loss, Balance Sheet, Cash Flow, General Ledger, Accounts Receivable/Payable (+ aging), Sales/Purchase Register, and **country tax reports** (e.g., GSTR/VAT return) — pulled through `frappe.desk.query_report.run` and rendered in XentraERP's report view.

**How XentraERP handles:**
- **Account setup / default accounts**: read Company defaults (receivable, payable, round-off, exchange gain/loss); expose in a settings screen.
- **Receivable/Payable accounts**: auto-selected by party type; shown read-only on invoices.
- **Tax accounts / cost center**: from templates + Company default cost center.
- **Currency & exchange rate**: base = Company currency; transaction currency per doc; `conversion_rate` fetched from Currency Exchange (editable with permission).
- **Posting date & fiscal year validation**: enforced by ERPNext; XentraERP shows the error (e.g., "posting date outside fiscal year").
- **GL impact visibility**: a "Ledger" tab on each submitted voucher calling the GL Entry list for that voucher.
- **Financial dashboards**: P&L trend, cash position, AR/AP aging, top debtors/creditors (§24).

**Rule:** XentraERP **never posts GL directly** — it always goes through a submittable ERPNext voucher so the ledger stays correct and auditable.

---

## 11. Standard ERPNext CRM Module Mapping

- **Lead capture**: Lead → capture form / web-to-lead → `lead_name`, `email_id`, `source`, `status` → notifications on assignment → Lead reports.
- **Lead qualification**: Lead `status` (Open→Replied→Opportunity) → workflow → SLA on first response.
- **Opportunity creation**: Opportunity → `opportunity_from`, `expected_closing`, `probability`, `opportunity_amount` → stage workflow → pipeline widget.
- **Follow-up management**: ToDo/Event/Communication linked via Dynamic Link → activity timeline.
- **Customer conversion**: Opportunity → Customer (`make_customer`) → dedupe on name/tax id.
- **Communication history / email logs**: **Communication** list filtered by `reference_doctype`+`reference_name`; email via Frappe Email.
- **Tasks / Events**: ToDo, Event calendar view.
- **Sales pipeline / stages / forecasting**: Opportunity by stage (Kanban), weighted forecast = amount × probability.
- **Lost reason tracking**: `Opportunity Lost Reason` / `Quotation Lost Reason` on close.
- **Dashboards**: funnel, win/loss, pipeline value by stage, activities due.

---

## 12. Master Data Mapping

**Masters**: Customer, Supplier, Item, Item Group, UOM, Warehouse, Price List, Item Price, Territory, Customer Group, Supplier Group, Tax Category, Payment Terms, Terms and Conditions, Contact, Address, Sales Person, Account, Cost Center.

- **Created during onboarding (auto)**: Company-derived — Account (CoA), Cost Center, Warehouse, default Price Lists, base Currency, standard Item/Customer/Supplier Groups, Territory "All Territories", UOMs.
- **Imported**: Item, Customer, Supplier, Item Price, Contacts/Addresses — via Data Import wizard.
- **Tenant-specific**: everything above is scoped to the tenant's site/company; nothing is shared across tenants by default.
- **Globally reusable (platform templates)**: CoA templates, tax template packs, UOM base list, country masters — maintained by the platform team as seed data, copied into each tenant (never live-shared).
- **Require approval**: Customer/Supplier onboarding (workflow), new Item (optional), Price List changes (optional) — governed by Workflow.
- **Duplicate detection**: on `naming` key + business keys (email/tax id for parties, `item_code` for items); fuzzy warn on names; block on exact key clash.
- **Inactive records**: use ERPNext `disabled`/`is_active`/`end_of_life` flags; XentraERP filters them from pickers but keeps them for historical docs.

---

## 13. ERPNext Settings Mapping

Fetch Single DocTypes (`issingle=1`) and render as settings pages: System, Company, Selling, Buying, Accounts, Stock, CRM, Email, Print, Workflow, Role Permission, Naming Series, Notification.

- **Visible to tenant admin**: Selling, Buying, Accounts (non-destructive), Stock, CRM, Print, Notification, Naming Series (view), Company details.
- **Restricted to platform super admin**: System Settings (security, backups), site/bench config, API keys, outbound email server credentials, provisioning limits.
- **Auto-configured**: currency, CoA, tax, fiscal year, default accounts, warehouses (from onboarding).
- **Editable from XentraERP**: tenant-level business toggles (allow negative stock, default price list, credit-limit behavior, email notifications) — gated by permission.
- **Backend-only**: encryption keys, scheduler config, DB, background workers, anything security-sensitive.

Principle: expose *business* settings; hide *infrastructure* settings.

---

## 14. Permission & Role Mapping

**Source of truth = ERPNext permissions.** XentraERP mirrors, never invents.

- **ERPNext roles → XentraERP roles**: 1:1; XentraERP UI roles are labels over ERPNext Roles/Role Profiles.
- **Role Permission Manager mapping**: read DocPerm/Custom DocPerm to build a matrix of {role × doctype × permlevel} → {read, write, create, submit, cancel, amend, delete, report, export}.
- **Module-level**: hide whole modules a role can't access.
- **DocType-level**: hide list/create for no-permission DocTypes.
- **Field-level**: enforce `permlevel` (hide/lock fields above the role's level).
- **Record-level**: apply **User Permission** (e.g., restrict to a Company/Territory/Warehouse) — passed through as filters.
- **Company/branch/department-wise**: via User Permission on Company/Cost Center/Department.
- **Approval / submit / cancel / amend perms**: from DocPerm flags + workflow `allowed` roles.
- **Report / dashboard perms**: from Report/Dashboard role restrictions.

**Application**: XentraERP computes the matrix at login (cached, invalidated on permission webhook) and the renderer consults it for every screen, field, and button. **Fail closed.** ERPNext still re-checks server-side — the UI gate is UX, not the security boundary.

---

## 15. Workflow & Approval Mapping

Fetch **Workflow** (+ States, Transitions, Actions) per DocType. Render:
- **State tracker**: horizontal stepper of workflow states with the current one highlighted.
- **Allowed transitions**: buttons for transitions whose `allowed` role the user holds and whose `condition` passes.
- **Actions**: Approve / Reject / Rework / Submit / Cancel / Amend mapped to transitions or docstatus ops.
- **Remarks capture**: comment box on transition (stored via `add_comment` / workflow remark).
- **History / timeline**: Version + Comment + Workflow Action list on a Timeline tab.
- **SLA / escalation**: optional layer using Assignment Rule / ToDo due dates + notifications.

**Execution API**: `POST /api/method/frappe.model.workflow.apply_workflow { doc, action }`.

**Examples** (state → action → next, role):
- **Sales Order approval**: Draft → *Submit for Approval* → Pending (Sales User); Pending → *Approve* → Approved (Sales Manager) / *Reject* → Rejected.
- **Purchase Order approval**: Draft → Pending → *Approve* (Purchase Manager, condition `grand_total > threshold`) → Approved.
- **Purchase Invoice approval**: Draft → Pending Finance → *Approve* (Accounts Manager) → Approved → auto-Submit (GL posts).
- **Payment Entry approval**: Draft → Pending → *Approve* (Finance Head, condition on amount) → Approved.
- **Customer / Supplier onboarding**: Draft → Review → *Approve* (Sales/Purchase Manager) → Active, with KYC fields required at Review.

If a DocType has **no** workflow, fall back to docstatus buttons (Save → Submit → Cancel → Amend) filtered by permission.

---

## 16. Auto-Mapping Logic (Detailed Pipeline)

1. **Fetch DocType metadata** (`getdoctype`) + child/link closure.
2. **Identify module** from meta.
3. **Identify business process** via a module→process rulebook (e.g., Selling→quote-to-cash).
4. **Identify parent + child DocTypes** from `Table` fields.
5. **Fetch field definitions** (DocField/Custom Field).
6. **Classify fields by type** into the component taxonomy (§7).
7. **Match standard fields → XentraERP fields** by fieldname (then label, then type).
8. **Create missing frontend field defs** for unmapped/custom fields (auto-descriptor).
9. **Apply validation rules** (`reqd`, precision, regex/options).
10. **Apply mandatory rules** including `mandatory_depends_on`.
11. **Apply dependent field logic** (`depends_on`, `read_only_depends_on`, Dynamic Link targeting).
12. **Apply role permissions** (permlevel + DocPerm matrix).
13. **Apply workflow states** (editability + transition buttons).
14. **Generate frontend form schema** (tabs/sections/columns + controls + grids).
15. **Save tenant-specific mapping** (versioned; tenant overrides layered).
16. **Test CRUD/Submit** against a sandbox record (dry-run insert/get/update/cancel).
17. **Validate API response** shape/permissions.
18. **Activate mapped screen** (flip status = active; publish to renderer).

The pipeline is **idempotent** and **diff-based**: re-running on an unchanged schema is a no-op; on a changed schema it produces a migration diff (§19).

---

## 17. Field Mapping Repository (Control-Plane Schema)

Central store (XentraERP DB, not ERPNext). Core entities:

- **Tenant** — the org. Keys: `tenant_id`, slug, status, plan, branding, enabled_modules. Root of all scoping.
- **ERPNext Site** — backend binding. Keys: `site_id`, `tenant_id`, base_url, tenancy_model, credential_ref. → belongs to Tenant.
- **ERPNext Module** — module catalog. Keys: `module`, label, enabled. Groups DocTypes.
- **ERPNext DocType** — schema snapshot. Keys: `doctype`, `tenant_id`, module, is_submittable, is_single, is_table, schema_hash, naming, title_field. Versioned.
- **ERPNext Field** — field snapshot. Keys: `id`, doctype, fieldname, label, fieldtype, options, reqd, read_only, hidden, depends_on, permlevel. Child of DocType.
- **XentraERP Module / Screen / Field** — the frontend catalog: module → screens → fields (component id, layout position, group).
- **Field Mapping** — the join. Keys: `id`, tenant_id, erp_field_id, xentra_field_id, match_method, component, validators, overrides, version, status. **The heart of the system.**
- **Child Table Mapping** — parent field ↔ child DocType ↔ column set.
- **Link Field Mapping** — link field ↔ target DocType ↔ search/display config.
- **Workflow Mapping** — doctype ↔ states/transitions ↔ role→action buttons.
- **Permission Mapping** — {tenant, role, doctype, permlevel} → rights matrix.
- **Validation Rule** — reusable rule defs referenced by mappings.
- **API Endpoint Mapping** — logical op (create/submit/report) → concrete ERPNext endpoint + params.
- **Sync Log** — every sync run: scope, started/finished, counts, result.
- **Error Log** — failures with tenant, endpoint, payload hash, error, retry state.
- **Mapping Version** — immutable version records enabling rollback + upgrade diffs.

Relationships: Tenant 1—* Site; DocType 1—* Field; Field 1—1 Field Mapping (per version); DocType 1—* Workflow/Permission Mapping; every row scoped by `tenant_id`.

---

## 18. Handling ERPNext Custom Fields

- **Detect**: include **Custom Field** and **Property Setter** in metadata fetch (they appear in `get_meta` output automatically).
- **Fetch metadata**: same field attributes as standard fields; flag `is_custom_field = 1`.
- **Display dynamically**: because rendering is metadata-driven, custom fields render with zero code — placed by their `insert_after` anchor.
- **Mark tenant-specific**: store with `tenant_id` + `custom` flag; excluded from platform templates.
- **Include in create/update**: custom fieldnames flow through the same payload builder.
- **Permissions / validation**: apply permlevel + reqd like any field.
- **Deleted custom fields**: re-sync detects removal → mark mapping `retired`, hide control, keep historical values.
- **Changed field types**: schema_hash changes → migration diff → re-pick component; warn if data-incompatible.
- **New mandatory custom fields**: flagged in the diff; block screen activation until mapped + defaulted to avoid save failures.

---

## 19. Handling ERPNext Version Updates

- **Trigger**: on ERPNext upgrade (or schema_hash change via webhook/scheduled re-sync), run metadata sync.
- **Diff engine** compares new snapshot vs current Mapping Version: classify each field as **added / removed / renamed / retyped**.
  - *New standard field*: auto-map (fieldname), add to schema, non-breaking.
  - *Removed field*: retire mapping, hide, preserve history.
  - *Renamed field*: detect via label+type heuristic; propose remap for confirmation.
  - *Changed type*: re-resolve component; flag if data migration implied.
  - *Deprecated DocType*: mark screen deprecated; keep read-only access to old records.
  - *New DocType*: optionally surface if module enabled.
  - *Modified workflows/permissions*: re-fetch + re-apply matrices.
- **Patch migration**: create a new **Mapping Version**; keep the old active until validated.
- **Version control**: every mapping is versioned; rollback = repoint tenant to prior version.
- **Regression testing**: automated CRUD/submit smoke tests per critical DocType against a staging tenant before promoting.
- **Tenant-wise compatibility**: stagger rollout; per-tenant health gate; block go-live of a version that fails a tenant's smoke tests.

**Golden rule:** upgrades change *data* (new mapping version), never require *frontend code* changes for standard fields.

---

## 20. API Design (XentraERP BFF ↔ ERPNext)

All calls are server-to-server, tenant-scoped, token/OAuth authenticated, TLS-only, with structured error envelope `{ ok, data, error_code, message, exceptions[] }`.

| Logical API | ERPNext endpoint | Purpose / params | Auth |
|---|---|---|---|
| Fetch DocTypes | `frappe.client.get_list` on DocType | list enabled DocTypes (module filter) | service token |
| Fetch DocType metadata | `frappe.desk.form.load.getdoctype` | full meta for `doctype` | service token |
| Fetch fields | `getdoctype` / `get_list` DocField | field defs | service token |
| Fetch records | `GET /api/resource/{dt}` or `frappe.client.get_list` | fields, filters, order_by, limit_start, limit_page_length | user/OAuth |
| Fetch one record | `frappe.desk.form.load.getdoc` / `GET /api/resource/{dt}/{name}` | full doc + defaults | user |
| Create record | `POST /api/resource/{dt}` / `frappe.client.insert` | doc payload; idempotency key | user |
| Update record | `PUT /api/resource/{dt}/{name}` | changed fields; version check | user |
| Submit | `frappe.client.submit` | `{doc}` (docstatus 0→1) | user (submit perm) |
| Cancel | `frappe.client.cancel` | `{doctype, name}` (1→2) | user (cancel perm) |
| Amend | `amend_doc` / insert with `amended_from` | new draft from cancelled | user |
| Delete | `DELETE /api/resource/{dt}/{name}` | if permitted | user (delete perm) |
| Fetch linked records | `frappe.client.get_list` filtered | for link pickers / linked-docs panel | user |
| Search records | `frappe.desk.search.search_link` | `doctype`, `txt`, filters | user |
| Fetch reports | `frappe.desk.query_report.run` | `report_name`, filters | user (report perm) |
| Fetch dashboards | Dashboard/Chart get + `frappe.desk.dashboard_chart_source` | chart data | user |
| Fetch workflow actions | `getdoc` (workflow) / transitions | available transitions for state+role | user |
| Execute workflow action | `frappe.model.workflow.apply_workflow` | `{doc, action}` | user (allowed role) |
| Fetch user permissions | `frappe.client.get_list` DocPerm / `has_permission` | permission matrix | service/user |
| Fetch settings | `GET /api/resource/{single_dt}` | Single DocType values | user (settings perm) |
| Sync master data | batched `get_list` / Data Import | pull/refresh masters | service |
| Sync transaction data | `get_list` with `modified` filter (incremental) | read-model refresh | service |

**Error handling**: normalize ERPNext `exc`/`_server_messages` into `error_code` + human message; map HTTP 417 (validation) / 403 (perm) / 409 (timestamp mismatch) to typed errors. **Auth**: service token for metadata/sync; per-user OAuth for transactions to preserve attribution + record-level permissions.

---

## 21. Data Synchronization Strategy

- **Initial full sync**: on onboarding — metadata (all enabled DocTypes) + masters + permissions + workflows.
- **Incremental sync**: periodic pull using `modified >` watermark per DocType (masters, permissions).
- **Metadata sync**: on schema_hash change / upgrade / scheduled nightly.
- **Master data sync**: scheduled + on webhook (Item/Customer/Supplier changes).
- **Transaction data sync**: only for read models/reporting mirrors; ERPNext remains authoritative (avoid syncing to a second ledger).
- **Permission & workflow sync**: on webhook (DocPerm/Workflow change) + nightly.
- **Scheduled sync**: cron jobs per scope with jitter to spread load.
- **Real-time webhook sync**: ERPNext **Webhook** → XentraERP listener → cache invalidation + targeted refresh.
- **Conflict resolution**: ERPNext wins for authoritative data; optimistic concurrency on writes via `modified` timestamp (reject stale → reload).
- **Retry logic**: exponential backoff with jitter; dead-letter after N attempts.
- **Failed sync handling**: quarantine the failing scope, keep last-good cache, alert.
- **Sync audit log**: every run recorded (Sync Log) with counts + duration for observability.

---

## 22. Error Handling & Validation

Envelope per error: **user message / technical log / retry / admin notification / recovery.**

| Error | User message | Log | Retry | Notify | Recovery |
|---|---|---|---|---|---|
| API connection failure | "Backend temporarily unavailable" | endpoint+latency | auto backoff | on threshold | circuit breaker, serve cache |
| Auth failure | "Session expired, please re-login" | tenant+token id | no | security alert on spike | refresh token / re-provision key |
| Missing DocType | "This feature isn't available yet" | doctype | no | platform admin | re-sync metadata |
| Missing field | "A required field isn't configured" | doctype+fieldname | no | admin | re-run mapping |
| Mandatory field error | inline "Field X is required" | field | user-fix | no | highlight field |
| Permission error | "You don't have access to do this" | role+doctype+op | no | optional | request access flow |
| Workflow transition error | "This action isn't allowed in the current state" | state+action+role | no | no | show allowed actions |
| Validation error | ERPNext message inline | exc | user-fix | no | correct + resubmit |
| Duplicate record | "A record with these details exists" | keys | no | no | link to existing |
| Naming series error | "Numbering not configured" | series | no | admin | fix Naming Series |
| Submit/cancel error | ERPNext reason | doc+op | conditional | no | resolve dependency |
| Backend server error (500) | "Something went wrong, we're on it" | stack ref | auto | on-call | incident |
| Timeout | "This is taking longer than expected" | endpoint+ms | auto | on threshold | async job + notify when done |
| Sync conflict | "This record changed, reloading latest" | modified diff | reload | no | merge/re-edit |

Client-side validators mirror ERPNext (`reqd`, type, precision) to fail fast; server remains the authority.

---

## 23. Frontend UX Requirements

- **Modern SaaS dashboard** with per-tenant branding (logo, palette, product name).
- **Sidebar module navigation** driven by enabled modules + permissions.
- **Dynamic form builder** (metadata-driven renderer, §7).
- **List view** with server-side filters, sort, pagination, saved views; column set from `in_list_view`.
- **Kanban view** for status/stage DocTypes (Lead, Opportunity, Task).
- **Calendar view** for date DocTypes (Event, deliveries, due dates).
- **Report view** rendering ERPNext query reports (filters + grid + export).
- **Transaction timeline** (Communications, Versions, Comments, Workflow actions).
- **Workflow progress tracker** (stepper) + **approval buttons** ("My Approvals" inbox).
- **Child-table grids** (inline edit, totals).
- **Quick create** (mini-forms for masters from within transactions).
- **Global search** (`search_link` across DocTypes) + per-list filters.
- **Export to Excel/PDF**; **print format preview** (server-rendered).
- **Notification center**, **My Tasks**, **My Transactions**, **My Approvals**.
- **Audit trail tab** (Version history) and **Linked Documents panel** (`get_linked_docs`).
- Responsive, keyboard-friendly, optimistic UI with graceful error/empty/loading states.

---

## 24. Module-Wise Dashboards

Each dashboard = number cards + charts fed by ERPNext report/chart APIs, filtered by permission + company + date range.

- **Sales**: revenue trend (P/L income), sales orders by status, top customers, top items, AR aging, conversion (quotation→order), pipeline value.
- **Purchase**: spend trend, POs by status, top suppliers, items to receive/bill, AP aging, purchase price variance.
- **Accounts / Finance**: cash position, P&L snapshot, Balance Sheet summary, AR vs AP, overdue receivables/payables, tax liability (country report), bank balances.
- **CRM**: lead funnel, opportunities by stage (weighted forecast), win/loss ratio, activities due, response SLA, source effectiveness.
- **Inventory/Stock**: stock value by warehouse, low-stock/reorder alerts, stock ageing, fast/slow movers.
- **Logistics** (XentraERP extension): shipments by status, on-time delivery %, carrier performance, cost per shipment — sourced from the real logistics DocTypes (replacing demo data), not hardcoded.
- **Executive (cross-module)**: revenue vs expense, gross margin, order-to-cash cycle, top KPIs across modules.

Dashboard config is metadata-driven (Number Card/Dashboard Chart or XentraERP widget defs) so tenants can enable/hide widgets by role without code.

---

## Implementation Roadmap (Phased)

**Phase 0 — Foundations (now):** tenant-aware BFF proxy, secure credential store, company-defaults wiring (currency/country from ERPNext), operations create flows (Sales/Purchase Order) — *in progress in the current codebase.*

**Phase 1 — Metadata Engine:** DocType discovery + snapshot store + schema hashing + cache; render a first DocType (e.g., Sales Order) fully from metadata instead of the hand-built form.

**Phase 2 — Dynamic Renderer:** component map, layout engine (tabs/sections/columns), child-table grids, link search, depends_on evaluation, client validators.

**Phase 3 — Permissions & Workflow:** permission matrix sync + UI gating; workflow state tracker + transition buttons + apply_workflow.

**Phase 4 — Masters & Imports:** master create-forms + Data Import wizard + dedupe.

**Phase 5 — Accounts & Reports:** invoices, payments, journal entries, GL/ledger tabs, query-report view (Trial Balance, P&L, Balance Sheet, tax reports).

**Phase 6 — CRM & Dashboards:** pipeline/Kanban, activities, module dashboards + number cards.

**Phase 7 — SaaS Admin & Provisioning:** automated site/company provisioning, onboarding orchestration, plan/module gating, white-label branding, billing hooks.

**Phase 8 — Upgrade Safety & Scale:** mapping versioning + upgrade diff engine, webhook-driven cache invalidation, per-tenant regression smoke tests, observability + SLOs.

**Cross-cutting from day one:** everything scoped by `tenant_id`; ERPNext stays standard; the ledger is never duplicated; UI gates are UX while ERPNext enforces security.
