'use client';
import { useEffect, useMemo, useState } from 'react';
import { Printer, Download, ExternalLink, Settings2, Loader2, PanelTop } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { CompiledField } from '@/lib/meta-compiler';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { PrintDesigner } from './print-designer';
import { LetterHeadDialog } from './letter-head-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  doctype: string;
  name: string;
  fields: CompiledField[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Frappe's own print-format rendering (letterhead, tax breakdowns, per-
// doctype layout) already covers what a compliant business document needs
// far better than a from-scratch React reimplementation would — this panel
// just gives that existing PDF a modern in-app preview instead of a bare
// new-tab link. The "Customize" flow still follows that principle: the
// designer (print-designer.tsx) doesn't draw anything itself — it compiles a
// layout to a real Print Format (Jinja) record that Frappe's own engine then
// renders — see lib/print-layout.ts.
export function PrintPanel({ doctype, name, fields, open, onOpenChange }: Props) {
  const [formats, setFormats] = useState<string[]>([]);
  const [format, setFormat] = useState<string>('');
  // '' = the tenant's default header/footer, '__none__' = no header/footer,
  // anything else = a specific Letter Head chosen for this print.
  const [letterHead, setLetterHead] = useState<string>('');
  const [letterHeads, setLetterHeads] = useState<Array<{ name: string; is_default: number }>>([]);
  const [manageHeadsOpen, setManageHeadsOpen] = useState(false);
  const [previewState, setPreviewState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  // Bumped after a template is saved so the preview re-renders even when the
  // selected format name (and therefore the URL) hasn't changed.
  const [previewNonce, setPreviewNonce] = useState(0);

  const [customizing, setCustomizing] = useState(false);

  const itemsField = useMemo(() => fields.find((f) => f.component === 'table') || null, [fields]);
  const { schema: childSchema } = useDocTypeSchema(itemsField?.options || '');
  const designerReady = !itemsField || !!childSchema;

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

  const loadLetterHeads = () => {
    frappe
      .getLetterHeads()
      .then(setLetterHeads)
      .catch(() => setLetterHeads([]));
  };

  useEffect(() => {
    if (!open) return;
    loadFormats();
    loadLetterHeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doctype]);

  const pdfUrl = frappe.printPdfUrl(
    doctype,
    name,
    format || undefined,
    letterHead === '__none__',
    letterHead && letterHead !== '__none__' ? letterHead : undefined
  );

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
  }, [open, pdfUrl, previewNonce]);

  const onTemplateSaved = (savedName: string) => {
    setFormats((prev) => (prev.includes(savedName) ? prev : [...prev, savedName]));
    setFormat(savedName);
    setPreviewNonce((n) => n + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={customizing ? 'max-w-7xl' : 'max-w-3xl'}>
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
          <Select value={letterHead || 'default'} onValueChange={(v) => setLetterHead(v === 'default' ? '' : v)}>
            <SelectTrigger className="h-9 w-56" aria-label="Header and footer">
              <SelectValue placeholder="Header & footer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default header &amp; footer</SelectItem>
              {letterHeads.map((h) => (
                <SelectItem key={h.name} value={h.name}>
                  {h.name}
                  {h.is_default ? ' (default)' : ''}
                </SelectItem>
              ))}
              <SelectItem value="__none__">No header &amp; footer</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setManageHeadsOpen(true)}>
            <PanelTop className="h-3.5 w-3.5" />
            Global header &amp; footer
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

        <div className={customizing ? 'grid gap-3 lg:grid-cols-[440px_minmax(0,1fr)]' : ''}>
          {customizing && (
            <div style={{ height: '65vh' }} className="min-h-0">
              {designerReady ? (
                <PrintDesigner
                  key={format}
                  doctype={doctype}
                  fields={fields}
                  itemsField={itemsField}
                  childFields={childSchema?.fields || []}
                  formats={formats}
                  initialFormat={format}
                  onSaved={onTemplateSaved}
                  onManageLetterHeads={() => setManageHeadsOpen(true)}
                />
              ) : (
                <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading fields…
                </div>
              )}
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
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Printer className="h-3.5 w-3.5" />
          Use your browser's own print button inside the preview above for a direct print dialog.
        </p>
      </DialogContent>
      <LetterHeadDialog
        open={manageHeadsOpen}
        onOpenChange={setManageHeadsOpen}
        onChanged={() => {
          loadLetterHeads();
          setPreviewNonce((n) => n + 1);
        }}
      />
    </Dialog>
  );
}
