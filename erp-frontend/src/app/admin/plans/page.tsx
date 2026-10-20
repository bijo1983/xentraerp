'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Check, X, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type ModuleInfo, type Plan, type ReportAccess, ANNUAL_MONTHS,
  deletePlan, emptyPlan, isPayPerModule, listPlans, loadModules, modulesTotal, planReportsFor, savePlan,
} from '@/lib/plans';

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, m] = await Promise.all([listPlans(), loadModules()]);
      setPlans(p);
      setModules(m);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const label = useMemo(() => Object.fromEntries(modules.map((m) => [m.code, m.label])), [modules]);

  async function remove(plan: Plan) {
    if (!plan.name || !window.confirm(`Delete plan "${plan.plan_name}"?`)) return;
    try {
      await deletePlan(plan.name);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete plan');
    }
  }

  async function toggleActive(plan: Plan) {
    try {
      await savePlan({ ...plan, is_active: plan.is_active ? 0 : 1 });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update plan');
    }
  }

  if (editing) {
    return (
      <PlanEditor
        plan={editing}
        modules={modules}
        onCancel={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Plans</h1>
          <p className="text-sm text-muted-foreground">Subscription plans: the modules each includes and its report bundle</p>
        </div>
        <Button size="sm" onClick={() => setEditing(emptyPlan())} disabled={loading}>
          <Plus className="h-4 w-4 mr-1" /> New Plan
        </Button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!loading && !error && plans.length === 0 && (
        <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
          No plans yet. Create one, pick its modules, and choose which reports it includes.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div key={plan.name} className={cn('rounded-xl border-2 bg-background p-5 flex flex-col', !plan.is_active && 'opacity-60')}>
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-lg">{plan.plan_name}</h3>
                {!plan.is_active && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">INACTIVE</span>}
                {!!plan.is_custom && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">PAY PER MODULE</span>}
              </div>
              {plan.custom_for && <div className="text-xs text-amber-700">Custom plan for tenant {plan.custom_for}</div>}
              <div className="mt-1">
                {plan.is_custom ? (
                  <>
                    <span className="text-2xl font-bold">Custom</span>
                    <span className="text-muted-foreground text-sm ml-2">from ${plan.price_monthly}/mo</span>
                  </>
                ) : plan.price_monthly ? (
                  <>
                    <span className="text-2xl font-bold">${plan.price_monthly}</span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                    {!!plan.price_annual && <span className="text-xs text-muted-foreground ml-2">${plan.price_annual}/yr</span>}
                  </>
                ) : (
                  <span className="text-2xl font-bold">Free</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {plan.max_users ? `Up to ${plan.max_users} users` : 'Unlimited users'} · {plan.tenant_count || 0} tenant(s)
              </div>
              {plan.description && <p className="text-xs text-muted-foreground mt-2">{plan.description}</p>}
            </div>

            <ul className="space-y-1.5 flex-1 mb-4">
              {plan.modules.map((m) => {
                const mod = modules.find((x) => x.code === m.module_code);
                const total = mod?.reports.length || 0;
                const count = mod ? planReportsFor(plan, mod).length : 0;
                return (
                  <li key={m.module_code} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <span className="flex-1">{label[m.module_code] || m.module_code}</span>
                    {total > 0 && (
                      <span className={cn('text-xs', m.report_access === 'Selected Reports' ? 'text-amber-700' : 'text-muted-foreground')}>
                        {m.report_access === 'Selected Reports' ? `${count}/${total} reports` : 'all reports'}
                      </span>
                    )}
                  </li>
                );
              })}
              {plan.modules.length === 0 && <li className="text-sm text-muted-foreground">No modules</li>}
            </ul>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(structuredClone(plan))}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => toggleActive(plan)}>
                {plan.is_active ? 'Deactivate' : 'Activate'}
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => remove(plan)} title="Delete plan">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanEditor({ plan: initial, modules, onCancel, onSaved }: {
  plan: Plan;
  modules: ModuleInfo[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [plan, setPlan] = useState<Plan>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Plan>(key: K, value: Plan[K]) => setPlan((p) => ({ ...p, [key]: value }));
  const rowOf = (code: string) => plan.modules.find((m) => m.module_code === code);

  function toggleModule(code: string) {
    setPlan((p) => rowOf(code)
      ? { ...p, modules: p.modules.filter((m) => m.module_code !== code), reports: p.reports.filter((r) => r.module_code !== code) }
      : { ...p, modules: [...p.modules, { module_code: code, report_access: 'All Reports' }] });
  }

  function setAccess(mod: ModuleInfo, access: ReportAccess) {
    setPlan((p) => ({
      ...p,
      modules: p.modules.map((m) => (m.module_code === mod.code ? { ...m, report_access: access } : m)),
      // Switching to a bundle starts from every report ticked, so the admin unticks what to leave out.
      reports: access === 'Selected Reports'
        ? [...p.reports.filter((r) => r.module_code !== mod.code), ...mod.reports.map((r) => ({ module_code: mod.code, report: r.name }))]
        : p.reports.filter((r) => r.module_code !== mod.code),
    }));
    if (access === 'Selected Reports') setOpen(mod.code);
  }

  function toggleReport(code: string, report: string) {
    setPlan((p) => {
      const has = p.reports.some((r) => r.module_code === code && r.report === report);
      return {
        ...p,
        reports: has
          ? p.reports.filter((r) => !(r.module_code === code && r.report === report))
          : [...p.reports, { module_code: code, report }],
      };
    });
  }

  function setAll(mod: ModuleInfo, on: boolean) {
    setPlan((p) => ({
      ...p,
      reports: [
        ...p.reports.filter((r) => r.module_code !== mod.code),
        ...(on ? mod.reports.map((r) => ({ module_code: mod.code, report: r.name })) : []),
      ],
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await savePlan(plan);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  }

  const num = (v: string) => (v === '' ? 0 : Number(v));
  const perModule = isPayPerModule(plan);
  const computed = modulesTotal(plan, modules);

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{initial.name ? `Edit ${initial.plan_name}` : 'New Plan'}</h1>
          <p className="text-sm text-muted-foreground">
            Tick the modules this plan includes. For each, give it all reports or pick a report bundle.
            {initial.name && !!initial.tenant_count && ` Saving updates the ${initial.tenant_count} tenant(s) on this plan.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}><X className="h-4 w-4 mr-1" /> Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}><Check className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'Save Plan'}</Button>
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="rounded-lg border bg-background p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Plan Name">
          <Input required disabled={!!initial.name} value={plan.plan_name} onChange={(e) => set('plan_name', e.target.value)} placeholder="Starter" />
        </Field>
        <Field label={perModule ? 'Monthly Price (sum of modules)' : 'Monthly Price'}>
          <Input type="number" min={0} step="0.01" disabled={perModule} value={(perModule ? computed : plan.price_monthly) || ''} onChange={(e) => set('price_monthly', num(e.target.value))} placeholder="0" />
        </Field>
        <Field label={perModule ? `Annual Price (${ANNUAL_MONTHS} months)` : 'Annual Price'}>
          <Input type="number" min={0} step="0.01" disabled={perModule} value={(perModule ? computed * ANNUAL_MONTHS : plan.price_annual) || ''} onChange={(e) => set('price_annual', num(e.target.value))} placeholder="0" />
        </Field>
        <Field label="Max Users (0 = unlimited)">
          <Input type="number" min={0} value={plan.max_users || ''} onChange={(e) => set('max_users', num(e.target.value))} placeholder="0" />
        </Field>
        <Field label="Description" className="sm:col-span-2 lg:col-span-3">
          <Input value={plan.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="Shown on the plan card" />
        </Field>
        <Field label="Display Order">
          <Input type="number" value={plan.sort_order || ''} onChange={(e) => set('sort_order', num(e.target.value))} placeholder="0" />
        </Field>
        {!plan.custom_for && (
          <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-4 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 mt-0.5" checked={!!plan.is_custom} onChange={(e) => set('is_custom', e.target.checked ? 1 : 0)} />
            <span>
              <span className="font-medium">Customizable — pay per module.</span>{' '}
              <span className="text-muted-foreground">
                Priced as the sum of the ticked modules (set prices on the Modules page). Assigning it to a tenant gives that
                tenant its own copy to tailor; the modules ticked here are the starting selection.
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="rounded-lg border bg-background divide-y">
        {modules.map((mod) => {
          const row = rowOf(mod.code);
          const selected = plan.reports.filter((r) => r.module_code === mod.code).map((r) => r.report);
          const expanded = open === mod.code && !!row;
          return (
            <div key={mod.code} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 flex-1 min-w-[200px] cursor-pointer">
                  <input type="checkbox" className="h-4 w-4" checked={!!row} onChange={() => toggleModule(mod.code)} />
                  <span className="font-medium text-sm">{mod.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">{mod.code}</span>
                  {perModule && <span className="text-xs text-muted-foreground">+${mod.price_monthly || 0}/mo</span>}
                </label>
                {row && mod.reports.length > 0 && (
                  <>
                    <select
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      value={row.report_access}
                      onChange={(e) => setAccess(mod, e.target.value as ReportAccess)}
                    >
                      <option value="All Reports">All reports ({mod.reports.length})</option>
                      <option value="Selected Reports">Selected reports only</option>
                    </select>
                    {row.report_access === 'Selected Reports' && (
                      <button type="button" className="flex items-center gap-1 text-sm text-primary" onClick={() => setOpen(expanded ? null : mod.code)}>
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {selected.length}/{mod.reports.length} reports
                      </button>
                    )}
                  </>
                )}
                {row && mod.reports.length === 0 && <span className="text-xs text-muted-foreground">No reports in this module</span>}
              </div>

              {expanded && row.report_access === 'Selected Reports' && (
                <div className="mt-3 ml-6 space-y-2">
                  <div className="flex gap-3 text-xs">
                    <button type="button" className="text-primary" onClick={() => setAll(mod, true)}>Select all</button>
                    <button type="button" className="text-primary" onClick={() => setAll(mod, false)}>Clear</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                    {mod.reports.map((r) => (
                      <label key={r.name} className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="checkbox" className="h-4 w-4 mt-0.5" checked={selected.includes(r.name)} onChange={() => toggleReport(mod.code, r.name)} />
                        <span>{r.name}{r.section && <span className="text-xs text-muted-foreground"> · {r.section}</span>}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </form>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
