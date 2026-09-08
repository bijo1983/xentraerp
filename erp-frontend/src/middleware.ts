import { NextRequest, NextResponse } from 'next/server';

// Top-level route segments that are NOT tenant codes — anything else in the
// first path segment is treated as /<tenantCode>/... and rewritten internally
// (browser keeps the tenant-prefixed URL; the app renders the normal page).
// Keep in sync with src/lib/tenant.ts (Edge middleware can't import a
// 'use client' module, so the list is duplicated here).
const RESERVED_SEGMENTS = new Set([
  'admin', 'api', 'login', 'signup', 'dashboard', 'accounts', 'app',
  'chart-of-accounts', 'cost-centers', 'customers', 'delivery-notes',
  'inventory', 'items', 'journal-entries', 'leads', 'material-requests',
  'opportunities', 'payments', 'purchase', 'purchase-invoices',
  'purchase-receipts', 'quotations', 'reports', 'sales', 'sales-invoices',
  'settings', 'suppliers', 'favicon.ico', '_next',
]);

const TENANT_CODE_RE = /^[a-z0-9]{2,10}$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return NextResponse.next();

  const [first, ...rest] = segments;
  if (RESERVED_SEGMENTS.has(first) || !TENANT_CODE_RE.test(first)) {
    return NextResponse.next();
  }

  const rewritten = req.nextUrl.clone();
  rewritten.pathname = '/' + (rest.length ? rest.join('/') : 'dashboard');

  const res = NextResponse.rewrite(rewritten);
  res.cookies.set('xentra_tenant', first, { path: '/', sameSite: 'lax' });
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
