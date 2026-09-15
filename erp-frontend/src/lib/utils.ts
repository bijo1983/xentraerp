import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// The tenant's real company currency, fetched once and cached — every
// formatCurrency() call site used to just take the hardcoded 'INR'
// default, so every amount showed as ₹/Rs regardless of the company's
// actual currency (reported: BHD configured, still showing Rs everywhere).
// A plain module-level cache (not a store) is deliberate: formatCurrency is
// called from many plain, non-hook contexts (react-table cell renderers,
// utility functions) — primeCurrency() is kicked off once from the ERP
// layout on mount, and since it resolves well before any real data finishes
// loading, by the time actual amounts render the cache is already warm.
let cachedCurrency = 'USD';
let currencyFetchStarted = false;

export function primeCurrency() {
  if (currencyFetchStarted) return;
  currencyFetchStarted = true;
  fetch('/api/resource/Global%20Defaults/Global%20Defaults', { credentials: 'include' })
    .then((r) => r.json())
    .then((d) => {
      const c = d?.data?.default_currency;
      if (c) cachedCurrency = c;
    })
    .catch(() => {
      /* keep the neutral fallback */
    });
}

export function formatCurrency(value: number, currency = cachedCurrency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

// Shared status-pill tones for DoctypeList `badgeColors` maps — theme-aware
// (uses the semantic --success/--warning/--destructive/--accent/--muted
// tokens, so it adapts to dark mode) instead of every list page hardcoding
// its own light-mode-only bg-*-100/text-*-800 pairs.
export const STATUS_TONE = {
  neutral: 'bg-muted text-muted-foreground',
  progress: 'bg-accent text-accent-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
} as const;
