'use client';

import { useEffect, useState, useCallback } from 'react';
import { frappe } from '@/lib/frappe';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Plus } from 'lucide-react';

interface Tenant {
  name: string;
  organization_name?: string;
  subdomain?: string;
  plan?: string;
  status?: string;
  creation?: string;
  enabled_modules?: string;
}

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-100 text-green-800',
  Trial: 'bg-amber-100 text-amber-800',
  Suspended: 'bg-red-100 text-red-800',
  Provisioning: 'bg-blue-100 text-blue-800',
  Cancelled: 'bg-gray-100 text-gray-700',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await frappe.getList('XentraERP Tenant', {
        fields: ['name', 'organization_name', 'subdomain', 'plan', 'status', 'creation'],
        filters: search ? [['organization_name', 'like', `%${search}%`]] : [],
        limit_page_length: 100,
        order_by: 'creation desc',
      }).catch(() => []);
      setTenants(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tenants</h1>
          <p className="text-sm text-muted-foreground">{tenants.length} organizations</p>
        </div>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Provision Tenant</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search organizations…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border overflow-x-auto bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Organization</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Subdomain</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Plan</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">Loading…</td></tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-muted-foreground">
                  No tenants found. The <code>XentraERP Tenant</code> DocType needs to be created in Frappe first.
                </td>
              </tr>
            ) : tenants.map((t) => (
              <tr key={t.name} className="border-b hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{t.organization_name || t.name}</td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{t.subdomain ? `${t.subdomain}.xentraerp.com` : '—'}</td>
                <td className="px-4 py-3">{t.plan || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status || ''] || 'bg-gray-100 text-gray-700'}`}>
                    {t.status || 'Draft'}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{t.creation ? new Date(t.creation).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm" onClick={() => {}}>Manage</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
