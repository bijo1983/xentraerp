// ── Tenancy model (S1) ──────────────────────────────────────────
// Two isolation strategies, chosen per tenant by company size:
//  - 'company': one shared ERPNext site, one Company per tenant
//               (isolation via ERPNext User Permissions). Best for SMB.
//  - 'site'   : a dedicated Frappe site + DB per tenant. Strong
//               isolation for large/enterprise customers.
export type TenancyModel = 'company' | 'site';

export interface TenantBackend {
  // ERPNext binding used by the server-side proxy.
  hostIp: string; // where to open the socket (e.g. 127.0.0.1 for shared site)
  port: number;
  host: string; // Host header ERPNext resolves the site by
}

export interface TenantBranding {
  productName: string;
  logoUrl?: string;
  theme: {
    // CSS-variable overrides; omitted values keep the app default.
    primary?: string;
    secondary?: string;
    accent?: string;
    mode?: 'light' | 'dark';
  };
}

export interface TenantConfig {
  id: string;
  code: string; // URL slug (e.g. "ymh")
  companyName: string;
  tenancyModel: TenancyModel;
  backend: TenantBackend;
  // For 'company' tenancy: the ERPNext Company name this tenant maps to.
  company?: string;
  branding: TenantBranding;
}

// Public, non-secret subset safe to expose to the browser.
export interface PublicTenant {
  code: string;
  companyName: string;
  tenancyModel: TenancyModel;
  company?: string;
  branding: TenantBranding;
}

export function toPublicTenant(t: TenantConfig): PublicTenant {
  return {
    code: t.code,
    companyName: t.companyName,
    tenancyModel: t.tenancyModel,
    company: t.company,
    branding: t.branding,
  };
}
