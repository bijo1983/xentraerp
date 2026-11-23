# CLINZA — clinic management (clinic-frontend)

Vue 3 + Vite + Pinia app for clinics on XentraERP. Same stack, folder layout and design tokens as
`pos-frontend/` (`src/styles/tokens.css` is copied from it; `src/styles/clinza.css` swaps the accent to
a clinical teal). It talks only to `custom_erp.api.clinic.*` through the erp-frontend `/api` proxy,
exactly like the POS: the proxy picks the tenant site from the `xentra_tenant` cookie.

Live host: **https://clinza.xentraerp.com** (see "Deploy").

## What's in this first slice

| Screen | What it does |
|---|---|
| Sign in (`/`) | Clinic code → email + password (Frappe login). "Start free trial" links to the ERP signup with `?product=clinza`, which shows the clinic-type picker. |
| Today (`/today`) | KPIs (appointments, waiting, billed today, open claims) and today's queue with check-in / start-visit actions. |
| Appointments | Day calendar by practitioner, click a slot to book, reschedule, status flow Booked → Confirmed → Checked In → In Consultation → Completed (or No Show / Cancelled). Server refuses double bookings and times outside opening hours. |
| Patients | Search, register (ID type per region: Emirates ID / Iqama / Aadhaar / …), file with visits, appointments, bills and insurance policies. |
| Visit (`/visit/:id`) | Charting from the clinic type's templates (vitals with BMI, SOAP, FDI dental chart, eye exam, skin, physio, growth, immunisation, antenatal, ENT, cardiac), ICD-10 diagnoses, prescription, services, insurance split preview, **Bill visit**. |
| Billing | CLINZA invoices (ERPNext Sales Invoices), take payment (Payment Entry), print. |
| Insurance claims | Claims opened automatically when an insured visit is billed; status workflow, approved amount, insurer payment (Payment Entry against the insurer invoice), insurers list. |
| Setup | Clinic type (adds templates / visit types / services), clinic details, tax registration and rates by kind of charge, templates, visit types & hours, services & prices, practitioners, staff (with the plan's user limit). |
| Print (`/print/:kind/:id`) | Invoice (GCC tax invoice with Arabic + ZATCA QR for KSA, India Tax Invoice / Bill of Supply / Invoice-cum-Bill of Supply with GSTIN, SAC/HSN, place of supply, CGST/SGST or IGST, EU invoice with exemption reason), prescription, claim form. Browser print / save as PDF. |

Backend: `custom_erp_app/custom_erp/api/clinic.py` (API), `clinic_setup.py` (applying a clinic type,
VAT/GST accounts and templates), `clinic_catalog.py` (clinic types, templates, tax presets — pure
Python, tested by `scripts/clinic-checks/test_clinic_catalog.py`). DocTypes `Clinza *` in
`custom_erp/xentraerp/doctype/`.

## Develop

```
npm ci
npm run dev        # http://localhost:5175, /api proxied to VITE_API_PROXY_TARGET (default 127.0.0.1:8083)
npm test           # vitest
npm run build      # vue-tsc + vite build -> dist/
```

## Deploy (server)

1. Backend: check out the branch in `/home/xentraerp` (live-linked into the bench), then
   `bench --site <tenant site> migrate` for every clinic tenant **and** the control-plane site
   (`clinic_type` field on XentraERP Tenant), `supervisorctl restart innovegic-bench-web:innovegic-bench-frappe-web`,
   `supervisorctl status`.
2. Turn a tenant into a clinic: as System Manager on the control plane call
   `custom_erp.api.provisioning.set_tenant_clinic_type(tenant_name, clinic_type)` — or sign in to CLINZA as the
   tenant admin and pick the clinic type in Setup. Add `clinic` to the tenant's modules (Trial tenants get all modules).
3. Frontend: `cd clinic-frontend && npm ci && npx vite build --outDir dist-new --emptyOutDir` (Node 22), then
   `mv dist dist-old; mv dist-new dist`.
4. DNS: an **A record `clinza` in the `xentraerp.com` zone** pointing at the droplet's IP.
5. nginx + TLS: see the header of `scripts/nginx-clinza.xentraerp.com.conf` (certbot webroot, then reload).
6. Rebuild erp-frontend (signup page has the clinic-type picker) with the usual safe-rebuild procedure.

## Not in this slice

Arabic UI (documents are bilingual already), ZATCA Phase 2 (XML e-invoicing / clearance), e-invoice IRN for
India (only needed above the GST e-invoicing turnover threshold), NPHIES / eClaimLink electronic submission,
pharmacy stock (medicines are billed as non-stock lines), lab/radiology orders, patient portal / online
booking, SMS reminders, Capacitor mobile build.
