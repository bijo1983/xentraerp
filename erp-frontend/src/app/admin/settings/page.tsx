'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Database, Sparkles } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { isControlPlaneReady, provisionControlPlane } from '@/lib/saas/control-plane';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CORE_MODULES = ['Sales', 'Purchase', 'Accounts', 'CRM', 'Inventory'];
const OPTIONAL_MODULES = ['Manufacturing', 'Projects', 'HR', 'Fixed Assets', 'Quality'];
const DEFAULT_PLANS = [
  { plan_name: 'Starter', price: 0, billing_cycle: 'Monthly' },
  { plan_name: 'Growth', price: 49, billing_cycle: 'Monthly' },
  { plan_name: 'Enterprise', price: 199, billing_cycle: 'Monthly' },
];

export default function PlatformSettingsPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isControlPlaneReady().then(setReady);
  }, []);

  const ensure = async (doctype: string, payload: Record<string, unknown>, label: string) => {
    try {
      await frappe.createDoc(doctype, payload);
      setLog((l) => [...l, `✓ ${label}`]);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { exception?: string } } })?.response?.data?.exception || '';
      setLog((l) => [...l, /exists|Duplicate/i.test(String(msg)) ? `• ${label} (exists)` : `✗ ${label}: ${msg}`]);
    }
  };

  const initialize = async () => {
    setBusy(true);
    setLog(['Creating control-plane DocTypes…']);
    const results = await provisionControlPlane();
    results.forEach((r) => setLog((l) => [...l, `  ${r.name}: ${r.result}`]));
    setReady(await isControlPlaneReady());
    setBusy(false);
  };

  const seedDefaults = async () => {
    setBusy(true);
    setLog((l) => [...l, 'Seeding default modules and plans…']);
    for (const m of CORE_MODULES) await ensure('Xentra Module', { module_name: m, module_type: 'Core', active: 1 }, `Core module: ${m}`);
    for (const m of OPTIONAL_MODULES) await ensure('Xentra Module', { module_name: m, module_type: 'Optional', active: 1 }, `Optional module: ${m}`);
    for (const p of DEFAULT_PLANS) await ensure('Xentra Subscription Plan', { ...p, active: 1 }, `Plan: ${p.plan_name}`);
    setLog((l) => [...l, 'Done.']);
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Platform Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-5 w-5 text-primary" /> Control Plane
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            {ready === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : ready ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-amber-500" />
            )}
            <span>{ready === null ? 'Checking…' : ready ? 'Provisioned' : 'Not initialized'}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Creates the SaaS DocTypes (Xentra Tenant, Subscription Plan, Module, Subscription, Invoice, Receipt) on the
            ERPNext admin site. Each uses a system-generated surrogate ID (XTEN-/XPLAN-/…) as its stable primary key,
            with unique natural keys (tenant code, plan name) for lookups.
          </p>
          <div className="flex gap-3">
            <Button onClick={initialize} disabled={busy}>
              {busy ? 'Working…' : ready ? 'Re-run Provisioning' : 'Initialize Platform'}
            </Button>
            <Button variant="outline" onClick={seedDefaults} disabled={busy || !ready}>
              <Sparkles className="mr-2 h-4 w-4" /> Seed Default Modules &amp; Plans
            </Button>
          </div>
        </CardContent>
      </Card>

      {log.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs">
              {log.join('\n')}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
