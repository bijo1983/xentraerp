'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import {
  Search, X, Inbox, ChevronRight, ChevronLeft, ChevronsUpDown, ChevronUp, ChevronDown,
  Trash2, Download, Upload, LayoutGrid, List as ListIcon, Rows3, Loader2,
} from 'lucide-react';
import { useFrappeList } from '@/hooks/use-frappe-list';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import { toCsv, downloadTextFile } from '@/lib/csv';
import { frappe } from '@/lib/frappe';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { KanbanBoard } from './kanban-board';
import { ImportDialog } from './import-dialog';

export interface ColDef {
  key: string;
  header: string;
  type?: 'date' | 'currency' | 'badge' | 'link' | 'text';
  badgeColors?: Record<string, string>;
  align?: 'left' | 'right';
}

export interface FilterDef {
  /** Doctype fieldname to filter on. */
  key: string;
  label: string;
  /** Fixed choices for a dropdown filter — a plain string is used as both the filter value and its display label. */
  options: Array<string | { value: string; label: string }>;
}

interface Props {
  title: string;
  doctype: string;
  fields: string[];
  cols: ColDef[];
  newLabel?: string;
  /** Fieldname the free-text search box does a "like" match against. Defaults to the first column. */
  searchField?: string;
  searchPlaceholder?: string;
  /** Structured dropdown filters shown next to the search box (also reused as the "set field to…" choices for bulk edit). */
  filters?: FilterDef[];
  /** Enables a List/Kanban toggle, grouping cards on this field's value (must be one of `filters`' keys to get a fixed, ordered column set). */
  kanbanField?: string;
  kanbanTitleField?: string;
  kanbanSubtitleField?: string;
  kanbanAmountField?: string;
}

type SortDir = 'asc' | 'desc' | null;
type ViewMode = 'list' | 'report' | 'kanban';

function normalizeOptions(options: FilterDef['options']) {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const col = createColumnHelper<any>();
const REPORT_GROUP_CAP = 1000;

export function DoctypeList({
  title,
  doctype,
  fields,
  cols,
  newLabel,
  searchField,
  searchPlaceholder,
  filters: filterDefs,
  kanbanField,
  kanbanTitleField,
  kanbanSubtitleField,
  kanbanAmountField,
}: Props) {
  const router = useRouter();
  const tenantCode = useTenantCode();

  const [view, setView] = useState<ViewMode>('list');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<string>('');

  // Debounce free-text search so we're not firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const effectiveSearchField = searchField || cols[0]?.key || 'name';

  const colFilterKind = (c: ColDef): 'text' | 'select' | null => {
    if (c.type === 'badge') return c.badgeColors ? 'select' : null;
    if (c.type === 'link' || c.type === 'text' || !c.type) return 'text';
    return null;
  };

  const activeFrappeFilters = useMemo(() => {
    const f: [string, string, unknown][] = [];
    if (search) f.push([effectiveSearchField, 'like', `%${search}%`]);
    for (const [key, value] of Object.entries(filterValues)) {
      if (value) f.push([key, '=', value]);
    }
    for (const c of cols) {
      const kind = colFilterKind(c);
      const v = columnFilters[c.key];
      if (!v || !kind) continue;
      f.push(kind === 'select' ? [c.key, '=', v] : [c.key, 'like', `%${v}%`]);
    }
    return f.length ? f : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterValues, columnFilters, cols, effectiveSearchField]);

  const orderBy = sortField && sortDir ? `${sortField} ${sortDir}` : undefined;

  const { data, loading, error, total, page, setPage, pageSize, refetch } = useFrappeList<Record<string, unknown>>({
    doctype,
    fields,
    filters: activeFrappeFilters,
    orderBy,
  });

  // A new filter can make the current page land past the end of the
  // (now smaller) result set — reset to page 1 whenever the filter set
  // itself changes, not on every unrelated re-render.
  const filterKey = JSON.stringify(activeFrappeFilters ?? null);
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Report-mode grouping needs the FULL filtered set (not one page) to
  // compute accurate per-group counts/sums — a separate, capped fetch.
  const [groupData, setGroupData] = useState<Record<string, unknown>[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupTruncated, setGroupTruncated] = useState(false);
  useEffect(() => {
    if (view !== 'report' || !groupBy) return;
    let cancelled = false;
    setGroupLoading(true);
    frappe
      .getList(doctype, {
        fields: JSON.stringify(fields),
        filters: activeFrappeFilters ? JSON.stringify(activeFrappeFilters) : undefined,
        limit_page_length: REPORT_GROUP_CAP,
        order_by: orderBy || 'modified desc',
      })
      .then((rows) => {
        if (cancelled) return;
        const arr = Array.isArray(rows) ? rows : [];
        setGroupData(arr);
        setGroupTruncated(arr.length >= REPORT_GROUP_CAP);
      })
      .finally(() => !cancelled && setGroupLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, groupBy, doctype, fields.join(','), filterKey, orderBy]);

  const hasActiveFilters = Boolean(search || Object.values(filterValues).some(Boolean) || Object.values(columnFilters).some(Boolean));
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setFilterValues({});
    setColumnFilters({});
  };

  const goToRecord = (name: string) =>
    router.push(withTenant(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, tenantCode));

  const toggleSort = (key: string) => {
    if (sortField !== key) {
      setSortField(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortField(null);
      setSortDir(null);
    }
  };

  const renderCellValue = (v: unknown, c: ColDef, forRowClick: (name: string) => void) => {
    if (v === undefined || v === null || v === '') return <span className="text-muted-foreground">—</span>;
    const sv = v as string;
    if (c.type === 'date') return formatDate(sv);
    if (c.type === 'currency') return <span className="tabular-nums">{formatCurrency(Number(sv))}</span>;
    if (c.type === 'badge') {
      const cls = c.badgeColors?.[sv];
      return (
        <Badge variant={cls ? undefined : 'default'} className={cls}>
          {sv}
        </Badge>
      );
    }
    if (c.type === 'link') {
      return (
        <button
          className="font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            forRowClick(sv);
          }}
        >
          {sv}
        </button>
      );
    }
    return sv;
  };

  const columns = useMemo(
    () =>
      cols.map((c) =>
        col.accessor(c.key, {
          header: c.header,
          cell: (info) => renderCellValue(info.getValue(), c, goToRecord),
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols, doctype, tenantCode]
  );

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // ── Selection / bulk actions ──────────────────────────────────────
  const allOnPageSelected = data.length > 0 && data.every((r) => selected.has(r.name as string));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allOnPageSelected) return new Set();
      return new Set(data.map((r) => r.name as string));
    });
  };
  const toggleRow = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const runBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} record${selected.size !== 1 ? 's' : ''}? This can't be undone.`)) return;
    setBulkBusy(true);
    try {
      await frappe.bulkDelete(doctype, Array.from(selected));
      setSelected(new Set());
      refetch();
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkSet = async (key: string, value: string) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      await frappe.bulkUpdate(doctype, Array.from(selected), { [key]: value });
      setSelected(new Set());
      refetch();
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Export ───────────────────────────────────────────────────────
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await frappe.getList(doctype, {
        fields: JSON.stringify(fields),
        filters: activeFrappeFilters ? JSON.stringify(activeFrappeFilters) : undefined,
        limit_page_length: 0,
        order_by: orderBy || 'modified desc',
      });
      const arr = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
      const headers = cols.map((c) => c.header);
      const body = arr.map((r) =>
        cols.map((c) => {
          const v = r[c.key];
          if (v === null || v === undefined) return '';
          if (c.type === 'date') return formatDate(v as string);
          return v;
        })
      );
      downloadTextFile(`${doctype.replace(/\s+/g, '_')}.csv`, toCsv(headers, body));
    } finally {
      setExporting(false);
    }
  };

  // ── Kanban ───────────────────────────────────────────────────────
  const kanbanColumns = useMemo(() => {
    if (!kanbanField) return [];
    const def = filterDefs?.find((f) => f.key === kanbanField);
    if (def) return normalizeOptions(def.options);
    const colDef = cols.find((c) => c.key === kanbanField);
    if (colDef?.badgeColors) return Object.keys(colDef.badgeColors).map((v) => ({ value: v, label: v }));
    return [];
  }, [kanbanField, filterDefs, cols]);

  // ── Report grouping ─────────────────────────────────────────────
  const groupableCols = cols.filter((c) => c.type === 'badge');
  const numericCols = cols.filter((c) => c.type === 'currency');
  const groups = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of groupData) {
      const v = String(row[groupBy] ?? '—');
      if (!map.has(v)) map.set(v, []);
      map.get(v)!.push(row);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [groupData, groupBy]);

  const bulkFieldDefs = filterDefs || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total} record{total !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export
          </Button>
          {newLabel && (
            <Button
              className="shadow-elevation-xs"
              onClick={() => router.push(withTenant(`/app/${encodeURIComponent(doctype)}/new`, tenantCode))}
            >
              {newLabel}
            </Button>
          )}
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-1 w-fit">
        <button
          onClick={() => setView('list')}
          className={cn('flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-smooth transition-colors', view === 'list' ? 'bg-card shadow-elevation-xs' : 'text-muted-foreground hover:text-foreground')}
        >
          <ListIcon className="h-3.5 w-3.5" /> List
        </button>
        <button
          onClick={() => setView('report')}
          className={cn('flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-smooth transition-colors', view === 'report' ? 'bg-card shadow-elevation-xs' : 'text-muted-foreground hover:text-foreground')}
        >
          <Rows3 className="h-3.5 w-3.5" /> Report
        </button>
        {kanbanField && kanbanColumns.length > 0 && (
          <button
            onClick={() => setView('kanban')}
            className={cn('flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-smooth transition-colors', view === 'kanban' ? 'bg-card shadow-elevation-xs' : 'text-muted-foreground hover:text-foreground')}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Kanban
          </button>
        )}
      </div>

      <Card className="overflow-hidden">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={searchPlaceholder || `Search ${title.toLowerCase()}…`}
              className="h-9 pl-8 shadow-none"
            />
          </div>
          {filterDefs?.map((f) => (
            <Select
              key={f.key}
              value={filterValues[f.key] || '__all__'}
              onValueChange={(v) => setFilterValues((prev) => ({ ...prev, [f.key]: v === '__all__' ? '' : v }))}
            >
              <SelectTrigger className="h-9 w-auto min-w-[9rem] shadow-none">
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All {f.label.toLowerCase()}</SelectItem>
                {normalizeOptions(f.options).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          {view !== 'kanban' && cols.some((c) => colFilterKind(c)) && (
            <Button
              variant={showColumnFilters ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9"
              onClick={() => setShowColumnFilters((v) => !v)}
            >
              Column filters
            </Button>
          )}
          {view === 'report' && groupableCols.length > 0 && (
            <Select value={groupBy || '__none__'} onValueChange={(v) => setGroupBy(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 w-auto min-w-[9rem] shadow-none">
                <SelectValue placeholder="Group by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No grouping</SelectItem>
                {groupableCols.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    Group by {c.header}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        {/* Per-column filter row */}
        {showColumnFilters && view !== 'kanban' && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2.5">
            {cols.map((c) => {
              const kind = colFilterKind(c);
              if (!kind) return null;
              if (kind === 'select') {
                const options = Object.keys(c.badgeColors || {});
                return (
                  <Select
                    key={c.key}
                    value={columnFilters[c.key] || '__all__'}
                    onValueChange={(v) => setColumnFilters((prev) => ({ ...prev, [c.key]: v === '__all__' ? '' : v }))}
                  >
                    <SelectTrigger className="h-8 w-auto min-w-[8rem] text-xs shadow-none">
                      <SelectValue placeholder={c.header} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{c.header}: any</SelectItem>
                      {options.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }
              return (
                <Input
                  key={c.key}
                  value={columnFilters[c.key] || ''}
                  onChange={(e) => setColumnFilters((prev) => ({ ...prev, [c.key]: e.target.value }))}
                  placeholder={c.header}
                  className="h-8 w-32 text-xs shadow-none"
                />
              );
            })}
          </div>
        )}

        {/* Bulk action toolbar */}
        {selected.size > 0 && view !== 'kanban' && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-accent/40 px-4 py-2.5">
            <span className="text-sm font-medium">{selected.size} selected</span>
            {bulkFieldDefs.map((f) => (
              <Select key={f.key} onValueChange={(v) => runBulkSet(f.key, v)} disabled={bulkBusy}>
                <SelectTrigger className="h-8 w-auto min-w-[9rem] text-xs shadow-none">
                  <SelectValue placeholder={`Set ${f.label}…`} />
                </SelectTrigger>
                <SelectContent>
                  {normalizeOptions(f.options).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-destructive hover:text-destructive" onClick={runBulkDelete} disabled={bulkBusy}>
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
            <Button variant="ghost" size="sm" className="h-8 ml-auto text-muted-foreground" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        <CardContent className="p-0">
          {error && <div className="m-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          {view === 'kanban' && kanbanField ? (
            <div className="p-4">
              <KanbanBoard
                doctype={doctype}
                fields={fields}
                cols={cols}
                kanbanField={kanbanField}
                columns={kanbanColumns}
                baseFilters={activeFrappeFilters}
                titleField={kanbanTitleField || cols[1]?.key || cols[0]?.key || 'name'}
                subtitleField={kanbanSubtitleField}
                amountField={kanbanAmountField}
              />
            </div>
          ) : loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">
                {hasActiveFilters ? 'No records match your filters' : `No ${title.toLowerCase()} yet`}
              </p>
              {hasActiveFilters ? (
                <Button variant="link" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : newLabel ? (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => router.push(withTenant(`/app/${encodeURIComponent(doctype)}/new`, tenantCode))}
                >
                  {newLabel}
                </Button>
              ) : null}
            </div>
          ) : view === 'report' && groupBy ? (
            <div>
              {groupLoading ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
              ) : (
                <>
                  {groupTruncated && (
                    <p className="border-b bg-warning/10 px-4 py-2 text-xs text-warning">
                      Showing the first {REPORT_GROUP_CAP} matching records for grouping — narrow your filters for exact totals.
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/20">
                          {cols.map((c) => (
                            <th key={c.key} className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {c.header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groups?.map(([groupValue, rows]) => (
                          <Fragment key={groupValue}>
                            <tr className="border-b bg-muted/40">
                              <td colSpan={cols.length} className="px-4 py-2 text-xs font-semibold">
                                {groupValue} <span className="font-normal text-muted-foreground">— {rows.length} record{rows.length !== 1 ? 's' : ''}</span>
                                {numericCols.map((nc) => {
                                  const sum = rows.reduce((s, r) => s + (Number(r[nc.key]) || 0), 0);
                                  return (
                                    <span key={nc.key} className="ml-4 text-muted-foreground">
                                      {nc.header}: <span className="font-medium text-foreground tabular-nums">{formatCurrency(sum)}</span>
                                    </span>
                                  );
                                })}
                              </td>
                            </tr>
                            {rows.map((row) => (
                              <tr
                                key={row.name as string}
                                onClick={() => goToRecord(row.name as string)}
                                className="cursor-pointer border-b border-border/70 transition-smooth transition-colors hover:bg-accent/60"
                              >
                                {cols.map((c) => (
                                  <td key={c.key} className="px-4 py-1.5">
                                    {renderCellValue(row[c.key], c, goToRecord)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b bg-muted/20">
                        <th className="w-9 px-3 py-2.5">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-input"
                            checked={allOnPageSelected}
                            onChange={toggleSelectAll}
                            aria-label="Select all"
                          />
                        </th>
                        {hg.headers.map((h) => {
                          const isSorted = sortField === h.column.id;
                          return (
                            <th
                              key={h.id}
                              onClick={() => toggleSort(h.column.id)}
                              className="cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-smooth hover:text-foreground"
                            >
                              <span className="inline-flex items-center gap-1">
                                {flexRender(h.column.columnDef.header, h.getContext())}
                                {isSorted ? (
                                  sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronsUpDown className="h-3 w-3 opacity-30" />
                                )}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => {
                      const name = row.original.name as string;
                      return (
                        <tr
                          key={row.id}
                          onClick={() => goToRecord(name)}
                          className={cn(
                            'cursor-pointer border-b border-border/70 transition-smooth transition-colors last:border-0 hover:bg-accent/60',
                            view === 'report' ? '' : '',
                            selected.has(name) && 'bg-accent/50'
                          )}
                        >
                          <td className={cn('px-3', view === 'report' ? 'py-1' : 'py-2.5')} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-input"
                              checked={selected.has(name)}
                              onChange={() => toggleRow(name)}
                              aria-label={`Select ${name}`}
                            />
                          </td>
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className={cn('px-4', view === 'report' ? 'py-1' : 'py-2.5')}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-3">
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {pageCount}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setPage(page - 1)} disabled={page === 0}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setPage(page + 1)}
                    disabled={(page + 1) * pageSize >= total}
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ImportDialog
        doctype={doctype}
        fields={fields}
        cols={cols}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={refetch}
      />
    </div>
  );
}
