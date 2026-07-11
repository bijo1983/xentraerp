'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, CheckCircle2, CreditCard, ReceiptText, AlertTriangle } from 'lucide-react';
import { isControlPlaneReady, saas } from '@/lib/saas/control-plane';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Row {
  name: string;
  status?: string;
  amount?: number;
}

export default function AdminDashboard() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [tenants, setTenants] = useState<Row[]>([]);
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const ok = await isControlPlaneReady();
      setReady(ok);
      if (ok) {
        setTenants(((await saas.listTenants().catch(() => [])) as Row[]) || []);
        setInvoices(((await saas.listInvoices().catch(() => [])) as Row[]) || []);
        setPlans(((await saas.listPlans().catch(() => [])) as Row[]) || []);
      }
    })();
  }, []);

  if (ready === null) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!ready) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">SaaS Dashboard</h2>
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-500/10">
          <CardContent className="flex items-start justify-between gap-4 pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium">Platform not initialized</p>
                <p className="text-sm text-muted-foreground">
                  The SaaS control-plane DocTypes (Tenant, Plan, Module, Subscription, Invoice, Receipt) haven’t been
                  created yet. Initialize the platform to begin managing tenants.
                </p>
              </div>
            </div>
            <Button asChild>
              <Link href="/admin/settings">Initialize</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeTenants = tenants.filter((t) => t.status === 'Active').length;
  const outstanding = invoices.filter((i) => i.status === 'Unpaid').reduce((s, i) => s + (i.amount || 0), 0);
  const collected = invoices.filter((i) => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);

  const kpis = [
    { label: 'Tenants', value: tenants.length, icon: Building2, href: '/admin/tenants' },
    { label: 'Active', value: activeTenants, icon: CheckCircle2, href: '/admin/tenants' },
    { label: 'Plans', value: plans.length, icon: CreditCard, href: '/app/Xentra%20Subscription%20Plan' },
    { label: 'Revenue Collected', value: collected.toFixed(2), icon: ReceiptText, href: '/app/Xentra%20Invoice' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">SaaS Dashboard</h2>
        <Button asChild>
          <Link href="/admin/tenants">Manage Tenants</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg bg-primary/10 p-2.5">
                  <k.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold">{k.value}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Outstanding</CardTitle>
          <span className="text-sm text-muted-foreground">Unpaid invoices total</span>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{outstanding.toFixed(2)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
