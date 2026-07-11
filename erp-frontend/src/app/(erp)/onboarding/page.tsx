'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Building2, Boxes, Sparkles, Palette, Rocket, ArrowRight, ArrowLeft } from 'lucide-react';
import { useCompanyDefaults } from '@/hooks/use-company-defaults';
import { SetupChecklist } from '@/components/setup/setup-checklist';
import type { SetupContext } from '@/lib/setup/engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const MODULES = ['Sales', 'Purchase', 'Accounts', 'CRM', 'Inventory'];
const STEPS = [
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'modules', label: 'Modules', icon: Boxes },
  { key: 'defaults', label: 'Default Masters', icon: Sparkles },
  { key: 'branding', label: 'Branding', icon: Palette },
  { key: 'golive', label: 'Go-Live', icon: Rocket },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { company, abbr, currency, country, loading } = useCompanyDefaults();

  const [step, setStep] = useState(0);
  const [modules, setModules] = useState<string[]>(MODULES);
  const [productName, setProductName] = useState('XentraERP');
  const [pct, setPct] = useState(0);

  // Resume state from localStorage.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('xentra_onboarding') || '{}');
      if (typeof saved.step === 'number') setStep(Math.max(0, Math.min(STEPS.length - 1, saved.step)));
      if (Array.isArray(saved.modules)) setModules(saved.modules);
      if (saved.productName) setProductName(saved.productName);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('xentra_onboarding', JSON.stringify({ step, modules, productName }));
  }, [step, modules, productName]);

  const ctx: SetupContext | null = useMemo(
    () => (company ? { company, abbr: abbr || '', currency: currency || '', country: country || undefined } : null),
    [company, abbr, currency, country]
  );

  const onProgress = useCallback((p: number) => setPct(p), []);

  const toggleModule = (m: string) =>
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const goLive = () => {
    localStorage.setItem('xentra_setup_complete', '1');
    router.push('/dashboard');
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Welcome to XentraERP</h2>
        <p className="text-sm text-muted-foreground">Let’s get {company || 'your company'} ready to transact.</p>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <button
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-primary text-primary-foreground' : done ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' : 'bg-muted text-muted-foreground'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                {s.label}
              </button>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {STEPS[step].key === 'company' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!company ? (
              <p className="text-sm text-destructive sm:col-span-2">
                No Company found in ERPNext. Create one first — it drives currency and chart of accounts.
              </p>
            ) : (
              <>
                <Field label="Company" value={company} />
                <Field label="Abbreviation" value={abbr || '—'} />
                <Field label="Currency" value={currency || '—'} />
                <Field label="Country" value={country || '—'} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {STEPS[step].key === 'modules' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enable Modules</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MODULES.map((m) => {
              const on = modules.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => toggleModule(m)}
                  className={`rounded-lg border p-4 text-left text-sm font-medium transition-colors ${
                    on ? 'border-primary bg-primary/5' : 'border-input hover:bg-accent'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    {m}
                    {on && <Check className="h-4 w-4 text-primary" />}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {STEPS[step].key === 'defaults' &&
        (ctx ? (
          <SetupChecklist ctx={ctx} onProgress={onProgress} />
        ) : (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">Create a Company first.</div>
        ))}

      {STEPS[step].key === 'branding' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Product Name</label>
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Theme colors are configured per tenant by the platform (see .env / tenant registry). Product name is applied to this workspace.
            </p>
          </CardContent>
        </Card>
      )}

      {STEPS[step].key === 'golive' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Go-Live Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span>Default masters completion</span>
              <span className="font-semibold">{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>· Company: {company || 'not set'}</li>
              <li>· Modules: {modules.join(', ') || 'none'}</li>
              <li>· Currency: {currency || '—'}</li>
            </ul>
            {pct < 100 && (
              <p className="text-xs text-amber-600">
                Some default masters are still missing. You can go live now and complete them later from Company Setup.
              </p>
            )}
            <Button onClick={goLive} className="w-full" disabled={!company}>
              <Rocket className="mr-2 h-4 w-4" /> Activate Workspace
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 && (
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{value}</div>
    </div>
  );
}
