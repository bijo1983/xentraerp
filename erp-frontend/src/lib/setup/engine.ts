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
