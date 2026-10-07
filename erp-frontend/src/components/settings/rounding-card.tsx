'use client';
import { useEffect, useState } from 'react';
import { frappe } from '@/lib/frappe';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Rounding { enabled: boolean; currency: string; step: number; steps: number[] }

/** Tenant-wide bill rounding (custom_erp.api.rounding): off, or round totals to a chosen step. */
export function RoundingCard() {
  const [saved, setSaved] = useState<Rounding | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = (r: Rounding) => {
    setSaved(r);
    setEnabled(r.enabled);
    setStep(r.step);
  };

  useEffect(() => {
    frappe.call('custom_erp.api.rounding.get_rounding').then((r) => load(r as Rounding), () => setMsg({ ok: false, text: 'Could not load the rounding setting.' }));
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      load((await frappe.call('custom_erp.api.rounding.set_rounding', { enabled: enabled ? 1 : 0, step })) as Rounding);
      setMsg({ ok: true, text: 'Saved. New bills and invoices use this from now on.' });
    } catch (e: unknown) {
      const err = e as { response?: { status?: number } };
      setMsg({ ok: false, text: err.response?.status === 403 ? 'Only an administrator can change this.' : 'Could not save the setting.' });
    } finally {
      setBusy(false);
    }
  };

  const ccy = saved?.currency || '';
  const label = (s: number) => (s === 1 ? `Whole ${ccy || 'unit'} (1)` : `${s} ${ccy}`);
  const example = (() => {
    const amount = 2.345;
    if (!enabled) return `${amount.toFixed(3)} ${ccy} is billed as ${amount.toFixed(3)} ${ccy}`;
    const r = Math.round(amount / step) * step;
    return `${amount.toFixed(3)} ${ccy} is billed as ${r.toFixed(3)} ${ccy}`;
  })();
  const dirty = !!saved && (saved.enabled !== enabled || (enabled && saved.step !== step));

  return (
    <Card>
      <CardHeader className="px-4 pb-1 pt-4">
        <CardTitle className="text-sm font-medium">Bill rounding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        <p className="text-xs text-muted-foreground">
          Rounds the total of every new sales and POS bill, and every purchase document. Turn it off to bill the exact amount.
        </p>
        {saved && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Round bill totals
            </label>
            {enabled && (
              <Select value={String(step)} onValueChange={(v) => setStep(Number(v))}>
                <SelectTrigger className="h-9 w-44 shadow-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {saved.steps.map((s) => <SelectItem key={s} value={String(s)}>to {label(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        )}
        {saved && <p className="text-xs text-muted-foreground">Example: {example}</p>}
        {msg && <p className={`text-xs ${msg.ok ? 'text-success' : 'text-destructive'}`}>{msg.text}</p>}
      </CardContent>
    </Card>
  );
}
