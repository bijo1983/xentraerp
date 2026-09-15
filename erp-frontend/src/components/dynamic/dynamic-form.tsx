'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { CompiledField, evalDependsOn, isTruthyDocValue } from '@/lib/meta-compiler';
import { cn } from '@/lib/utils';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { DOCUMENT_MAPPERS } from '@/lib/document-mappers';
import { stashMappedDoc } from '@/lib/mapped-doc';
import { frappe } from '@/lib/frappe';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LinkField } from '@/components/fields/link-field';
import { AttachField } from '@/components/fields/attach-field';
import { ChildTable } from './child-table';
import { PrintPanel } from './print-panel';
import { RecordDrawer } from './record-drawer';
import { RecordSummary } from './record-summary';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Printer, PanelRight, Plus, ChevronDown, Loader2 } from 'lucide-react';

interface Props {
  doctype: string;
  name?: string;
  initialDoc?: Record<string, unknown>;
  initial?: Record<string, unknown>;
  onSave?: (doc: Record<string, unknown>) => void;
  onSaved?: (name: string) => void;
  onCancel?: () => void;
  onClose?: () => void;
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
function consolidateTabs(rawTabs: Tab[]): Tab[] {
  const hasTable = (tab: Tab) => tab.sections.some((s) => s.fields.some((f) => f.component === 'table'));

  const primary: Tab[] = [];
  const secondary: Tab[] = [];
  rawTabs.forEach((tab, i) => {
    if (i === 0 || hasTable(tab)) primary.push(tab);
    else secondary.push(tab);
  });

  if (!secondary.length) return primary;

  const moreSections: Section[] = secondary.flatMap((tab) =>
    tab.sections.map((section) => ({ ...section, label: section.label || tab.label }))
  );
  return [...primary, { label: 'More Details', sections: moreSections }];
}

export default function DynamicForm({ doctype, name, initialDoc, initial, onSave, onSaved, onCancel, onClose }: Props) {
  const router = useRouter();
  const tenantCode = useTenantCode();
  const { schema, loading, error } = useDocTypeSchema(doctype);
  const [doc, setDoc] = useState<Record<string, unknown>>(initialDoc || initial || {});
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
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.exception || data?.message || res.statusText);
        if (!cancelled) setDoc((prev) => ({ ...prev, ...data.data }));
      })
      .catch((e) => {
        if (!cancelled) setDocError(String(e instanceof Error ? e.message : e));
      })
      .finally(() => {
        if (!cancelled) setDocLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctype, name, initialDoc, initial]);

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
  }, [schema]);

  // Company/Currency/Price List defaults — deliberately separate from the
  // meta-driven defaults effect above, because these aren't in the
  // doctype's own `default` metadata at all; Frappe Desk fills them from
  // Global Defaults / Selling & Buying Settings via client script, which
  // this generic form doesn't run. Without this every new transaction
  // opened with Company, Currency, Price List, and Exchange Rate all
  // blank, forcing a manual pick on every single record even though the
  // tenant only has one company/currency. Only touches fields that exist
  // on this doctype and aren't already set, and never overrides a real
  // multi-currency choice the user makes afterward.
  useEffect(() => {
    if (!schema || name) return;
    const fieldnames = new Set(schema.fields.map((f) => f.fieldname));
    const relevant = ['company', 'currency', 'price_list_currency', 'selling_price_list', 'buying_price_list', 'conversion_rate', 'plc_conversion_rate'];
    if (!relevant.some((f) => fieldnames.has(f))) return;

    let cancelled = false;
    (async () => {
      try {
        const gd = await fetch('/api/resource/Global%20Defaults/Global%20Defaults', { credentials: 'include' }).then((r) => r.json());
        const company = gd?.data?.default_company;
        const currency = gd?.data?.default_currency;
        const patch: Record<string, unknown> = {};
        if (fieldnames.has('company') && company) patch.company = company;
        if (fieldnames.has('currency') && currency) patch.currency = currency;
        if (fieldnames.has('price_list_currency') && currency) patch.price_list_currency = currency;
        // Single-currency tenants (the common case): price list / customer
        // currency equals the company currency, so a 1:1 conversion rate is
        // correct. A genuinely multi-currency transaction still needs the
        // user (or ERPNext's own validation) to correct this.
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
        // Best-effort — leave the fields blank for the user to fill in
        // manually, same as before this convenience existed.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schema, name]);

  const setField = (fieldname: string, value: unknown) => {
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
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload: Record<string, unknown> = { ...doc, doctype };
      for (const key of Object.keys(payload)) {
        if (payload[key] === '__user') payload[key] = '';
      }
      const url = name
        ? `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
        : `/api/resource/${encodeURIComponent(doctype)}`;
      const res = await fetch(url, {
        method: name ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.exception || data?.message || res.statusText);
      onSave?.(data.data);
      onSaved?.((data.data as Record<string, unknown>)?.name as string);
    } catch (e) {
      setSaveError(String(e));
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
    setTransitioning(action);
    setTransitionError(null);
    try {
      const res = await fetch(`/api/method/frappe.client.${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ doc: JSON.stringify({ ...doc, doctype, name }) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.exception || data?.message?.exception || data?.message || res.statusText);
      const updated = data.message as Record<string, unknown>;
      setDoc((prev) => ({ ...prev, ...updated }));
      onSave?.(updated);
    } catch (e) {
      setTransitionError(String(e instanceof Error ? e.message : e));
    } finally {
      setTransitioning(null);
    }
  };

  // "Create >" chained-document actions (e.g. Sales Order -> Delivery
  // Note) — calls ERPNext's own mapper method, which returns a fully
  // populated but unsaved target document, then opens a New form
  // pre-filled with it for the user to review before saving. Not a save
  // itself — nothing is created server-side until that New form is saved.
  const createLinkedDocument = async (mapper: { targetDoctype: string; method: string }) => {
    if (!name) return;
    setCreatingFrom(mapper.method);
    setCreateError(null);
    try {
      const mapped = await frappe.call(mapper.method, { source_name: name });
      const key = stashMappedDoc(mapped as Record<string, unknown>);
      router.push(withTenant(`/app/${encodeURIComponent(mapper.targetDoctype)}/new?from=${key}`, tenantCode));
    } catch (e) {
      setCreateError(String(e instanceof Error ? e.message : e));
    } finally {
      setCreatingFrom(null);
    }
  };

  if (loading || docLoading) return <p className="text-muted-foreground p-4">Loading form…</p>;
  if (error) return <p className="text-destructive p-4">Error loading form: {error}</p>;
  if (docError) return <p className="text-destructive p-4">Error loading document: {docError}</p>;
  if (!schema) return null;

  const docstatus = Number(doc.docstatus ?? 0);
  const tabs = buildTabs(schema.fields);

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

  return (
    <div className="flex items-start gap-4">
    <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border/80 bg-card shadow-elevation-xs">
      <RecordSummary fields={schema.fields} doc={doc} />
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
                        {renderField(f, doc, setField)}
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

        {saveError && (
          <p className="text-sm text-destructive border border-destructive/30 rounded p-2 bg-destructive/10">
            {saveError}
          </p>
        )}
        {transitionError && (
          <p className="text-sm text-destructive border border-destructive/30 rounded p-2 bg-destructive/10">
            {transitionError}
          </p>
        )}
        {createError && (
          <p className="text-sm text-destructive border border-destructive/30 rounded p-2 bg-destructive/10">
            {createError}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          {docstatus === 0 && (
            <Button onClick={handleSave} disabled={saving || !!transitioning}>
              {saving ? 'Saving…' : name ? 'Update' : 'Save'}
            </Button>
          )}
          {schema.is_submittable && name && docstatus === 0 && (
            <Button onClick={() => runTransition('submit')} disabled={saving || !!transitioning}>
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
          {name && !drawerOpen && (
            <Button variant="outline" className="gap-1.5" onClick={() => setDrawerOpen(true)}>
              <PanelRight className="h-3.5 w-3.5" />
              Show Comments &amp; Activity
            </Button>
          )}
          {(onCancel || onClose) && (
            <Button variant="outline" onClick={onCancel ?? onClose} disabled={saving || !!transitioning}>
              Close
            </Button>
          )}
        </div>
      </div>
      {name && <PrintPanel doctype={doctype} name={name} fields={schema.fields} open={printOpen} onOpenChange={setPrintOpen} />}
    </div>
    {name && drawerOpen && <RecordDrawer doctype={doctype} name={name} onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}

function renderField(
  f: CompiledField,
  doc: Record<string, unknown>,
  setField: (k: string, v: unknown) => void,
) {
  const value = doc[f.fieldname];
  const readOnly = f.read_only;

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
          onChange={(e) => setField(f.fieldname, e.target.checked ? 1 : 0)}
        />
      );

    case 'select': {
      const opts = (f.options || '').split('\n').filter(Boolean);
      return (
        <select
          className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          value={String(value ?? '')}
          disabled={readOnly}
          onChange={(e) => setField(f.fieldname, e.target.value)}
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
            onChange={(v) => setField(f.fieldname, v)}
          />
        );
      }
      return (
        <LinkField
          target={f.options || ''}
          value={(value as string) || ''}
          disabled={readOnly}
          onChange={(v) => setField(f.fieldname, v)}
        />
      );
    }

    case 'date':
      return (
        <Input
          type="date"
          disabled={readOnly}
          value={String(value ?? '')}
          onChange={(e) => setField(f.fieldname, e.target.value)}
        />
      );

    case 'datetime': {
      const dtVal = ((value as string) || '').replace(' ', 'T').slice(0, 16);
      return (
        <Input
          type="datetime-local"
          disabled={readOnly}
          value={dtVal}
          onChange={(e) => setField(f.fieldname, e.target.value.replace('T', ' ') + ':00')}
        />
      );
    }

    case 'number':
      return (
        <Input
          type="number"
          disabled={readOnly}
          value={String(value ?? '')}
          onChange={(e) => setField(f.fieldname, e.target.value)}
        />
      );

    case 'textarea':
      return (
        <textarea
          className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-y"
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
      const rows = (value as Record<string, unknown>[]) || [];
      return (
        <ChildTable
          childDoctype={childDoctype}
          rows={rows}
          readOnly={readOnly}
          parentDoc={doc}
          onChange={(updated) => setField(f.fieldname, updated)}
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

export { DynamicForm };
