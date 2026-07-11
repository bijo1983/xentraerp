import { NextRequest, NextResponse } from 'next/server';

// ── Path-based multi-tenant routing ─────────────────────────────
//  /                    → SaaS Admin Platform (redirect to /admin)
//  /admin/**            → SaaS Admin Platform
//  /<tenant>            → /<tenant>/dashboard (tenant workspace home)
//  /<tenant>/<page>     → rewritten to /<page>, tenant kept in the URL bar
//  /dashboard, /app/**  → bare ERP routes (tenant from cookie)
//
// The tenant slug is carried BOTH in the URL (/<tenant>/…, so the address
// bar shows the tenant and deep links are shareable) AND in the
// `xentra_tenant` cookie (so the API proxy routes to the right ERPNext
// backend even on a bare route). Middleware REWRITES /<tenant>/<page> to
// the real /<page> route so the existing pages render unchanged while the
// browser keeps the /<tenant>/<page> URL.

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

  // Root → SaaS admin platform. Use a redirect (not a rewrite): rewriting
  // the root to a different app-router page breaks RSC client-module
  // resolution ("Cannot read properties of undefined (reading
  // 'clientModules')"). A redirect renders /admin cleanly.
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/admin', req.url));
  }

  // Reserved routes or static assets → pass through unchanged (bare ERP
  // routes; tenant comes from the cookie set on a prior /<tenant> visit).
  if (RESERVED.has(first) || first.includes('.')) {
    return NextResponse.next();
  }

  // Unknown first segment = tenant slug. Keep it in the URL and REWRITE to
  // the underlying page so the address bar stays /<tenant>/<page>.
  const rest = pathname.split('/').slice(2).join('/'); // everything after the slug
  const url = req.nextUrl.clone();
  url.pathname = '/' + (rest || 'dashboard'); // /<tenant> → dashboard home
  const res = NextResponse.rewrite(url);
  res.cookies.set('xentra_tenant', first, { path: '/', sameSite: 'lax' });
  return res;
}

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
