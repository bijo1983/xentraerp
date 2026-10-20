'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Check, Minus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ModuleInfo, type Plan, listPlans, loadModules, planReportsFor, savePlan } from '@/lib/plans';

/** Reports × plans grid. Ticking a cell adds/removes that report from the plan's bundle. */
export default function ReportsAdminPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([listPlans(), loadModules()]);
      setPlans(p);
      setModules(m.filter((x) => x.reports.length > 0));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const access = useMemo(() => {
    const out = new Map<string, Set<string>>(); // `${plan}|${module}` -> reports
    for (const p of plans) for (const m of modules) out.set(`${p.name}|${m.code}`, new Set(planReportsFor(p, m)));
    return out;
  }, [plans, modules]);

  async function toggle(plan: Plan, mod: ModuleInfo, report: string) {
    const row = plan.modules.find((m) => m.module_code === mod.code);
    if (!row) return;
    const current = access.get(`${plan.name}|${mod.code}`) || new Set<string>();
    const next = new Set(current);
    if (next.has(report)) next.delete(report); else next.add(report);
    const all = next.size === mod.reports.length;
    const updated: Plan = {
      ...plan,
      modules: plan.modules.map((m) => (m.module_code === mod.code ? { ...m, report_access: all ? 'All Reports' : 'Selected Reports' } : m)),
      reports: [
        ...plan.reports.filter((r) => r.module_code !== mod.code),
        ...(all ? [] : Array.from(next).map((r) => ({ module_code: mod.code, report: r }))),
      ],
    };
    setBusy(`${plan.name}|${report}`);
    try {
      const saved = await savePlan(updated);
      setPlans((ps) => ps.map((p) => (p.name === plan.name ? { ...saved, tenant_count: p.tenant_count } : p)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update plan');
    } finally {
      setBusy(null);
    }
  }

  const q = search.trim().toLowerCase();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Report Entitlements</h1>
        <p className="text-sm text-muted-foreground">
          Which reports each plan includes. Tick or untick a cell to change that plan&apos;s report bundle;
          greyed cells are modules the plan doesn&apos;t include (add them on <Link href="/admin/plans" className="underline">Plans</Link>).
        </p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!loading && !error && plans.length === 0 && (
        <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
          No plans yet. <Link href="/admin/plans" className="underline">Create a plan</Link> first.
        </div>
      )}

      {plans.length > 0 && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search reports" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="rounded-lg border bg-background overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Report</th>
                  {plans.map((p) => (
                    <th key={p.name} className={cn('font-medium px-3 py-2 text-center whitespace-nowrap', !p.is_active && 'text-muted-foreground')}>
                      {p.plan_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((mod) => {
                  const reports = mod.reports.filter((r) => !q || r.name.toLowerCase().includes(q));
                  if (!reports.length) return null;
                  return [
                    <tr key={mod.code} className="bg-muted/30 border-t">
                      <td className="px-3 py-1.5 font-semibold text-xs uppercase tracking-wide">{mod.label}</td>
                      {plans.map((p) => {
                        const row = p.modules.find((m) => m.module_code === mod.code);
                        return (
                          <td key={p.name} className="px-3 py-1.5 text-center text-xs text-muted-foreground whitespace-nowrap">
                            {!row ? 'not included' : row.report_access === 'All Reports' ? 'all' : `${access.get(`${p.name}|${mod.code}`)?.size}/${mod.reports.length}`}
                          </td>
                        );
                      })}
                    </tr>,
                    ...reports.map((r) => (
                      <tr key={`${mod.code}|${r.name}`} className="border-t">
                        <td className="px-3 py-1.5 pl-6">{r.name}</td>
                        {plans.map((p) => {
                          const included = !!p.modules.find((m) => m.module_code === mod.code);
                          const on = access.get(`${p.name}|${mod.code}`)?.has(r.name);
                          return (
                            <td key={p.name} className="px-3 py-1.5 text-center">
                              <button
                                type="button"
                                disabled={!included || busy !== null}
                                onClick={() => toggle(p, mod, r.name)}
                                className={cn(
                                  'inline-flex h-6 w-6 items-center justify-center rounded border',
                                  on ? 'bg-primary text-primary-foreground border-primary' : 'border-input',
                                  !included && 'opacity-30 cursor-not-allowed',
                                  busy === `${p.name}|${r.name}` && 'animate-pulse',
                                )}
                                title={included ? (on ? 'Remove from plan' : 'Add to plan') : 'Module not in this plan'}
                              >
                                {on ? <Check className="h-3.5 w-3.5" /> : !included ? <Minus className="h-3 w-3" /> : null}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
