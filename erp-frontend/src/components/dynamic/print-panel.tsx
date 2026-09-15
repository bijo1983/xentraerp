'use client';
import { useEffect, useState } from 'react';
import { Printer, Download, ExternalLink } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  doctype: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Frappe's own print-format rendering (letterhead, tax breakdowns, per-
// doctype layout) already covers what a compliant business document needs
// far better than a from-scratch React reimplementation would — this panel
// just gives that existing PDF a modern in-app preview instead of a bare
// new-tab link.
export function PrintPanel({ doctype, name, open, onOpenChange }: Props) {
  const [formats, setFormats] = useState<string[]>([]);
  const [format, setFormat] = useState<string>('');
  const [noLetterhead, setNoLetterhead] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    frappe
      .getPrintFormats(doctype)
      .then((list) => {
        if (cancelled) return;
        setFormats(list);
        if (list.length && !format) setFormat(list[0]);
      })
      .catch(() => {
        /* fall back to the doctype's default print format */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doctype]);

  const pdfUrl = frappe.printPdfUrl(doctype, name, format || undefined, noLetterhead);

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
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={pdfUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open in new tab
              </a>
            </Button>
            <Button size="sm" className="gap-1.5 shadow-elevation-xs" asChild>
              <a href={pdfUrl} download={`${name}.pdf`}>
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border bg-muted/30" style={{ height: '65vh' }}>
          {/* Native browser PDF viewer — no extra library needed. Key on the
              URL so switching format/letterhead reloads the preview. */}
          <iframe key={pdfUrl} src={pdfUrl} title="Print preview" className="h-full w-full" />
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Printer className="h-3.5 w-3.5" />
          Use your browser's own print button inside the preview above for a direct print dialog.
        </p>
      </DialogContent>
    </Dialog>
  );
}
