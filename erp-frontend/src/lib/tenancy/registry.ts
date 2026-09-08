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
export async function resolveTenant(slug?: string): Promise<Tenant> {
  if (!slug) return { slug: 'default', backend: DEFAULT_BACKEND };
  return {
    slug,
    backend: { ...DEFAULT_BACKEND, host: `${slug}.${TENANT_SITE_SUFFIX}` },
  };
}
