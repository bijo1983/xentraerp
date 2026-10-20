// Subscription plans (XentraERP Plan on the control-plane site) for the admin portal.
import { frappe } from '@/lib/frappe';
import { REPORTS, type ReportDef } from '@/lib/reports/catalog';

export type ReportAccess = 'All Reports' | 'Selected Reports';

export interface PlanModule {
  module_code: string;
  report_access: ReportAccess;
}

export interface PlanReport {
  module_code: string;
  report: string;
}

export interface Plan {
  name?: string;
  plan_name: string;
  is_active: number;
  sort_order: number;
  /** Pay-per-module template: assigning it gives the tenant its own copy. */
  is_custom: number;
  /** Set on a tenant's own copy of a customizable plan. */
  custom_for?: string | null;
  description: string;
  price_monthly: number;
  price_annual: number;
  max_users: number;
  modules: PlanModule[];
  reports: PlanReport[];
  tenant_count?: number;
}

export interface ModuleInfo {
  code: string;
  label: string;
  /** Monthly price this module adds to a custom (pay-per-module) plan. */
  price_monthly: number;
  /** Catalog reports offered under this module (what tenants see on their Reports page). */
  reports: ReportDef[];
}

export const listPlans = () => frappe.call('custom_erp.api.plans.list_plans') as Promise<Plan[]>;
export const savePlan = (plan: Plan) => frappe.call('custom_erp.api.plans.save_plan', { plan: JSON.stringify(plan) }) as Promise<Plan>;
export const deletePlan = (name: string) => frappe.call('custom_erp.api.plans.delete_plan', { name });
export const assignPlan = (tenant_name: string, plan: string) =>
  frappe.call('custom_erp.api.plans.assign_plan', { tenant_name, plan });

export const saveModulePrices = (prices: Record<string, number>) =>
  frappe.call('custom_erp.api.plans.save_module_prices', { prices: JSON.stringify(prices) });

/** Annual billing charges this many months (two months free). */
export const ANNUAL_MONTHS = 10;

/** Pay-per-module plans: the template and each tenant's own copy of it. */
export const isPayPerModule = (p: Plan) => !!p.is_custom || !!p.custom_for;

export const modulesTotal = (plan: Plan, modules: ModuleInfo[]) =>
  plan.modules.reduce((sum, m) => sum + (modules.find((x) => x.code === m.module_code)?.price_monthly || 0), 0);

/** Every module with its price and the catalog reports that belong to it. */
export async function loadModules(): Promise<ModuleInfo[]> {
  const data = (await frappe.call('custom_erp.api.plans.module_catalog')) as {
    modules: { code: string; label: string; price_monthly: number }[];
    reports: { report: string; modules: string[] }[];
  };
  const modulesOf = new Map(data.reports.map((r) => [r.report, r.modules]));
  return data.modules.map((m) => ({
    ...m,
    reports: REPORTS.filter((r) => modulesOf.get(r.name)?.includes(m.code)).sort(
      (a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name),
    ),
  }));
}

/** Reports of `module` a plan gives access to (all of them unless it's limited to a bundle). */
export function planReportsFor(plan: Plan, module: ModuleInfo): string[] {
  const row = plan.modules.find((m) => m.module_code === module.code);
  if (!row) return [];
  if (row.report_access === 'All Reports') return module.reports.map((r) => r.name);
  return plan.reports.filter((r) => r.module_code === module.code).map((r) => r.report);
}

export const emptyPlan = (): Plan => ({
  plan_name: '',
  is_active: 1,
  sort_order: 0,
  is_custom: 0,
  description: '',
  price_monthly: 0,
  price_annual: 0,
  max_users: 0,
  modules: [],
  reports: [],
});
