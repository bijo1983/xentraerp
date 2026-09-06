'use client';

import { useEffect, useState, useCallback } from 'react';
import { frappe } from '@/lib/frappe';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Plus, X } from 'lucide-react';

interface Tenant {
  name: string;
  organization_name?: string;
  subdomain?: string;
  plan?: string;
  status?: string;
  provisioning_status?: string;
  max_users?: number;
  trial_end_date?: string;
  creation?: string;
}

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-100 text-green-800',
  Trial: 'bg-amber-100 text-amber-800',
  Suspended: 'bg-red-100 text-red-800',
  'Payment Pending': 'bg-orange-100 text-orange-800',
  'Past Due': 'bg-orange-100 text-orange-800',
  Cancelled: 'bg-gray-100 text-gray-700',
  Draft: 'bg-gray-100 text-gray-700',
};

const emptyForm = { organization_name: '', subdomain: '', plan: 'Free', tenant_admin_email: '' };

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await frappe.call('custom_erp.api.tenants.list_tenants', { search: search || undefined });
      setTenants(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load tenants';
      setError(message);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await frappe.createDoc('XentraERP Tenant', {
        organization_name: form.organization_name,
        subdomain: form.subdomain.toLowerCase().trim(),
        plan: form.plan,
        tenant_admin_email: form.tenant_admin_email,
        status: 'Draft',
        provisioning_status: 'Pending',
      });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to create tenant';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tenants</h1>
          <p className="text-sm text-muted-foreground">{tenants.length} organizations</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          {showForm ? 'Cancel' : 'Provision Tenant'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-lg border bg-background p-5 space-y-4">
          <h3 className="font-medium text-sm">New Tenant</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Organization Name</label>
              <Input
                required
                value={form.organization_name}
                onChange={(e) => setForm((f) => ({ ...f, organization_name: e.target.value }))}
                placeholder="Acme Corporation"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Subdomain</label>
              <Input
                required
                pattern="[a-z0-9-]+"
                value={form.subdomain}
                onChange={(e) => setForm((f) => ({ ...f, subdomain: e.target.value }))}
                placeholder="acme-corp"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Plan</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.plan}
                onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
              >
                <option>Free</option>
                <option>Starter</option>
                <option>Professional</option>
                <option>Enterprise</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Administrator Email</label>
              <Input
                type="email"
                required
                value={form.tenant_admin_email}
                onChange={(e) => setForm((f) => ({ ...f, tenant_admin_email: e.target.value }))}
                placeholder="admin@acme.com"
              />
            </div>
          </div>
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Creating…' : 'Create Tenant'}</Button>
          </div>
        </form>
      )}

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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Provisioning</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-16 text-center text-muted-foreground">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="py-16 text-center text-red-600 text-sm">{error}</td></tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-muted-foreground">
                  No tenants yet. Click &quot;Provision Tenant&quot; to create the first one.
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
                <td className="px-4 py-3 text-xs text-muted-foreground">{t.provisioning_status || 'Pending'}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{t.creation ? new Date(t.creation).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.assign(`/app/XentraERP%20Tenant/${encodeURIComponent(t.name)}`)}
                  >
                    Manage
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
