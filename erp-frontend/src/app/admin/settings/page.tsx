'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Database, Sparkles, UserPlus } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { isControlPlaneReady, provisionControlPlane } from '@/lib/saas/control-plane';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkField } from '@/components/dynamic/link-field';

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

  // Create-user form (separate platform admin vs company user).
  const [uEmail, setUEmail] = useState('');
  const [uName, setUName] = useState('');
  const [uPass, setUPass] = useState('');
  const [uRole, setURole] = useState<'company' | 'platform'>('company');
  const [uCompany, setUCompany] = useState('');
  const [uBusy, setUBusy] = useState(false);
  const [uMsg, setUMsg] = useState<string | null>(null);
  const [uErr, setUErr] = useState<string | null>(null);

  const createUser = async () => {
    setUMsg(null);
    setUErr(null);
    if (!uEmail || !uName || !uPass) {
      setUErr('Email, full name and password are required.');
      return;
    }
    setUBusy(true);
    try {
      // Company user gets a full "company admin" role set (manage masters
      // + transactions) so they can set up and run their ERP without System
      // Manager. Platform user gets System Manager for the SaaS platform.
      const roles =
        uRole === 'platform'
          ? ['System Manager']
          : [
              'Sales Manager',
              'Sales Master Manager',
              'Purchase Manager',
              'Purchase Master Manager',
              'Stock Manager',
              'Accounts Manager',
              'Item Manager',
              'Maintenance Manager',
              'Sales User',
              'Purchase User',
              'Accounts User',
              'Stock User',
            ];
      await frappe.createUser(uEmail, uName, uPass, roles);
      // Restrict a company user to their company (record-level isolation).
      if (uRole === 'company' && uCompany) {
        await frappe.addUserPermission(uEmail, 'Company', uCompany);
      }
      setUMsg(`User ${uEmail} created. They can sign in via ${uRole === 'platform' ? 'Admin' : 'Customer'} Sign In.`);
      setUEmail('');
      setUName('');
      setUPass('');
      setUCompany('');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { exception?: string } } })?.response?.data?.exception ||
        (e instanceof Error ? e.message : 'Failed to create user.');
      setUErr(msg);
    } finally {
      setUBusy(false);
    }
  };

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

      {/* Separate platform-admin vs company users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-5 w-5 text-primary" /> Create User
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Keep the platform admin separate from company users. A <strong>Company user</strong> signs in via
            “Customer Sign In” and is restricted to their company; a <strong>Platform admin</strong> signs in via
            “Admin Sign In” with full System Manager access.
          </p>
          {uErr && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{uErr}</div>}
          {uMsg && <div className="rounded-md bg-green-100 p-3 text-sm text-green-700 dark:bg-green-500/15 dark:text-green-400">{uMsg}</div>}

          <div className="flex rounded-lg border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setURole('company')}
              className={`flex-1 rounded-md py-2 text-sm font-medium ${uRole === 'company' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              Company User
            </button>
            <button
              type="button"
              onClick={() => setURole('platform')}
              className={`flex-1 rounded-md py-2 text-sm font-medium ${uRole === 'platform' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              Platform Admin
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Full Name</label>
              <Input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="JJ Company Admin" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} placeholder="admin@jjcompany.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Password</label>
              <Input type="password" value={uPass} onChange={(e) => setUPass(e.target.value)} placeholder="Set a strong password" />
            </div>
            {uRole === 'company' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Restrict to Company (optional)</label>
                <LinkField target="Company" value={uCompany} onChange={setUCompany} placeholder="Search company…" />
              </div>
            )}
          </div>

          <Button onClick={createUser} disabled={uBusy}>
            {uBusy ? 'Creating…' : `Create ${uRole === 'platform' ? 'Platform Admin' : 'Company User'}`}
          </Button>
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
