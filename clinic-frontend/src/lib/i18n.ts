// CLINZA screens are English for now; printed documents carry Arabic where the region
// needs it (lib/print.ts). This keeps the same t() shape as pos-frontend so the shared
// ui/* components work unchanged, and leaves room for an Arabic UI later.
const EN: Record<string, string> = {
  'ui.close': 'Close',
  'ui.dismiss': 'Dismiss',
  'ui.reference': 'Reference',
  'ui.search': 'Search',
  'ui.clear': 'Clear',
  'error.unexpected': 'Something went wrong. Please try again.',
  'error.network': "Can't reach the server. Check your connection and try again.",
  'error.apiUnavailable': 'The clinic server is not responding right now. Please try again in a minute.',
  'error.rateLimited': 'Too many attempts. Please wait a minute and try again.',
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = EN[key] ?? key
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v))
  return s
}
