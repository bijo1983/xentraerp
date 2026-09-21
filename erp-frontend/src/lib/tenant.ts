'use client';

import { usePathname } from 'next/navigation';

export const RESERVED_SEGMENTS = new Set([
  'admin', 'api', 'login', 'signup', 'dashboard', 'accounts', 'app',
  'chart-of-accounts', 'cost-centers', 'customers', 'delivery-notes',
  'inventory', 'items', 'journal-entries', 'leads', 'material-requests',
  'opportunities', 'payments', 'purchase', 'purchase-invoices',
  'purchase-receipts', 'quotations', 'reports', 'sales', 'sales-invoices',
  'settings', 'suppliers', 'favicon.ico', '_next',
]);

const TENANT_CODE_RE = /^[a-z0-9]{2,10}$/;

export function getTenantCodeFromPath(pathname: string): string | null {
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) return null;
  if (RESERVED_SEGMENTS.has(first)) return null;
  if (!TENANT_CODE_RE.test(first)) return null;
  return first;
}

/** Returns the tenant code prefix segment (e.g. 'jjc') from the current URL, or null. */
export function useTenantCode(): string | null {
  const pathname = usePathname();
  return getTenantCodeFromPath(pathname || '');
}

/** Prefixes an internal href with the tenant code, if one is active. */
export function withTenant(href: string, tenantCode: string | null): string {
  if (!tenantCode) return href;
  return `/${tenantCode}${href.startsWith('/') ? href : `/${href}`}`;
}
