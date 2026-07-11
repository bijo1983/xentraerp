'use client';

import { useMemo } from 'react';
import { useCompanyDefaults } from '@/hooks/use-company-defaults';
import { SetupChecklist } from '@/components/setup/setup-checklist';
import { CreateCompany } from '@/components/setup/create-company';
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
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Company Setup</h2>
        <CreateCompany onCreated={() => window.location.reload()} />
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
