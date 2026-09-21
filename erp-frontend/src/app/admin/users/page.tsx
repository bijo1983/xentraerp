'use client';

import { useEffect, useState } from 'react';
import { frappe } from '@/lib/frappe';

interface PlatformUser {
  name: string;
  full_name?: string;
  email?: string;
  enabled?: number;
  role_profile_name?: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await frappe.getList('User', {
          fields: ['name', 'full_name', 'email', 'enabled', 'role_profile_name'],
          filters: [['name', 'not in', ['Administrator', 'Guest']]],
          limit_page_length: 100,
          order_by: 'creation desc',
        });
        setUsers(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load users');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Platform Users</h1>
        <p className="text-sm text-muted-foreground">System-level users with access to this Frappe instance</p>
      </div>

      <div className="rounded-md border overflow-x-auto bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="py-16 text-center text-muted-foreground">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={3} className="py-16 text-center text-red-600 text-sm">{error}</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={3} className="py-16 text-center text-muted-foreground">No other platform users yet.</td></tr>
            ) : users.map((u) => (
              <tr key={u.name} className="border-b hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{u.full_name || u.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email || u.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                    {u.enabled ? 'Active' : 'Disabled'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        This is separate from tenant administrators — see <a href="/admin/tenants" className="text-primary hover:underline">Tenants</a> for per-organization admins.
      </p>
    </div>
  );
}
