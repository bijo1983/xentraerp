'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns3, Download, ExternalLink, FilterX, Layers, Printer, Table2,
} from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { cn } from '@/lib/utils';
import { toCsv, downloadTextFile } from '@/lib/csv';
import { withTenant } from '@/lib/tenant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  formatCell, linkTarget, drillsFor, reportHref, NUMERIC_TYPES,
  type ReportColumn, type ReportContext, type FilterValues,
} from '@/lib/reports/catalog';
import { ColumnsDialog, type AddedColumn, type Layout } from './columns-dialog';

type Row = Record<string, unknown>;
type View = 'table' | 'group';

const ROW_CAP = 2000; // rendered rows; CSV export always has everything
const SUMMABLE = new Set(['Currency', 'Float', 'Int']);

interface Props {
  slug: string;
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Row[];
  totalRow: Row | null;
  currency: string;
  tenantCode: string | null;
  filters: FilterValues;
  ctx: ReportContext | null;
}

// ── Layout (column order / hidden / added), kept per report in this browser ──

const layoutKey = (slug: string) => `xentra.report-layout.${slug}`;
const EMPTY_LAYOUT: Layout = { order: [], hidden: [], added: [] };

function readLayout(slug: string): Layout {
  try {
    const raw = window.localStorage.getItem(layoutKey(slug));
    return raw ? { ...EMPTY_LAYOUT, ...(JSON.parse(raw) as Layout) } : EMPTY_LAYOUT;
  } catch {
    return EMPTY_LAYOUT;
  }
}

function writeLayout(slug: string, layout: Layout) {
  try {
    window.localStorage.setItem(layoutKey(slug), JSON.stringify(layout));
  } catch { /* storage unavailable: layout lasts for this visit only */ }
}

// ── Column filters: text contains; numbers accept >, <, >=, <=, =, != ──

function matches(raw: unknown, col: ReportColumn, row: Row, expr: string, currency: string): boolean {
  const e = expr.trim();
  if (!e) return true;
  if (NUMERIC_TYPES.has(col.fieldtype)) {
    const m = e.match(/^(>=|<=|!=|>|<|=)?\s*(-?[\d.,]+)$/);
    if (m) {
      const n = Number(raw);
      const x = Number(m[2].replace(/,/g, ''));
      switch (m[1]) {
        case '>': return n > x;
        case '<': return n < x;
        case '>=': return n >= x;
        case '<=': return n <= x;
        case '!=': return n !== x;
        default: return n === x;
      }
    }
  }
  const needle = e.toLowerCase();
  return String(raw ?? '').toLowerCase().includes(needle) || formatCell(raw, col, row, currency).toLowerCase().includes(needle);
}

function compare(a: unknown, b: unknown, numeric: boolean): number {
  if (numeric) return (Number(a) || 0) - (Number(b) || 0);
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

export function ResultGrid({ slug, title, subtitle, columns, rows, totalRow, currency, tenantCode, filters, ctx }: Props) {
  const [layout, setLayoutState] = useState<Layout>(EMPTY_LAYOUT);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [addedData, setAddedData] = useState<Record<string, Record<string, unknown>>>({});
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [view, setView] = useState<View>('table');
  const [groupBy, setGroupBy] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => setLayoutState(readLayout(slug)), [slug]);
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    writeLayout(slug, l);
  };

  // A fresh result resets row-level state.
  useEffect(() => {
    setCollapsed(new Set());
    setOpenGroups(new Set());
    setShowAll(false);
  }, [rows]);

  // Values for added columns: one lookup per added column for the linked records in the result.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, Record<string, unknown>> = {};
      for (const a of layout.added) {
        const names = Array.from(new Set(rows.map((r) => r[a.link]).filter((v): v is string => typeof v === 'string' && v !== '')));
        const map: Record<string, unknown> = {};
        for (let i = 0; i < names.length; i += 500) {
          try {
            const res = (await frappe.call('xentraerp.client.get_list', {
              doctype: a.doctype,
              filters: [['name', 'in', names.slice(i, i + 500)]],
              fields: ['name', a.field],
              limit_page_length: 0,
            })) as Row[];
            for (const r of res || []) map[String(r.name)] = r[a.field];
          } catch { /* no read access to that doctype: the column stays empty */ }
        }
        out[a.key] = map;
      }
      if (!cancelled) setAddedData(out);
    })();
    return () => { cancelled = true; };
  }, [layout.added, rows]);

  // All columns (report's + added), in the user's order, minus hidden ones.
  const allColumns = useMemo<ReportColumn[]>(() => {
    const added = layout.added.map((a) => ({ fieldname: a.key, label: a.label, fieldtype: a.fieldtype, options: a.options }));
    const base = [...columns];
    for (const a of added) {
      const at = base.findIndex((c) => c.fieldname === layout.added.find((x) => x.key === a.fieldname)?.link);
      base.splice(at >= 0 ? at + 1 : base.length, 0, a);
    }
    if (!layout.order.length) return base;
    const pos = new Map(layout.order.map((f, i) => [f, i]));
    return base
      .map((c, i) => ({ c, i }))
      .sort((x, y) => (pos.get(x.c.fieldname) ?? 10000 + x.i) - (pos.get(y.c.fieldname) ?? 10000 + y.i))
      .map((x) => x.c);
  }, [columns, layout]);
  const visibleCols = useMemo(() => allColumns.filter((c) => !layout.hidden.includes(c.fieldname)), [allColumns, layout.hidden]);

  const enriched = useMemo(() => {
    if (!layout.added.length) return rows;
    return rows.map((r) => {
      const out = { ...r };
      for (const a of layout.added) out[a.key] = addedData[a.key]?.[String(r[a.link] ?? '')];
      return out;
    });
  }, [rows, layout.added, addedData]);

  const activeFilters = Object.entries(colFilters).filter(([, v]) => v.trim());
  const filtered = useMemo(() => {
    if (!activeFilters.length) return enriched;
    const cols = new Map(allColumns.map((c) => [c.fieldname, c]));
    return enriched.filter((r) => activeFilters.every(([f, e]) => matches(r[f], cols.get(f)!, r, e, currency)));
  }, [enriched, activeFilters, allColumns, currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = allColumns.find((c) => c.fieldname === sort.field);
    const numeric = !!col && NUMERIC_TYPES.has(col.fieldtype);
    const out = [...filtered].sort((a, b) => compare(a[sort.field], b[sort.field], numeric));
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [filtered, sort, allColumns]);

  // Tree reports (financial statements, ...) carry `indent`; keep the hierarchy unless sorted or filtered.
  const hasIndent = useMemo(() => rows.some((r) => typeof r.indent === 'number' || (r.indent !== undefined && r.indent !== null && r.indent !== '')), [rows]);
  const isTree = hasIndent && !sort && !activeFilters.length;
  const treeRows = useMemo(() => {
    if (!isTree) return sorted.map((row, i) => ({ row, i, hasChildren: false }));
    const out: { row: Row; i: number; hasChildren: boolean }[] = [];
    let hideBelow: number | null = null;
    sorted.forEach((row, i) => {
      const indent = Number(row.indent) || 0;
      if (hideBelow !== null && indent > hideBelow) return;
      hideBelow = null;
      const hasChildren = (Number(sorted[i + 1]?.indent) || 0) > indent;
      out.push({ row, i, hasChildren });
      if (hasChildren && collapsed.has(i)) hideBelow = indent;
    });
    return out;
  }, [sorted, isTree, collapsed]);

  // Footer: the report's own total row, or (once column filters narrow it) a sum of what's shown.
  const footer = useMemo<Row | null>(() => {
    if (totalRow && !activeFilters.length) return totalRow;
    if (hasIndent || !sorted.length || (!totalRow && !activeFilters.length)) return null;
    const sum: Row = {};
    for (const c of visibleCols) if (SUMMABLE.has(c.fieldtype)) sum[c.fieldname] = sorted.reduce((s, r) => s + (Number(r[c.fieldname]) || 0), 0);
    return sum;
  }, [totalRow, activeFilters.length, hasIndent, sorted, visibleCols]);

  const groupable = visibleCols.filter((c) => !NUMERIC_TYPES.has(c.fieldtype));
  const groups = useMemo(() => {
    if (view !== 'group' || !groupBy) return null;
    const map = new Map<string, Row[]>();
    for (const r of sorted) {
      const k = String(r[groupBy] ?? '') || '(blank)';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => compare(a[0], b[0], false));
  }, [view, groupBy, sorted]);

  const toggleSort = (field: string) =>
    setSort((s) => (!s || s.field !== field ? { field, dir: 'asc' } : s.dir === 'asc' ? { field, dir: 'desc' } : null));

  const exportRows = footer ? [...sorted, footer] : sorted;
  const exportCsv = () =>
    downloadTextFile(`${slug}.csv`, toCsv(visibleCols.map((c) => c.label), exportRows.map((r) => visibleCols.map((c) => plain(r[c.fieldname])))));
  const print = () => printTable(title, subtitle, visibleCols, exportRows, currency, !!footer);

  const shown = showAll ? treeRows : treeRows.slice(0, ROW_CAP);

  const cell = (row: Row, c: ReportColumn, ci: number, opts: { total?: boolean; tree?: { i: number; hasChildren: boolean } } = {}) => {
    const raw = row[c.fieldname];
    const text = opts.total && ci === 0 && (raw === undefined || raw === null || raw === '') ? 'Total' : formatCell(raw, c, row, currency);
    const numeric = NUMERIC_TYPES.has(c.fieldtype);
    const indent = ci === 0 && isTree ? Number(row.indent) || 0 : 0;
    const target = !opts.total && text ? linkTarget(c, row) : null;
    return (
      <td
        key={c.fieldname}
        className={cn('whitespace-nowrap px-3 py-1.5', numeric && 'text-right tabular-nums', numeric && Number(raw) < 0 && 'text-destructive')}
        style={indent ? { paddingLeft: `${0.75 + indent * 1.1}rem` } : undefined}
      >
        <span className="inline-flex items-center gap-1">
          {ci === 0 && isTree && (
            opts.tree?.hasChildren ? (
              <button
                type="button"
                className="-ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted"
                onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(opts.tree!.i)) n.delete(opts.tree!.i); else n.add(opts.tree!.i); return n; })}
                aria-label={collapsed.has(opts.tree.i) ? 'Expand' : 'Collapse'}
              >
                {collapsed.has(opts.tree.i) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            ) : !opts.total ? <span className="inline-block w-4" /> : null
          )}
          {target ? <DrillMenu doctype={target} value={String(raw)} label={text} filters={filters} ctx={ctx} tenantCode={tenantCode} /> : text}
        </span>
      </td>
    );
  };

  const headerRow = (
    <>
      <tr className="border-b bg-muted/20">
        {visibleCols.map((c) => {
          const numeric = NUMERIC_TYPES.has(c.fieldtype);
          return (
            <th key={c.fieldname} className={cn('whitespace-nowrap px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground', numeric ? 'text-right' : 'text-left')}>
              <button type="button" className={cn('inline-flex items-center gap-1 hover:text-foreground', numeric && 'flex-row-reverse')} onClick={() => toggleSort(c.fieldname)}>
                {c.label}
                {sort?.field === c.fieldname && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
              </button>
            </th>
          );
        })}
      </tr>
      <tr className="border-b">
        {visibleCols.map((c) => (
          <th key={c.fieldname} className="px-2 pb-1.5 pt-0">
            <Input
              className={cn('h-7 min-w-[5rem] px-2 text-xs font-normal', NUMERIC_TYPES.has(c.fieldtype) && 'text-right')}
              placeholder={NUMERIC_TYPES.has(c.fieldtype) ? '>, <, =' : 'Filter'}
              value={colFilters[c.fieldname] || ''}
              onChange={(e) => setColFilters((f) => ({ ...f, [c.fieldname]: e.target.value }))}
            />
          </th>
        ))}
      </tr>
    </>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <div className="flex rounded-md bg-muted p-0.5">
          <ViewButton active={view === 'table'} onClick={() => setView('table')} icon={Table2} label="Table" />
          <ViewButton active={view === 'group'} onClick={() => { setView('group'); if (!groupBy && groupable[0]) setGroupBy(groupable[0].fieldname); }} icon={Layers} label="Group" />
        </div>
        {view === 'group' && (
          <Select value={groupBy || undefined} onValueChange={(v) => { setGroupBy(v); setOpenGroups(new Set()); }}>
            <SelectTrigger className="h-8 w-48 text-xs shadow-none"><SelectValue placeholder="Group by…" /></SelectTrigger>
            <SelectContent>
              {groupable.map((c) => <SelectItem key={c.fieldname} value={c.fieldname}>Group by {c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          {sorted.length.toLocaleString()} row{sorted.length === 1 ? '' : 's'}
          {activeFilters.length > 0 && ` of ${rows.length.toLocaleString()}`}
        </p>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(activeFilters.length > 0 || sort) && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => { setColFilters({}); setSort(null); }}>
              <FilterX className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8" onClick={() => setLayoutOpen(true)}>
            <Columns3 className="mr-1 h-3.5 w-3.5" /> Columns
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} disabled={!sorted.length}>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={print} disabled={!sorted.length}>
            <Printer className="mr-1 h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      {!rows.length ? (
        <p className="py-14 text-center text-sm text-muted-foreground">No data for these filters.</p>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">{headerRow}</thead>
            <tbody>
              {groups ? (
                groups.map(([key, items]) => {
                  const open = openGroups.has(key);
                  return (
                    <Fragment key={key}>
                      <tr
                        className="cursor-pointer border-b bg-muted/40 hover:bg-muted/60"
                        onClick={() => setOpenGroups((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                      >
                        {visibleCols.map((c, ci) => {
                          const numeric = SUMMABLE.has(c.fieldtype);
                          if (ci === 0) {
                            return (
                              <td key={c.fieldname} className="whitespace-nowrap px-3 py-1.5 font-semibold">
                                <span className="inline-flex items-center gap-1">
                                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  {key} <span className="font-normal text-muted-foreground">· {items.length}</span>
                                </span>
                              </td>
                            );
                          }
                          return (
                            <td key={c.fieldname} className={cn('whitespace-nowrap px-3 py-1.5 font-semibold', numeric && 'text-right tabular-nums')}>
                              {numeric ? formatCell(items.reduce((s, r) => s + (Number(r[c.fieldname]) || 0), 0), c, items[0], currency) : ''}
                            </td>
                          );
                        })}
                      </tr>
                      {open && items.map((row, i) => (
                        <tr key={i} className="border-b hover:bg-muted/20">{visibleCols.map((c, ci) => cell(row, c, ci))}</tr>
                      ))}
                    </Fragment>
                  );
                })
              ) : (
                shown.map(({ row, i, hasChildren }) => (
                  <tr key={i} className={cn('border-b hover:bg-muted/20', (row.is_group || row.bold || hasChildren) && 'font-semibold')}>
                    {visibleCols.map((c, ci) => cell(row, c, ci, { tree: { i, hasChildren } }))}
                  </tr>
                ))
              )}
              {footer && (
                <tr className="sticky bottom-0 bg-muted font-semibold">{visibleCols.map((c, ci) => cell(footer, c, ci, { total: true }))}</tr>
              )}
            </tbody>
          </table>
          {!groups && treeRows.length > shown.length && (
            <div className="border-t p-3 text-center">
              <Button variant="link" size="sm" onClick={() => setShowAll(true)}>
                Showing {shown.length.toLocaleString()} of {treeRows.length.toLocaleString()} rows — show all
              </Button>
            </div>
          )}
        </div>
      )}

      <ColumnsDialog
        open={layoutOpen}
        onOpenChange={setLayoutOpen}
        columns={allColumns}
        baseColumns={columns}
        layout={layout}
        onChange={setLayout}
      />
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Table2; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors', active ? 'bg-card shadow-elevation-xs' : 'text-muted-foreground hover:text-foreground')}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function DrillMenu({ doctype, value, label, filters, ctx, tenantCode }: {
  doctype: string; value: string; label: string; filters: FilterValues; ctx: ReportContext | null; tenantCode: string | null;
}) {
  const drills = drillsFor(doctype, value, filters, ctx);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="text-primary hover:underline">{label}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[13rem]">
        <DropdownMenuLabel className="max-w-[18rem] truncate text-xs text-muted-foreground">{doctype}: {value}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={withTenant(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(value)}`, tenantCode)}>
            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open {doctype}
          </Link>
        </DropdownMenuItem>
        {drills.length > 0 && <DropdownMenuSeparator />}
        {drills.map((d) => (
          <DropdownMenuItem key={d.slug} asChild>
            <Link href={withTenant(reportHref(d.slug, d.filters), tenantCode)}>
              <Layers className="mr-2 h-3.5 w-3.5" /> {d.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function plain(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/<[^>]*>/g, '');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** Prints the result table on its own (not the app around it) through a hidden iframe. */
function printTable(title: string, subtitle: string, columns: ReportColumn[], rows: Row[], currency: string, lastIsTotal: boolean) {
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

export type { AddedColumn };
