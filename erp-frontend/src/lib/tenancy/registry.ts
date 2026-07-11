import fs from 'fs';
import path from 'path';
import type { TenantConfig } from './types';

// ── Tenant registry ─────────────────────────────────────────────
// Resolves each tenant to its own ERPNext backend binding. For the
// site-per-tenant model, every tenant has a dedicated Frappe site (its
// own DB) selected by the `host` header, so the proxy routes each slug
// to a physically isolated environment where the tenant admin is the
// site Administrator with full control.
//
// Sources, in priority order:
//   1. A JSON registry FILE (XENTRA_TENANTS_FILE or ./data/tenants.json)
//      — written by the provisioning script when a site is created, so a
//      new tenant routes WITHOUT redeploying the frontend.
//   2. XENTRA_TENANTS env (inline JSON array), for static config.
//   3. The built-in default tenant (preserves single-backend behavior).

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

function registryFilePath(): string {
  return process.env.XENTRA_TENANTS_FILE || path.join(process.cwd(), 'data', 'tenants.json');
}

// Small cache so we don't hit the disk on every proxied request; keyed by
// the file's mtime so the provisioning script's writes are picked up
// within `TTL_MS` (or immediately when mtime changes).
let cache: { tenants: TenantConfig[]; mtimeMs: number; readAt: number } | null = null;
const TTL_MS = 5000;

function readFileRegistry(): TenantConfig[] {
  const file = registryFilePath();
  try {
    const stat = fs.statSync(file);
    const now = Date.now();
    if (cache && cache.mtimeMs === stat.mtimeMs && now - cache.readAt < TTL_MS) {
      return cache.tenants;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const tenants = Array.isArray(parsed) ? (parsed as TenantConfig[]) : [];
    cache = { tenants, mtimeMs: stat.mtimeMs, readAt: now };
    return tenants;
  } catch {
    // No file / unreadable / invalid JSON → no file-based tenants.
    return [];
  }
}

// Optional inline registry supplied as JSON via env, e.g.
// XENTRA_TENANTS='[{"id":"t1","code":"ymh",...}]'
function loadEnvRegistry(): TenantConfig[] {
  const raw = process.env.XENTRA_TENANTS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TenantConfig[]) : [];
  } catch {
    return [];
  }
}

/** All configured tenants (file registry takes precedence over env). */
export function loadRegistry(): TenantConfig[] {
  const byCode = new Map<string, TenantConfig>();
  for (const t of loadEnvRegistry()) byCode.set(t.code, t);
  for (const t of readFileRegistry()) byCode.set(t.code, t); // file wins
  return Array.from(byCode.values());
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
