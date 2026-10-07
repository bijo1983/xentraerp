'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Play, Printer, X, SlidersHorizontal } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { cn } from '@/lib/utils';
import { toCsv, downloadTextFile } from '@/lib/csv';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LinkField } from '@/components/fields/link-field';
import {
  findReport, useReportContext, initialFilterValues, filterActive, missingRequired, filtersForRun,
  selectOptions, normalizeColumns, normalizeRows, formatCell, linkTarget, NUMERIC_TYPES,
  type ReportDef, type ReportFilter, type FilterValues, type ReportColumn,
} from '@/lib/reports/catalog';

interface Summary { label: string; value: unknown; datatype?: string; indicator?: string }
interface Result {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  message?: string;
  summary: Summary[];
  hasTotalRow: boolean;
}

const ROW_CAP = 2000; // rendered rows; CSV export always has everything

export default function ReportRunnerPage() {
  const { slug } = useParams<{ slug: string }>();
  const report = findReport(slug);
  const tenantCode = useTenantCode();
  if (!report) {
    return (
      <div className="space-y-4">
        <BackLink tenantCode={tenantCode} />
        <p className="text-sm text-muted-foreground">This report isn’t available.</p>
      </div>
    );
  }
  return <ReportRunner key={report.slug} report={report} tenantCode={tenantCode} />;
}

function BackLink({ tenantCode }: { tenantCode: string | null }) {
  return (
    <Link href={withTenant('/reports', tenantCode)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" /> Reports
    </Link>
  );
}

function ReportRunner({ report, tenantCode }: { report: ReportDef; tenantCode: string | null }) {
  const { ctx, error: ctxError } = useReportContext();
  const [values, setValues] = useState<FilterValues | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const runSeq = useRef(0);

  useEffect(() => {
    if (ctx && !values) setValues(initialFilterValues(report, ctx));
  }, [ctx, values, report]);

  const missing = useMemo(() => (values ? missingRequired(report, values) : []), [report, values]);

  const run = useCallback(async (vals: FilterValues) => {
    const seq = ++runSeq.current;
    setRunning(true);
    setError(null);
    try {
      const res = (await frappe.call('xentraerp.desk.query_report.run', {
        report_name: report.name,
        filters: JSON.stringify(filtersForRun(report, vals)),
        ignore_prepared_report: 1,
      })) as Record<string, unknown>;
      if (seq !== runSeq.current) return;
      const columns = normalizeColumns((res.columns as unknown[]) || []).filter((c) => c.fieldtype !== 'Hidden');
      const rows = normalizeRows((res.result as unknown[]) || [], columns);
      setResult({
        columns,
        rows,
        message: typeof res.message === 'string' ? res.message.replace(/<[^>]*>/g, ' ').trim() : undefined,
        summary: Array.isArray(res.report_summary) ? (res.report_summary as Summary[]) : [],
        hasTotalRow: !!(res.add_total_row || report.add_total_row) && !res.skip_total_row && rows.length > 1,
      });
      setShowAll(false);
    } catch (e: unknown) {
      if (seq !== runSeq.current) return;
      const err = e as { response?: { data?: { _server_messages?: string; exception?: string } }; message?: string };
      setError(serverMessage(err.response?.data) || err.message || 'The report could not be run.');
      setResult(null);
    } finally {
      if (seq === runSeq.current) setRunning(false);
    }
  }, [report]);

  // Like Desk: re-run shortly after the filters change, once every required filter has a value.
  useEffect(() => {
    if (!values || missing.length) return;
    const t = setTimeout(() => run(values), 400);
    return () => clearTimeout(t);
  }, [values, missing.length, run]);

  const setValue = (field: string, v: unknown) => setValues((prev) => ({ ...(prev || {}), [field]: v }));

  const currency = ctx?.currency || '';
  const q = search.trim().toLowerCase();
  const bodyRows = useMemo(() => {
    if (!result) return [];
    const rows = result.hasTotalRow ? result.rows.slice(0, -1) : result.rows;
    if (!q) return rows;
    return rows.filter((r) => result.columns.some((c) => String(r[c.fieldname] ?? '').toLowerCase().includes(q)));
  }, [result, q]);
  const totalRow = result?.hasTotalRow ? result.rows[result.rows.length - 1] : null;
  const shown = showAll ? bodyRows : bodyRows.slice(0, ROW_CAP);

  const exportCsv = () => {
    if (!result) return;
    const rows = totalRow ? [...bodyRows, totalRow] : bodyRows;
    downloadTextFile(
      `${report.slug}.csv`,
      toCsv(result.columns.map((c) => c.label), rows.map((r) => result.columns.map((c) => cellText(r[c.fieldname])))),
    );
  };

  const print = () => {
    if (!result) return;
    const rows = totalRow ? [...bodyRows, totalRow] : bodyRows;
    printTable(report.name, describeFilters(report, values || {}), result.columns, rows, currency, !!totalRow);
  };

  const visibleFilters = report.filters.filter((f) => !f.hidden && values && filterActive(f, values));

  return (
    <div className="space-y-4">
      <BackLink tenantCode={tenantCode} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{report.name}</h2>
          <p className="text-sm text-muted-foreground">{report.section} · based on {report.ref_doctype}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => values && run(values)} disabled={!values || !!missing.length || running}>
            <Play className="mr-1 h-3.5 w-3.5" /> {running ? 'Running…' : 'Run'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!result?.rows.length}>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={print} disabled={!result?.rows.length}>
            <Printer className="mr-1 h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      {ctxError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ctxError}</div>}

      {values && visibleFilters.length > 0 && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {visibleFilters.map((f) => (
              <FilterField key={f.fieldname} filter={f} values={values} onChange={(v) => setValue(f.fieldname, v)} />
            ))}
          </CardContent>
        </Card>
      )}

      {missing.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" />
          Choose {missing.map((f) => f.label).join(', ')} to run this report.
        </p>
      )}

      {error && <div className="whitespace-pre-wrap rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {result && result.summary.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {result.summary.filter((s) => s.label).map((s, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCell(s.value, { fieldname: '', label: '', fieldtype: s.datatype || 'Data' }, {}, currency)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {result && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
            <p className="text-xs text-muted-foreground">
              {bodyRows.length.toLocaleString()} row{bodyRows.length === 1 ? '' : 's'}
              {running && ' · refreshing…'}
            </p>
            <Input className="h-8 w-56 text-xs" placeholder="Search in results…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <CardContent className="p-0">
            {result.message && <p className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">{result.message}</p>}
            {!result.rows.length ? (
              <p className="py-14 text-center text-sm text-muted-foreground">No data for these filters.</p>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b bg-muted/20">
                      {result.columns.map((c) => (
                        <th
                          key={c.fieldname}
                          className={cn(
                            'whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                            NUMERIC_TYPES.has(c.fieldtype) ? 'text-right' : 'text-left',
                          )}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row, i) => (
                      <ResultRow key={i} row={row} columns={result.columns} currency={currency} tenantCode={tenantCode} />
                    ))}
                    {totalRow && (
                      <ResultRow row={totalRow} columns={result.columns} currency={currency} tenantCode={tenantCode} total />
                    )}
                  </tbody>
                </table>
                {bodyRows.length > shown.length && (
                  <div className="border-t p-3 text-center">
                    <Button variant="link" size="sm" onClick={() => setShowAll(true)}>
                      Showing {shown.length.toLocaleString()} of {bodyRows.length.toLocaleString()} rows — show all
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResultRow({ row, columns, currency, tenantCode, total }: {
  row: Record<string, unknown>; columns: ReportColumn[]; currency: string; tenantCode: string | null; total?: boolean;
}) {
  const indent = Number(row.indent) || 0;
  const bold = !!(total || row.is_group || row.bold);
  return (
    <tr className={cn('border-b last:border-0', total ? 'bg-muted/40 font-semibold' : 'hover:bg-muted/20', bold && 'font-semibold')}>
      {columns.map((c, ci) => {
        const raw = row[c.fieldname];
        const text = total && ci === 0 && (raw === undefined || raw === null || raw === '') ? 'Total' : formatCell(raw, c, row, currency);
        const target = !total ? linkTarget(c, row) : null;
        const numeric = NUMERIC_TYPES.has(c.fieldtype);
        return (
          <td
            key={c.fieldname}
            className={cn('whitespace-nowrap px-3 py-1.5', numeric && 'text-right tabular-nums', numeric && Number(raw) < 0 && 'text-destructive')}
            style={ci === 0 && indent ? { paddingLeft: `${0.75 + indent * 1.1}rem` } : undefined}
          >
            {target && text ? (
              <Link className="text-primary hover:underline" href={withTenant(`/app/${encodeURIComponent(target)}/${encodeURIComponent(String(raw))}`, tenantCode)}>
                {text}
              </Link>
            ) : (
              text
            )}
          </td>
        );
      })}
    </tr>
  );
}

function FilterField({ filter: f, values, onChange }: { filter: ReportFilter; values: FilterValues; onChange: (v: unknown) => void }) {
  const value = values[f.fieldname];
  const label = (
    <label className="mb-1 block text-xs font-medium text-muted-foreground">
      {f.label}
      {f.reqd ? <span className="text-destructive"> *</span> : null}
    </label>
  );
  switch (f.fieldtype) {
    case 'Check':
      return (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={!!Number(value)} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />
          {f.label}
        </label>
      );
    case 'Select': {
      const opts = selectOptions(f);
      return (
        <div>
          {label}
          <Select value={value ? String(value) : '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-9 w-full shadow-none"><SelectValue placeholder={f.label} /></SelectTrigger>
            <SelectContent>
              {!f.reqd && <SelectItem value="__none__">—</SelectItem>}
              {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    }
    case 'Link':
    case 'Dynamic Link': {
      const target = f.fieldtype === 'Link' ? String(f.options || '') : String(values[String(f.options)] || '');
      return (
        <div>
          {label}
          {target ? (
            <div className="relative">
              <LinkField target={target} value={String(value ?? '')} onChange={(v) => onChange(v)} allowCreate={false} />
              {value ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => onChange('')}
                  aria-label={`Clear ${f.label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ) : (
            <Input className="h-9" disabled placeholder={`Choose ${f.options} first`} />
          )}
        </div>
      );
    }
    case 'MultiSelectList': {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>
          {label}
          {f.options && typeof f.options === 'string' ? (
            <LinkField key={list.length} target={f.options} value="" onChange={(v) => v && !list.includes(v) && onChange([...list, v])} allowCreate={false} />
          ) : (
            <Input
              className="h-9"
              placeholder="Type a value and press Enter"
              onKeyDown={(e) => {
                const v = (e.target as HTMLInputElement).value.trim();
                if (e.key === 'Enter' && v && !list.includes(v)) {
                  onChange([...list, v]);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
          )}
          {list.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {list.map((v) => (
                <span key={v} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                  {v}
                  <button type="button" onClick={() => onChange(list.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'DateRange': {
      const range = Array.isArray(value) ? (value as string[]) : ['', ''];
      return (
        <div>
          {label}
          <div className="flex gap-1">
            <Input type="date" className="h-9" value={range[0] || ''} onChange={(e) => onChange([e.target.value, range[1] || ''])} />
            <Input type="date" className="h-9" value={range[1] || ''} onChange={(e) => onChange([range[0] || '', e.target.value])} />
          </div>
        </div>
      );
    }
    default: {
      const type = f.fieldtype === 'Date' ? 'date'
        : f.fieldtype === 'Datetime' ? 'datetime-local'
        : ['Int', 'Float', 'Currency', 'Percent'].includes(f.fieldtype) ? 'number' : 'text';
      const shown = type === 'datetime-local' && typeof value === 'string' ? value.replace(' ', 'T').slice(0, 16) : String(value ?? '');
      return (
        <div>
          {label}
          <Input
            type={type}
            className="h-9"
            value={shown}
            disabled={f.fieldtype === 'Read Only'}
            onChange={(e) => {
              const v = e.target.value;
              if (type === 'number') onChange(v === '' ? '' : Number(v));
              else if (type === 'datetime-local') onChange(v ? `${v.replace('T', ' ')}:00` : '');
              else onChange(v);
            }}
          />
        </div>
      );
    }
  }
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/<[^>]*>/g, '');
}

function serverMessage(data?: { _server_messages?: string; exception?: string }): string | null {
  if (!data) return null;
  try {
    if (data._server_messages) {
      const msgs = (JSON.parse(data._server_messages) as string[]).map((m) => {
        try { return (JSON.parse(m) as { message?: string }).message || m; } catch { return m; }
      });
      return msgs.join('\n').replace(/<[^>]*>/g, '');
    }
  } catch { /* fall through */ }
  return data.exception ? data.exception.replace(/^[\w.]+:\s*/, '') : null;
}

function describeFilters(report: ReportDef, values: FilterValues): string {
  return report.filters
    .filter((f) => filterActive(f, values))
    .map((f) => {
      const v = values[f.fieldname];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return null;
      if (f.fieldtype === 'Check') return Number(v) ? f.label : null;
      return `${f.label}: ${Array.isArray(v) ? v.join(', ') : v}`;
    })
    .filter(Boolean)
    .join(' · ');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** Prints the result table on its own (not the app around it) through a hidden iframe. */
function printTable(title: string, subtitle: string, columns: ReportColumn[], rows: Record<string, unknown>[], currency: string, lastIsTotal: boolean) {
  const head = columns.map((c) => `<th class="${NUMERIC_TYPES.has(c.fieldtype) ? 'n' : ''}">${escapeHtml(c.label)}</th>`).join('');
  const body = rows.map((r, i) => {
    const total = lastIsTotal && i === rows.length - 1;
    const cells = columns.map((c, ci) => {
      let text = formatCell(r[c.fieldname], c, r, currency);
      if (total && ci === 0 && !text) text = 'Total';
      const pad = ci === 0 && Number(r.indent) ? ` style="padding-left:${6 + Number(r.indent) * 14}px"` : '';
      return `<td class="${NUMERIC_TYPES.has(c.fieldtype) ? 'n' : ''}"${pad}>${escapeHtml(text)}</td>`;
    }).join('');
    return `<tr${total ? ' class="t"' : ''}>${cells}</tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body{font:11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:16px}
    h1{font-size:16px;margin:0 0 2px}p{margin:0 0 10px;color:#555}
    table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;white-space:nowrap}
    th{font-size:10px;text-transform:uppercase;color:#555}.n{text-align:right}.t td{font-weight:600;border-top:2px solid #333}
    @page{size:landscape;margin:12mm}
  </style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 1000);
}
