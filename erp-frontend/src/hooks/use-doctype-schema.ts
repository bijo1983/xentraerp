import { useEffect, useState } from 'react';
import { frappe } from '@/lib/frappe';
import { compileSchema } from '@/lib/meta-compiler';
import type { DocTypeMeta, RenderSchema } from '@/types/meta';

// Simple in-memory cache (per tab session) keyed by doctype. The metadata
// engine (Phase 1) caches compiled schemas so repeat form opens are instant.
const cache = new Map<string, RenderSchema>();

export function useDocTypeSchema(doctype: string) {
  const [schema, setSchema] = useState<RenderSchema | null>(cache.get(doctype) || null);
  const [loading, setLoading] = useState(!cache.has(doctype));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (cache.has(doctype)) {
      setSchema(cache.get(doctype)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const meta = (await frappe.getDocTypeMeta(doctype)) as DocTypeMeta | undefined;
        if (!meta || !meta.fields) {
          throw new Error(`No metadata returned for "${doctype}".`);
        }
        const compiled = compileSchema(meta);
        cache.set(doctype, compiled);
        if (active) setSchema(compiled);
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load form metadata.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [doctype]);

  return { schema, loading, error };
}
