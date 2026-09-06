'use client';
import { useState, useEffect } from 'react';
import { compileMeta, CompiledMeta } from '@/lib/meta-compiler';

const cache: Record<string, CompiledMeta> = {};

export function useDocTypeSchema(doctype: string) {
  const [schema, setSchema] = useState<CompiledMeta | null>(cache[doctype] || null);
  const [loading, setLoading] = useState(!cache[doctype]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doctype) return;
    if (cache[doctype]) {
      setSchema(cache[doctype]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/method/frappe.desk.form.load.getdoctype?doctype=${encodeURIComponent(doctype)}&with_parent=1`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => {
        const rawMeta = data?.docs?.[0] || data?.message?.docs?.[0];
        if (!rawMeta) throw new Error('No meta returned');
        const compiled = compileMeta(rawMeta);
        cache[doctype] = compiled;
        setSchema(compiled);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [doctype]);

  return { schema, loading, error };
}
