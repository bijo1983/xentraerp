// Evaluate ERPNext depends_on / mandatory_depends_on / read_only_depends_on.
// Forms accept either `eval:<js expression over doc>` or a bare fieldname
// (treated as a truthy check). Metadata comes from our own backend, so a
// scoped Function evaluator is acceptable; failures fall back to `visible`.
export function evalDepends(
  expr: string | undefined,
  doc: Record<string, unknown>,
  fallback = true
): boolean {
  if (!expr) return fallback;
  const trimmed = expr.trim();
  try {
    if (trimmed.startsWith('eval:')) {
      const body = trimmed.slice(5);
      // eslint-disable-next-line no-new-func
      const fn = new Function('doc', `try { return !!(${body}); } catch (e) { return ${fallback}; }`);
      return fn(doc) as boolean;
    }
    // Bare fieldname → truthy check
    return !!doc[trimmed];
  } catch {
    return fallback;
  }
}
