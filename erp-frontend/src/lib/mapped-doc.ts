// Hands a server-mapped document (e.g. the result of calling ERPNext's own
// make_delivery_note/make_sales_invoice/... whitelisted mapper methods,
// which return a fully-populated but unsaved doc) from one page navigation
// to the next. A URL can't carry a full document payload, and there's no
// backend "staged new document" concept to fetch it back from — sessionStorage
// is the simplest thing that actually works for a same-tab redirect.
const PREFIX = 'xentra:mapped-doc:';

export function stashMappedDoc(doc: Record<string, unknown>): string {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(doc));
  } catch {
    /* storage unavailable — the New page just won't find anything under this key */
  }
  return key;
}

export function popMappedDoc(key: string): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    sessionStorage.removeItem(PREFIX + key);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
