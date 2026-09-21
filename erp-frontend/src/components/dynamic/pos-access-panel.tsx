'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PosAccess {
  user: string;
  has_pin: boolean;
  active: boolean;
  pos_profile: string | null;
  location: string | null;
  effective_location: string | null;
  cost_center: string | null;
  warehouse: string | null;
  pos_role: string | null;
  level: string | null;
  role_label: string;
  is_admin: boolean;
  pos_roles: string[];
  locations: Array<{ code: string; name: string; company: string | null; cost_center: string | null; warehouse: string | null }>;
  registers: Array<{ name: string; location: string | null }>;
  pin_min: number;
  pin_max: number;
}

const POS = 'custom_erp.api.pos.';
const selectCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';

// Frappe puts the readable reason in `_server_messages` (a JSON list of JSON strings).
function errorText(e: unknown): string {
  const data = (e as { response?: { data?: { _server_messages?: string } } })?.response?.data;
  try {
    const msgs = JSON.parse(data?._server_messages || '[]') as string[];
    const first = msgs.length ? (JSON.parse(msgs[0]) as { message?: string }).message : '';
    if (first) return first.replace(/<[^>]+>/g, '');
  } catch {
    /* fall through */
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

// The POS Access section of the User form: the person's POS role, register and PIN.
// Every action saves on its own (a PIN can't wait for the form's Save button). Shows
// nothing to anyone who isn't the company administrator, or on a site without POS.
export function PosAccessPanel({ user }: { user: string }) {
  const [data, setData] = useState<PosAccess | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [register, setRegister] = useState('');
  const [location, setLocation] = useState('');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const apply = useCallback((d: PosAccess) => {
    setData(d);
    setRole(d.pos_role || '');
    setRegister(d.pos_profile || '');
    setLocation(d.location || '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setHidden(false);
    setNewPin(null);
    (async () => {
      try {
        const d = (await frappe.call(POS + 'get_pos_access', { user })) as PosAccess;
        if (!cancelled) apply(d);
      } catch {
        if (!cancelled) setHidden(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, apply]);

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (hidden) return null;
  if (!data) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading POS access…
      </div>
    );
  }

  const label = (r: string) => r.replace('POS ', '');
  const pinOk = /^\d+$/.test(pin) && pin.length >= data.pin_min && pin.length <= data.pin_max;
  const changed = role !== (data.pos_role || '') || register !== (data.pos_profile || '') || location !== (data.location || '');
  // Only the chosen location's registers are offered (all of them when no location is set).
  const registerOptions = data.registers.filter((r) => !location || r.location === location);
  const chosenLocation = data.locations.find((l) => l.code === location);
  const onLocation = (code: string) => {
    setLocation(code);
    if (register && code && data.registers.find((r) => r.name === register)?.location !== code) setRegister('');
  };

  const save = () =>
    run(async () => {
      const args: Record<string, unknown> = { user };
      if (role && role !== data.pos_role) args.pos_role = role;
      if (data.has_pin && register !== (data.pos_profile || '')) args.pos_profile = register;
      if (data.has_pin && location !== (data.location || '')) args.location = location;
      apply((await frappe.call(POS + 'save_pos_access', args)) as PosAccess);
    }, 'POS access saved');

  const setPinNow = () =>
    run(async () => {
      // No role picked and none held yet → Waiter, the least privilege (the server would default to Cashier).
      await frappe.call(POS + 'set_pin', {
        user,
        pin,
        pos_profile: register || undefined,
        location: location || undefined,
        pos_role: role || (data.pos_role ? undefined : 'POS Waiter'),
      });
      setPin('');
      setNewPin(null);
      apply((await frappe.call(POS + 'get_pos_access', { user })) as PosAccess);
    }, data.has_pin ? 'PIN changed' : 'PIN set — they can sign in to the POS with it');

  const generate = () =>
    run(async () => {
      const r = (await frappe.call(POS + 'reset_pin', { user })) as { pin: string };
      setNewPin(r.pin);
      setCopied(false);
      apply((await frappe.call(POS + 'get_pos_access', { user })) as PosAccess);
    }, 'New PIN generated');

  const toggle = () =>
    run(async () => {
      apply((await frappe.call(POS + 'save_pos_access', { user, active: data.active ? 0 : 1 })) as PosAccess);
    }, data.active ? 'PIN switched off — they can no longer sign in to the POS' : 'PIN switched on');

  return (
    <div className="mb-4 rounded-lg border bg-card p-4 shadow-elevation-xs">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">POS access</h3>
        {data.is_admin ? (
          <Badge>Administrator — full POS access</Badge>
        ) : data.has_pin ? (
          <Badge variant={data.active ? 'success' : 'default'}>{data.active ? 'PIN active' : 'PIN switched off'}</Badge>
        ) : (
          <Badge>No PIN yet</Badge>
        )}
        {data.level && !data.is_admin && <Badge>{data.role_label}</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="pos-location" className="mb-1 block text-xs font-medium text-muted-foreground">
            Location
          </label>
          <select
            id="pos-location"
            className={selectCls}
            value={location}
            disabled={busy || data.is_admin || !data.locations.length}
            onChange={(e) => onLocation(e.target.value)}
          >
            <option value="">{data.is_admin ? 'Administrators see every location' : 'Every location'}</option>
            {data.locations.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {!data.locations.length
              ? 'No locations are set up yet — add them in the POS app under Locations.'
              : chosenLocation
                ? `Their registers, shifts and reports are limited to this location. Cost center: ${chosenLocation.cost_center || 'not set'} · Warehouse: ${chosenLocation.warehouse || 'not set'}.`
                : data.effective_location
                  ? `Follows their register: ${data.effective_location} · Cost center: ${data.cost_center || 'not set'}.`
                  : 'Not tied to a location — they can use every location’s registers and see all reports.'}
          </p>
        </div>
        <div>
          <label htmlFor="pos-role" className="mb-1 block text-xs font-medium text-muted-foreground">
            POS role
          </label>
          <select
            id="pos-role"
            className={selectCls}
            value={role}
            disabled={busy || data.is_admin}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">{data.is_admin ? 'Comes from the administrator role' : 'No POS role'}</option>
            {data.pos_roles.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">What they can do at the till. Rights per role are set under Access Control.</p>
        </div>
        <div>
          <label htmlFor="pos-register" className="mb-1 block text-xs font-medium text-muted-foreground">
            Register
          </label>
          <select id="pos-register" className={selectCls} value={register} disabled={busy} onChange={(e) => setRegister(e.target.value)}>
            <option value="">{location ? 'Any register at this location' : 'Any register'}</option>
            {registerOptions.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
                {r.location && !location ? ` · ${r.location}` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.has_pin ? 'Lock them to one register, or leave it open.' : 'Applied when the PIN is set.'}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t pt-4">
        <div className="mb-2 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{data.has_pin ? 'Reset PIN' : 'Set PIN'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-44 tabular-nums"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={data.pin_max}
            placeholder={`${data.pin_min}-${data.pin_max} digits`}
            value={pin}
            disabled={busy}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
          <Button size="sm" disabled={busy || !pinOk} onClick={setPinNow}>
            {data.has_pin ? 'Change PIN' : 'Set PIN'}
          </Button>
          <span className="text-xs text-muted-foreground">or</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={generate}>
            Generate a new PIN
          </Button>
          {data.has_pin && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={toggle}>
              {data.active ? 'Switch PIN off' : 'Switch PIN on'}
            </Button>
          )}
        </div>
        {newPin && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
            <span className="text-xs text-muted-foreground">New PIN — shown only now, pass it on:</span>
            <code className="text-lg font-semibold tracking-widest tabular-nums">{newPin}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard?.writeText(newPin).then(() => setCopied(true), () => undefined);
              }}
            >
              {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={busy || !changed || (!data.has_pin && role === (data.pos_role || ''))} onClick={save}>
          Save POS access
        </Button>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {notice && !error && <span className="text-xs text-success">{notice}</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
