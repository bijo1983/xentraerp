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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function resolveTenant(_slug?: string): Promise<Tenant> {
  // Single-tenant: ignore slug, always return the configured backend.
  // Extend here for multi-tenant routing (e.g. look up slug in a DB).
  return { slug: _slug || 'default', backend: DEFAULT_BACKEND };
}
