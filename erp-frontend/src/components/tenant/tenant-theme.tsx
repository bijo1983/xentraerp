'use client';

import { useEffect } from 'react';
import type { PublicTenant } from '@/lib/tenancy/types';

// Applies per-tenant branding at runtime: overrides CSS variables only
// when the tenant specifies them (default tenant specifies none, so the
// app keeps its current look). Extends cleanly to full theming later.
export function TenantTheme() {
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/tenant');
        if (!res.ok) return;
        const tenant = (await res.json()) as PublicTenant;
        if (!active) return;

        const root = document.documentElement;
        const { theme } = tenant.branding;
        if (theme.primary) root.style.setProperty('--primary', theme.primary);
        if (theme.accent) root.style.setProperty('--accent', theme.accent);
        if (theme.mode === 'dark') root.classList.add('dark');
        if (theme.mode === 'light') root.classList.remove('dark');
        if (tenant.branding.productName) {
          document.title = tenant.branding.productName;
        }
      } catch {
        /* keep default theme */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return null;
}
