'use client';

import { usePathname } from 'next/navigation';

// First-path segments that are NOT tenant slugs (mirror of middleware).
// A URL whose first segment is one of these is a "bare" ERP route; the
// active tenant then comes from the xentra_tenant cookie.
export const RESERVED_SEGMENTS = new Set([
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
]);

function readCookieSlug(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)xentra_tenant=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/**
 * Tenant-aware routing helper. Reads the tenant slug from the URL's first
 * segment when present (e.g. /jjcompany/dashboard → "jjcompany"), else
 * from the xentra_tenant cookie. Exposes:
 *   - slug: current tenant slug ('' if none)
 *   - href(path): prefix an absolute app path with the tenant slug so the
 *     URL bar keeps /<slug>/… as the user navigates
 *   - strip(pathname): remove the slug prefix for active-state comparison
 */
export function useTenant() {
  const pathname = usePathname() || '/';
  const seg = pathname.split('/')[1] || '';
  const urlSlug = seg && !RESERVED_SEGMENTS.has(seg) && !seg.includes('.') ? seg : '';
  const slug = urlSlug || readCookieSlug();
  const base = slug ? `/${slug}` : '';

  const href = (path: string) => {
    if (!slug) return path;
    if (path === base || path.startsWith(`${base}/`)) return path; // already prefixed
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const strip = (p: string) => {
    if (urlSlug && (p === base || p.startsWith(`${base}/`))) {
      return p.slice(base.length) || '/';
    }
    return p;
  };

  return { slug, base, href, strip, pathname };
}
