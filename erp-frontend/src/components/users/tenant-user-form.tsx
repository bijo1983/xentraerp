'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Eye, EyeOff, Loader2, Wand2 } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { errorText } from '@/lib/errors';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { cn, STATUS_TONE } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PosAccessDraftPanel, PosAccessPanel, applyPosAccessDraft } from '@/components/dynamic/pos-access-panel';

const API = 'custom_erp.api.users.';

interface UserData {
  name: string;
  email: string;
  enabled: number;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  mobile_no?: string;
  role_profile_name?: string | null;
  roles: string[];
  last_login?: string | null;
}

interface FormData {
  user: UserData | null;
  role_profiles: string[];
  roles: string[];
  email_ready: boolean;
}

const selectCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const symbols = '!@#$%*?';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes.slice(0, 12), (b) => chars[b % chars.length]).join('');
  return `${body}${symbols[bytes[12] % symbols.length]}${(bytes[13] % 90) + 10}`;
}

// The tenant's Users screen. Frappe's own User form is a system-admin form
// (sounds, document follow, 2FA bypass, desk settings ...); a company admin
// only needs who the person is, how they sign in the first time, and what
// they may do. Saved through custom_erp.api.users.save_user.
export function TenantUserForm({ name, onClose }: { name?: string; onClose: () => void }) {
  const router = useRouter();
  const tenantCode = useTenantCode();
  const [data, setData] = useState<FormData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [profile, setProfile] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [profileRoles, setProfileRoles] = useState<string[]>([]);
  const [signIn, setSignIn] = useState<'password' | 'invite'>('password');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    frappe
      .call(API + 'get_user_form', name ? { name } : {})
      .then((d) => {
        if (cancelled) return;
        const fd = d as FormData;
        setData(fd);
        const u = fd.user;
        if (u) {
          setFirstName(u.first_name || '');
          setLastName(u.last_name || '');
          setEmail(u.email || u.name);
          setMobile(u.mobile_no || '');
          setEnabled(!!u.enabled);
          setProfile(u.role_profile_name || '');
          setRoles(u.roles || []);
        }
      })
      .catch((e) => !cancelled && setLoadError(errorText(e, 'The user could not be loaded.')));
    return () => {
      cancelled = true;
    };
  }, [name]);

  // A role profile decides the roles; show which ones it gives.
  useEffect(() => {
    if (!profile) {
      setProfileRoles([]);
      return;
    }
    let cancelled = false;
    frappe
      .call(API + 'get_role_profile_roles', { role_profile: profile })
      .then((r) => !cancelled && setProfileRoles((r as string[]) || []))
      .catch(() => !cancelled && setProfileRoles([]));
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const shownRoles = useMemo(() => {
    const all = data?.roles || [];
    const q = roleFilter.trim().toLowerCase();
    return q ? all.filter((r) => r.toLowerCase().includes(q)) : all;
  }, [data, roleFilter]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        name,
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        mobile_no: mobile.trim(),
        enabled: enabled ? 1 : 0,
        role_profile_name: profile || null,
        roles: profile ? [] : roles,
      };
      if (!name) {
        payload.send_invite = signIn === 'invite' ? 1 : 0;
        if (signIn === 'password') payload.new_password = password;
      } else if (password) {
        payload.new_password = password;
      }
      const res = (await frappe.call(API + 'save_user', { data: JSON.stringify(payload) })) as { name: string };
      if (!name) {
        try {
          await applyPosAccessDraft(res.name);
        } catch (posErr) {
          // The user exists, so we still move to their record page, where the POS panel lets you retry.
          window.alert(`The user was saved, but their POS role profile wasn't: ${errorText(posErr, 'unknown error')}`);
        }
        router.push(withTenant(`/app/User/${encodeURIComponent(res.name)}`, tenantCode));
        return;
      }
      setPassword('');
      setNotice('Saved.');
    } catch (e) {
      setError(errorText(e, 'The user could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <p className="p-4 text-sm text-destructive">{loadError}</p>;
  if (!data) return <p className="p-4 text-muted-foreground">Loading…</p>;

  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const status = !name ? { label: 'Not Saved', tone: STATUS_TONE.warning } : enabled ? { label: 'Active', tone: STATUS_TONE.success } : { label: 'Disabled', tone: STATUS_TONE.danger };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div className="space-y-1">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link href={withTenant('/app/User', tenantCode)} className="hover:text-foreground hover:underline">
            Users
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>{name || 'New'}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{fullName || (name ? name : 'New user')}</h1>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', status.tone)}>{status.label}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/80 bg-card shadow-elevation-xs">
        <div className="flex flex-wrap items-center gap-2 border-b bg-background px-5 py-3">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {name ? 'Save' : 'Create user'}
          </Button>
          <div className="ml-auto">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Close
            </Button>
          </div>
        </div>
        {(error || notice) && (
          <div className="border-b bg-background px-5 py-3">
            {error && <p className="whitespace-pre-line rounded border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
            {notice && <p className="rounded border border-success/30 bg-success/10 p-2 text-sm text-success">{notice}</p>}
          </div>
        )}

        <div className="space-y-8 p-5">
          <Section title="Person">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="First name" required>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus={!name} />
              </Field>
              <Field label="Last name">
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
              <Field label="Email" required hint={name ? 'The email is the sign-in name and can’t be changed.' : 'The person signs in with this email.'}>
                <Input type="email" value={email} disabled={!!name} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Mobile">
                <Input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </Field>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Can sign in
              <span className="text-xs text-muted-foreground">(untick to block the account without deleting it)</span>
            </label>
            {name && data.user?.last_login && (
              <p className="mt-2 text-xs text-muted-foreground">Last signed in {data.user.last_login.slice(0, 16)}</p>
            )}
          </Section>

          <Section title={name ? 'Password' : 'First sign-in'}>
            {!name && (
              <div className="mb-3 flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={signIn === 'password'} onChange={() => setSignIn('password')} />
                  Set a password now and give it to the person
                </label>
                <label className={cn('flex items-center gap-2', !data.email_ready && 'opacity-60')}>
                  <input type="radio" disabled={!data.email_ready} checked={signIn === 'invite'} onChange={() => setSignIn('invite')} />
                  Email them an invitation to set their own password
                </label>
                {!data.email_ready && (
                  <p className="text-xs text-muted-foreground">
                    Invitations need an outgoing email account, and none is set up for this company yet.
                  </p>
                )}
              </div>
            )}
            {(name || signIn === 'password') && (
              <Field label={name ? 'New password' : 'Password'} required={!name} hint={name ? 'Leave empty to keep the current password.' : undefined}>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      autoComplete="new-password"
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((s) => !s)}
                      title={showPassword ? 'Hide' : 'Show'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setPassword(generatePassword());
                      setShowPassword(true);
                    }}
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Generate
                  </Button>
                </div>
              </Field>
            )}
          </Section>

          <Section title="Access">
            <Field label="Role profile" hint="A role profile gives a standard set of roles. Choose “Custom roles” to pick them one by one.">
              <select className={selectCls} value={profile} onChange={(e) => setProfile(e.target.value)}>
                <option value="">Custom roles</option>
                {data.role_profiles.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            {profile ? (
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Roles from {profile}</p>
                <div className="flex flex-wrap gap-1.5">
                  {profileRoles.length ? (
                    profileRoles.map((r) => (
                      <span key={r} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                        {r}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No roles</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="Filter roles…" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="max-w-xs" />
                  <span className="text-xs text-muted-foreground">{roles.length} selected</span>
                </div>
                <div className="grid max-h-72 grid-cols-1 gap-x-4 gap-y-1.5 overflow-y-auto rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shownRoles.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={roles.includes(r)}
                        onChange={(e) => setRoles((cur) => (e.target.checked ? [...cur, r] : cur.filter((x) => x !== r)))}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {name && <PosAccessPanel user={name} />}
          {!name && <PosAccessDraftPanel />}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 border-b border-border pb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
