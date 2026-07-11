'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Power, PowerOff } from 'lucide-react';
import { isControlPlaneReady, saas, type TenantStatus } from '@/lib/saas/control-plane';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Tenant {
  name: string;
  tenant_code?: string;
  company_name?: string;
  status?: TenantStatus;
  plan?: string;
  expiry_date?: string;
}

const STATUS_COLOR: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  Trial: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  Suspended: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  Expired: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400',
};

export default function TenantsPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const ok = await isControlPlaneReady();
    setReady(ok);
    if (ok) setTenants(((await saas.listTenants().catch(() => [])) as Tenant[]) || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (t: Tenant, status: TenantStatus) => {
    setBusy(t.name);
    try {
      await saas.setTenantStatus(t.name, status);
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (ready === null) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!ready) {
    return (
      <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/10">
        Platform not initialized. Go to <Link href="/admin/settings" className="font-medium underline">Platform Settings</Link> to initialize.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Tenants</h2>
        <Button asChild>
          <Link href="/admin/app/Xentra%20Tenant/new">
            <Plus className="mr-1 h-4 w-4" /> New Tenant
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['Tenant', 'Code', 'Plan', 'Status', 'Expiry', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No tenants yet. Create one to onboard a company.
                    </td>
                  </tr>
                )}
                {tenants.map((t) => (
                  <tr key={t.name} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/admin/app/Xentra%20Tenant/${encodeURIComponent(t.name)}`} className="font-medium hover:underline">
                        {t.company_name || t.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {t.tenant_code ? (
                        <Link href={`/${t.tenant_code}`} className="text-primary hover:underline">
                          /{t.tenant_code}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">{t.plan || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[t.status || ''] || 'bg-muted'}`}>
                        {t.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{t.expiry_date || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {t.status === 'Suspended' ? (
                        <Button size="sm" variant="outline" disabled={busy === t.name} onClick={() => setStatus(t, 'Active')}>
                          <Power className="mr-1 h-3.5 w-3.5" /> Activate
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy === t.name} onClick={() => setStatus(t, 'Suspended')}>
                          <PowerOff className="mr-1 h-3.5 w-3.5" /> Suspend
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
