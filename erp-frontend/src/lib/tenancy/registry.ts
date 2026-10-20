import http from 'http';
import { NextResponse } from 'next/server';

// Minimal tenant registry — resolves backend connection details for proxy routes.
// For single-tenant deployments, set ERP_BACKEND_URL in .env.local (e.g. http://127.0.0.1:8001).
// The Host header is derived from ERP_BACKEND_HOST (defaults to the URL's hostname).

interface TenantBackend {
  hostIp: string;
  port: number;
  host: string;
}

interface Tenant {
  slug: string;
  backend: TenantBackend;
}

function parseBackend(): TenantBackend {
  const raw = process.env.ERP_BACKEND_URL || 'http://127.0.0.1:8001';
  const url = new URL(raw);
  return {
    hostIp: url.hostname,
    port: parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10),
    host: process.env.ERP_BACKEND_HOST || url.hostname,
  };
}

const DEFAULT_BACKEND = parseBackend();

const TENANT_SITE_SUFFIX = process.env.TENANT_SITE_SUFFIX || 'xentraerp.local';

// Per-tenant Frappe sites live on the same bench/gunicorn process as the
// control-plane site — Frappe resolves which site's database to use purely
// from the HTTP Host header string (no real DNS needed, since the request
// never leaves 127.0.0.1). Site names are deterministic: "<code>.xentraerp.local",
// created by custom_erp.api.provisioning.provision_tenant_site via `bench new-site`.
//
// The slug comes from a client-controlled cookie/header, so it is validated before
// it can pick a site (POS upgrade Phase 1, audit H4):
//  1. format: same rule as src/middleware.ts (2-10 lowercase letters/digits);
//  2. allow-list: the control-plane site confirms the code is an active, provisioned
//     tenant (custom_erp.api.tenants.resolve_tenant_site, server-to-server with the
//     shared secret XENTRA_INTERNAL_TOKEN). Answers are cached (60 s known, 30 s
//     unknown). If the control plane can't be reached, a previously confirmed code
//     keeps working for up to 24 h; an unconfirmed one is refused (fails closed).
//  If XENTRA_INTERNAL_TOKEN is not set, only the format check runs and a warning is
//  logged once — set it in production (see scripts/nginx-pos-security.conf notes).
export const TENANT_SLUG_RE = /^[a-z0-9]{2,10}$/;

export class UnknownTenantError extends Error {
  status: number;
  constructor(message = 'Unknown organization', status = 404) {
    super(message);
    this.status = status;
  }
}

interface CacheEntry { ok: boolean; at: number }
const verified = new Map<string, CacheEntry>();
const OK_TTL_MS = 60_000;
const BAD_TTL_MS = 30_000;
const STALE_OK_MS = 24 * 3600_000;
let warnedNoToken = false;

function askControlPlane(slug: string, token: string): Promise<boolean> {
  const controlHost = process.env.XENTRA_CONTROL_PLANE_HOST || DEFAULT_BACKEND.host;
  const path = `/api/method/custom_erp.api.tenants.resolve_tenant_site?tenant_code=${encodeURIComponent(slug)}`;
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: DEFAULT_BACKEND.hostIp, port: DEFAULT_BACKEND.port, path, method: 'GET', timeout: 3000,
        headers: { Host: controlHost, Accept: 'application/json', 'X-Xentra-Internal-Token': token } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if ((res.statusCode || 0) >= 500) return reject(new Error(`control plane ${res.statusCode}`));
          if ((res.statusCode || 0) >= 400) return reject(new Error(`control plane refused (${res.statusCode}) — check XENTRA_INTERNAL_TOKEN`));
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            resolve(!!body?.message?.active);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('control plane timeout')));
    req.on('error', reject);
    req.end();
  });
}

export async function isKnownTenant(slug: string, now = Date.now()): Promise<boolean> {
  if (!TENANT_SLUG_RE.test(slug)) return false;
  const token = process.env.XENTRA_INTERNAL_TOKEN;
  if (!token) {
    if (!warnedNoToken) {
      console.warn('[tenancy] XENTRA_INTERNAL_TOKEN is not set: tenant codes are format-checked only, not allow-listed.');
      warnedNoToken = true;
    }
    return true;
  }
  const hit = verified.get(slug);
  if (hit && now - hit.at < (hit.ok ? OK_TTL_MS : BAD_TTL_MS)) return hit.ok;
  try {
    const ok = await askControlPlane(slug, token);
    verified.set(slug, { ok, at: now });
    if (verified.size > 5000) verified.clear();
    return ok;
  } catch (e) {
    console.error('[tenancy] tenant allow-list check failed:', e instanceof Error ? e.message : e);
    return !!(hit && hit.ok && now - hit.at < STALE_OK_MS);
  }
}

export async function resolveTenant(slug?: string): Promise<Tenant> {
  // No tenant, or the reserved 'sandbox' alias: both point at the original
  // shared/default site — the pre-per-tenant-sites data lives there, with no
  // separate site of its own, so /sandbox/... is just a URL alias onto it.
  if (!slug || slug === 'sandbox') return { slug: slug || 'default', backend: DEFAULT_BACKEND };
  const code = slug.trim().toLowerCase();
  if (!(await isKnownTenant(code))) throw new UnknownTenantError();
  return {
    slug: code,
    backend: { ...DEFAULT_BACKEND, host: `${code}.${TENANT_SITE_SUFFIX}` },
  };
}

// The JSON a proxy route returns for a refused tenant (no detail about why).
export function tenantErrorResponse(err: unknown): NextResponse {
  const status = err instanceof UnknownTenantError ? err.status : 502;
  return NextResponse.json(
    { error: status === 404 ? 'Unknown organization' : 'Backend unavailable', code: status === 404 ? 'UNKNOWN_TENANT' : 'BACKEND_UNAVAILABLE' },
    { status },
  );
}
