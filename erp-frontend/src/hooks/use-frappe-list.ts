import { useState, useEffect, useCallback } from 'react';
import { frappe } from '@/lib/frappe';

// Frappe's REST API accepts filters either as a plain {field: value} dict
// (implicit "=") or as a list of [field, operator, value] triples (for
// "like", ">=", etc.) — support both shapes here.
/** Prefix bare sort fields with the doctype's table. A filter on a child-table field
 * makes Frappe join that table, and an unqualified `modified desc` is then ambiguous
 * (MySQL 1052 -> HTTP 417) — that broke every Connections link to a document whose
 * back-reference lives on its rows (Purchase Invoice Item, Payment Entry Reference, ...). */
export function qualifyOrderBy(doctype: string, orderBy: string): string {
  return orderBy
    .split(',')
    .map((part) => {
      const m = part.trim().match(/^([a-z_][a-z0-9_]*)(\s+(?:asc|desc))?$/i);
      return m ? `\`tab${doctype}\`.${m[1]}${m[2] || ''}` : part.trim();
    })
    .join(', ');
}

type FrappeFilters = Record<string, unknown> | Array<[string, string, unknown] | [string, string, string, unknown]>;

interface UseFrappeListOptions {
  doctype: string;
  fields?: string[];
  filters?: FrappeFilters;
  orderBy?: string;
  pageSize?: number;
  enabled?: boolean;
}

export function useFrappeList<T>({
  doctype,
  fields = ['name'],
  filters,
  orderBy = 'modified desc',
  pageSize = 20,
  enabled = true,
}: UseFrappeListOptions) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  // Callers pass `fields`/`filters` as inline array/object literals, which
  // get a new identity every render — keying the callback on their
  // serialized content (not the reference) is what actually prevents an
  // infinite fetch loop (new literal -> new callback -> effect re-fires ->
  // re-render -> new literal -> ...) that otherwise shows up as a page
  // stuck flickering between loading states forever.
  const fieldsKey = JSON.stringify(fields);
  const filtersKey = filters ? JSON.stringify(filters) : '';

  const fetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const params = {
        fields: fieldsKey,
        filters: filtersKey || undefined,
        order_by: qualifyOrderBy(doctype, orderBy),
        limit_start: page * pageSize,
        limit_page_length: pageSize,
      };
      const result = await frappe.getList(doctype, params);
      setData(result);
      const count = await frappe.getCount(doctype, filtersKey ? JSON.parse(filtersKey) : undefined);
      setTotal(count as number);
    } catch (err: unknown) {
      setData([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : `Failed to load ${doctype}`);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, fieldsKey, filtersKey, orderBy, page, pageSize, enabled]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, total, page, setPage, pageSize, refetch: fetch };
}
