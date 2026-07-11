import { NextRequest, NextResponse } from 'next/server';
import { resolveTenant } from '@/lib/tenancy/registry';
import { toPublicTenant } from '@/lib/tenancy/types';

// Exposes the current tenant's PUBLIC branding/config (no secrets) so the
// client can apply per-tenant theme + product name. Extension seam: once
// slug routing exists, read the slug from the path/host instead.
export async function GET(req: NextRequest) {
  const slug = req.headers.get('x-xentra-tenant') || req.cookies.get('xentra_tenant')?.value || undefined;
  const tenant = await resolveTenant(slug);
  return NextResponse.json(toPublicTenant(tenant));
}
