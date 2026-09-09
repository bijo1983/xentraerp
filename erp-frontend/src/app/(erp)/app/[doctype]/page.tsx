'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { frappe } from '@/lib/frappe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTenantCode, withTenant } from '@/lib/tenant';

interface Row { name: string; [key: string]: unknown }

const PAGE_SIZE = 20;

function humanize(str: string) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DoctypeListPage() {
  const { doctype } = useParams<{ doctype: string }>();
  const router = useRouter();
  const tenantCode = useTenantCode();
  const decoded = decodeURIComponent(doctype);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [cols, setCols] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: [string, string, string][] = search
        ? [['name', 'like', `%${search}%`]]
        : [];
      const data = await frappe.getList(decoded, {
        fields: ['name', 'modified'],
        filters,
        limit_start: page * PAGE_SIZE,
        limit_page_length: PAGE_SIZE,
        order_by: 'modified desc',
      });
      const arr = Array.isArray(data) ? data : [];
      setRows(arr);
      if (arr.length > 0) {
        setCols(Object.keys(arr[0]).filter((k) => k !== 'name').slice(0, 4));
      }
      // get total
      try {
        const cnt = await frappe.call('frappe.client.get_count', { doctype: decoded, filters });
        setTotal(typeof cnt === 'number' ? cnt : arr.length);
      } catch {
        setTotal(arr.length);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [decoded, page, search]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{humanize(decoded)}</h2>
          <p className="text-sm text-muted-foreground">{total} record{total !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => router.push(withTenant(`/app/${doctype}/new`, tenantCode))} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${humanize(decoded)}…`}
            className="pl-8"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name / ID</th>
              {cols.map((c) => (
                <th key={c} className="px-4 py-3 text-left font-medium text-muted-foreground">{humanize(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={cols.length + 1} className="py-16 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={cols.length + 1} className="py-16 text-center text-muted-foreground">No records found</td></tr>
            ) : rows.map((row) => (
              <tr
                key={row.name}
                className="border-b hover:bg-muted/40 cursor-pointer"
                onClick={() => router.push(withTenant(`/app/${doctype}/${encodeURIComponent(row.name)}`, tenantCode))}
              >
                <td className="px-4 py-3 font-medium text-primary">{row.name}</td>
                {cols.map((c) => (
                  <td key={c} className="px-4 py-3 text-muted-foreground">{String(row[c] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {page + 1} of {totalPages}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
