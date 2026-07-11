import { frappe, frappeErrorMessage } from '@/lib/frappe';

// ── Tenant Admin access model ───────────────────────────────────
// A Tenant Admin is a TENANT user with full ERP administration rights
// INSIDE their own company/site. This is distinct from a Platform Admin
// (SaaS provider staff who manage tenants/plans/billing and never operate
// a tenant's ERP directly). This module encodes the tenant-admin role
// policy and provides a diagnostic + repair service that is role-aware,
// module-aware, and reports exactly what it inspected and changed.

// Base roles every Tenant Admin must hold (full ERP administration of
// their own company). System Manager is required to edit settings Singles
// (Stock Settings, Accounts Settings, …), create users and assign roles.
export const TENANT_ADMIN_BASE_ROLES = ['System Manager'];

// Map an enabled subscription module → the ERPNext manager/user roles the
// tenant admin needs for it. Keys are matched case-insensitively against
// the module name (substring), so "Selling"/"Sales" both map to sales.
export const MODULE_ROLE_MAP: { match: RegExp; roles: string[] }[] = [
  { match: /sell|sales|crm/i, roles: ['Sales Manager', 'Sales Master Manager', 'Sales User'] },
  { match: /buy|purchas/i, roles: ['Purchase Manager', 'Purchase Master Manager', 'Purchase User'] },
  { match: /account|financ/i, roles: ['Accounts Manager', 'Accounts User'] },
  { match: /stock|invent|warehous/i, roles: ['Stock Manager', 'Stock User', 'Item Manager'] },
  { match: /manufactur|production/i, roles: ['Manufacturing Manager', 'Manufacturing User'] },
  { match: /\bhr\b|human|payroll/i, roles: ['HR Manager', 'HR User'] },
  { match: /project/i, roles: ['Projects Manager', 'Projects User'] },
  { match: /asset/i, roles: ['Accounts Manager'] },
  { match: /quality/i, roles: ['Quality Manager'] },
  { match: /website|portal/i, roles: ['Website Manager'] },
  { match: /maintenance/i, roles: ['Maintenance Manager', 'Maintenance User'] },
];

/** Full role set a tenant admin should hold given the tenant's modules. */
export function rolesForTenantAdmin(enabledModules: string[]): string[] {
  const set = new Set<string>(TENANT_ADMIN_BASE_ROLES);
  for (const mod of enabledModules) {
    for (const { match, roles } of MODULE_ROLE_MAP) {
      if (match.test(mod)) roles.forEach((r) => set.add(r));
    }
  }
  // If no modules are recorded, fall back to the common operational bundle
  // so a tenant admin is never left with only System Manager.
  if (enabledModules.length === 0) {
    ['Sales Manager', 'Purchase Manager', 'Accounts Manager', 'Stock Manager', 'Item Manager'].forEach((r) =>
      set.add(r)
    );
  }
  return Array.from(set);
}

export type UserType = 'Tenant Admin' | 'Tenant User' | 'Platform Admin' | 'Unknown';

export interface DocAccessProbe {
  doctype: string;
  status: 'ok' | 'no-permission' | 'user-permission-block' | 'error';
  detail?: string;
}

export interface TenantAdminDiagnostic {
  email: string;
  userExists: boolean;
  enabled: boolean;
  userType: UserType;
  tenant?: { name: string; code?: string; company?: string; status?: string; modules: string[] };
  belongsToTenant: boolean;
  isPrimaryAdmin: boolean;
  currentRoles: string[];
  requiredRoles: string[];
  missingRoles: string[];
  userPermissions: { name: string; allow: string; for_value: string }[];
  docAccess: DocAccessProbe[];
  summary: string[];
}

// Settings Singles we probe to prove the tenant admin can actually operate.
const PROBE_SINGLES = ['Stock Settings', 'Accounts Settings', 'Selling Settings', 'Buying Settings'];

/** Classify a caught error from a getDoc probe. */
function classifyProbe(doctype: string, e: unknown): DocAccessProbe {
  const status = (e as { response?: { status?: number } })?.response?.status;
  const msg = frappeErrorMessage(e, '');
  if (status === 403) {
    if (/does not have access to this document/i.test(msg)) {
      return { doctype, status: 'user-permission-block', detail: 'Blocked by a User Permission restriction.' };
    }
    return { doctype, status: 'no-permission', detail: 'Missing role/DocPerm write access.' };
  }
  return { doctype, status: 'error', detail: msg || `HTTP ${status ?? '?'}` };
}

/** Find the tenant whose admin_email matches, else the first tenant. */
async function findTenantForEmail(email: string) {
  try {
    const rows = (await frappe.getList('Xentra Tenant', {
      fields: JSON.stringify([
        'name',
        'tenant_code',
        'company_name',
        'erp_company',
        'status',
        'admin_email',
        'enabled_modules',
      ]),
      filters: JSON.stringify([['admin_email', '=', email]]),
      limit_page_length: 1,
    })) as Record<string, string>[];
    return rows?.[0];
  } catch {
    return undefined;
  }
}

function parseModules(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Inspect a tenant admin's access and produce a structured report. Runs as
 * the logged-in platform admin (Administrator) over REST. Read-only.
 */
export async function diagnoseTenantAdmin(email: string): Promise<TenantAdminDiagnostic> {
  const summary: string[] = [];

  // User doc + roles.
  let userExists = false;
  let enabled = true;
  let currentRoles: string[] = [];
  try {
    const user = (await frappe.getDoc('User', email)) as {
      enabled?: number;
      roles?: { role: string }[];
    };
    userExists = true;
    enabled = user.enabled !== 0;
    currentRoles = (user.roles || []).map((r) => r.role);
  } catch (e) {
    summary.push(`User ${email} could not be read: ${frappeErrorMessage(e, 'not found')}`);
  }

  // Tenant mapping.
  const tRow = await findTenantForEmail(email);
  const tenant = tRow
    ? {
        name: tRow.name,
        code: tRow.tenant_code,
        company: tRow.erp_company || tRow.company_name,
        status: tRow.status,
        modules: parseModules(tRow.enabled_modules),
      }
    : undefined;
  const belongsToTenant = !!tenant;
  const isPrimaryAdmin = !!tRow && tRow.admin_email === email;

  // User type inference.
  let userType: UserType = 'Unknown';
  if (belongsToTenant) userType = isPrimaryAdmin ? 'Tenant Admin' : 'Tenant User';
  else if (currentRoles.includes('System Manager')) userType = 'Platform Admin';

  // Required vs missing roles. Computed for anyone who is (or could be) a
  // tenant admin — i.e. everyone except a clear Platform Admin — so the
  // report shows what a tenant admin still needs even when not yet mapped.
  const requiredRoles = userType === 'Platform Admin' ? [] : rolesForTenantAdmin(tenant?.modules || []);
  const missingRoles = requiredRoles.filter((r) => !currentRoles.includes(r));

  // User Permission restrictions.
  let userPermissions: { name: string; allow: string; for_value: string }[] = [];
  try {
    userPermissions = (await frappe.getList('User Permission', {
      fields: JSON.stringify(['name', 'allow', 'for_value']),
      filters: JSON.stringify([['user', '=', email]]),
      limit_page_length: 500,
    })) as { name: string; allow: string; for_value: string }[];
  } catch {
    /* platform admin may or may not read these; non-fatal */
  }

  // Probe settings access (only meaningful when checking THIS user's own
  // session; when a platform admin runs it, this reflects the admin's own
  // access, so we note that in the detail).
  const docAccess: DocAccessProbe[] = [];
  for (const dt of PROBE_SINGLES) {
    try {
      await frappe.getDoc(dt, dt);
      docAccess.push({ doctype: dt, status: 'ok' });
    } catch (e) {
      docAccess.push(classifyProbe(dt, e));
    }
  }

  if (!userExists) summary.push('User does not exist — provision the tenant admin first.');
  if (userExists && !enabled) summary.push('User is DISABLED — enable it.');
  if (belongsToTenant) summary.push(`Mapped to tenant ${tenant!.code || tenant!.name}.`);
  else summary.push('Not mapped to any tenant (Xentra Tenant.admin_email). Treated as platform/unknown.');
  if (missingRoles.length) summary.push(`Missing ${missingRoles.length} required role(s).`);
  if (userPermissions.length) summary.push(`${userPermissions.length} User Permission restriction(s) present.`);

  return {
    email,
    userExists,
    enabled,
    userType,
    tenant,
    belongsToTenant,
    isPrimaryAdmin,
    currentRoles,
    requiredRoles,
    missingRoles,
    userPermissions,
    docAccess,
    summary,
  };
}

export interface RepairResult {
  actions: string[];
  ok: boolean;
  error?: string;
}

/**
 * ensure_tenant_admin_access — grant the required roles and clear invalid
 * record-level restrictions for a tenant admin. Only operates on a user
 * that IS (or is being designated as) a tenant admin. Never grants
 * platform-admin rights and never touches other users' isolation rules.
 *
 * @param opts.clearUserPermissions remove ALL User Permission rows on the
 *   user (a full tenant admin needs none; normal tenant users keep theirs).
 * @param opts.markPrimaryAdmin set the tenant's admin_email to this user
 *   if the tenant has none yet.
 */
export async function ensureTenantAdminAccess(
  email: string,
  opts: { clearUserPermissions?: boolean; markPrimaryAdmin?: boolean; assignTenant?: string } = {}
): Promise<RepairResult> {
  const actions: string[] = [];
  try {
    // Load the user + roles.
    let user: { enabled?: number; roles?: { role: string }[] };
    try {
      user = (await frappe.getDoc('User', email)) as typeof user;
    } catch {
      return { actions, ok: false, error: `User ${email} does not exist.` };
    }
    const currentRoles = new Set((user.roles || []).map((r) => r.role));

    // Resolve the tenant context: an explicit assignment wins, else the
    // tenant already mapped to this email. Without a tenant we refuse —
    // granting ERP admin roles to an unmapped user could elevate a
    // platform admin, so the operator must pick the tenant explicitly.
    let tenantName = opts.assignTenant;
    let modules: string[] = [];
    if (tenantName) {
      const t = (await frappe.getDoc('Xentra Tenant', tenantName)) as {
        enabled_modules?: string;
        admin_email?: string;
        tenant_code?: string;
      };
      modules = parseModules(t.enabled_modules);
      // Map this user as the tenant's admin if requested or if none set.
      if (opts.markPrimaryAdmin || !t.admin_email) {
        await frappe.updateDoc('Xentra Tenant', tenantName, { admin_email: email });
        actions.push(`Mapped ${email} as admin of tenant ${t.tenant_code || tenantName}.`);
      }
    } else {
      const mapped = await findTenantForEmail(email);
      if (!mapped) {
        return {
          actions,
          ok: false,
          error:
            'This user is not mapped to any tenant. Choose the tenant to assign them to (so we grant the ' +
            'correct, module-based roles) — this prevents accidentally elevating a platform admin.',
        };
      }
      tenantName = mapped.name;
      modules = parseModules(mapped.enabled_modules);
    }

    // Enable the user if disabled.
    if (user.enabled === 0) {
      await frappe.updateDoc('User', email, { enabled: 1 });
      actions.push('Enabled the user account.');
    }

    // Clear record-level restrictions (opt-in).
    if (opts.clearUserPermissions) {
      const perms = (await frappe.getList('User Permission', {
        fields: JSON.stringify(['name']),
        filters: JSON.stringify([['user', '=', email]]),
        limit_page_length: 500,
      })) as { name: string }[];
      for (const p of perms) await frappe.deleteDoc('User Permission', p.name);
      actions.push(`Cleared ${perms.length} User Permission restriction(s).`);
    }

    // Grant the full required role set (System Manager + module managers).
    const required = rolesForTenantAdmin(modules);
    const missing = required.filter((r) => !currentRoles.has(r));
    if (missing.length) {
      const roles = [...(user.roles || []), ...missing.map((role) => ({ role }))];
      await frappe.updateDoc('User', email, { roles });
      actions.push(`Added role(s): ${missing.join(', ')}.`);
    } else {
      actions.push('All required roles already present.');
    }

    actions.push('IMPORTANT: the user must sign out and sign back in so the new roles load into their session.');
    return { actions, ok: true };
  } catch (e) {
    return { actions, ok: false, error: frappeErrorMessage(e, 'Repair failed.') };
  }
}
