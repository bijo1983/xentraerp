'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { CompiledField, evalDependsOn, isTruthyDocValue } from '@/lib/meta-compiler';
import { cn, STATUS_TONE } from '@/lib/utils';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { DOCUMENT_MAPPERS } from '@/lib/document-mappers';
import { stashMappedDoc } from '@/lib/mapped-doc';
import { doctypeListRoute } from '@/lib/doctype-routes';
import { linkFilters } from '@/lib/link-filters';
import { errorText, readJson } from '@/lib/errors';
import { frappe } from '@/lib/frappe';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LinkField } from '@/components/fields/link-field';
import { AttachField } from '@/components/fields/attach-field';
import { ChildTable } from './child-table';
import { PrintPanel } from './print-panel';
import { RecordDrawer } from './record-drawer';
import { RecordSummary } from './record-summary';
import { ItemPricePanel, useItemPrices } from './item-price-panel';
import { PosAccessPanel } from './pos-access-panel';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Printer, PanelRight, Plus, ChevronDown, Loader2, Copy, ChevronRight } from 'lucide-react';

interface Props {
  doctype: string;
  name?: string;
  initialDoc?: Record<string, unknown>;
  initial?: Record<string, unknown>;
  onSave?: (doc: Record<string, unknown>) => void;
  onSaved?: (name: string) => void;
  onCancel?: () => void;
  onClose?: () => void;
  /** Breadcrumb, title and status badge above the form (full-page forms). */
  showHeader?: boolean;
}

interface Tab {
  label: string;
  sections: Section[];
}

interface Section {
  label: string;
  fields: CompiledField[];
  depends_on?: string;
}

const AUTO_FIELDS = new Set([
  'name', 'owner', 'creation', 'modified', 'modified_by',
  'docstatus', 'idx', 'parent', 'parentfield', 'parenttype',
]);

// Splits on Tab Break fields *and* on any labeled Section Break — real
// ERPNext doctypes group almost everything into one giant first tab with
// many named sections (Accounting Dimensions, Taxes, Currency and Price
// List, ...) rather than real tabs, which is exactly the "one long
// scrolling form" experience that's hard to navigate. Promoting every
// labeled section to its own tab (unlabeled ones still just group fields
// within whatever tab is current — they're typically layout-only column
// breaks) generically produces "required fields up front, everything else
// in its own tab, accounting/tax/etc. each get their own tab" for any
// doctype, without hardcoding which section names count as "accounting" or
// "tax" — whatever the doctype's own authors labeled the section becomes
// the tab name.
function buildTabs(fields: CompiledField[]): Tab[] {
  const tabs: Tab[] = [];
  let currentTab: Tab = { label: 'Details', sections: [] };
  let currentSection: Section = { label: '', fields: [] };

  for (const f of fields) {
    if (f.component === 'tab_break' || (f.component === 'section_break' && f.label)) {
      // A new tab — from a real Tab Break, or a labeled Section Break
      // promoted to tab-level. No redundant section header repeating the
      // tab's own label.
      if (currentSection.fields.length) currentTab.sections.push(currentSection);
      if (currentTab.sections.length) tabs.push(currentTab);
      currentTab = { label: f.label || 'Details', sections: [] };
      currentSection = { label: '', fields: [], depends_on: f.component === 'section_break' ? f.depends_on : undefined };
    } else if (f.component === 'section_break') {
      // Unlabeled section break — just a layout grouping, stays in the
      // current tab as its own (unlabeled) section.
      if (currentSection.fields.length) currentTab.sections.push(currentSection);
      currentSection = { label: '', fields: [], depends_on: f.depends_on };
    } else if (
      !AUTO_FIELDS.has(f.fieldname) &&
      f.component !== 'hidden' &&
      // A field with `hidden: 1` in its DocType meta is usually not
      // permanently hidden — Frappe doctypes commonly author fields as
      // hidden-by-default-but-revealed-by-depends_on (e.g. Item's
      // "attributes" table, shown only once "Has Variants" is checked —
      // ERPNext's own item.js toggles it with the exact same condition
      // as its depends_on). Excluding it here unconditionally meant the
      // field could never appear no matter what the user did. Only treat
      // `hidden` as a hard veto when there's no depends_on to override it.
      (!f.hidden || f.depends_on)
    ) {
      currentSection.fields.push(f);
    }
  }
  if (currentSection.fields.length) currentTab.sections.push(currentSection);
  if (currentTab.sections.length) tabs.push(currentTab);

  const rawTabs = tabs.length ? tabs : [{ label: 'Details', sections: [{ label: '', fields: [] }] }];
  return consolidateTabs(rawTabs);
}

// ERPNext transaction doctypes routinely define far more Tab Break fields
// than fit in a tab bar without horizontal scrolling (Sales Order alone has
// around a dozen — Details, Accounting Dimensions, Currency and Price List,
// Items, Taxes, Totals, Additional Discount, Tax Breakup, Packing List,
// Pricing Rules, ...). Frappe Desk's own tab bar has an overflow affordance
// for this; this generic renderer doesn't, so instead of a scrolling wall
// of tabs, keep only the ones that matter for day-to-day data entry — the
// first tab, and any tab holding a child table (the actual working data:
// Items, Taxes and Charges, Packing List, ...) — and fold every other
// tab's sections into one trailing "More Details" tab. Nothing is removed,
// it's just not a dedicated top-level tab anymore.
// A hard cap on top-level tabs, independent of how many qualify as
// "primary" below — doctypes with several child tables (Item: Attributes,
// Item Tax, Reorder Levels, Item Defaults, Barcodes, ...) could otherwise
// still produce more primary tabs than fit across a normal screen width,
// forcing the same horizontal-scrolling tab bar this consolidation exists
// to avoid. Keeping the count fixed regardless of doctype is what actually
// makes "fits on screen" true everywhere, not just for doctypes with one
// child table.
const MAX_PRIMARY_TABS = 6;

function consolidateTabs(rawTabs: Tab[]): Tab[] {
  const hasTable = (tab: Tab) => tab.sections.some((s) => s.fields.some((f) => f.component === 'table'));

  const primary: Tab[] = [];
  const secondary: Tab[] = [];
  rawTabs.forEach((tab, i) => {
    if (i === 0 || hasTable(tab)) primary.push(tab);
    else secondary.push(tab);
  });

  // Tabs authored earlier in the doctype are the ones actually used day to
  // day (e.g. Items/Taxes before Packing List/Pricing Rules) — keep those,
  // fold anything past the cap into "More Details" together with the
  // already-secondary tabs instead of letting the tab bar overflow.
  const visible = primary.slice(0, MAX_PRIMARY_TABS);
  const overflowPrimary = primary.slice(MAX_PRIMARY_TABS);
  const folded = [...secondary, ...overflowPrimary];

  if (!folded.length) return visible;

  const toSections = (tabs: Tab[]): Section[] =>
    tabs.flatMap((tab) => tab.sections.map((section) => ({ ...section, label: section.label || tab.label })));

  // Price-related information should be readable on one page: Currency and
  // Price List, Additional Discount and Totals are folded into the tab
  // holding the main child table (Items, for every real sales/purchase
  // transaction), directly below the line items. Only those three — every
  // other folded tab (Accounting Dimensions, Terms, Address, More Info, ...)
  // stays out of Items, in the trailing "More Details" tab. Falls back to
  // "More Details" for everything when no visible tab has a table at all
  // (a pure master doctype with nothing to attach the price sections to).
  const targetIdx = visible.findIndex(hasTable);
  const priceTabs = targetIdx === -1 ? [] : folded.filter((tab) => PRICE_TAB_LABEL.test(tab.label.trim()));
  const otherTabs = folded.filter((tab) => !priceTabs.includes(tab));

  const withPrice = visible.map((tab, i) =>
    i === targetIdx && priceTabs.length ? { ...tab, sections: [...tab.sections, ...toSections(priceTabs)] } : tab
  );
  return otherTabs.length ? [...withPrice, { label: 'More Details', sections: toSections(otherTabs) }] : withPrice;
}

// Sections that make up a document's price picture — see consolidateTabs.
// Matches ERPNext's own labels ("Currency and Price List", "Additional
// Discount", "Totals") on Sales/Purchase Order, Quotation, Invoices, and
// Delivery Note/Purchase Receipt.
const PRICE_TAB_LABEL = /^(currency and price list|additional discount( and coupon code)?|totals)$/i;

// ── Server refresh ─────────────────────────────────────────────────
//
// Desk fills a form as you go (a customer's address and price list, an
// item's rate, fetch_from values, totals) with per-doctype client scripts
// this generic form can't run. Instead, after a change the whole unsaved
// document goes to custom_erp.api.form.refresh_doc, which runs ERPNext's own
// controller code on it and sends the filled-in copy back (nothing is
// saved). Edits the user makes while a refresh is in flight are tracked as
// paths ("customer", "items.2.qty") and win over the server's copy.

export interface FieldChange {
  fieldname: string;
  /** Child table fieldname, for a line field. */
  table?: string;
  /** 0-based line index, for a line field. */
  row?: number;
}

type Doc = Record<string, unknown>;
type Rows = Record<string, unknown>[];

function stripInternal(doc: Doc): Doc {
  const out: Doc = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k.startsWith('__') && k !== '__islocal') continue;
    out[k] = v;
  }
  return out;
}

function mergeServerDoc(server: Doc, current: Doc, dirty: Set<string>): Doc {
  const next: Doc = { ...server };
  // Keep identity fields the server copy may not echo back.
  for (const k of ['name', 'doctype', 'docstatus']) if (current[k] !== undefined && next[k] === undefined) next[k] = current[k];
  dirty.forEach((path) => {
    const [field, idx, sub] = path.split('.');
    if (idx === undefined) {
      next[field] = current[field];
      return;
    }
    const curRows = (current[field] as Rows) || [];
    const srvRows = (next[field] as Rows) || [];
    if (sub === undefined || curRows.length !== srvRows.length) {
      next[field] = curRows;
      return;
    }
    const i = Number(idx);
    next[field] = srvRows.map((r, j) => (j === i ? { ...r, [sub]: curRows[i]?.[sub] } : r));
  });
  return next;
}

function changePath(c: FieldChange): string {
  return c.table ? `${c.table}.${c.row ?? ''}.${c.fieldname}` : c.fieldname;
}

export default function DynamicForm({ doctype, name, initialDoc, initial, onSave, onSaved, onCancel, onClose, showHeader }: Props) {
  const router = useRouter();
  const tenantCode = useTenantCode();
  const { schema, loading, error } = useDocTypeSchema(doctype);
  const [doc, setDocState] = useState<Doc>(initialDoc || initial || {});
  const [docLoading, setDocLoading] = useState(!!name && !initialDoc && !initial);
  const [docError, setDocError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [transitioning, setTransitioning] = useState<'submit' | 'cancel' | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  // Open by default (not a click-to-reveal panel) whenever there's an
  // existing record to show comments/activity/connections for — matches
  // Frappe Desk's own always-visible sidebar. Still collapsible for anyone
  // who wants the extra width back.
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  // "Not Saved" marker, like Desk: set by any user edit, cleared on load/save.
  const [unsaved, setUnsaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Server defaults unavailable (older backend) — fall back to the local ones below.
  const [serverDefaultsFailed, setServerDefaultsFailed] = useState(false);

  // Item only: standard selling / purchase price inputs, stored as Item Price
  // records (see lib/item-prices.ts). Keyed on the `name` prop — not on the
  // name a just-created record gets — so a failed price save right after
  // creation doesn't reload the panel and wipe what the user typed.
  const isItem = doctype === 'Item';
  const [createdName, setCreatedName] = useState<string | null>(null);
  const savedName = name || createdName || undefined;
  const itemPrices = useItemPrices(isItem, name, doc.stock_uom as string | undefined);

  // ── Document state + server refresh queue ──
  const docRef = useRef<Doc>(doc);
  const setDoc = useCallback((update: Doc | ((prev: Doc) => Doc)) => {
    setDocState((prev) => {
      const next = typeof update === 'function' ? (update as (p: Doc) => Doc)(prev) : update;
      docRef.current = next;
      return next;
    });
  }, []);
  const dirty = useRef<Set<string>>(new Set());
  const queue = useRef<(FieldChange | null)[]>([]);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runQueue = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      while (queue.current.length) {
        const change = queue.current.shift() ?? null;
        const sent = docRef.current;
        if (Number(sent.docstatus ?? 0) !== 0) {
          queue.current = [];
          break;
        }
        dirty.current = new Set();
        try {
          const res = (await frappe.call('custom_erp.api.form.refresh_doc', {
            doc: JSON.stringify(stripInternal({ ...sent, doctype })),
            changed: change?.fieldname,
            table: change?.table,
            row: change?.table && change.row !== undefined ? change.row + 1 : undefined,
          })) as Doc;
          const edits = dirty.current;
          if (res && typeof res === 'object') setDoc((cur) => mergeServerDoc(res, cur, edits));
        } catch {
          // Best effort: the form still saves, and the server validates then.
        }
        // Let React commit the merged doc before the next queued change reads it.
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }, [doctype, setDoc]);

  const requestRefresh = useCallback(
    (change: FieldChange | null, delay = 250) => {
      const key = change ? changePath(change) : '';
      if (!queue.current.some((c) => (c ? changePath(c) : '') === key)) queue.current.push(change);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => runQueue(), delay);
    },
    [runQueue]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const waitForRefresh = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      if (queue.current.length) await runQueue();
    }
    while (busy.current) await new Promise((r) => setTimeout(r, 50));
  };

  // Editing an existing document: the caller only passes doctype/name (no
  // initialDoc), so fetch the real saved record here — otherwise `doc`
  // never holds anything but schema defaults, and every field without a
  // default (e.g. Time Zone, Country) silently renders blank even though
  // it's saved correctly server-side.
  useEffect(() => {
    if (!name || initialDoc || initial) return;
    let cancelled = false;
    setDocLoading(true);
    setDocError(null);
    fetch(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(readJson)
      .then((data) => {
        if (!cancelled) {
          setDoc((prev) => ({ ...prev, ...(data.data as Doc) }));
          setUnsaved(false);
        }
      })
      .catch((e) => {
        if (!cancelled) setDocError(errorText(e, 'This record could not be loaded.'));
      })
      .finally(() => {
        if (!cancelled) setDocLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctype, name, initialDoc, initial, setDoc]);

  // New document: ERPNext's own defaults — user defaults (company, ...),
  // Global Defaults, static defaults, and what the controller fills itself
  // (currency, price list, exchange rate, posting date/time, naming series).
  // Values the caller passed in (a list filter like ?purpose=...) win. A
  // document mapped from another one (Sales Order -> Delivery Note, a
  // duplicate, an amendment) already comes filled by the server, so it only
  // gets a refresh.
  const presetRef = useRef(initialDoc || initial);
  useEffect(() => {
    if (!schema || name) return;
    const preset = presetRef.current;
    if (preset?.doctype) {
      requestRefresh(null, 0);
      return;
    }
    let cancelled = false;
    frappe
      .call('custom_erp.api.form.get_new_doc', { doctype })
      .then((base) => {
        if (cancelled || !base || typeof base !== 'object') return;
        const keep = new Set([...Object.keys(preset || {}), ...Array.from(dirty.current)]);
        setDoc((prev) => mergeServerDoc({ ...prev, ...(base as Doc) }, prev, keep));
        if (preset && Object.keys(preset).length) requestRefresh(null, 0);
      })
      .catch(() => {
        if (!cancelled) setServerDefaultsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [schema, name, doctype, setDoc, requestRefresh]);

  useEffect(() => {
    if (!schema) return;
    setDoc((prev) => {
      const patched = { ...prev };
      for (const f of schema.fields) {
        if (patched[f.fieldname] === undefined && f.default !== undefined) {
          const dv = f.default as string;
          if (f.component === 'link') {
            // skip — referenced records may not exist
          } else if ((f.component === 'date' || f.component === 'datetime') && dv === 'Today') {
            patched[f.fieldname] = new Date().toISOString().slice(0, 10);
          } else if (f.component === 'check') {
            // Frappe's `default` is always a string ("0"/"1"), but the
            // *backend's* own Python validate() hooks routinely do
            // `if self.some_check_field:` — and the non-empty string "0" is
            // truthy in Python too, not just JS. Sending the raw default
            // string through on save made every untouched, correctly-
            // unchecked Check field look checked to server-side validation
            // (e.g. Item's is_fixed_asset/is_customer_provided_item/
            // has_variants), causing spurious ValidationErrors on a plain
            // save with no field ever visibly wrong in the UI. Store real
            // 0/1 so it round-trips correctly no matter which side reads it.
            patched[f.fieldname] = dv === '1' ? 1 : 0;
          } else {
            patched[f.fieldname] = dv;
          }
        }
      }
      return patched;
    });
  }, [schema, setDoc]);

  // Fallback for a backend without custom_erp.api.form: Company/Currency/
  // Price List from Global Defaults and Selling/Buying Settings, which Desk
  // fills by client script and the doctype meta doesn't carry.
  useEffect(() => {
    if (!schema || name || !serverDefaultsFailed) return;
    const fieldnames = new Set(schema.fields.map((f) => f.fieldname));
    const relevant = ['company', 'currency', 'price_list_currency', 'selling_price_list', 'buying_price_list', 'conversion_rate', 'plc_conversion_rate'];
    if (!relevant.some((f) => fieldnames.has(f))) return;

    let cancelled = false;
    (async () => {
      try {
        const gd = await fetch('/api/resource/Global%20Defaults/Global%20Defaults', { credentials: 'include' }).then((r) => r.json());
        const company = gd?.data?.default_company;
        const currency = gd?.data?.default_currency;
        const patch: Doc = {};
        if (fieldnames.has('company') && company) patch.company = company;
        if (fieldnames.has('currency') && currency) patch.currency = currency;
        if (fieldnames.has('price_list_currency') && currency) patch.price_list_currency = currency;
        if (fieldnames.has('conversion_rate')) patch.conversion_rate = 1;
        if (fieldnames.has('plc_conversion_rate')) patch.plc_conversion_rate = 1;
        if (fieldnames.has('selling_price_list')) {
          const ss = await fetch('/api/resource/Selling%20Settings/Selling%20Settings', { credentials: 'include' }).then((r) => r.json());
          if (ss?.data?.selling_price_list) patch.selling_price_list = ss.data.selling_price_list;
        }
        if (fieldnames.has('buying_price_list')) {
          const bs = await fetch('/api/resource/Buying%20Settings/Buying%20Settings', { credentials: 'include' }).then((r) => r.json());
          if (bs?.data?.buying_price_list) patch.buying_price_list = bs.data.buying_price_list;
        }
        if (!cancelled && Object.keys(patch).length) {
          setDoc((prev) => {
            const next = { ...prev };
            for (const [k, v] of Object.entries(patch)) {
              if (next[k] === undefined || next[k] === null || next[k] === '') next[k] = v;
            }
            return next;
          });
        }
      } catch {
        // Best-effort — leave the fields blank for the user to fill in.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schema, name, serverDefaultsFailed, setDoc]);

  /** A user edit of a header field. `refresh` asks the server to fill in what depends on it. */
  const setField = (fieldname: string, value: unknown, refresh = false, track = true) => {
    // Table edits are tracked per line and field by onTableEdit instead.
    if (track) dirty.current.add(fieldname);
    setUnsaved(true);
    setDoc((prev) => {
      const updated = { ...prev, [fieldname]: value };
      if (schema) {
        for (const f of schema.fields) {
          if (f.fieldtype === 'Dynamic Link' && f.options === fieldname) {
            updated[f.fieldname] = '';
          }
        }
      }
      return updated;
    });
    if (refresh) requestRefresh({ fieldname });
  };

  /** A user edit inside a child table (rows already updated through setField). */
  const onTableEdit = (table: string, change: { row: number; fieldname: string; commit: boolean }) => {
    dirty.current.add(change.row < 0 ? table : `${table}.${change.row}.${change.fieldname}`);
    setUnsaved(true);
    if (change.commit) requestRefresh(change.row < 0 ? { fieldname: table } : { fieldname: change.fieldname, table, row: change.row });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await waitForRefresh();
      const payload: Doc = stripInternal({ ...docRef.current, doctype });
      delete payload.__islocal;
      for (const key of Object.keys(payload)) {
        if (payload[key] === '__user') payload[key] = '';
      }
      // A new Item's price is saved as an Item Price by the panel below; a
      // `standard_rate` on the insert payload would make ERPNext create its
      // own (duplicate) Item Price as well.
      if (isItem && !savedName) delete payload.standard_rate;
      const url = savedName
        ? `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(savedName)}`
        : `/api/resource/${encodeURIComponent(doctype)}`;
      const data = await fetch(url, {
        method: savedName ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      }).then(readJson);
      const savedDoc = data.data as Doc;
      if (!savedName) setCreatedName(savedDoc?.name as string);
      setDoc((prev) => ({ ...prev, ...savedDoc }));
      setUnsaved(false);
      if (isItem) {
        try {
          await itemPrices.save(savedDoc?.name as string);
        } catch (priceErr) {
          // The Item itself is saved; only the price step failed. Stay on the
          // form (a retry updates this same record — see `savedName`) instead
          // of navigating away and losing the message.
          setSaveError(`The item was saved, but its price wasn't: ${errorText(priceErr)}`);
          return;
        }
      }
      onSave?.(savedDoc);
      onSaved?.(savedDoc?.name as string);
    } catch (e) {
      setSaveError(errorText(e, 'The record could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  // Submit/Cancel a saved submittable document. Frappe's REST resource API
  // (used by handleSave above) never transitions docstatus — that requires
  // calling frappe.client.submit/cancel explicitly, same as Frappe Desk
  // does. Without this, every transaction created here stayed a Draft
  // forever: no GL entries, no stock impact, and nothing downstream (a
  // Delivery Note, a Purchase Invoice, ...) could properly reference it.
  const runTransition = async (action: 'submit' | 'cancel') => {
    if (!name) return;
    if (action === 'submit' && unsaved) {
      setTransitionError('Save your changes before submitting.');
      return;
    }
    if (!window.confirm(action === 'submit'
      ? `Submit ${doctype} ${name}? A submitted document can no longer be edited, only cancelled.`
      : `Cancel ${doctype} ${name}? This reverses its accounting and stock entries.`)) return;
    setTransitioning(action);
    setTransitionError(null);
    try {
      const data = await fetch(`/api/method/xentraerp.client.${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ doc: JSON.stringify({ ...stripInternal(docRef.current), doctype, name }) }),
      }).then(readJson);
      const updated = data.message as Doc;
      setDoc((prev) => ({ ...prev, ...updated }));
      setUnsaved(false);
      onSave?.(updated);
    } catch (e) {
      setTransitionError(errorText(e, `The document could not be ${action === 'submit' ? 'submitted' : 'cancelled'}.`));
    } finally {
      setTransitioning(null);
    }
  };

  // "Create >" chained-document actions (e.g. Sales Order -> Delivery
  // Note) — calls ERPNext's own mapper method, which returns a fully
  // populated but unsaved target document, then opens a New form
  // pre-filled with it for the user to review before saving. Not a save
  // itself — nothing is created server-side until that New form is saved.
  const createLinkedDocument = async (mapper: { targetDoctype: string; method: string; paramStyle?: 'source_name' | 'dt_dn' | 'selected_items' }) => {
    if (!name) return;
    setCreatingFrom(mapper.method);
    setCreateError(null);
    try {
      let args: Doc;
      if (mapper.paramStyle === 'dt_dn') {
        args = { dt: doctype, dn: name };
      } else if (mapper.paramStyle === 'selected_items') {
        // No row-picker dialog here — send every line currently on the
        // document, matching "select all" in Frappe Desk's own picker.
        const rows = (doc.items as Rows | undefined) || [];
        const items = rows.filter((r) => r.item_code).map((r) => ({ item_code: r.item_code }));
        if (!items.length) throw new Error('This document has no items to create a Purchase Order from.');
        args = { source_name: name, selected_items: JSON.stringify(items) };
      } else {
        args = { source_name: name };
      }
      const mapped = await frappe.call(mapper.method, args);
      const key = stashMappedDoc(mapped as Doc);
      router.push(withTenant(`/app/${encodeURIComponent(mapper.targetDoctype)}/new?from=${key}`, tenantCode));
    } catch (e) {
      setCreateError(errorText(e));
    } finally {
      setCreatingFrom(null);
    }
  };

  // Duplicate (any saved record) and Amend (a cancelled one): Desk's
  // frappe.model.copy_doc — the same document without its identity and
  // no_copy fields, opened as a new unsaved form.
  const copyDocument = (amend: boolean) => {
    if (!schema || !name) return;
    const skip = new Set(['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'amended_from', 'idx', '_comments', '_assign', '_liked_by', '_user_tags', '_seen']);
    schema.fields.forEach((f) => f.no_copy && skip.add(f.fieldname));
    const copy: Doc = { doctype };
    for (const [k, v] of Object.entries(doc)) {
      if (skip.has(k) || k.startsWith('__')) continue;
      copy[k] = Array.isArray(v)
        ? (v as Rows).map((r) => {
            const row = { ...r };
            for (const k of ['name', 'parent', 'creation', 'modified', 'modified_by', 'owner', 'docstatus']) delete row[k];
            return row;
          })
        : v;
    }
    if (amend) copy.amended_from = name;
    const key = stashMappedDoc(copy);
    router.push(withTenant(`/app/${encodeURIComponent(doctype)}/new?from=${key}`, tenantCode));
  };

  if (loading || docLoading) return <p className="text-muted-foreground p-4">Loading form…</p>;
  if (error) return <p className="text-destructive p-4">Error loading form: {error}</p>;
  if (docError) return <p className="text-destructive p-4">{docError}</p>;
  if (!schema) return null;

  const docstatus = Number(doc.docstatus ?? 0);
  // A submitted or cancelled document is read-only, except the fields the
  // doctype marks "allow on submit" (Desk behaves the same).
  const isLocked = (f: CompiledField) => !!f.read_only || (docstatus > 0 && !(docstatus === 1 && f.allow_on_submit));
  // On Item, the old "Standard Selling Rate" field (shown only while creating)
  // is replaced by the price panel, which also covers the purchase price.
  const tabs = buildTabs(isItem ? schema.fields.filter((f) => f.fieldname !== 'standard_rate') : schema.fields);

  // A tab whose fields include an unfilled required one gets flagged in the
  // tab bar — the user shouldn't have to visit every tab to discover which
  // one is blocking save. Only counts a field if its section and the field
  // itself are actually visible right now (depends_on-gated fields the user
  // can't even see yet don't count against the tab).
  const isEmpty = (v: unknown) => v === undefined || v === null || v === '';
  const tabMissingRequired = tabs.map((tab) =>
    tab.sections.some(
      (section) =>
        evalDependsOn(section.depends_on, doc) &&
        section.fields.some(
          (f) =>
            evalDependsOn(f.depends_on, doc) &&
            (f.reqd || (f.mandatory_depends_on && evalDependsOn(f.mandatory_depends_on, doc))) &&
            isEmpty(doc[f.fieldname])
        )
    )
  );

  const title =
    (schema.title_field && typeof doc[schema.title_field] === 'string' && (doc[schema.title_field] as string)) ||
    (savedName as string) ||
    `New ${doctype}`;
  const status = statusOf(doc, schema.is_submittable, !savedName, unsaved);

  return (
    <div className="space-y-4">
    {showHeader && (
      <div className="space-y-1">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link href={withTenant(doctypeListRoute(doctype), tenantCode)} className="hover:text-foreground hover:underline">
            {doctype}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate">{savedName || 'New'}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {status && <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', status.tone)}>{status.label}</span>}
          {refreshing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Updating" />}
          {savedName && title !== savedName && <span className="text-sm text-muted-foreground">{savedName}</span>}
        </div>
      </div>
    )}
    <div className="flex items-start gap-4">
    <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border/80 bg-card shadow-elevation-xs">
      <RecordSummary fields={schema.fields} doc={doc} />

      {/* Toolbar — primary actions live at the top so Save/Submit/Print
          are always reachable without scrolling down through a
          potentially long tab first, matching where a user actually
          looks for them on first opening a record. */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-5 py-3">
        {docstatus === 0 && (
          <Button onClick={handleSave} disabled={saving || !!transitioning}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        )}
        {schema.is_submittable && name && docstatus === 0 && (
          <Button variant={unsaved ? 'outline' : 'default'} onClick={() => runTransition('submit')} disabled={saving || !!transitioning}>
            {transitioning === 'submit' ? 'Submitting…' : 'Submit'}
          </Button>
        )}
        {schema.is_submittable && name && docstatus === 1 && (
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => runTransition('cancel')}
            disabled={!!transitioning}
          >
            {transitioning === 'cancel' ? 'Cancelling…' : 'Cancel Document'}
          </Button>
        )}
        {schema.is_submittable && name && docstatus === 2 && (
          <Button onClick={() => copyDocument(true)}>Amend</Button>
        )}
        {name && DOCUMENT_MAPPERS[doctype]?.length > 0 && (!schema.is_submittable || docstatus === 1) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1.5" disabled={!!creatingFrom}>
                {creatingFrom ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {DOCUMENT_MAPPERS[doctype].map((m) => (
                <DropdownMenuItem key={m.method} onSelect={() => createLinkedDocument(m)}>
                  {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {name && (
          <Button variant="outline" className="gap-1.5" onClick={() => setPrintOpen(true)}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        )}
        {name && doctype !== 'User' && (
          <Button variant="outline" className="gap-1.5" onClick={() => copyDocument(false)} title="Open a new copy of this record">
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </Button>
        )}
        {name && !drawerOpen && (
          <Button variant="outline" className="gap-1.5" onClick={() => setDrawerOpen(true)}>
            <PanelRight className="h-3.5 w-3.5" />
            Show Comments &amp; Activity
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {(onCancel || onClose) && (
            <Button variant="outline" onClick={onCancel ?? onClose} disabled={saving || !!transitioning}>
              Close
            </Button>
          )}
        </div>
      </div>
      {(saveError || transitionError || createError) && (
        <div className="space-y-2 border-b bg-background px-5 py-3">
          {[saveError, transitionError, createError].filter(Boolean).map((msg, i) => (
            <p key={i} className="whitespace-pre-line text-sm text-destructive border border-destructive/30 rounded p-2 bg-destructive/10">
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b bg-muted/30 px-2 pt-2">
        {tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={cn(
              'relative flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-3.5 py-2 text-[13px] font-medium transition-smooth transition-colors',
              activeTab === i
                ? 'bg-card text-foreground'
                : tabMissingRequired[i]
                  ? 'text-destructive/90 hover:bg-card/60 hover:text-destructive'
                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
            )}
          >
            {tab.label}
            {tabMissingRequired[i] && (
              <span
                className={cn('h-1.5 w-1.5 shrink-0 rounded-full', activeTab === i ? 'bg-destructive' : 'bg-destructive/80')}
                title="This tab has a required field that isn't filled in yet"
              />
            )}
            {activeTab === i && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="p-5 space-y-6">
        {isItem && activeTab === 0 && <ItemPricePanel state={itemPrices} />}
        {doctype === 'User' && name && activeTab === 0 && <PosAccessPanel user={name} />}
        {tabs[activeTab]?.sections
          .filter((section) => evalDependsOn(section.depends_on, doc))
          .map((section, si) => {
            const visibleFields = section.fields.filter((f) => evalDependsOn(f.depends_on, doc));
            if (!visibleFields.length) return null;
            return (
              <div key={si}>
                {section.label && (
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 pb-1 border-b border-border">
                    {section.label}
                  </h3>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleFields.map((f) => {
                    const isMandatory = f.reqd || (f.mandatory_depends_on ? evalDependsOn(f.mandatory_depends_on, doc) : false);
                    return (
                      <div
                        key={f.fieldname}
                        className={f.component === 'table' || f.component === 'textarea' ? 'col-span-full' : ''}
                      >
                        <label className="block text-sm font-medium mb-1">
                          {f.label}
                          {isMandatory && <span className="text-destructive ml-1">*</span>}
                        </label>
                        {renderField(f, doc, { setField, onTableEdit, locked: isLocked(f), docLocked: docstatus > 0, tenantCode })}
                        {f.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>
      {name && <PrintPanel doctype={doctype} name={name} fields={schema.fields} open={printOpen} onOpenChange={setPrintOpen} />}
    </div>
    {name && drawerOpen && <RecordDrawer doctype={doctype} name={name} onClose={() => setDrawerOpen(false)} />}
    </div>
    </div>
  );
}

// The badge next to the title: the document's own status when it has one,
// else Draft / Submitted / Cancelled, and "Not Saved" while there are edits.
function statusOf(doc: Doc, submittable: boolean, isNew: boolean, unsaved: boolean): { label: string; tone: string } | null {
  if (isNew) return { label: 'Not Saved', tone: STATUS_TONE.warning };
  if (unsaved) return { label: 'Not Saved', tone: STATUS_TONE.warning };
  const docstatus = Number(doc.docstatus ?? 0);
  const label = (typeof doc.status === 'string' && doc.status) || (submittable ? ['Draft', 'Submitted', 'Cancelled'][docstatus] : '');
  if (!label) return null;
  const tone = /cancel|overdue|lost|reject|expired|closed/i.test(label)
    ? STATUS_TONE.danger
    : /paid|completed|delivered|received|converted|ordered|billed|active|enabled|open/i.test(label) && !/unpaid|partly|not /i.test(label)
      ? STATUS_TONE.success
      : /draft/i.test(label)
        ? STATUS_TONE.neutral
        : /unpaid|partly|pending|to /i.test(label)
          ? STATUS_TONE.warning
          : STATUS_TONE.progress;
  return { label, tone };
}

interface RenderCtx {
  setField: (k: string, v: unknown, refresh?: boolean, track?: boolean) => void;
  onTableEdit: (table: string, change: { row: number; fieldname: string; commit: boolean }) => void;
  /** This field can't be edited (read-only field, or the document is submitted). */
  locked: boolean;
  /** The whole document is submitted/cancelled. */
  docLocked: boolean;
  tenantCode: string | null;
}

// Number inputs ask for a refresh when the user leaves the field with a
// different value, not on every keystroke (a refresh mid-typing would
// rewrite "1." to "1").
function commitOnBlur(onCommit: () => void) {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.dataset.before = e.currentTarget.value;
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.currentTarget.dataset.before !== e.currentTarget.value) onCommit();
    },
  };
}

function renderField(f: CompiledField, doc: Doc, ctx: RenderCtx) {
  const { setField } = ctx;
  const value = doc[f.fieldname];
  const readOnly = ctx.locked;

  switch (f.component) {
    case 'readonly':
      return <Input value={String(value ?? '')} disabled />;

    case 'check':
      return (
        <input
          type="checkbox"
          checked={isTruthyDocValue(value)}
          disabled={readOnly}
          className="h-4 w-4"
          onChange={(e) => setField(f.fieldname, e.target.checked ? 1 : 0, true)}
        />
      );

    case 'select': {
      const opts = (f.options || '').split('\n').filter(Boolean);
      return (
        <select
          className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-70"
          value={String(value ?? '')}
          disabled={readOnly}
          onChange={(e) => setField(f.fieldname, e.target.value, true)}
        >
          <option value="">— Select —</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }

    case 'link': {
      if (f.fieldtype === 'Dynamic Link') {
        const typeSelectorFieldname = f.options || '';
        const linkTarget = typeSelectorFieldname ? (doc[typeSelectorFieldname] as string) || '' : '';
        return (
          <LinkField
            target={linkTarget}
            value={(value as string) || ''}
            disabled={readOnly || !linkTarget}
            onChange={(v) => setField(f.fieldname, v, true)}
            tenantCode={ctx.tenantCode}
          />
        );
      }
      return (
        <LinkField
          target={f.options || ''}
          value={(value as string) || ''}
          disabled={readOnly}
          filters={linkFilters(f.options || '', doc)}
          onChange={(v) => setField(f.fieldname, v, true)}
          tenantCode={ctx.tenantCode}
        />
      );
    }

    case 'date':
      return (
        <Input
          type="date"
          disabled={readOnly}
          value={String(value ?? '')}
          onChange={(e) => setField(f.fieldname, e.target.value, true)}
        />
      );

    case 'datetime': {
      const dtVal = ((value as string) || '').replace(' ', 'T').slice(0, 16);
      return (
        <Input
          type="datetime-local"
          disabled={readOnly}
          value={dtVal}
          onChange={(e) => setField(f.fieldname, e.target.value ? e.target.value.replace('T', ' ') + ':00' : '', true)}
        />
      );
    }

    case 'number':
      if (readOnly && isMoney(f)) {
        return <Input value={formatNumber(value, f)} disabled className="text-right tabular-nums" />;
      }
      return (
        <Input
          type="number"
          disabled={readOnly}
          className="tabular-nums"
          value={String(value ?? '')}
          onChange={(e) => setField(f.fieldname, e.target.value)}
          {...commitOnBlur(() => setField(f.fieldname, docNumber(doc, f.fieldname), true))}
        />
      );

    case 'textarea':
      return (
        <textarea
          className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-y disabled:opacity-70"
          disabled={readOnly}
          value={String(value ?? '')}
          onChange={(e) => setField(f.fieldname, e.target.value)}
        />
      );

    case 'attach':
      return (
        <AttachField
          value={String(value ?? '')}
          onChange={(v) => setField(f.fieldname, v)}
          disabled={readOnly}
          isImage={f.fieldtype === 'Attach Image'}
        />
      );

    case 'table': {
      const childDoctype = f.options || '';
      const rows = (value as Rows) || [];
      return (
        <ChildTable
          childDoctype={childDoctype}
          rows={rows}
          readOnly={readOnly || ctx.docLocked}
          parentDoc={doc}
          onChange={(updated) => setField(f.fieldname, updated.map((r, i) => ({ ...r, idx: i + 1 })), false, false)}
          onEdit={(change) => ctx.onTableEdit(f.fieldname, change)}
        />
      );
    }

    default:
      return (
        <Input
          disabled={readOnly}
          value={String(value ?? '')}
          onChange={(e) => setField(f.fieldname, e.target.value)}
        />
      );
  }
}

// The value already in state — commitOnBlur only needs to trigger the refresh.
function docNumber(doc: Doc, fieldname: string): unknown {
  return doc[fieldname];
}

function isMoney(f: CompiledField) {
  return f.fieldtype === 'Currency' || f.fieldtype === 'Float' || f.fieldtype === 'Percent';
}

function formatNumber(v: unknown, f: CompiledField): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (v === undefined || v === null || v === '' || !Number.isFinite(n)) return '';
  if (f.fieldtype === 'Percent') return `${n}%`;
  return n.toLocaleString('en-US', { minimumFractionDigits: f.fieldtype === 'Currency' ? 2 : 0, maximumFractionDigits: 3 });
}

export { DynamicForm };
