'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { Search, X, Inbox, ChevronRight, ChevronLeft } from 'lucide-react';
import { useFrappeList } from '@/hooks/use-frappe-list';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenantCode, withTenant } from '@/lib/tenant';

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
  /** Structured dropdown filters shown next to the search box. */
  filters?: FilterDef[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const col = createColumnHelper<any>();

export function DoctypeList({
  title,
  doctype,
  fields,
  cols,
  newLabel,
  searchField,
  searchPlaceholder,
  filters: filterDefs,
}: Props) {
  const router = useRouter();
  const tenantCode = useTenantCode();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  // Debounce free-text search so we're not firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const effectiveSearchField = searchField || cols[0]?.key || 'name';

  const activeFrappeFilters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (search) f.push([effectiveSearchField, 'like', `%${search}%`]);
    for (const [key, value] of Object.entries(filterValues)) {
      if (value) f.push([key, '=', value]);
    }
    return f.length ? f : undefined;
  }, [search, filterValues, effectiveSearchField]);

  const { data, loading, error, total, page, setPage, pageSize } = useFrappeList<Record<string, unknown>>({
    doctype,
    fields,
    filters: activeFrappeFilters,
  });

  // A new filter can make the current page land past the end of the
  // (now smaller) result set — reset to page 1 whenever the filter set
  // itself changes, not on every unrelated re-render.
  const filterKey = JSON.stringify(activeFrappeFilters ?? null);
  useEffect(() => {
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const hasActiveFilters = Boolean(search || Object.values(filterValues).some(Boolean));
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setFilterValues({});
  };

  const goToRecord = (name: string) =>
    router.push(withTenant(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, tenantCode));

  const columns = useMemo(
    () =>
      cols.map((c) =>
        col.accessor(c.key, {
          header: c.header,
          cell: (info) => {
            const v = info.getValue() as string;
            if (v === undefined || v === null || v === '') return <span className="text-muted-foreground">—</span>;
            if (c.type === 'date') return formatDate(v);
            if (c.type === 'currency') return <span className="tabular-nums">{formatCurrency(Number(v))}</span>;
            if (c.type === 'badge') {
              const cls = c.badgeColors?.[v];
              return (
                <Badge variant={cls ? undefined : 'default'} className={cls}>
                  {v}
                </Badge>
              );
            }
            if (c.type === 'link') {
              return (
                <button
                  className="font-medium text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToRecord(v);
                  }}
                >
                  {v}
                </button>
              );
            }
            return v;
          },
        })
      ),
    [cols, doctype, tenantCode, router]
  );

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total} record{total !== 1 ? 's' : ''}
          </p>
        </div>
        {newLabel && (
          <Button
            className="shadow-elevation-xs"
            onClick={() => router.push(withTenant(`/app/${encodeURIComponent(doctype)}/new`, tenantCode))}
          >
            {newLabel}
          </Button>
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
                {f.options.map((o) => {
                  const opt = typeof o === 'string' ? { value: o, label: o } : o;
                  return (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          ))}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        <CardContent className="p-0">
          {error && (
            <div className="m-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          {loading ? (
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
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b bg-muted/20">
                        {hg.headers.map((h) => (
                          <th
                            key={h.id}
                            className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => goToRecord(row.original.name as string)}
                        className="cursor-pointer border-b border-border/70 transition-smooth transition-colors last:border-0 hover:bg-accent/60"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-2.5">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
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
    </div>
  );
}
