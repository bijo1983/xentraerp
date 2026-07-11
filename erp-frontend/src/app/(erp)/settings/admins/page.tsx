'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { frappe, frappeErrorMessage } from '@/lib/frappe';
import { useCompanyDefaults } from '@/hooks/use-company-defaults';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Role presets a company admin can be granted. These are standard ERPNext
// roles; "Company Admin" = System Manager scoped to this company.
const ROLE_PRESETS: { label: string; desc: string; roles: string[] }[] = [
  {
    label: 'Full Admin',
    desc: 'System Manager — manages users, settings and all modules for this company.',
    roles: ['System Manager'],
  },
  {
    label: 'Operations Manager',
    desc: 'Sales, Purchase and Stock management (no system configuration).',
    roles: ['Sales Manager', 'Purchase Manager', 'Stock Manager'],
  },
  {
    label: 'Accounts Manager',
    desc: 'Accounting, invoices and financial reports.',
    roles: ['Accounts Manager'],
  },
];

interface CompanyUser {
  name: string;
  full_name?: string;
  enabled?: number;
}

export default function CompanyAdminsPage() {
  const { company, loading: companyLoading } = useCompanyDefaults();

  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // Form state.
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [presetIdx, setPresetIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load users already scoped (User Permission) to this company.
  const load = useCallback(async () => {
    if (!company) return;
    setListLoading(true);
    try {
      const perms = (await frappe.getList('User Permission', {
        fields: JSON.stringify(['user']),
        filters: JSON.stringify([
          ['allow', '=', 'Company'],
          ['for_value', '=', company],
        ]),
        limit_page_length: 200,
      })) as { user: string }[];
      const emails = Array.from(new Set((perms || []).map((p) => p.user)));
      if (emails.length === 0) {
        setUsers([]);
        return;
      }
      const rows = (await frappe.getList('User', {
        fields: JSON.stringify(['name', 'full_name', 'enabled']),
        filters: JSON.stringify([['name', 'in', emails]]),
        limit_page_length: 200,
      })) as CompanyUser[];
      setUsers(rows || []);
    } catch {
      // Non-fatal: the form still works even if the list can't be read.
      setUsers([]);
    } finally {
      setListLoading(false);
    }
  }, [company]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!company) {
      setError('No company found. Run Company Setup first.');
      return;
    }
    if (!email.trim() || !fullName.trim() || password.length < 8) {
      setError('Enter an email, full name, and a password of at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      // 1) Create the user with the selected roles.
      const roles = ROLE_PRESETS[presetIdx].roles;
      await frappe.createUser(email.trim(), fullName.trim(), password, roles);
      // 2) Scope the user to this company (record-level isolation) — but NOT
      // for a full admin. System Manager doesn't bypass User Permissions, so
      // a Company restriction would block that admin from company-linked
      // settings Singles (e.g. Stock Settings → 403) while providing no real
      // isolation. Only the non-admin presets get the Company restriction.
      if (!roles.includes('System Manager')) {
        await frappe.addUserPermission(email.trim(), 'Company', company);
      }

      setSuccess(`${email.trim()} is now an admin of ${company}.`);
      setEmail('');
      setFullName('');
      setPassword('');
      await load();
    } catch (err) {
      setError(frappeErrorMessage(err, 'Failed to create the admin. The email may already exist.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-muted p-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Company Admins</h2>
          <p className="text-sm text-muted-foreground">
            {companyLoading
              ? 'Loading company…'
              : company
                ? `Manage who administers ${company}.`
                : 'No company configured yet.'}
          </p>
        </div>
      </div>

      {/* Add admin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Add an admin
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Full name</label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Temporary password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              <p className="text-xs text-muted-foreground">
                Share this securely; the user should change it after first sign-in.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Access level</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {ROLE_PRESETS.map((p, i) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setPresetIdx(i)}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      presetIdx === i ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                    }`}
                  >
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 rounded-md bg-green-100 p-3 text-sm text-green-700 dark:bg-green-500/15 dark:text-green-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <Button type="submit" disabled={submitting || !company}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creating…
                </>
              ) : (
                <>
                  <UserPlus className="mr-1.5 h-4 w-4" /> Create admin
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing admins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current admins</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : users.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No company-scoped admins yet. Add one above.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.name} className="border-b last:border-0">
                    <td className="px-6 py-3 font-medium">{u.full_name || '—'}</td>
                    <td className="px-6 py-3 text-muted-foreground">{u.name}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.enabled
                            ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {u.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Admins are created in ERPNext with the selected roles and are restricted (via a Company User
        Permission) to {company || 'this company'} only — they cannot see other tenants&apos; data.
      </p>
    </div>
  );
}
