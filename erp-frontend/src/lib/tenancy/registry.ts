import type { TenantConfig } from './types';

// ── Tenant registry (S1 — thin slice) ───────────────────────────
// Today this resolves tenants from configuration (env + a built-in
// default that preserves the current single-backend behavior). The
// public API (resolveTenant / getDefaultTenant) is the extension seam:
// swap the in-memory lookup for a control-plane DB / master-site
// `Tenant` DocType lookup later WITHOUT touching call sites.

// Built-in default tenant. Values fall back to the previously hardcoded
// backend so existing deployments behave identically until configured.
function defaultTenant(): TenantConfig {
  return {
    id: process.env.XENTRA_DEFAULT_TENANT_ID || 'default',
    code: process.env.XENTRA_DEFAULT_TENANT_CODE || 'default',
    companyName: process.env.XENTRA_DEFAULT_COMPANY_NAME || 'XentraERP',
    tenancyModel: (process.env.XENTRA_DEFAULT_TENANCY_MODEL as 'company' | 'site') || 'company',
    backend: {
      hostIp: process.env.ERP_HOST_IP || '127.0.0.1',
      port: Number(process.env.ERP_PORT || 8001),
      host: process.env.ERP_HOST || 'erp.badmintonbooking.com',
    },
    company: process.env.XENTRA_DEFAULT_ERP_COMPANY || undefined,
    branding: {
      productName: process.env.XENTRA_PRODUCT_NAME || 'XentraERP',
      theme: {
        // No overrides by default → app keeps its current look.
        primary: process.env.XENTRA_THEME_PRIMARY || undefined,
        accent: process.env.XENTRA_THEME_ACCENT || undefined,
      },
    },
  };
}

// Optional multi-tenant registry supplied as JSON via env, e.g.
// XENTRA_TENANTS='[{"id":"t1","code":"ymh",...}]'
function loadRegistry(): TenantConfig[] {
  const raw = process.env.XENTRA_TENANTS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TenantConfig[]) : [];
  } catch {
    return [];
  }
}

export function getDefaultTenant(): TenantConfig {
  return defaultTenant();
}

/**
 * Resolve a tenant by slug. Falls back to the default tenant when no
 * slug is given or no match is found (single-tenant behavior today).
 * Async by design so a DB-backed implementation can drop in unchanged.
 */
export async function resolveTenant(slug?: string): Promise<TenantConfig> {
  if (slug) {
    const match = loadRegistry().find((t) => t.code === slug);
    if (match) return match;
  }
  return getDefaultTenant();
}
