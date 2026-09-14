import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-IN', {
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
