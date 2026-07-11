import { frappe } from '@/lib/frappe';

// ── Default Setup Engine (S2) ───────────────────────────────────
// Detects missing company defaults and creates the corresponding
// ERPNext records idempotently ("create if not exists"). Safe masters
// are auto-created; financial defaults (accounts) are best-effort mapped
// from the existing Chart of Accounts. Everything is scoped to the
// active company (company-per-tenant / SMB model).

export interface SetupContext {
  company: string;
  abbr: string;
  currency: string;
  country?: string;
}

export type SetupGroup = 'Inventory' | 'Sales' | 'Purchase' | 'Accounts';

export interface SetupItem {
  key: string;
  label: string;
  group: SetupGroup;
  mandatory: boolean;
  description: string;
  check: (ctx: SetupContext) => Promise<boolean>; // true = already present
  fix: (ctx: SetupContext) => Promise<void>;
}

// Insert a doc, treating "already exists" as success (idempotent).
async function ensure(doctype: string, payload: Record<string, unknown>) {
  try {
    await frappe.createDoc(doctype, payload);
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { exception?: string } } })?.response?.data?.exception ||
      (e instanceof Error ? e.message : '');
    if (/exists|Duplicate/i.test(String(msg))) return; // already there
    throw e;
  }
}

async function countOf(doctype: string, filters?: unknown): Promise<number> {
  const list = await frappe.getList(doctype, {
    fields: JSON.stringify(['name']),
    ...(filters ? { filters: JSON.stringify(filters) } : {}),
    limit_page_length: 1,
  });
  // get_count is more accurate but a single-row probe is enough for "exists".
  if (Array.isArray(list) && list.length > 0) return list.length;
  const c = await frappe.getCount(doctype, filters as Record<string, unknown> | undefined);
  return Number(c) || 0;
}

// GCC currencies that ERPNext often ships disabled (so they don't appear
// in the currency picker). BHD in particular needs 3-decimal formatting.
const GCC_CURRENCIES: Record<string, { symbol: string; number_format: string; fraction?: string; fraction_units?: number; smallest?: number }> = {
  BHD: { symbol: 'BD', number_format: '#,###.###', fraction: 'Fils', fraction_units: 1000, smallest: 0.001 },
  KWD: { symbol: 'KD', number_format: '#,###.###', fraction: 'Fils', fraction_units: 1000, smallest: 0.001 },
  OMR: { symbol: 'OMR', number_format: '#,###.###', fraction: 'Baisa', fraction_units: 1000, smallest: 0.001 },
  AED: { symbol: 'AED', number_format: '#,###.##' },
  SAR: { symbol: 'SAR', number_format: '#,###.##' },
  QAR: { symbol: 'QAR', number_format: '#,###.##' },
};

// Ensure a currency exists AND is enabled (so it shows in pickers).
export async function ensureCurrencyEnabled(code: string) {
  const cfg = GCC_CURRENCIES[code] || { symbol: code, number_format: '#,###.##' };
  const payload = {
    enabled: 1,
    symbol: cfg.symbol,
    number_format: cfg.number_format,
    ...(cfg.fraction ? { fraction: cfg.fraction } : {}),
    ...(cfg.fraction_units ? { fraction_units: cfg.fraction_units } : {}),
    ...(cfg.smallest ? { smallest_currency_fraction_value: cfg.smallest } : {}),
  };
  try {
    // Exists? enable + fix formatting.
    await frappe.getDoc('Currency', code);
    await frappe.updateDoc('Currency', code, payload);
  } catch {
    // Doesn't exist → create it.
    await ensure('Currency', { currency_name: code, ...payload });
  }
}

// Country → standard VAT/GST rate + label. Drives auto tax-template setup.
// Labels are used as ERPNext document names, so they must NOT contain
// "%" (breaks resource URLs). The rate is stored separately.
export const COUNTRY_TAX: Record<string, { label: string; rate: number }> = {
  // GCC
  'United Arab Emirates': { label: 'UAE VAT 5', rate: 5 },
  'Saudi Arabia': { label: 'KSA VAT 15', rate: 15 },
  Qatar: { label: 'Qatar VAT 5', rate: 5 },
  Bahrain: { label: 'Bahrain VAT 10', rate: 10 },
  Oman: { label: 'Oman VAT 5', rate: 5 },
  Kuwait: { label: 'Kuwait VAT 0', rate: 0 },
  // Others
  India: { label: 'GST 18', rate: 18 },
  'United States': { label: 'US Sales Tax', rate: 0 },
  'United Kingdom': { label: 'UK VAT 20', rate: 20 },
  Australia: { label: 'GST 10', rate: 10 },
};

// Ensure country tax templates (best-effort; tolerant of CoA differences).
async function ensureTaxTemplates(ctx: SetupContext) {
  const cfg = ctx.country ? COUNTRY_TAX[ctx.country] : undefined;
  if (!cfg) throw new Error(`No tax template preset for country "${ctx.country || 'unknown'}".`);

  // Find or create a tax account to post to.
  let accountHead: string | undefined;
  const existing = await frappe.getList('Account', {
    fields: JSON.stringify(['name']),
    filters: JSON.stringify([
      ['company', '=', ctx.company],
      ['account_type', '=', 'Tax'],
      ['is_group', '=', 0],
    ]),
    limit_page_length: 1,
  });
  if (Array.isArray(existing) && existing[0]?.name) {
    accountHead = existing[0].name;
  } else {
    // Create under the standard "Duties and Taxes" group if present.
    const parent = `Duties and Taxes - ${ctx.abbr}`;
    await ensure('Account', {
      account_name: cfg.label,
      parent_account: parent,
      company: ctx.company,
      account_type: 'Tax',
      tax_rate: cfg.rate,
    });
    accountHead = `${cfg.label} - ${ctx.abbr}`;
  }

  const taxes = [{ charge_type: 'On Net Total', account_head: accountHead, rate: cfg.rate, description: cfg.label }];
  await ensure('Sales Taxes and Charges Template', { title: `${cfg.label} (Sales)`, company: ctx.company, taxes });
  await ensure('Purchase Taxes and Charges Template', { title: `${cfg.label} (Purchase)`, company: ctx.company, taxes });
  await ensure('Tax Category', { title: cfg.label });
}

export const SETUP_ITEMS: SetupItem[] = [
  // ── Inventory ──────────────────────────────────────────────
  {
    key: 'item_group',
    label: 'Item Groups',
    group: 'Inventory',
    mandatory: true,
    description: 'Items must belong to a group. Creates a standard group tree.',
    check: async () => (await countOf('Item Group')) > 0,
    fix: async () => {
      await ensure('Item Group', { item_group_name: 'All Item Groups', is_group: 1 });
      await ensure('Item Group', { item_group_name: 'Products', parent_item_group: 'All Item Groups' });
      await ensure('Item Group', { item_group_name: 'Services', parent_item_group: 'All Item Groups' });
      await ensure('Item Group', { item_group_name: 'Raw Material', parent_item_group: 'All Item Groups' });
    },
  },
  {
    key: 'uom',
    label: 'Units of Measure',
    group: 'Inventory',
    mandatory: true,
    description: 'Quantities need units. Seeds common UOMs.',
    check: async () => (await countOf('UOM')) > 0,
    fix: async () => {
      for (const uom of ['Nos', 'Unit', 'Kg', 'Litre', 'Box', 'Hour', 'Day']) {
        await ensure('UOM', { uom_name: uom });
      }
    },
  },
  {
    key: 'warehouse',
    label: 'Default Warehouse',
    group: 'Inventory',
    mandatory: true,
    description: 'Stock transactions need a warehouse. Creates Stores & Finished Goods.',
    check: async (ctx) => (await countOf('Warehouse', [['company', '=', ctx.company]])) > 0,
    fix: async (ctx) => {
      await ensure('Warehouse', { warehouse_name: 'Stores', company: ctx.company });
      await ensure('Warehouse', { warehouse_name: 'Finished Goods', company: ctx.company });
    },
  },
  // ── Sales ──────────────────────────────────────────────────
  {
    key: 'selling_price_list',
    label: 'Selling Price List',
    group: 'Sales',
    mandatory: false,
    description: 'A default selling price list for quotations and orders.',
    check: async () => (await countOf('Price List', [['selling', '=', 1]])) > 0,
    fix: async (ctx) => {
      await ensure('Price List', {
        price_list_name: 'Standard Selling',
        selling: 1,
        currency: ctx.currency,
      });
    },
  },
  {
    key: 'customer_group',
    label: 'Customer Groups',
    group: 'Sales',
    mandatory: true,
    description: 'Customers must belong to a group.',
    check: async () => (await countOf('Customer Group')) > 0,
    fix: async () => {
      await ensure('Customer Group', { customer_group_name: 'All Customer Groups', is_group: 1 });
      await ensure('Customer Group', { customer_group_name: 'Commercial', parent_customer_group: 'All Customer Groups' });
      await ensure('Customer Group', { customer_group_name: 'Individual', parent_customer_group: 'All Customer Groups' });
    },
  },
  {
    key: 'territory',
    label: 'Territories',
    group: 'Sales',
    mandatory: true,
    description: 'Sales are scoped by territory.',
    check: async () => (await countOf('Territory')) > 0,
    fix: async (ctx) => {
      await ensure('Territory', { territory_name: 'All Territories', is_group: 1 });
      if (ctx.country) {
        await ensure('Territory', { territory_name: ctx.country, parent_territory: 'All Territories' });
      }
    },
  },
  // ── Purchase ───────────────────────────────────────────────
  {
    key: 'buying_price_list',
    label: 'Buying Price List',
    group: 'Purchase',
    mandatory: false,
    description: 'A default buying price list for purchase orders.',
    check: async () => (await countOf('Price List', [['buying', '=', 1]])) > 0,
    fix: async (ctx) => {
      await ensure('Price List', {
        price_list_name: 'Standard Buying',
        buying: 1,
        currency: ctx.currency,
      });
    },
  },
  {
    key: 'supplier_group',
    label: 'Supplier Groups',
    group: 'Purchase',
    mandatory: true,
    description: 'Suppliers must belong to a group.',
    check: async () => (await countOf('Supplier Group')) > 0,
    fix: async () => {
      await ensure('Supplier Group', { supplier_group_name: 'All Supplier Groups', is_group: 1 });
      await ensure('Supplier Group', { supplier_group_name: 'Local', parent_supplier_group: 'All Supplier Groups' });
      await ensure('Supplier Group', { supplier_group_name: 'Distributor', parent_supplier_group: 'All Supplier Groups' });
    },
  },
  // ── Accounts (best-effort mapping from existing CoA) ───────
  {
    key: 'gcc_currencies',
    label: 'GCC Currencies (BHD, KWD…)',
    group: 'Accounts',
    mandatory: false,
    description: 'Enable GCC currencies including BHD (symbol BD, 3 decimals) so they appear in every currency picker.',
    check: async () => {
      try {
        return !!(await frappe.getValue('Currency', 'BHD', 'enabled'));
      } catch {
        return false;
      }
    },
    fix: async () => {
      for (const c of Object.keys(GCC_CURRENCIES)) await ensureCurrencyEnabled(c);
    },
  },
  {
    key: 'tax_templates',
    label: 'Tax Templates',
    group: 'Accounts',
    mandatory: false,
    description: 'Country-specific sales & purchase tax templates (VAT / GST) based on the company country.',
    check: async (ctx) => (await countOf('Sales Taxes and Charges Template', [['company', '=', ctx.company]])) > 0,
    fix: ensureTaxTemplates,
  },
  {
    key: 'receivable_account',
    label: 'Default Receivable Account',
    group: 'Accounts',
    mandatory: true,
    description: 'Maps the company default receivable account from the Chart of Accounts.',
    check: async (ctx) => {
      const v = await frappe.getValue('Company', ctx.company, 'default_receivable_account');
      return !!v;
    },
    fix: async (ctx) => {
      const accts = await frappe.getList('Account', {
        fields: JSON.stringify(['name']),
        filters: JSON.stringify([
          ['company', '=', ctx.company],
          ['account_type', '=', 'Receivable'],
          ['is_group', '=', 0],
        ]),
        limit_page_length: 1,
      });
      const acc = Array.isArray(accts) && accts[0]?.name;
      if (acc) await frappe.updateDoc('Company', ctx.company, { default_receivable_account: acc });
    },
  },
  {
    key: 'payable_account',
    label: 'Default Payable Account',
    group: 'Accounts',
    mandatory: true,
    description: 'Maps the company default payable account from the Chart of Accounts.',
    check: async (ctx) => {
      const v = await frappe.getValue('Company', ctx.company, 'default_payable_account');
      return !!v;
    },
    fix: async (ctx) => {
      const accts = await frappe.getList('Account', {
        fields: JSON.stringify(['name']),
        filters: JSON.stringify([
          ['company', '=', ctx.company],
          ['account_type', '=', 'Payable'],
          ['is_group', '=', 0],
        ]),
        limit_page_length: 1,
      });
      const acc = Array.isArray(accts) && accts[0]?.name;
      if (acc) await frappe.updateDoc('Company', ctx.company, { default_payable_account: acc });
    },
  },
];
