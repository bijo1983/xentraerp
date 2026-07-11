'use client';

import { useMemo } from 'react';
import { useCompanyDefaults } from '@/hooks/use-company-defaults';
import { SetupChecklist } from '@/components/setup/setup-checklist';
import type { SetupContext } from '@/lib/setup/engine';

export default function SetupPage() {
  const { company, abbr, currency, country, loading } = useCompanyDefaults();

  const ctx: SetupContext | null = useMemo(
    () => (company ? { company, abbr: abbr || '', currency: currency || '', country: country || undefined } : null),
    [company, abbr, currency, country]
  );

  if (loading) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading company…</div>;
  }
  if (!company || !ctx) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        No Company is configured in ERPNext yet. Create a Company first — it drives currency, chart of accounts and these defaults.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Company Setup</h2>
        <p className="text-sm text-muted-foreground">
          {company} · {currency}
          {country ? ` · ${country}` : ''}
        </p>
      </div>
      <SetupChecklist ctx={ctx} />
    </div>
  );
}
