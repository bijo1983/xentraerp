'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// POS role profiles (custom_erp.api.pos_roles): the preconfigured jobs at the till that are
// mapped to staff on their User record. Every tenant starts with the standard set; the
// administrator can narrow or widen each profile's rights within its access level, add their
// own, disable, or reset a standard one.

interface Profile {
  name: string;
  access_level: string;
  rights: string[];
  description: string;
  disabled: number;
  is_standard: number;
  modified_from_standard: boolean;
  staff: number;
}
interface Right {
  key: string;
  label: string;
  description: string;
}
interface Level {
  level: string;
  max_rights: string[];
  devices: string;
}
interface Catalogue {
  profiles: Profile[];
  rights: Right[];
  levels: Level[];
}

const API = 'custom_erp.api.pos_roles.';
const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';

function errorText(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { _server_messages?: string } } };
  try {
    const msgs = JSON.parse(err.response?.data?._server_messages || '[]') as string[];
    const first = msgs.length ? (JSON.parse(msgs[0]) as { message?: string }).message : '';
    if (first) return first.replace(/<[^>]+>/g, '');
  } catch {
    /* fall through */
  }
  if (err.response?.status === 403) return 'Only an administrator can manage POS role profiles.';
  return e instanceof Error ? e.message : 'Something went wrong';
}

type Draft = { access_level: string; rights: string[]; description: string; disabled: number };

function ProfileCard({
  profile,
  cat,
  busy,
  onSave,
  onReset,
  onDelete,
}: {
  profile: Profile | null; // null = a new profile
  cat: Catalogue;
  busy: boolean;
  onSave: (name: string | null, profileName: string, d: Draft) => void;
  onReset?: () => void;
  onDelete?: () => void;
}) {
  const initial = useMemo<Draft>(
    () =>
      profile
        ? { access_level: profile.access_level, rights: profile.rights, description: profile.description, disabled: profile.disabled }
        : { access_level: 'Waiter', rights: ['view'], description: '', disabled: 0 },
    [profile],
  );
  const [d, setD] = useState<Draft>(initial);
  const [newName, setNewName] = useState('');
  useEffect(() => setD(initial), [initial]);

  const level = cat.levels.find((l) => l.level === d.access_level);
  const allowed = new Set(level?.max_rights || []);
  const dirty = !profile || JSON.stringify(d) !== JSON.stringify(initial);
  const toggle = (k: string) =>
    setD((x) => ({ ...x, rights: x.rights.includes(k) ? x.rights.filter((r) => r !== k) : [...x.rights, k] }));
  // Lowering the level drops rights it doesn't allow.
  const setLevel = (lvl: string) => {
    const max = new Set(cat.levels.find((l) => l.level === lvl)?.max_rights || []);
    setD((x) => ({ ...x, access_level: lvl, rights: x.rights.filter((r) => max.has(r)) }));
  };

  return (
    <div className={`rounded-xl border bg-card p-5 shadow-elevation-xs ${profile?.disabled ? 'opacity-70' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {profile ? (
          <h3 className="text-base font-semibold">{profile.name}</h3>
        ) : (
          <Input className="h-9 max-w-xs" placeholder="Profile name, e.g. Barista" value={newName} onChange={(e) => setNewName(e.target.value)} />
        )}
        {profile && <Badge variant="outline">{profile.is_standard ? 'Standard' : 'Custom'}</Badge>}
        {profile?.modified_from_standard && <Badge>Changed from standard</Badge>}
        {profile?.disabled ? <Badge>Disabled</Badge> : null}
        {profile && (
          <span className="ml-auto text-xs text-muted-foreground">
            {profile.staff === 1 ? '1 staff member' : `${profile.staff} staff members`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Access level</label>
          <select className={selectCls} value={d.access_level} disabled={busy} onChange={(e) => setLevel(e.target.value)}>
            {cat.levels.map((l) => (
              <option key={l.level} value={l.level}>
                {l.level}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">{level?.devices}</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
          <Input className="h-9" value={d.description} disabled={busy} onChange={(e) => setD((x) => ({ ...x, description: e.target.value }))} />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Rights</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cat.rights.map((r) => {
            const can = allowed.has(r.key);
            const on = d.rights.includes(r.key) || r.key === 'view';
            return (
              <label
                key={r.key}
                title={can ? r.description : `Needs a higher access level than ${d.access_level}`}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${can ? 'cursor-pointer hover:bg-muted/50' : 'cursor-not-allowed opacity-45'}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={can && on}
                  disabled={busy || !can || r.key === 'view'}
                  onChange={() => toggle(r.key)}
                />
                <span>
                  <span className="block font-medium">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !dirty || (!profile && !newName.trim())} onClick={() => onSave(profile?.name || null, profile ? profile.name : newName.trim(), d)}>
          {profile ? 'Save changes' : 'Create profile'}
        </Button>
        {profile && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(profile.name, profile.name, { ...initial, disabled: profile.disabled ? 0 : 1 })}>
            {profile.disabled ? 'Enable' : 'Disable'}
          </Button>
        )}
        {profile?.is_standard && profile.modified_from_standard && onReset ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onReset}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to standard
          </Button>
        ) : null}
        {profile && !profile.is_standard && onDelete ? (
          <Button size="sm" variant="ghost" className="text-destructive" disabled={busy || profile.staff > 0} title={profile.staff > 0 ? 'Give its staff another profile first' : undefined} onClick={onDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function PosRoleProfilesPage() {
  const tenantCode = useTenantCode();
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setCat((await frappe.call(API + 'list_role_profiles')) as Catalogue);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      setCat((await fn()) as Catalogue);
      setMsg({ ok: true, text: done });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (name: string | null, profileName: string, d: Draft) => {
    const ok = await run(
      () => frappe.call(API + 'save_role_profile', { name, profile_name: profileName, access_level: d.access_level, rights: JSON.stringify(d.rights), description: d.description, disabled: d.disabled }),
      name ? `${profileName} saved — applies from the next action at the till.` : `${profileName} created.`,
    );
    if (ok && !name) setAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <Link href={withTenant('/settings', tenantCode)} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Settings
          </Link>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-primary" /> POS role profiles
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Ready-made jobs at the till. Map one to each staff member from their user record (Settings → Users → POS access). The access level decides which devices they can sign in on and the most a profile can include; administrators always have every right.
          </p>
        </div>
        <Button size="sm" disabled={busy || adding || !cat} onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" /> New profile
        </Button>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? 'text-success' : 'text-destructive'}`}>{msg.text}</p>}
      {!cat && !msg && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading profiles…
        </div>
      )}

      {cat && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {adding && <ProfileCard profile={null} cat={cat} busy={busy} onSave={save} />}
          {cat.profiles.map((p) => (
            <ProfileCard
              key={p.name}
              profile={p}
              cat={cat}
              busy={busy}
              onSave={save}
              onReset={() => run(() => frappe.call(API + 'reset_role_profile', { name: p.name }), `${p.name} is back to the standard rights.`)}
              onDelete={() => {
                if (window.confirm(`Delete the ${p.name} profile?`)) run(() => frappe.call(API + 'delete_role_profile', { name: p.name }), `${p.name} deleted.`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
