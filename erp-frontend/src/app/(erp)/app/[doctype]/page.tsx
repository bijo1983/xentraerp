'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Inbox } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { resolvePermissions } from '@/lib/meta-compiler';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { DocField, DocTypeMeta, PermissionSet } from '@/types/meta';

const PAGE_SIZE = 20;

/** Map a status/state value to a themed badge color. */
function statusBadgeClass(value: string): string {
  const v = value.toLowerCase();
  if (/(paid|completed|complete|active|submitted|success|approved|closed|delivered|received|enabled)/.test(v))
    return 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400';
  if (/(pending|draft|open|to |awaiting|in progress|on hold|partly|unpaid|overdue|queued)/.test(v))
    return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  if (/(cancelled|canceled|rejected|failed|error|expired|returned|disabled|inactive)/.test(v))
    return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400';
  return 'bg-muted text-muted-foreground';
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(value)}`}
    >
      {value}
    </span>
  );
}

/**
 * Metadata-driven list view for ANY ERPNext DocType.
 * Columns are the DocType's in_list_view fields (falls back to the title/name).
 * Route: /app/<DocType>
 */
export default function DynamicListPage() {
  const router = useRouter();
  const params = useParams();
  const doctype = decodeURIComponent(String(params.doctype));

  const { user } = useAuthStore();
  const [columns, setColumns] = useState<DocField[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [perms, setPerms] = useState<PermissionSet | null>(null);

  // Load metadata to determine list columns + permissions.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const meta = (await frappe.getDocTypeMeta(doctype)) as DocTypeMeta | undefined;
        const cols = (meta?.fields || []).filter(
          (f) =>
            f.in_list_view === 1 &&
            !['Section Break', 'Column Break', 'Tab Break', 'Table', 'HTML'].includes(f.fieldtype)
        );
        if (active) {
          setColumns(cols);
          setPerms(resolvePermissions(meta?.permissions || [], user?.roles || []));
        }
      } catch {
        if (active) setError('Failed to load list metadata.');
      }
    })();
    return () => {
      active = false;
    };
  }, [doctype, user]);

  // Load records once columns are known.
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const fields = ['name', ...columns.map((c) => c.fieldname)];
        const uniqueFields = Array.from(new Set(fields));
        const data = await frappe.getList(doctype, {
          fields: JSON.stringify(uniqueFields),
          order_by: 'modified desc',
          limit_start: page * PAGE_SIZE,
          limit_page_length: PAGE_SIZE,
        });
        const count = await frappe.getCount(doctype);
        if (active) {
          setRows(data || []);
          setTotal((count as number) || 0);
        }
      } catch {
        if (active) setError('Failed to load records.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [doctype, columns, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isStatusCol = (fieldname: string) => /^(status|state|workflow_state|docstatus)$/i.test(fieldname);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">{doctype}</h2>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${total.toLocaleString()} record${total === 1 ? '' : 's'}` : 'Manage your records'}
          </p>
        </div>
        {perms?.create && (
          <Button asChild>
            <Link href={`/app/${encodeURIComponent(doctype)}/new`}>
              <Plus className="mr-1.5 h-4 w-4" /> New {doctype}
            </Link>
          </Button>
        )}
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y">
              <div className="h-11 bg-muted/50" />
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">No {doctype} records yet</p>
                <p className="text-sm text-muted-foreground">
                  Get started by creating your first {doctype.toLowerCase()}.
                </p>
              </div>
              {perms?.create && (
                <Button asChild size="sm" className="mt-1">
                  <Link href={`/app/${encodeURIComponent(doctype)}/new`}>
                    <Plus className="mr-1.5 h-4 w-4" /> New {doctype}
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Name
                    </th>
                    {columns.map((c) => (
                      <th
                        key={c.fieldname}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {c.label || c.fieldname}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={String(row.name)}
                      className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                      onClick={() =>
                        router.push(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(String(row.name))}`)
                      }
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">{String(row.name)}</td>
                      {columns.map((c) => {
                        const raw = row[c.fieldname];
                        const val = raw === null || raw === undefined ? '' : String(raw);
                        return (
                          <td key={c.fieldname} className="px-4 py-3 text-muted-foreground">
                            {val && isStatusCol(c.fieldname) ? <StatusBadge value={val} /> : val || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
