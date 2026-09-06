'use client';

import { useEffect, useState } from 'react';
import { frappe } from '@/lib/frappe';
import {
  Building2, Users, CreditCard, AlertTriangle,
  CheckCircle, Clock, XCircle, TrendingUp,
} from 'lucide-react';

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}

interface Tenant {
  name: string;
  organization_name?: string;
  status?: string;
  plan?: string;
  creation?: string;
}

export default function AdminDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await frappe.getList('XentraERP Tenant', {
          fields: ['name', 'organization_name', 'status', 'plan', 'creation'],
          limit_page_length: 50,
          order_by: 'creation desc',
        }).catch(() => []);
        setTenants(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const total = tenants.length;
  const active = tenants.filter((t) => t.status === 'Active').length;
  const trial = tenants.filter((t) => t.status === 'Trial').length;
  const suspended = tenants.filter((t) => t.status === 'Suspended').length;

  const stats: StatCard[] = [
    { label: 'Total Tenants', value: total, icon: Building2, color: 'text-blue-600', sub: 'All registered organizations' },
    { label: 'Active', value: active, icon: CheckCircle, color: 'text-green-600', sub: 'Paid subscriptions' },
    { label: 'On Trial', value: trial, icon: Clock, color: 'text-amber-600', sub: 'Trial accounts' },
    { label: 'Suspended', value: suspended, icon: XCircle, color: 'text-red-600', sub: 'Requires attention' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">XentraERP SaaS Administration</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-background p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div className="text-3xl font-bold tabular-nums">{loading ? '…' : s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-background p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Quick Actions</span>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Add New Plan', href: '/admin/plans/new' },
              { label: 'Register Module', href: '/admin/modules/new' },
              { label: 'View Audit Logs', href: '/admin/audit' },
              { label: 'Platform Settings', href: '/admin/settings' },
            ].map((a) => (
              <a key={a.href} href={a.href} className="block text-sm text-primary hover:underline">{a.label}</a>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-background p-5 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Recent Tenants</span>
            </div>
            <a href="/admin/tenants" className="text-xs text-primary hover:underline">View all</a>
          </div>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : tenants.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No tenants yet. The XentraERP Tenant DocType needs to be created in Frappe.
              <br />
              <a href="/admin/provisioning" className="text-primary hover:underline mt-2 inline-block">Set up provisioning →</a>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Organization</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Plan</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {tenants.slice(0, 8).map((t) => (
                  <tr key={t.name} className="border-b last:border-0">
                    <td className="py-2 font-medium">{t.organization_name || t.name}</td>
                    <td className="py-2 text-muted-foreground">{t.plan || '—'}</td>
                    <td className="py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.status === 'Active' ? 'bg-green-100 text-green-800' :
                        t.status === 'Trial' ? 'bg-amber-100 text-amber-800' :
                        t.status === 'Suspended' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>{t.status || 'Draft'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Module & Plan setup notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Platform Setup Required</p>
            <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
              Configure plans, modules, and features before tenants can subscribe.
              Start with <a href="/admin/plans" className="font-medium underline">Plans</a> then <a href="/admin/modules" className="font-medium underline">Modules</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
