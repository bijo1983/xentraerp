'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Wallet, ShoppingCart, Users, ShoppingBag, Warehouse, CreditCard, Factory,
  FolderKanban, HardDrive, ShieldCheck, LifeBuoy, Globe, Search, FileBarChart,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { REPORTS, SECTIONS, useReportContext } from '@/lib/reports/catalog';

const SECTION_ICONS: Record<string, typeof Wallet> = {
  Accounting: Wallet, Selling: ShoppingCart, CRM: Users, Buying: ShoppingBag, Stock: Warehouse,
  'Point of Sale': CreditCard, Manufacturing: Factory, Projects: FolderKanban, Assets: HardDrive,
  Quality: ShieldCheck, Support: LifeBuoy, Website: Globe,
};

// XentraERP's own reports (not ERPNext reports), listed first in their section.
const CUSTOM_REPORTS = [
  { name: 'POS End of Day', section: 'Point of Sale', href: '/reports/pos-end-of-day', subtitle: 'Sales, payments, shifts and cash-up for one business day', module: 'pos' },
];

interface Entry { name: string; section: string; href: string; subtitle: string }

export default function ReportsPage() {
  const tenantCode = useTenantCode();
  const { ctx } = useReportContext();
  const [query, setQuery] = useState('');

  const entries = useMemo<Entry[]>(() => {
    const permitted = ctx ? new Set(ctx.permitted) : null;
    const standard = REPORTS
      .filter((r) => !permitted || permitted.has(r.name))
      .map((r) => ({ name: r.name, section: r.section, href: `/reports/${r.slug}`, subtitle: r.ref_doctype }));
    // Only what the tenant's package includes (standard ones are already filtered server-side).
    const custom = CUSTOM_REPORTS.filter((r) => !ctx?.modules || ctx.modules.includes(r.module));
    return [...custom, ...standard];
  }, [ctx]);

  const q = query.trim().toLowerCase();
  const visible = q ? entries.filter((e) => `${e.name} ${e.section} ${e.subtitle}`.toLowerCase().includes(q)) : entries;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Reports</h2>
          <p className="text-sm text-muted-foreground">{entries.length} reports across {SECTIONS.filter((s) => entries.some((e) => e.section === s)).length} modules</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-9" placeholder="Search reports…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="columns-1 gap-6 sm:columns-2 lg:columns-3 xl:columns-4">
        {SECTIONS.map((section) => {
          const items = visible.filter((e) => e.section === section);
          if (!items.length) return null;
          const Icon = SECTION_ICONS[section] || FileBarChart;
          return (
            <section key={section} className="mb-6 break-inside-avoid">
              <h3 className="mb-1.5 flex items-center gap-2 border-b pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {section}
                <span className="ml-auto font-normal normal-case tracking-normal">{items.length}</span>
              </h3>
              <ul className="space-y-px">
                {items.map((e) => (
                  <li key={e.href}>
                    <Link
                      href={withTenant(e.href, tenantCode)}
                      title={e.subtitle}
                      className="block truncate rounded px-1.5 py-1 text-sm text-foreground/90 transition-colors hover:bg-muted hover:text-primary"
                    >
                      {e.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {!visible.length && <p className="py-12 text-center text-sm text-muted-foreground">No reports match “{query}”.</p>}
    </div>
  );
}
