'use client';
import { useMemo, useRef, useState } from 'react';
import { Upload, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { parseCsv } from '@/lib/csv';
import { frappe } from '@/lib/frappe';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ColDef } from './doctype-list';

interface Props {
  doctype: string;
  fields: string[];
  cols: ColDef[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface RowResult {
  row: number;
  ok: boolean;
  message?: string;
}

// Scope: flat top-level fields only (matches this list's own `fields`),
// matched by exact fieldname or by the column's display label. No child
// tables, no Link-target validation beyond what the backend itself
// enforces on create — this is a "quick bulk add", not Frappe Desk's full
// Data Import tool (file staging, dry-run, templated child rows, etc).
export function ImportDialog({ doctype, fields, cols, open, onOpenChange, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);

  const importableFields = useMemo(() => fields.filter((f) => f !== 'name'), [fields]);

  const mapping = useMemo(() => {
    const labelToKey = new Map(cols.map((c) => [c.header.toLowerCase(), c.key]));
    return headers.map((h) => {
      const norm = h.trim().toLowerCase();
      if (importableFields.includes(h.trim())) return h.trim();
      if (labelToKey.has(norm)) return labelToKey.get(norm)!;
      const byFieldname = importableFields.find((f) => f.toLowerCase() === norm);
      return byFieldname || null;
    });
  }, [headers, cols, importableFields]);

  const reset = () => {
    setHeaders([]);
    setRows([]);
    setFileName('');
    setResults(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) return;
    setFileName(file.name);
    setHeaders(parsed[0]);
    setRows(parsed.slice(1));
    setResults(null);
  };

  const runImport = async () => {
    setRunning(true);
    const out: RowResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const record: Record<string, string> = {};
      rows[i].forEach((cell, idx) => {
        const key = mapping[idx];
        if (key && cell !== '') record[key] = cell;
      });
      if (Object.keys(record).length === 0) {
        out.push({ row: i + 2, ok: false, message: 'Empty row' });
        continue;
      }
      try {
        await frappe.createDoc(doctype, record);
        out.push({ row: i + 2, ok: true });
      } catch (e) {
        const err = e as { response?: { data?: { exception?: string; message?: string } } };
        out.push({
          row: i + 2,
          ok: false,
          message: err?.response?.data?.exception || err?.response?.data?.message || String(e),
        });
      }
      setResults([...out]);
    }
    setRunning(false);
    if (out.some((r) => r.ok)) onImported();
  };

  const unmapped = headers.filter((_, i) => !mapping[i]);
  const successCount = results?.filter((r) => r.ok).length ?? 0;
  const failCount = results ? results.length - successCount : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import {doctype}</DialogTitle>
          <DialogDescription>
            CSV with a header row. Columns are matched by field name or column label — unmatched columns are skipped.
          </DialogDescription>
        </DialogHeader>

        {!fileName && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-8 text-center transition-smooth hover:border-primary/50 hover:bg-accent/30">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">Click to choose a CSV file</span>
            <span className="text-xs text-muted-foreground">Importable columns: {importableFields.join(', ')}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        )}

        {fileName && !results && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{fileName}</span>
              <span className="text-muted-foreground">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="max-h-48 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {headers.map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                        {h}
                        <div className={mapping[i] ? 'text-primary' : 'text-destructive'}>
                          {mapping[i] ? `→ ${mapping[i]}` : 'skipped'}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, ri) => (
                    <tr key={ri} className="border-b last:border-0">
                      {r.map((c, ci) => (
                        <td key={ci} className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {unmapped.length > 0 && (
              <p className="text-xs text-warning">Unmatched, will be skipped: {unmapped.join(', ')}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Choose different file
              </Button>
              <Button size="sm" className="gap-1.5 shadow-elevation-xs" onClick={runImport} disabled={running}>
                {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {running ? `Importing ${(results as RowResult[] | null)?.length ?? 0}/${rows.length}…` : `Import ${rows.length} row${rows.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        )}

        {results && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4" /> {successCount} created
              </span>
              {failCount > 0 && (
                <span className="flex items-center gap-1.5 text-destructive">
                  <XCircle className="h-4 w-4" /> {failCount} failed
                </span>
              )}
            </div>
            {failCount > 0 && (
              <div className="max-h-40 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <tbody>
                    {results
                      .filter((r) => !r.ok)
                      .map((r) => (
                        <tr key={r.row} className="border-b last:border-0">
                          <td className="px-2 py-1 font-medium">Row {r.row}</td>
                          <td className="px-2 py-1 text-destructive">{r.message}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Import another file
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
