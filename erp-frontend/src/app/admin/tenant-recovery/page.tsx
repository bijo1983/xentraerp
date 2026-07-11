'use client';

import { useState } from 'react';
import { Stethoscope, Wrench, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, XCircle } from 'lucide-react';
import { diagnoseTenantAdmin, ensureTenantAdminAccess, type TenantAdminDiagnostic } from '@/lib/saas/tenant-admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const PROBE_STYLE: Record<string, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  ok: { icon: CheckCircle2, cls: 'text-green-600 dark:text-green-400', label: 'OK' },
  'no-permission': { icon: XCircle, cls: 'text-red-600 dark:text-red-400', label: 'Missing role/DocPerm' },
  'user-permission-block': { icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400', label: 'User Permission block' },
  error: { icon: AlertTriangle, cls: 'text-muted-foreground', label: 'Error' },
};

export default function TenantRecoveryPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<TenantAdminDiagnostic | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [clearPerms, setClearPerms] = useState(true);
  const [markPrimary, setMarkPrimary] = useState(true);
  const [repairActions, setRepairActions] = useState<string[] | null>(null);

  const run = async () => {
    setErr(null);
    setRepairActions(null);
    setDiag(null);
    if (!email.trim()) {
      setErr('Enter the tenant admin email.');
      return;
    }
    setBusy(true);
    try {
      setDiag(await diagnoseTenantAdmin(email.trim()));
    } catch (e) {
      setErr((e as Error)?.message || 'Diagnostic failed.');
    } finally {
      setBusy(false);
    }
  };

  const repair = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await ensureTenantAdminAccess(email.trim(), {
        clearUserPermissions: clearPerms,
        markPrimaryAdmin: markPrimary,
      });
      setRepairActions(res.actions);
      if (!res.ok) setErr(res.error || 'Repair reported an issue.');
      // Re-run the diagnostic to reflect the new state.
      setDiag(await diagnoseTenantAdmin(email.trim()));
    } catch (e) {
      setErr((e as Error)?.message || 'Repair failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-muted p-2">
          <Stethoscope className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Tenant Admin Access — Diagnostic &amp; Repair</h2>
          <p className="text-sm text-muted-foreground">
            Inspect and repair a tenant administrator&apos;s ERP access. Role-aware and tenant-scoped — it does
            not grant platform rights or touch other users&apos; isolation.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@jjcompany.com"
            className="max-w-xs"
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Stethoscope className="mr-1.5 h-4 w-4" />}
            Run Diagnostic
          </Button>
        </CardContent>
      </Card>

      {err && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {diag && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diagnostic report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="User" value={diag.email} />
              <Field label="User type" value={diag.userType} />
              <Field label="Exists / enabled" value={`${diag.userExists ? 'Yes' : 'No'} / ${diag.enabled ? 'Yes' : 'No'}`} />
              <Field
                label="Tenant"
                value={diag.tenant ? `${diag.tenant.code || diag.tenant.name} (${diag.tenant.status || '—'})` : 'Not mapped'}
              />
              <Field label="Belongs to tenant" value={diag.belongsToTenant ? 'Yes' : 'No'} />
              <Field label="Primary admin" value={diag.isPrimaryAdmin ? 'Yes' : 'No'} />
              <Field label="Enabled modules" value={diag.tenant?.modules.join(', ') || '(none recorded)'} />
            </div>

            <Section title="Current roles">
              {diag.currentRoles.length ? diag.currentRoles.join(', ') : '(none)'}
            </Section>

            <Section title="Missing required roles">
              {diag.missingRoles.length ? (
                <span className="text-amber-600 dark:text-amber-400">{diag.missingRoles.join(', ')}</span>
              ) : (
                <span className="text-green-600 dark:text-green-400">None — all required roles present</span>
              )}
            </Section>

            <Section title="User Permission restrictions">
              {diag.userPermissions.length ? (
                <ul className="space-y-0.5">
                  {diag.userPermissions.map((p) => (
                    <li key={p.name} className="text-amber-600 dark:text-amber-400">
                      {p.allow} = {p.for_value}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-green-600 dark:text-green-400">None</span>
              )}
            </Section>

            <Section title="Settings access (as the account running this check)">
              <ul className="space-y-1">
                {diag.docAccess.map((d) => {
                  const s = PROBE_STYLE[d.status];
                  const Icon = s.icon;
                  return (
                    <li key={d.doctype} className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${s.cls}`} />
                      <span className="font-medium">{d.doctype}</span>
                      <span className={s.cls}>— {s.label}</span>
                      {d.detail && <span className="text-xs text-muted-foreground">({d.detail})</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                Note: this probe reflects the access of the account you are signed in as (the platform admin),
                not the tenant admin&apos;s session. Use it to confirm the doctypes themselves are reachable;
                the definitive test is the tenant admin signing in after repair.
              </p>
            </Section>

            {/* Repair controls */}
            <div className="rounded-md border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Wrench className="h-4 w-4" /> Repair
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={clearPerms} onChange={(e) => setClearPerms(e.target.checked)} />
                  Clear the user&apos;s User Permission restrictions (recommended for a full tenant admin)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={markPrimary} onChange={(e) => setMarkPrimary(e.target.checked)} />
                  Mark as the tenant&apos;s primary admin (if the tenant has none)
                </label>
              </div>
              <Button className="mt-3" onClick={repair} disabled={busy || diag.userType === 'Platform Admin'}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}
                Repair Tenant Admin Access
              </Button>
              {diag.userType === 'Platform Admin' && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  This user isn&apos;t mapped to a tenant — repair is disabled to avoid giving a platform admin
                  tenant ERP rights. Map it to a tenant first.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {repairActions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions applied</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {repairActions.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                  {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div>{children}</div>
    </div>
  );
}
