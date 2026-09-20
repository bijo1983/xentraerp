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
    fetch(`/api/method/xentraerp.desk.form.load.getdoctype?doctype=${encodeURIComponent(doctype)}&with_parent=1`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => {
        // getdoctype's with_parent=1 flag returns a bundle led by the
        // PARENT doctype's meta (plus all its child-table doctypes) when
        // `doctype` is itself a child table — docs[0] is only the requested
        // doctype when it isn't a child table. Find the matching entry by
        // name instead of assuming position, or every child-table grid in
        // the app renders the parent transaction's own fields.
        const docs: Array<{ name?: string }> = data?.docs || data?.message?.docs || [];
        const rawMeta = docs.find((d) => d?.name === doctype) || docs[0];
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
