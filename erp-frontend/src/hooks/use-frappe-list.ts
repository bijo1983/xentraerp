import { useState, useEffect, useCallback } from 'react';
import { frappe } from '@/lib/frappe';

interface UseFrappeListOptions {
  doctype: string;
  fields?: string[];
  filters?: Record<string, unknown>;
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  // Serialize fields/filters so the callback identity stays stable across
  // renders. The page components pass fresh array/object literals on every
  // render; depending on them directly causes an infinite fetch loop.
  const fieldsKey = JSON.stringify(fields);
  const filtersKey = filters ? JSON.stringify(filters) : undefined;

  const fetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const params = {
        fields: fieldsKey,
        filters: filtersKey,
        order_by: orderBy,
        limit_start: page * pageSize,
        limit_page_length: pageSize,
      };
      const result = await frappe.getList(doctype, params);
      setData(result);
      const count = await frappe.getCount(doctype, filtersKey ? JSON.parse(filtersKey) : undefined);
      setTotal(count as number);
    } finally {
      setLoading(false);
    }
  }, [doctype, fieldsKey, filtersKey, orderBy, page, pageSize, enabled]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, total, page, setPage, pageSize, refetch: fetch };
}
