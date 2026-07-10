'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { resolvePermissions } from '@/lib/meta-compiler';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { DocField, DocTypeMeta, PermissionSet } from '@/types/meta';

const PAGE_SIZE = 20;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{doctype}</h2>
        {perms?.create && (
          <Button asChild>
            <Link href={`/app/${encodeURIComponent(doctype)}/new`}>
              <Plus className="mr-1 h-4 w-4" /> New {doctype}
            </Link>
          </Button>
        )}
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                    {columns.map((c) => (
                      <th key={c.fieldname} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                        {c.label || c.fieldname}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No {doctype} records yet.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr
                      key={String(row.name)}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                      onClick={() =>
                        router.push(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(String(row.name))}`)
                      }
                    >
                      <td className="px-4 py-3 font-medium">{String(row.name)}</td>
                      {columns.map((c) => (
                        <td key={c.fieldname} className="px-4 py-3">
                          {row[c.fieldname] === null || row[c.fieldname] === undefined
                            ? ''
                            : String(row[c.fieldname])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {total > 0 ? `Page ${page + 1} of ${Math.max(1, Math.ceil(total / PAGE_SIZE))}` : ''}
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
    </div>
  );
}
