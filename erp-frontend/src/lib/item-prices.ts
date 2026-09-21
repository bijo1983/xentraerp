// Item prices — the "Standard Selling / Standard Purchase price" an item is
// set up with — stored the way ERPNext itself stores them: as Item Price
// records against a Price List. That is what its pricing engine, reports and
// every other ERPNext screen read, so a price entered here shows up
// everywhere, not just in this app.
//
// Which Price List: the tenant's default selling list (Selling Settings) and
// default buying list (Buying Settings) — "Standard Selling" / "Standard
// Buying" on a tenant provisioned by this app (see provisioning.py).
import { frappe } from '@/lib/frappe';

export type PriceSide = 'selling' | 'buying';

export interface PriceList {
  name: string;
  currency: string | null;
}

export interface ItemPriceRow {
  name: string;
  rate: number;
}

export interface DefaultPriceLists {
  selling: PriceList | null;
  buying: PriceList | null;
}

interface RawPriceRow {
  name: string;
  price_list: string;
  price_list_rate: number;
  uom?: string | null;
  customer?: string | null;
  supplier?: string | null;
  valid_from?: string | null;
  valid_upto?: string | null;
  modified?: string;
}

const FALLBACK: Record<PriceSide, string> = { selling: 'Standard Selling', buying: 'Standard Buying' };

// Tenant defaults rarely change within a session; every transaction line
// would otherwise refetch them.
let listsCache: Promise<DefaultPriceLists> | null = null;

async function resolveList(side: PriceSide): Promise<PriceList | null> {
  const [settingsDoctype, field] = side === 'selling' ? ['Selling Settings', 'selling_price_list'] : ['Buying Settings', 'buying_price_list'];
  let name: string | null = null;
  try {
    const s = await frappe.getDoc(settingsDoctype, settingsDoctype);
    name = (s?.[field] as string) || null;
  } catch {
    /* fall back to the conventional name below */
  }
  name = name || FALLBACK[side];
  try {
    const pl = await frappe.getDoc('Price List', name);
    if (pl?.enabled === 0) return null;
    return { name, currency: (pl?.currency as string) || null };
  } catch {
    return null; // the list doesn't exist on this tenant
  }
}

export function getDefaultPriceLists(): Promise<DefaultPriceLists> {
  if (!listsCache) {
    listsCache = Promise.all([resolveList('selling'), resolveList('buying')])
      .then(([selling, buying]) => ({ selling, buying }))
      .catch((e) => {
        listsCache = null; // don't cache a failure
        throw e;
      });
  }
  return listsCache;
}

/** Test/edge use: force the next lookup to re-read the tenant's settings. */
export function resetPriceListCache() {
  listsCache = null;
}

// Rows that apply to any customer/supplier and to the item's own stock unit —
// what "the item's standard price" means. Party-specific or other-UOM rows
// are real ERPNext features but not a single "standard" number.
function isStandardRow(r: RawPriceRow, stockUom: string | null | undefined): boolean {
  if (r.customer || r.supplier) return false;
  if (r.uom && stockUom && r.uom !== stockUom) return false;
  return true;
}

function isCurrent(r: RawPriceRow, today: string): boolean {
  if (r.valid_from && r.valid_from > today) return false;
  if (r.valid_upto && r.valid_upto < today) return false;
  return true;
}

async function fetchRows(itemCode: string, priceLists: string[]): Promise<RawPriceRow[]> {
  if (!priceLists.length) return [];
  const rows = await frappe.getList('Item Price', {
    fields: JSON.stringify(['name', 'price_list', 'price_list_rate', 'uom', 'customer', 'supplier', 'valid_from', 'valid_upto', 'modified']),
    filters: JSON.stringify([
      ['item_code', '=', itemCode],
      ['price_list', 'in', priceLists],
    ]),
    order_by: 'modified desc',
    limit_page_length: 50,
  });
  return rows as RawPriceRow[];
}

function pickStandard(rows: RawPriceRow[], priceList: string, stockUom: string | null | undefined): RawPriceRow | null {
  const today = new Date().toISOString().slice(0, 10);
  // Rows arrive newest-modified first; prefer one that is in force today.
  const mine = rows.filter((r) => r.price_list === priceList && isStandardRow(r, stockUom));
  return mine.find((r) => isCurrent(r, today)) || mine[0] || null;
}

/** The item's current standard selling and buying price, or null for each that isn't set. */
export async function loadItemPrices(
  itemCode: string,
  lists: DefaultPriceLists,
  stockUom?: string | null
): Promise<Record<PriceSide, ItemPriceRow | null>> {
  const names = [lists.selling?.name, lists.buying?.name].filter((n): n is string => !!n);
  const rows = await fetchRows(itemCode, names);
  const toRow = (r: RawPriceRow | null): ItemPriceRow | null => (r ? { name: r.name, rate: Number(r.price_list_rate) } : null);
  return {
    selling: lists.selling ? toRow(pickStandard(rows, lists.selling.name, stockUom)) : null,
    buying: lists.buying ? toRow(pickStandard(rows, lists.buying.name, stockUom)) : null,
  };
}

export type PriceInput = { value: string; existing: ItemPriceRow | null; list: PriceList | null };

/**
 * Creates or updates the Item Price for each side that has a value.
 * A blank input on a side that has no price yet is simply skipped; a blank on
 * a side that already has one leaves it untouched (removing a price is a
 * deliberate act — use the Item Price list for that — not a side effect of
 * clearing a text box).
 * Returns the rows as saved, so the caller can refresh what it shows.
 */
export async function saveItemPrices(
  itemCode: string,
  inputs: Record<PriceSide, PriceInput>
): Promise<Record<PriceSide, ItemPriceRow | null>> {
  const out: Record<PriceSide, ItemPriceRow | null> = { selling: inputs.selling.existing, buying: inputs.buying.existing };
  for (const side of ['selling', 'buying'] as const) {
    const { value, existing, list } = inputs[side];
    const text = value.trim();
    if (text === '') continue;
    const rate = Number(text);
    if (!Number.isFinite(rate) || rate < 0) throw new Error(`${side === 'selling' ? 'Selling' : 'Purchase'} price must be a number, 0 or more.`);
    if (!list) throw new Error(`No default ${side} price list is set up for this organization, so a ${side === 'selling' ? 'selling' : 'purchase'} price can't be saved.`);
    if (existing) {
      if (existing.rate !== rate) await frappe.updateDoc('Item Price', encodeURIComponent(existing.name), { price_list_rate: rate });
      out[side] = { name: existing.name, rate };
    } else {
      const created = await frappe.createDoc('Item Price', { item_code: itemCode, price_list: list.name, price_list_rate: rate });
      out[side] = { name: created.name as string, rate };
    }
  }
  return out;
}

/**
 * Rate to pre-fill on a transaction line, or undefined when there's no price
 * set for that item on that side. Used by the item-line grid.
 */
export async function lookupPrice(
  itemCode: string,
  side: PriceSide,
  priceListName: string | null | undefined,
  stockUom?: string | null
): Promise<number | undefined> {
  const list = priceListName || (await getDefaultPriceLists())[side]?.name;
  if (!list) return undefined;
  try {
    const rows = await fetchRows(itemCode, [list]);
    const row = pickStandard(rows, list, stockUom);
    return row ? Number(row.price_list_rate) : undefined;
  } catch {
    return undefined;
  }
}
