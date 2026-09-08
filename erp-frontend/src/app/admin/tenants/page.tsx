'use client';

import { useEffect, useState, useCallback } from 'react';
import { frappe } from '@/lib/frappe';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Plus, X, Check, Ban, Copy, CheckCheck, Server, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tenant {
  name: string;
  organization_name?: string;
  subdomain?: string;
  tenant_code?: string;
  plan?: string;
  status?: string;
  provisioning_status?: string;
  site_name?: string;
  provisioning_error?: string;
  max_users?: number;
  trial_end_date?: string;
  tenant_admin_name?: string;
  tenant_admin_email?: string;
  creation?: string;
}

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-100 text-green-800',
  Trial: 'bg-amber-100 text-amber-800',
  'Pending Approval': 'bg-blue-100 text-blue-800',
  Rejected: 'bg-red-100 text-red-800',
  Suspended: 'bg-red-100 text-red-800',
  'Payment Pending': 'bg-orange-100 text-orange-800',
  'Past Due': 'bg-orange-100 text-orange-800',
  Cancelled: 'bg-gray-100 text-gray-700',
  Draft: 'bg-gray-100 text-gray-700',
};

const FILTERS = ['All', 'Pending Approval', 'Trial', 'Active', 'Suspended', 'Rejected'] as const;

const emptyForm = { organization_name: '', subdomain: '', plan: 'Free', tenant_admin_email: '' };

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof FILTERS)[number]>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await frappe.call('custom_erp.api.tenants.list_tenants', {
        search: search || undefined,
        status: statusFilter === 'All' ? undefined : statusFilter,
      });
      setTenants(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load tenants';
      setError(message);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

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

  async function approve(t: Tenant) {
    setActingOn(t.name);
    try {
      await frappe.call('custom_erp.api.tenants.approve_tenant', { tenant_name: t.name });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to approve tenant');
    } finally {
      setActingOn(null);
    }
  }

  async function reject(t: Tenant) {
    const reason = window.prompt(`Reason for rejecting ${t.organization_name}? (optional)`) || undefined;
    setActingOn(t.name);
    try {
      await frappe.call('custom_erp.api.tenants.reject_tenant', { tenant_name: t.name, reason });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to reject tenant');
    } finally {
      setActingOn(null);
    }
  }

  async function provisionSite(t: Tenant) {
    setActingOn(t.name);
    try {
      await frappe.call('custom_erp.api.provisioning.provision_tenant_site', { tenant_name: t.name });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to start site provisioning');
    } finally {
      setActingOn(null);
    }
  }

  // Poll while any tenant's site is being provisioned, so status updates without a manual refresh.
  useEffect(() => {
    if (!tenants.some((t) => t.provisioning_status === 'In Progress')) return;
    const id = setInterval(() => load(), 5000);
    return () => clearInterval(id);
  }, [tenants, load]);

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
                pattern="[a-z0-9\-]+"
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

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search organizations…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                statusFilter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Organization</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Code</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Admin</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Plan</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Site</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={8} className="py-16 text-center text-red-600 text-sm">{error}</td></tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-muted-foreground">
                  No tenants found for this filter.
                </td>
              </tr>
            ) : tenants.map((t) => (
              <tr key={t.name} className="border-b hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{t.organization_name || t.name}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {t.tenant_code ? (
                    <button
                      className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                      onClick={() => copyCode(t.tenant_code!)}
                      title="Copy tenant code"
                    >
                      {t.tenant_code}
                      {copiedCode === t.tenant_code ? (
                        <CheckCheck className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  <div>{t.tenant_admin_name || '—'}</div>
                  <div className="text-muted-foreground/70">{t.tenant_admin_email}</div>
                </td>
                <td className="px-4 py-3">{t.plan || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status || ''] || 'bg-gray-100 text-gray-700'}`}>
                    {t.status || 'Draft'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {t.status === 'Pending Approval' ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : t.provisioning_status === 'Completed' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700">
                      <Server className="h-3 w-3" /> {t.site_name}
                    </span>
                  ) : t.provisioning_status === 'In Progress' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Provisioning…
                    </span>
                  ) : t.provisioning_status === 'Failed' ? (
                    <button
                      className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline"
                      title={t.provisioning_error || 'Provisioning failed — click to retry'}
                      onClick={() => provisionSite(t)}
                      disabled={actingOn === t.name}
                    >
                      <AlertTriangle className="h-3 w-3" /> Failed — Retry
                    </button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={actingOn === t.name}
                      onClick={() => provisionSite(t)}
                    >
                      <Server className="h-3.5 w-3.5 mr-1" /> Provision Site
                    </Button>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{t.creation ? new Date(t.creation).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  {t.status === 'Pending Approval' ? (
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        className="h-7 px-2 bg-green-600 hover:bg-green-700"
                        disabled={actingOn === t.name}
                        onClick={() => approve(t)}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-red-600 border-red-200 hover:bg-red-50"
                        disabled={actingOn === t.name}
                        onClick={() => reject(t)}
                      >
                        <Ban className="h-3.5 w-3.5 mr-1" /> Reject
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.location.assign(`/app/XentraERP%20Tenant/${encodeURIComponent(t.name)}`)}
                    >
                      Manage
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
