import { NextRequest, NextResponse } from 'next/server';

// ── Path-based multi-tenant routing ─────────────────────────────
//  /                → SaaS Admin Platform (rewritten to /admin)
//  /admin/**        → SaaS Admin Platform
//  /<tenant>        → selects a tenant: sets tenant context + enters ERP
//  /dashboard, /app/**, /setup, … → the tenant ERP app (existing routes)
//
// The tenant slug is carried in the `xentra_tenant` cookie so the API
// proxy can route to the right ERPNext backend/company. This keeps the
// working ERP routes intact while making `/` the admin platform.

// First-path segments that are NOT tenant slugs.
const RESERVED = new Set([
  'admin',
  'api',
  'login',
  '_next',
  'dashboard',
  'app',
  'setup',
  'onboarding',
  'reports',
  'logistics',
  'settings',
  'customers',
  'items',
  'sales',
  'purchase',
  'inventory',
  'accounts',
  'favicon.ico',
  'logo.svg',
  'robots.txt',
  'sitemap.xml',
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split('/')[1] || '';

  // Root → SaaS admin platform.
  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/admin', req.url));
  }

  // Reserved routes or static assets → pass through unchanged.
  if (RESERVED.has(first) || first.includes('.')) {
    return NextResponse.next();
  }

  // Unknown first segment = tenant slug. Set tenant context and enter
  // the ERP app. (Persistent /<slug>/… deep links are a later step.)
  const res = NextResponse.redirect(new URL('/dashboard', req.url));
  res.cookies.set('xentra_tenant', first, { path: '/', sameSite: 'lax' });
  return res;
}

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
