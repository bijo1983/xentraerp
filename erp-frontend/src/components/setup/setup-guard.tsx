'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useCompanyDefaults } from '@/hooks/use-company-defaults';
import { SETUP_ITEMS, type SetupContext } from '@/lib/setup/engine';

// Which default-master keys each transaction DocType needs before it can
// be created cleanly. Drives a just-in-time "missing defaults" banner (S4).
const DOCTYPE_DEFAULTS: Record<string, string[]> = {
  'Sales Order': ['warehouse', 'customer_group', 'territory', 'selling_price_list'],
  Quotation: ['customer_group', 'territory', 'selling_price_list'],
  'Sales Invoice': ['warehouse', 'customer_group', 'receivable_account'],
  'Delivery Note': ['warehouse'],
  'Purchase Order': ['warehouse', 'supplier_group', 'buying_price_list'],
  'Purchase Invoice': ['warehouse', 'supplier_group', 'payable_account'],
  'Purchase Receipt': ['warehouse'],
  'Material Request': ['warehouse'],
  Item: ['item_group', 'uom'],
  Customer: ['customer_group', 'territory'],
  Supplier: ['supplier_group'],
};

export function SetupGuard({ doctype }: { doctype: string }) {
  const { company, abbr, currency, country } = useCompanyDefaults();
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    const keys = DOCTYPE_DEFAULTS[doctype];
    if (!keys || !company) return;
    let active = true;
    const ctx: SetupContext = { company, abbr: abbr || '', currency: currency || '', country: country || undefined };
    (async () => {
      const results = await Promise.all(
        keys.map(async (key) => {
          const item = SETUP_ITEMS.find((i) => i.key === key);
          if (!item) return null;
          try {
            const present = await item.check(ctx);
            return present ? null : item.label;
          } catch {
            return null;
          }
        })
      );
      if (active) setMissing(results.filter(Boolean) as string[]);
    })();
    return () => {
      active = false;
    };
  }, [doctype, company, abbr, currency, country]);

  if (missing.length === 0) return null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Some required defaults for <strong>{doctype}</strong> are not configured:{' '}
          {missing.join(', ')}. Creating this document may fail until they exist.
        </span>
      </div>
      <Link
        href="/setup"
        className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
      >
        Set up
      </Link>
    </div>
  );
}
