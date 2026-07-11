'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { ensureCurrencyEnabled } from '@/lib/setup/engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkField } from '@/components/dynamic/link-field';

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * Creates the ERPNext Company when a tenant has none. Company insert
 * triggers ERPNext's standard chart-of-accounts / warehouse / cost-center
 * install for the chosen country, which everything else builds on.
 */
export function CreateCompany({ onCreated }: { onCreated: () => void }) {
  const [companyName, setCompanyName] = useState('');
  const [abbr, setAbbr] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ccyBusy, setCcyBusy] = useState(false);
  const [ccyMsg, setCcyMsg] = useState<string | null>(null);

  const enableGccCurrencies = async () => {
    setCcyBusy(true);
    setCcyMsg(null);
    try {
      for (const c of ['BHD', 'KWD', 'OMR', 'AED', 'SAR', 'QAR']) {
        await ensureCurrencyEnabled(c);
      }
      setCcyMsg('GCC currencies enabled — search BHD in the Currency field now.');
    } catch {
      setCcyMsg('Could not enable currencies. Enable BHD manually under Configuration → Currencies.');
    } finally {
      setCcyBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!companyName || !abbr || !country || !currency) {
      return setError('Company name, abbreviation, country and currency are all required.');
    }
    setSubmitting(true);
    try {
      await frappe.createDoc('Company', {
        company_name: companyName,
        abbr,
        country,
        default_currency: currency,
      });
      onCreated();
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { exception?: string } } })?.response?.data?.exception ||
        (e instanceof Error ? e.message : 'Failed to create company.');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" /> Create Your Company
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No company exists yet. Creating one installs the country’s chart of accounts, warehouses and cost
          centers automatically.
        </p>
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Company Name</label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="YMH Trading LLC" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Abbreviation</label>
            <Input value={abbr} onChange={(e) => setAbbr(e.target.value.toUpperCase())} placeholder="YMH" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Currency</label>
            <LinkField target="Currency" value={currency} onChange={setCurrency} placeholder="Search currency…" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Country</label>
          <LinkField target="Country" value={country} onChange={setCountry} placeholder="Search country…" />
        </div>

        <div className="rounded-md bg-muted/40 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">BHD or other GCC currency not listed?</span>
            <Button size="sm" variant="outline" onClick={enableGccCurrencies} disabled={ccyBusy}>
              {ccyBusy ? 'Enabling…' : 'Enable GCC currencies'}
            </Button>
          </div>
          {ccyMsg && <p className="mt-2 text-green-600 dark:text-green-400">{ccyMsg}</p>}
        </div>

        <Button className="w-full" onClick={submit} disabled={submitting}>
          {submitting ? 'Creating company…' : 'Create Company'}
        </Button>
      </CardContent>
    </Card>
  );
}
