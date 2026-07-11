# XentraERP — Tenant Setup Engine & Modern UX Product Specification

**PRD + Functional Blueprint + UI/UX Enhancement Document.**
Companion to `XentraERP-Architecture-Blueprint.md`. Where that document defines the metadata-driven engine (Phases 1–5, already implemented), this document defines the **Initial Tenant Setup Engine**, **default-master initialization**, **tenant-based SaaS model**, and the **modern UI/UX redesign** that makes XentraERP look nothing like ERPNext while using it as the backend engine.

> Backend principle (unchanged): ERPNext stays standard. XentraERP creates defaults via ERPNext's own DocTypes/APIs and renders a modern UI. No core patches.

---

## 1. Executive Summary

XentraERP is a modern white-label SaaS ERP **frontend** on a standard **ERPNext/Frappe backend**. DocTypes, fields, child tables, workflows, permissions, settings, and masters are fetched dynamically (the metadata engine already built), but the UI is a completely different, modern SaaS experience.

**Current gap:** metadata and forms load correctly, but a freshly connected tenant has **no initialized defaults** — item groups, item types, UOM, warehouses, price lists, tax templates, default accounts, cost centers, naming series, fiscal year, CRM stages, workflows, roles, and dashboard widgets are missing or empty. So forms render but transactions fail validation ("default warehouse required", "receivable account not set").

**Solution:** an **Initial Tenant Setup Engine** — a guided wizard + an automated Default Setup Engine — that, on signup, configures every company-specific default by creating the corresponding ERPNext records (idempotently), tracks completion, and only then flips the tenant to go-live. Combined with a **tenant-based model** (`/ymh`, `/company-code`) and a **modern UX layer** (right-side activity pane, visual connections, KPI dashboards, industry templates).

---

## 2. Current Application Status & Gaps Identified

**Status (implemented):** tenant-aware proxy; metadata engine (`getDocTypeMeta`, schema compiler, cache); `DynamicForm` (create/edit/validation/child-tables/link-search/depends_on); generic `/app/[doctype]` list/new/edit; permission matrix + workflow bar; financial reports viewer; company-default currency wiring.

**Gap:** no default-data initialization. For every missing default below — **why required / ERPNext DocType / how XentraERP initializes / scope / admin-editable**:

| Missing default | Why required | ERPNext DocType/Setting | Initialize how | Scope | Admin-editable |
|---|---|---|---|---|---|
| Item Groups | Items need a group | `Item Group` (tree) | Auto-create "All Item Groups" + Products/Services/Raw Material | Tenant | Yes |
| Item Type | Classifies stock/non-stock | Item flags (`is_stock_item`) / custom | Seed standard types | Tenant | Yes |
| UOM | Qty needs a unit | `UOM` | Seed Nos/Unit/Kg/Litre/Box/Hour | Global template → tenant | Yes |
| Warehouses | Stock postings need location | `Warehouse` | Create "Stores - <ABBR>", "Finished Goods - <ABBR>" | Tenant | Yes |
| Price List | Selling/buying rates | `Price List` | Create "Standard Selling", "Standard Buying" | Tenant | Yes |
| Customer Group | Customer classification | `Customer Group` (tree) | "All Customer Groups" + Commercial/Individual | Tenant | Yes |
| Supplier Group | Supplier classification | `Supplier Group` (tree) | "All Supplier Groups" + Local/Import | Tenant | Yes |
| Territory | Geographic scoping | `Territory` (tree) | "All Territories" + country | Tenant | Yes |
| Company accounts | Posting targets | `Company` default account fields | Map from CoA after install | Tenant | Yes |
| Receivable/Payable | AR/AP posting | `Account` + Company defaults | Map "Debtors - <ABBR>" / "Creditors - <ABBR>" | Tenant | Yes |
| Income/Expense | P&L posting | `Account` + Company defaults | Map "Sales - <ABBR>" / "Cost of Goods Sold - <ABBR>" | Tenant | Yes |
| Cost Center | Cost attribution | `Cost Center` (tree) | "Main - <ABBR>" | Tenant | Yes |
| Tax templates | Tax computation | `Sales/Purchase Taxes and Charges Template`, `Item Tax Template`, `Tax Category` | Country tax pack | Tenant (from global) | Yes |
| Payment Terms | Due-date scheduling | `Payment Terms Template` | "Net 30" default | Tenant | Yes |
| Naming Series | Doc numbering | `Naming Series` / `autoname` | Set series per doctype | Tenant | Yes |
| Fiscal Year | Posting calendar | `Fiscal Year` | Country FY, mark current | Tenant | Limited |
| Currency | Base currency | `Company.default_currency`, `Currency` | From country | Tenant | No (post-txn) |
| Stock/Selling/Buying/Accounts Settings | Behavior toggles | Single DocTypes | Sensible defaults | Tenant | Yes |
| CRM stages | Pipeline | `Lead Source`, `Opportunity Type`, `Sales Stage`, `Lost Reason` | Seed standard stages | Tenant | Yes |
| Workflows | Approvals | `Workflow` (+states/transitions) | Install selected approval workflows | Tenant | Yes |
| Roles & Permissions | Access | `Role`, `Role Profile`, DocPerm | Seed role profiles per module | Tenant | Yes |
| Dashboard widgets | KPIs | `Dashboard`, `Dashboard Chart`, `Number Card` / XentraERP widget defs | Default widget pack | Tenant | Yes |

---

## 3. Tenant-Based SaaS Setup Model

**URL forms:** path-based `https://app.xentraerp.com/ymh` or subdomain `https://ymh.xentraerp.com`. Slug = tenant code (lowercase, unique, `[a-z0-9-]`).

**Tenant record (control-plane, XentraERP DB — not ERPNext):**
`tenant_id, tenant_code, url_slug, company_name, erpnext_site_url, db_ref, plan, enabled_modules[], default_language, default_currency, fiscal_year, timezone, logo_url, theme{primary,secondary,accent,mode}, user_count, storage_limit, feature_access[], mapping_version, setup_completion_pct, status`.

**Isolation:** two supported models (choose per plan) —
- *Site-per-tenant*: separate Frappe site + DB (strong isolation).
- *Company-per-tenant on a shared site*: one site, many Companies, isolation via **User Permission** on Company + company scoping.
Every XentraERP request carries tenant context; the BFF injects the right backend URL + credentials; the browser never sees ERPNext creds. Middleware resolves the slug → tenant → backend binding on each request. Metadata cache, mapping, branding, and theme are keyed by `tenant_id`.

---

## 4. Initial Tenant Setup Wizard (13 steps)

Modern, progress-tracked, resumable. Each step writes to ERPNext via the Default Setup Engine (§5) and updates the completion tracker (§6). Steps: **1 Company Info · 2 Modules · 3 Chart of Accounts · 4 Inventory · 5 Sales · 6 Purchase · 7 CRM · 8 Users & Roles · 9 Workflows · 10 Branding/Theme · 11 Metadata Fetch & Mapping · 12 Validation · 13 Go-Live.** (Field lists per step exactly as enumerated in the request.)

Each step: renders a modern card form → on Next, calls the setup engine's step handler → shows created/skipped items → validates → advances. Steps are **idempotent** (re-entrant), **skippable** where optional (industry template can pre-fill), and **resumable** (state persisted, so the admin can leave and return). Step 11 runs the metadata engine we built; Step 12 dry-runs a sample transaction; Step 13 shows the completion score and activates the workspace.

---

## 5. Default Setup Engine

An idempotent, ordered engine: **for each default, create the ERPNext record only if it doesn't already exist.** Contract per default: `{ source, fallback, tenant_override, validation, mandatory, dependency, status }`. Ordering respects dependencies (Company → Fiscal Year → CoA → Accounts → Cost Center → Warehouse → Groups → Price Lists → Tax → Settings → CRM → Workflows → Roles → Dashboards).

Group coverage exactly as enumerated (Company / Inventory / Sales / Purchase / Accounts / CRM / System defaults). Engine algorithm per item:
1. Check tenant-specific record exists (by naming key).
2. If not, check global template.
3. If not, create from fallback (ERPNext insert).
4. Map as the relevant default (Company field / Settings single).
5. Validate; log action; set setup status; update tracker.
Financial-impact items (accounts, tax) are **recommended, not silently created** where a wrong guess would corrupt the ledger — surfaced for admin confirmation.

---

## 6. Setup Completion Tracker

Stages: Company → Accounts → Inventory → Sales → Purchase → CRM → Users & Roles → Workflow → Branding → Metadata Mapping → Validation → Go-Live. Each stage: **Completed / In Progress / Pending / Failed / Requires Attention** + a percentage; overall = weighted average. Persisted per tenant; drives the go-live gate (can't go live below threshold on mandatory stages). Rendered as a vertical stepper with per-stage progress rings and a "Fix" deep-link to the responsible screen.

```
Company 100% · Accounts 80% · Inventory 60% · Sales 75% · Purchase 70%
CRM 50% · Users 90% · Metadata 100% · Overall 78%
```

---

## 7. ERPNext Backend vs XentraERP Frontend Variation

**ERPNext (engine only):** DocType structure, business logic, accounting engine, stock engine, workflow engine, permission engine, transaction validation, backend persistence, standard reports.
**XentraERP (experience):** modern SaaS UI, richer dashboards, guided setup, right-side activity pane, modern forms, better navigation, visual connections, module icons, workflow progress bars, approval cards, AI-assisted suggestions, mobile-responsive views, tenant branding. The frontend must **not** resemble the ERPNext desk — same data, different product.

---

## 8. Modern UI/UX Redesign Requirements

**Global layout:** collapsible sidebar; top command bar with global search (⌘K); notification center; quick-create (+); My Approvals; My Tasks; tenant switcher; profile menu; light/dark; breadcrumbs; recently viewed.
**Sidebar** (icon-led modules): Dashboard, Sales, Purchase, Accounts, CRM, Inventory, Masters, Reports, Settings, Users, Workflows, Integrations, Audit Logs.
**Form layout:** card-based sections; sticky header with document status badge; primary actions top-right (Save/Submit/Approve/Reject/Cancel); stage progress tracker; business-area field grouping; collapsible smart sections; modern child-table grids; inline validation; required highlights; auto-save draft; keyboard shortcuts; contextual help tooltips.
**List view:** modern grid; quick + saved filters; column chooser; bulk actions; status badges; date-range filter; export; Kanban toggle; density switch.
**Dashboard:** KPI cards; trend charts; approval widgets; pending tasks; recent transactions; setup-completion widget; sync-health widget; module performance cards; quick actions.

---

## 9. Right-Side Activity Pane

A collapsible, resizable, sticky, context-aware, permission-controlled right pane on all transaction screens — replacing ERPNext's bottom timeline. Tabs:
- **Activity** — created by/date, last modified, status changes, approval/submission/cancellation history (from `Version` + workflow actions).
- **Comments** — user comments, internal notes, @mentions, reply threads, attachments, visibility control (Frappe `Comment`).
- **Workflow** — current stage, completed stages, pending approver, next action, rejection reason, approval history.
- **Attachments** — files, drag-drop upload, preview, version history, download (Frappe File API).
- **Audit Log** — field change history: old→new value, changed by, timestamp, IP (Frappe `Version`).
- **Connections** — linked docs (see §10) via `frappe.desk.form.linked_with.get_linked_docs`.

---

## 10. Modern Connections Panel

Replace ERPNext's connection tab with a visual **process flow** of linked documents. For Sales Order: `Lead → Opportunity → Quotation → Sales Order → Delivery Note → Sales Invoice → Payment Entry`. Each linked-document **card** shows: doctype, number, status, amount, date, owner, **Open**, and **Create next** (via ERPNext `make_*` mappers). Views: relationship graph, timeline chain, linked cards, process flow, status cards.
**Status color codes:** Draft=Grey · Pending Approval=Amber · Approved=Blue · Submitted=Green · Overdue=Red · Cancelled=Dark Grey · Paid=Green · Partially Paid=Orange.

---

## 11. Latest Icon Strategy

Use **Lucide** (already the project's icon set; alternatives: Heroicons, Tabler, Phosphor, Remix). Assignment:

```
Dashboard: LayoutDashboard
Sales: TrendingUp, FileText, ShoppingCart, Receipt, CreditCard
Purchase: ShoppingBag, Truck, PackageCheck, ClipboardList
Accounts: Wallet, Landmark, Calculator, Banknote, BarChart3
CRM: Users, UserPlus, Handshake, Target, MessageSquare
Inventory: Boxes, Package, Warehouse, Barcode, Layers
Masters: Database, ListTree, Settings2
Settings: SlidersHorizontal, Cog, ShieldCheck
Workflow: GitBranch, Route, CheckCircle2, Clock
Audit Logs: History, FileClock, ScrollText
Notifications: Bell, Mail, MessageCircle
Tenant Admin: Building2, Globe, Palette, KeyRound
```

---

## 12. XentraERP Module Screens

A. **Tenant Setup Dashboard** — setup progress, missing defaults, ERPNext connection status, metadata sync status, module activation, branding, go-live checklist.
B. **Company Setup** — company info, currency, fiscal year, default accounts, default warehouse, cost center.
C. **Default Masters Setup** — item groups/types, UOM, warehouses, customer/supplier groups, territories, price lists, tax templates, payment terms.
D. **Metadata Mapping** — DocTypes, XentraERP screens, mapping status, missing fields, custom fields, sync logs, mapping version.
E. **Sales Workspace** — Leads, Opportunities, Quotations, Sales Orders, Delivery Notes, Sales Invoices, Payments, dashboard.
F. **Purchase Workspace** — Material Requests, Supplier Quotations, POs, Receipts, Purchase Invoices, Payments, dashboard.
G. **Accounts Workspace** — CoA, Journal Entries, Payment Entries, Receivables, Payables, Trial Balance, P&L, Balance Sheet.
H. **CRM Workspace** — Leads, Opportunities, Customers, Contacts, Activities, Follow-ups, Pipeline (Kanban).
I. **Settings Workspace** — Company/Selling/Buying/Accounts/Stock settings, Naming Series, Workflow, Email, Notification.

(E–I are largely delivered by the existing `/app/[doctype]` engine + workspace landing pages that group the relevant DocTypes.)

---

## 13. Dynamic Default Value Handling

When a required default is missing at transaction time: **auto-create if safe · recommend if high financial impact · block only if mandatory · warn if optional · always add to the tracker.**

- *Missing item group*: check tenant default → global template → create "All Item Groups" → assign default → log → renameable later.
- *Missing warehouse*: derive from company abbr → create "Stores - <ABBR>" → map to company → set default → validate stock settings.
- *Missing receivable account*: check CoA → create/map "Debtors - <ABBR>" → set as company default receivable → validate customer posting.

---

## 14. Setup Templates by Industry

Selectable during onboarding; each pre-selects modules + seeds defaults:
- **Trading**: Sales, Purchase, Inventory, Accounts, CRM.
- **Service**: Sales, Accounts, CRM, (Projects).
- **Healthcare/Medical**: Sales, Purchase, Inventory, Accounts, Compliance, department-wise cost centers.
- **Manufacturing**: Sales, Purchase, Inventory, BOM, Work Order, Accounts.
- **Distribution**: Sales, Purchase, Warehouse, Delivery, Accounts.

---

## 15. UI Wireframe Descriptions

**A. Tenant Setup Dashboard** — left sidebar; top bar; main grid of setup cards (each a stage with % ring + Fix button); right alerts panel (missing defaults, sync errors); bottom validation checklist with go-live gate.
**B. Sales Order** — top sticky header (SO number + status badge + Save/Submit/Approve); left form area (customer, dates); middle child-table (items grid with totals); right activity/comments/connections pane; bottom summary bar (net, tax, grand total).
**C. Item Master** — header with item status; cards: Basic details, Inventory details, Sales details, Purchase details, Accounting defaults; right pane (activity, attachments, linked transactions).
**D. Customer Master** — profile header; contact & address cards; credit limit & payment terms; sales history; outstanding summary; right relationship panel.
**E. Purchase Order** — supplier details; items table; taxes & totals; approval progress tracker; right activity & connections pane.

---

## 16. Frontend Design Style

Clean white/soft-grey background; rounded cards; subtle shadows; gradient primary actions; modern type; consistent spacing; minimal borders; status badges; icon-led nav; micro-interactions; smooth transitions; skeleton loaders; empty-state illustrations; toasts; slide-over panels; modal quick actions; fully responsive.

**Default palette:** Primary Deep Indigo/Royal Blue · Secondary Slate Grey · Accent Emerald · Warning Amber · Error Red · Info Sky Blue · Background Soft Grey · Card White.
**Premium theme (alt):** Primary Olive Green · Accent Gold · Neutral Charcoal · Background Warm Off-White.
Themes are tenant-configurable via CSS variables (the app already uses `--primary` etc.); branding swaps the token values per tenant.

---

## 17. Metadata & Mapping Health Dashboard

Admin monitoring view: total DocTypes fetched · total fields fetched · fields mapped · missing mappings · custom fields detected · failed API calls · last metadata/master/workflow sync · mapping version · ERPNext version · XentraERP version · tenant health score. Fed by the Sync Log / Error Log control-plane tables (blueprint §17/§21).

---

## 18. Admin Console Enhancements (Action Buttons)

Re-fetch ERPNext metadata · Rebuild frontend schema · Sync default masters · Validate setup · Run health check · Re-map fields · View missing defaults · Create missing defaults · Export mapping · Import mapping · Reset tenant setup · Activate tenant. Each is a control-plane job with confirmation, progress, and audit entry.

---

## 19. Error & Warning Framework

User-friendly, actionable messages with a one-click remedy:
- Missing item group → "Default item group is not configured. XentraERP can create a standard item group for this company." **[Create]**
- Missing warehouse → "Default warehouse is required before stock transactions. Create or auto-generate a warehouse." **[Auto-generate]**
- Incomplete account defaults → "Accounting defaults are incomplete. Review receivable, payable, income, and expense mappings." **[Review]**
- Metadata sync failed → "ERPNext metadata sync failed. Check backend connection or retry." **[Retry]**
- Mapping conflict → "Some ERPNext fields could not be mapped automatically. Review mapping suggestions." **[Review mappings]**

---

## 20. User Stories & Acceptance Criteria

**US-1 Guided onboarding.** *As a new tenant admin, I complete a step-by-step wizard so my company is ready to transact.*
AC: all 13 steps resumable; each writes ERPNext records idempotently; completion tracker updates; go-live blocked until mandatory stages ≥ threshold.

**US-2 Auto-defaults.** *As an admin, missing defaults are created safely so I'm not blocked.*
AC: safe masters auto-created + logged; financial defaults recommended not silent; mandatory-missing blocks with a Create action; every action appears in the tracker.

**US-3 Tenant isolation.** *As a platform operator, each tenant's data/branding/mapping is isolated.*
AC: slug resolves to the correct backend; no cross-tenant data; branding/theme per tenant; creds never reach the browser.

**US-4 Modern transaction UX.** *As a user, I work in a modern form with a right-side activity/connections pane.*
AC: sticky status header; right pane with Activity/Comments/Workflow/Attachments/Audit/Connections; connections show the linked-doc flow with Open/Create-next; permission-controlled.

**US-5 Health visibility.** *As an admin, I monitor metadata/mapping/sync health.*
AC: health dashboard shows counts, versions, last-sync, failures, tenant health score; admin actions available.

---

## 21. Implementation Roadmap (this spec, layered on the existing engine)

- **S1 — Control plane & tenancy**: Tenant table, slug routing/middleware, per-tenant backend binding + secrets, branding/theme tokens. *(enables `/ymh` URLs)*
- **S2 — Default Setup Engine**: idempotent creators for all defaults (§5) as BFF endpoints + job runner; setup status model.
- **S3 — Setup Wizard UI**: the 13-step resumable wizard + completion tracker (§4/§6).
- **S4 — Dynamic default handling**: transaction-time missing-default detection + auto-create/recommend/block (§13).
- **S5 — Modern UX shell**: command bar, quick-create, notifications, workspaces, dashboards, icon system, theming (§8/§11/§16).
- **S6 — Right-side pane + Connections**: activity/comments/workflow/attachments/audit/connections tabs; visual linked-doc flow (§9/§10).
- **S7 — Industry templates**: template packs pre-seeding modules + defaults (§14).
- **S8 — Health & Admin console**: mapping/sync health dashboard + admin action jobs (§17/§18).

---

## Appendix A — Sample JSON: Tenant Setup

```json
{
  "tenant_id": "t_01H...",
  "tenant_code": "ymh",
  "url_slug": "ymh",
  "company_name": "YMH Trading LLC",
  "erpnext": { "site_url": "https://ymh.erp.internal", "tenancy_model": "company-per-tenant", "company": "YMH Trading LLC", "abbr": "YMH" },
  "plan": "growth",
  "enabled_modules": ["Sales", "Purchase", "Accounts", "CRM", "Inventory"],
  "locale": { "language": "en", "currency": "AED", "timezone": "Asia/Dubai", "country": "United Arab Emirates" },
  "fiscal_year": { "name": "2026", "start": "2026-01-01", "end": "2026-12-31" },
  "branding": { "logo_url": "https://cdn/.../ymh.svg", "theme": { "primary": "#4338CA", "secondary": "#475569", "accent": "#10B981", "mode": "light" } },
  "limits": { "users": 25, "storage_gb": 50 },
  "mapping_version": "v3",
  "setup_completion_pct": 78,
  "status": "staging"
}
```

## Appendix B — Sample JSON: Default Master Creation (engine input)

```json
{
  "company": "YMH Trading LLC",
  "abbr": "YMH",
  "defaults": [
    { "doctype": "Item Group", "key": "All Item Groups", "payload": { "item_group_name": "All Item Groups", "is_group": 1 }, "mandatory": true, "on_missing": "create" },
    { "doctype": "Item Group", "key": "Products", "payload": { "item_group_name": "Products", "parent_item_group": "All Item Groups" }, "on_missing": "create" },
    { "doctype": "UOM", "key": "Nos", "payload": { "uom_name": "Nos" }, "on_missing": "create" },
    { "doctype": "Warehouse", "key": "Stores - YMH", "payload": { "warehouse_name": "Stores", "company": "YMH Trading LLC" }, "mandatory": true, "on_missing": "create" },
    { "doctype": "Price List", "key": "Standard Selling", "payload": { "price_list_name": "Standard Selling", "selling": 1, "currency": "AED" }, "on_missing": "create" },
    { "doctype": "Customer Group", "key": "All Customer Groups", "payload": { "customer_group_name": "All Customer Groups", "is_group": 1 }, "on_missing": "create" },
    { "doctype": "Company", "key": "YMH Trading LLC", "map_defaults": { "default_receivable_account": "Debtors - YMH", "default_payable_account": "Creditors - YMH", "default_income_account": "Sales - YMH", "default_expense_account": "Cost of Goods Sold - YMH", "cost_center": "Main - YMH" }, "on_missing": "recommend" }
  ]
}
```

## Appendix C — Sample JSON: DocType → XentraERP Screen Mapping

```json
{
  "tenant_id": "t_01H...",
  "doctype": "Sales Order",
  "module": "Selling",
  "xentra_screen": "sales/sales-order",
  "is_submittable": true,
  "workflow": "Sales Order Approval",
  "schema_hash": "Sales Order-874203",
  "fields": [
    { "fieldname": "customer", "label": "Customer", "component": "link", "target": "Customer", "reqd": true, "group": "Party" },
    { "fieldname": "transaction_date", "label": "Date", "component": "date", "reqd": true, "group": "Party" },
    { "fieldname": "delivery_date", "label": "Delivery Date", "component": "date", "group": "Party" },
    { "fieldname": "currency", "label": "Currency", "component": "link", "target": "Currency", "readOnly": true, "group": "Party" },
    { "fieldname": "items", "label": "Items", "component": "child_table", "child_doctype": "Sales Order Item",
      "columns": ["item_code", "qty", "rate", "amount"], "group": "Items" },
    { "fieldname": "grand_total", "label": "Grand Total", "component": "currency", "readOnly": true, "group": "Totals" }
  ],
  "connections": ["Delivery Note", "Sales Invoice", "Payment Entry"]
}
```

## Appendix D — Sample Setup Completion Tracker (state)

```json
{
  "overall_pct": 78,
  "stages": [
    { "key": "company", "label": "Company Setup", "status": "completed", "pct": 100 },
    { "key": "accounts", "label": "Accounts Setup", "status": "in_progress", "pct": 80, "missing": ["default_bank_account"] },
    { "key": "inventory", "label": "Inventory Setup", "status": "in_progress", "pct": 60, "missing": ["default_warehouse"] },
    { "key": "sales", "label": "Sales Setup", "status": "in_progress", "pct": 75 },
    { "key": "purchase", "label": "Purchase Setup", "status": "in_progress", "pct": 70 },
    { "key": "crm", "label": "CRM Setup", "status": "pending", "pct": 50 },
    { "key": "users", "label": "Users & Roles", "status": "in_progress", "pct": 90 },
    { "key": "metadata", "label": "Metadata Mapping", "status": "completed", "pct": 100 },
    { "key": "validation", "label": "Validation", "status": "pending", "pct": 0 },
    { "key": "golive", "label": "Go-Live", "status": "pending", "pct": 0 }
  ]
}
```

## Appendix E — Sample Validation Rules

```json
[
  { "rule": "company_exists", "check": "count(Company) >= 1", "severity": "block", "message": "No company configured." },
  { "rule": "current_fiscal_year", "check": "Fiscal Year where current==1 and covers today", "severity": "block", "message": "No active fiscal year." },
  { "rule": "default_warehouse", "check": "Company.default_warehouse is set OR Warehouse count>=1", "severity": "block", "message": "Default warehouse required for stock transactions." },
  { "rule": "receivable_account", "check": "Company.default_receivable_account is set", "severity": "block", "message": "Default receivable account not mapped." },
  { "rule": "selling_price_list", "check": "Price List where selling==1 count>=1", "severity": "warn", "message": "No selling price list; rates must be entered manually." },
  { "rule": "sales_tax_template", "check": "Sales Taxes and Charges Template default exists", "severity": "warn", "message": "No default sales tax template." },
  { "rule": "sample_txn", "check": "dry-run create+cancel Sales Order succeeds", "severity": "block", "message": "Sample transaction failed; setup incomplete." }
]
```

## Appendix F — Sample First-Time Onboarding Workflow

```
signup(company, admin, country, plan)
  └─> create Tenant (status=provisioning, slug)
       └─> bind/provision ERPNext backend (site or company)
            └─> Default Setup Engine (ordered, idempotent):
                 Company → Fiscal Year → CoA → Account defaults → Cost Center
                 → Warehouse → Item/Customer/Supplier Groups → UOM → Price Lists
                 → Tax templates → Payment Terms → Naming Series → Settings singles
                 → CRM stages → Workflows → Roles/Role Profiles → Dashboard widgets
                 └─> Metadata Engine: fetch DocTypes/fields/child/links/workflows/perms
                      → compile render schema → persist tenant mapping (version)
                      └─> Validation: run rules (Appendix E) + sample transaction
                           └─> Completion tracker computed
                                ├─ below threshold → status=staging (admin fixes)
                                └─ meets threshold → status=active → redirect /{slug}/dashboard
```

## Appendix G — UI Mockup Descriptions (for a frontend dev / AI design tool)

- **Dashboard**: top command bar (logo, ⌘K search, +, bell, avatar); left icon sidebar; main = 4 KPI cards (revenue, orders, receivables, cash) with sparklines, a revenue trend line chart, an approvals widget (cards with Approve/Reject), pending tasks list, recent transactions table, and a setup-completion ring (if <100%); right rail optional. Soft-grey bg, white rounded cards, indigo gradient primary buttons.
- **Setup Wizard**: centered stepper (13 dots) top; large card with the current step's fields; left mini-checklist of stages with % rings; sticky footer Back/Next + "Save & exit"; success toasts as records are created.
- **Item Master**: sticky header (item name, status badge, Save/Submit); grid of cards — Basic, Inventory, Sales, Purchase, Accounting defaults; right pane tabs (Activity/Attachments/Connections). Barcode icon accents.
- **Sales Order / Purchase Order**: sticky header (number + status + primary actions); left party card; center items grid with live totals; approval progress tracker bar; right pane (Activity/Comments/Workflow/Connections); bottom summary bar (net/tax/grand total). PO mirrors with supplier.
- **Invoice (Sales/Purchase)**: header with status + outstanding badge; party + dates; items grid; taxes/totals card; payment schedule; right pane with Connections showing the order→delivery→invoice→payment chain and a **Create Payment** action.
- **Customer Master**: profile header (name, group, territory, credit badge); contact/address cards; credit limit & payment terms; sales history mini-chart; outstanding summary; right relationship panel (linked orders/invoices/payments).
- **Supplier Master**: mirror of customer — profile header, contact/address, buying terms, purchase history, outstanding payable, right relationship panel.
- **Right-Side Activity Pane**: 48px collapsed rail with tab icons; expands to ~360px; tab header row; scrollable content; drag handle to resize; sticky; theme-aware; hidden per permission.
```
