'use client';
import { useEffect, useMemo, useState } from 'react';
import { Printer, Download, ExternalLink, Settings2, Loader2 } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { CompiledField } from '@/lib/meta-compiler';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { buildCustomPrintHtml } from '@/lib/print-template';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  doctype: string;
  name: string;
  fields: CompiledField[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Fields the base template (lib/print-template.ts) already renders on its
// own — offering these again in the "add extra fields" picker would just
// duplicate them on the page.
const ALREADY_SHOWN_HEADER = new Set([
  'customer', 'customer_name', 'supplier', 'supplier_name', 'party_name', 'lead_name',
  'company', 'currency', 'status', 'grand_total', 'rounded_total', 'total',
  'discount_amount', 'additional_discount_percentage', 'outstanding_amount',
  'in_words', 'terms', 'transaction_date', 'posting_date', 'delivery_date', 'due_date',
]);
const ALREADY_SHOWN_ITEM = new Set(['item_code', 'item_name', 'description', 'qty', 'uom', 'rate', 'amount']);
const SYSTEM_FIELDNAMES = new Set([
  'name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx',
  'parent', 'parentfield', 'parenttype', 'naming_series', 'amended_from',
]);

const PICKABLE_COMPONENTS = new Set(['text', 'number', 'date', 'datetime', 'check', 'select', 'link', 'readonly', 'textarea']);

// Frappe's own print-format rendering (letterhead, tax breakdowns, per-
// doctype layout) already covers what a compliant business document needs
// far better than a from-scratch React reimplementation would — this panel
// just gives that existing PDF a modern in-app preview instead of a bare
// new-tab link. The "Customize" flow below still follows that principle:
// instead of drawing extra fields onto the PDF ourselves, it builds and
// saves a real Print Format (Jinja) record that Frappe's own engine then
// renders — see lib/print-template.ts.
export function PrintPanel({ doctype, name, fields, open, onOpenChange }: Props) {
  const [formats, setFormats] = useState<string[]>([]);
  const [format, setFormat] = useState<string>('');
  const [noLetterhead, setNoLetterhead] = useState(false);
  const [previewState, setPreviewState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);

  const [customizing, setCustomizing] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [headerPicks, setHeaderPicks] = useState<Set<string>>(new Set());
  const [itemPicks, setItemPicks] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const itemsField = useMemo(() => fields.find((f) => f.component === 'table'), [fields]);
  const { schema: childSchema } = useDocTypeSchema(itemsField?.options || '');

  const headerCandidates = useMemo(
    () =>
      fields.filter(
        (f) => PICKABLE_COMPONENTS.has(f.component) && !SYSTEM_FIELDNAMES.has(f.fieldname) && !ALREADY_SHOWN_HEADER.has(f.fieldname)
      ),
    [fields]
  );
  const itemCandidates = useMemo(
    () =>
      (childSchema?.fields || []).filter(
        (f) => PICKABLE_COMPONENTS.has(f.component) && !SYSTEM_FIELDNAMES.has(f.fieldname) && !ALREADY_SHOWN_ITEM.has(f.fieldname)
      ),
    [childSchema]
  );

  const loadFormats = () => {
    frappe
      .getPrintFormats(doctype)
      .then((list) => {
        setFormats(list);
        if (list.length && !format) setFormat(list[0]);
      })
      .catch(() => {
        /* fall back to the doctype's default print format */
      });
  };

  useEffect(() => {
    if (!open) return;
    loadFormats();
    setTemplateName(`${doctype} Custom`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doctype]);

  const pdfUrl = frappe.printPdfUrl(doctype, name, format || undefined, noLetterhead);

  // Frappe's own PDF endpoint returns `application/pdf` bytes on success,
  // but on any server-side failure (a missing/misconfigured PDF renderer,
  // a Jinja error in the format, ...) it returns a normal `application/
  // json` error body instead — same status-200-vs-500 handling as any other
  // whitelisted method. Pointing an <iframe> straight at the URL couldn't
  // tell the two apart: the browser just rendered whatever bytes came back,
  // so a backend failure showed up as a wall of raw JSON/exception text
  // inside the "print preview" with no indication anything had gone wrong.
  // Fetching first lets us tell the difference and show a real error
  // instead.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewState('loading');
    setPreviewError(null);
    fetch(pdfUrl, { credentials: 'include' })
      .then(async (res) => {
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('pdf')) {
          let message = `${res.status} ${res.statusText}`;
          try {
            const data = await res.json();
            message = data?.exception || data?._server_messages || data?.message || message;
          } catch {
            /* not JSON either — fall back to the status line above */
          }
          if (!cancelled) {
            setPreviewError(String(message));
            setPreviewState('error');
          }
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewObjectUrl(objectUrl);
        setPreviewState('ok');
      })
      .catch((e) => {
        if (!cancelled) {
          setPreviewError(String(e instanceof Error ? e.message : e));
          setPreviewState('error');
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pdfUrl]);

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, fieldname: string) => {
    const next = new Set(set);
    if (next.has(fieldname)) next.delete(fieldname);
    else next.add(fieldname);
    setSet(next);
  };

  const saveTemplate = async () => {
    const trimmedName = templateName.trim();
    if (!trimmedName) {
      setSaveError('Enter a name for the template');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const html = buildCustomPrintHtml({
        itemsFieldname: itemsField?.fieldname || null,
        headerFields: fields.filter((f) => headerPicks.has(f.fieldname)).map((f) => ({ fieldname: f.fieldname, label: f.label })),
        itemFields: (childSchema?.fields || [])
          .filter((f) => itemPicks.has(f.fieldname))
          .map((f) => ({ fieldname: f.fieldname, label: f.label })),
      });
      await frappe.createDoc('Print Format', {
        name: trimmedName,
        doc_type: doctype,
        print_format_type: 'Jinja',
        // `custom_format: 1` is what actually makes Frappe's print engine
        // render our `html` at all — without it, get_rendered_template
        // (frappe/www/printview.py) ignores html/print_format_type
        // entirely and silently falls back to the generic "Standard"
        // layout, regardless of print_format_type. Confirmed live: the
        // exact same saved format rendered as plain Standard output before
        // this flag was added, and rendered this template correctly after.
        custom_format: 1,
        standard: 'No',
        disabled: 0,
        html,
      });
      setFormats((prev) => (prev.includes(trimmedName) ? prev : [...prev, trimmedName]));
      setFormat(trimmedName);
      setCustomizing(false);
      setHeaderPicks(new Set());
      setItemPicks(new Set());
    } catch (e) {
      setSaveError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Print {doctype}: {name}
          </DialogTitle>
        </DialogHeader>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {formats.length > 1 && (
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="Print format" />
              </SelectTrigger>
              <SelectContent>
                {formats.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant={noLetterhead ? 'default' : 'outline'}
            size="sm"
            onClick={() => setNoLetterhead((v) => !v)}
          >
            {noLetterhead ? 'Letterhead off' : 'Letterhead on'}
          </Button>
          <Button variant={customizing ? 'default' : 'outline'} size="sm" className="gap-1.5" onClick={() => setCustomizing((v) => !v)}>
            <Settings2 className="h-3.5 w-3.5" />
            Customize
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={previewState !== 'ok'} asChild={previewState === 'ok'}>
              {previewState === 'ok' ? (
                <a href={pdfUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in new tab
                </a>
              ) : (
                <span className="flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in new tab
                </span>
              )}
            </Button>
            <Button size="sm" className="gap-1.5 shadow-elevation-xs" disabled={previewState !== 'ok'} asChild={previewState === 'ok'}>
              {previewState === 'ok' ? (
                <a href={pdfUrl} download={`${name}.pdf`}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </span>
              )}
            </Button>
          </div>
        </div>

        {customizing && (
          <div className="mb-3 space-y-3 rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              Pick any extra fields to include, then save the combination as a new print format for {doctype} — it
              stays available in the format list above for every future print, for anyone on this tenant.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Additional header fields</p>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded border bg-background p-2">
                  {headerCandidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No extra fields available</p>
                  ) : (
                    headerCandidates.map((f) => (
                      <label key={f.fieldname} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={headerPicks.has(f.fieldname)}
                          onChange={() => toggle(headerPicks, setHeaderPicks, f.fieldname)}
                        />
                        {f.label}
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Additional item columns {itemsField ? '' : '(no item table on this doctype)'}
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded border bg-background p-2">
                  {itemCandidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No extra fields available</p>
                  ) : (
                    itemCandidates.map((f) => (
                      <label key={f.fieldname} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={itemPicks.has(f.fieldname)}
                          onChange={() => toggle(itemPicks, setItemPicks, f.fieldname)}
                        />
                        {f.label}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                className="h-9 w-64"
              />
              <Button size="sm" onClick={saveTemplate} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save as Template
              </Button>
              {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-md border bg-muted/30" style={{ height: '65vh' }}>
          {previewState === 'loading' ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Rendering print preview…
            </div>
          ) : previewState === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-medium text-destructive">Couldn't generate the PDF for this document</p>
              <p className="max-w-xl whitespace-pre-wrap break-words text-xs text-muted-foreground">{previewError}</p>
              <p className="text-xs text-muted-foreground">
                This is usually a server-side PDF rendering problem, not a data issue — check the PDF generator on the
                backend before assuming this document's data is wrong.
              </p>
            </div>
          ) : (
            // Native browser PDF viewer — no extra library needed. Points
            // at the blob URL fetched above (not `pdfUrl` directly) so a
            // failed generation never lands raw response bytes in the
            // iframe.
            <iframe key={previewObjectUrl} src={previewObjectUrl || undefined} title="Print preview" className="h-full w-full" />
          )}
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Printer className="h-3.5 w-3.5" />
          Use your browser's own print button inside the preview above for a direct print dialog.
        </p>
      </DialogContent>
    </Dialog>
  );
}
