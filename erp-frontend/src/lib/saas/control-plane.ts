import { frappe } from '@/lib/frappe';

// ── XentraERP SaaS control plane ────────────────────────────────
// The SaaS admin data (tenants, plans, modules, subscriptions,
// invoices, receipts, payments) is stored as ERPNext CUSTOM DocTypes
// on the admin site — Frappe-native, no extra infrastructure. This
// module defines those DocTypes, self-provisions them, and exposes a
// thin CRUD API the admin screens use.

export type TenantStatus = 'Trial' | 'Active' | 'Suspended' | 'Expired';
export type ModuleType = 'Core' | 'Optional';
export type BillingCycle = 'Monthly' | 'Yearly';
export type InvoiceReason = 'Signup' | 'Renewal' | 'Upgrade' | 'Module Addition' | 'Subscription';
export type InvoiceStatus = 'Draft' | 'Unpaid' | 'Paid' | 'Cancelled';

interface FieldDef {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string;
  reqd?: number;
  unique?: number;
  default?: string;
  in_list_view?: number;
}

interface DocTypeDef {
  name: string;
  autoname?: string;
  title_field?: string;
  fields: FieldDef[];
}

// Prefixed to avoid clashing with standard/ERPNext doctypes.
export const SAAS_DOCTYPES: DocTypeDef[] = [
  {
    // Surrogate ID (XPLAN-#####) is the stable primary key that FKs
    // reference; plan_name is a separate unique-indexed natural key.
    name: 'Xentra Subscription Plan',
    autoname: 'XPLAN-.#####',
    title_field: 'plan_name',
    fields: [
      { fieldname: 'plan_name', label: 'Plan Name', fieldtype: 'Data', reqd: 1, unique: 1, in_list_view: 1 },
      { fieldname: 'price', label: 'Price', fieldtype: 'Currency', in_list_view: 1 },
      { fieldname: 'currency', label: 'Currency', fieldtype: 'Link', options: 'Currency', in_list_view: 1 },
      { fieldname: 'billing_cycle', label: 'Billing Cycle', fieldtype: 'Select', options: 'Monthly\nYearly', in_list_view: 1 },
      { fieldname: 'included_modules', label: 'Included Optional Modules', fieldtype: 'Small Text' },
      { fieldname: 'active', label: 'Active', fieldtype: 'Check', default: '1', in_list_view: 1 },
      { fieldname: 'description', label: 'Description', fieldtype: 'Text' },
    ],
  },
  {
    name: 'Xentra Module',
    autoname: 'XMOD-.#####',
    title_field: 'module_name',
    fields: [
      { fieldname: 'module_name', label: 'Module Name', fieldtype: 'Data', reqd: 1, unique: 1, in_list_view: 1 },
      { fieldname: 'module_type', label: 'Type', fieldtype: 'Select', options: 'Core\nOptional', default: 'Optional', in_list_view: 1 },
      { fieldname: 'description', label: 'Description', fieldtype: 'Small Text' },
      { fieldname: 'active', label: 'Active', fieldtype: 'Check', default: '1', in_list_view: 1 },
    ],
  },
  {
    // Surrogate ID (XTEN-#####) is the FK target; tenant_code (URL slug)
    // is a separate unique-indexed natural key that can change safely.
    name: 'Xentra Tenant',
    autoname: 'XTEN-.#####',
    title_field: 'company_name',
    fields: [
      { fieldname: 'tenant_code', label: 'Tenant Code (URL slug)', fieldtype: 'Data', reqd: 1, unique: 1, in_list_view: 1 },
      { fieldname: 'company_name', label: 'Company Name', fieldtype: 'Data', reqd: 1, in_list_view: 1 },
      { fieldname: 'erp_company', label: 'ERPNext Company', fieldtype: 'Link', options: 'Company' },
      // ── Site-per-tenant binding ──────────────────────────────────
      // 'site' = its own Frappe site (Administrator = full control, hard
      // isolation); 'company' = a Company on the shared site.
      { fieldname: 'tenancy_model', label: 'Tenancy Model', fieldtype: 'Select', options: 'site\ncompany', default: 'site', in_list_view: 1 },
      { fieldname: 'site_name', label: 'Frappe Site Name', fieldtype: 'Data' },
      { fieldname: 'backend_host', label: 'Backend Host (Host header)', fieldtype: 'Data' },
      { fieldname: 'backend_ip', label: 'Backend IP', fieldtype: 'Data', default: '127.0.0.1' },
      { fieldname: 'backend_port', label: 'Backend Port', fieldtype: 'Int', default: '8001' },
      { fieldname: 'status', label: 'Status', fieldtype: 'Select', options: 'Trial\nActive\nSuspended\nExpired', default: 'Trial', in_list_view: 1 },
      { fieldname: 'plan', label: 'Subscription Plan', fieldtype: 'Link', options: 'Xentra Subscription Plan', in_list_view: 1 },
      { fieldname: 'country', label: 'Country', fieldtype: 'Link', options: 'Country' },
      { fieldname: 'currency', label: 'Currency', fieldtype: 'Link', options: 'Currency' },
      { fieldname: 'admin_email', label: 'Admin Email', fieldtype: 'Data' },
      { fieldname: 'start_date', label: 'Start Date', fieldtype: 'Date' },
      { fieldname: 'expiry_date', label: 'Expiry Date', fieldtype: 'Date', in_list_view: 1 },
      { fieldname: 'enabled_modules', label: 'Enabled Optional Modules', fieldtype: 'Small Text' },
    ],
  },
  {
    name: 'Xentra Subscription',
    autoname: 'XSUB-.#####',
    fields: [
      { fieldname: 'tenant', label: 'Tenant', fieldtype: 'Link', options: 'Xentra Tenant', reqd: 1, in_list_view: 1 },
      { fieldname: 'plan', label: 'Plan', fieldtype: 'Link', options: 'Xentra Subscription Plan', reqd: 1, in_list_view: 1 },
      { fieldname: 'start_date', label: 'Start Date', fieldtype: 'Date', in_list_view: 1 },
      { fieldname: 'end_date', label: 'End Date', fieldtype: 'Date', in_list_view: 1 },
      { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency' },
      { fieldname: 'currency', label: 'Currency', fieldtype: 'Link', options: 'Currency' },
      { fieldname: 'status', label: 'Status', fieldtype: 'Select', options: 'Active\nExpired\nCancelled', default: 'Active', in_list_view: 1 },
    ],
  },
  {
    name: 'Xentra Invoice',
    autoname: 'XINV-.#####',
    fields: [
      { fieldname: 'tenant', label: 'Tenant', fieldtype: 'Link', options: 'Xentra Tenant', reqd: 1, in_list_view: 1 },
      { fieldname: 'subscription', label: 'Subscription', fieldtype: 'Link', options: 'Xentra Subscription' },
      { fieldname: 'reason', label: 'Reason', fieldtype: 'Select', options: 'Signup\nRenewal\nUpgrade\nModule Addition\nSubscription', default: 'Subscription', in_list_view: 1 },
      { fieldname: 'invoice_date', label: 'Invoice Date', fieldtype: 'Date', in_list_view: 1 },
      { fieldname: 'due_date', label: 'Due Date', fieldtype: 'Date' },
      { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', in_list_view: 1 },
      { fieldname: 'currency', label: 'Currency', fieldtype: 'Link', options: 'Currency', in_list_view: 1 },
      { fieldname: 'status', label: 'Status', fieldtype: 'Select', options: 'Draft\nUnpaid\nPaid\nCancelled', default: 'Unpaid', in_list_view: 1 },
    ],
  },
  {
    name: 'Xentra Receipt',
    autoname: 'XRCP-.#####',
    fields: [
      { fieldname: 'invoice', label: 'Invoice', fieldtype: 'Link', options: 'Xentra Invoice', reqd: 1, in_list_view: 1 },
      { fieldname: 'tenant', label: 'Tenant', fieldtype: 'Link', options: 'Xentra Tenant', in_list_view: 1 },
      { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', in_list_view: 1 },
      { fieldname: 'currency', label: 'Currency', fieldtype: 'Link', options: 'Currency' },
      { fieldname: 'payment_date', label: 'Payment Date', fieldtype: 'Date', in_list_view: 1 },
      { fieldname: 'mode_of_payment', label: 'Mode of Payment', fieldtype: 'Data' },
    ],
  },
];

// Create a control-plane DocType via the REST API if it doesn't exist.
async function ensureDocType(def: DocTypeDef) {
  try {
    await frappe.getDoc('DocType', def.name);
    return 'exists';
  } catch {
    await frappe.createDoc('DocType', {
      name: def.name,
      module: 'Custom',
      custom: 1,
      naming_rule: def.autoname?.startsWith('field:') ? 'By fieldname' : 'Expression (old style)',
      autoname: def.autoname,
      title_field: def.title_field,
      fields: def.fields,
      permissions: [
        { role: 'System Manager', read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1 },
      ],
    });
    return 'created';
  }
}

// Self-provision all SaaS control-plane DocTypes (admin action).
export async function provisionControlPlane(): Promise<{ name: string; result: string }[]> {
  const out: { name: string; result: string }[] = [];
  for (const def of SAAS_DOCTYPES) {
    try {
      const result = await ensureDocType(def);
      out.push({ name: def.name, result });
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { exception?: string } } })?.response?.data?.exception ||
        (e instanceof Error ? e.message : 'failed');
      out.push({ name: def.name, result: `error: ${msg}` });
    }
  }
  return out;
}

// Whether the control plane has been provisioned (probe one DocType).
export async function isControlPlaneReady(): Promise<boolean> {
  try {
    await frappe.getDoc('DocType', 'Xentra Tenant');
    return true;
  } catch {
    return false;
  }
}

// ── Thin CRUD helpers over the SaaS DocTypes ────────────────────
export const saas = {
  listTenants: () =>
    frappe.getList('Xentra Tenant', {
      fields: JSON.stringify(['name', 'tenant_code', 'company_name', 'status', 'plan', 'expiry_date']),
      order_by: 'modified desc',
      limit_page_length: 0,
    }),
  listPlans: () =>
    frappe.getList('Xentra Subscription Plan', {
      fields: JSON.stringify(['name', 'plan_name', 'price', 'currency', 'billing_cycle', 'active']),
      limit_page_length: 0,
    }),
  listModules: () =>
    frappe.getList('Xentra Module', {
      fields: JSON.stringify(['name', 'module_name', 'module_type', 'active']),
      limit_page_length: 0,
    }),
  listInvoices: () =>
    frappe.getList('Xentra Invoice', {
      fields: JSON.stringify(['name', 'tenant', 'reason', 'invoice_date', 'amount', 'currency', 'status']),
      order_by: 'modified desc',
      limit_page_length: 0,
    }),
  createTenant: (data: Record<string, unknown>) => frappe.createDoc('Xentra Tenant', data),
  setTenantStatus: (name: string, status: TenantStatus) =>
    frappe.updateDoc('Xentra Tenant', name, { status }),
  createInvoice: (data: Record<string, unknown>) => frappe.createDoc('Xentra Invoice', data),
  createReceipt: (data: Record<string, unknown>) => frappe.createDoc('Xentra Receipt', data),
};
