'use client';

import { useEffect, useState } from 'react';
import { Package, ShoppingCart, ShoppingBag, Warehouse, Factory, FolderKanban, HardDrive, Users, Wallet, ShieldCheck, LifeBuoy, Wrench, CreditCard as POSIcon, Globe, FileText, Gavel, PiggyBank, Truck, FolderOpen, GraduationCap, Check, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ANNUAL_MONTHS, type ModuleInfo, loadModules, saveModulePrices } from '@/lib/plans';

const ICONS: Record<string, LucideIcon> = {
  accounting: Wallet, selling: ShoppingCart, buying: ShoppingBag, inventory: Warehouse,
  manufacturing: Factory, projects: FolderKanban, assets: HardDrive, hr: Users, payroll: Wallet,
  quality: ShieldCheck, support: LifeBuoy, maintenance: Wrench, pos: POSIcon, website: Globe,
  contracts: FileText, tenders: Gavel, budget: PiggyBank, vendor: Truck, documents: FolderOpen, lms: GraduationCap,
};

export default function ModulesPage() {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadModules().then((m) => {
      setModules(m);
      setPrices(Object.fromEntries(m.map((x) => [x.code, x.price_monthly ? String(x.price_monthly) : ''])));
    }, (e) => setError(e?.message || 'Failed to load modules')).finally(() => setLoading(false));
  }, []);

  const total = Object.values(prices).reduce((s, v) => s + (Number(v) || 0), 0);
  const dirty = modules.some((m) => (Number(prices[m.code]) || 0) !== (m.price_monthly || 0));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveModulePrices(Object.fromEntries(modules.map((m) => [m.code, Number(prices[m.code]) || 0])));
      setModules((ms) => ms.map((m) => ({ ...m, price_monthly: Number(prices[m.code]) || 0 })));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save prices');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Modules</h1>
          <p className="text-sm text-muted-foreground">
            Monthly price of each module on a customizable (pay-per-module) plan. A custom plan costs the sum of its
            modules; annual billing charges {ANNUAL_MONTHS} months. Saving re-prices every custom plan.
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={saving || !dirty || loading}>
          <Check className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : saved ? 'Saved' : 'Save Prices'}
        </Button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {modules.map((m) => {
              const Icon = ICONS[m.code] || Package;
              return (
                <div key={m.code} className="rounded-lg border bg-background p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{m.label}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{m.code}</span> · {m.reports.length} reports
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-20 h-8 text-right"
                      value={prices[m.code] ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [m.code]: e.target.value }))}
                      placeholder="0"
                    />
                    <span className="text-xs text-muted-foreground">/mo</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">All modules on a custom plan: <b>${total.toFixed(2)}</b>/mo.</p>
        </>
      )}
    </div>
  );
}
