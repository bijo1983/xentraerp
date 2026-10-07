'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Wallet, ShoppingCart, Users, ShoppingBag, Warehouse, CreditCard, Factory,
  FolderKanban, HardDrive, ShieldCheck, LifeBuoy, Search, FileBarChart,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { REPORTS, SECTIONS, useReportContext } from '@/lib/reports/catalog';

const SECTION_ICONS: Record<string, typeof Wallet> = {
  Accounting: Wallet, Selling: ShoppingCart, CRM: Users, Buying: ShoppingBag, Stock: Warehouse,
  'Point of Sale': CreditCard, Manufacturing: Factory, Projects: FolderKanban, Assets: HardDrive,
  Quality: ShieldCheck, Support: LifeBuoy,
};

// XentraERP's own reports (not ERPNext reports), listed first in their section.
const CUSTOM_REPORTS = [
  { name: 'POS End of Day', section: 'Point of Sale', href: '/reports/pos-end-of-day', subtitle: 'Sales, payments, shifts and cash-up for one business day' },
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
    return [...CUSTOM_REPORTS, ...standard];
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

      {SECTIONS.map((section) => {
        const items = visible.filter((e) => e.section === section);
        if (!items.length) return null;
        const Icon = SECTION_ICONS[section] || FileBarChart;
        return (
          <section key={section} className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon className="h-3.5 w-3.5" /> {section}
              <span className="font-normal normal-case tracking-normal">· {items.length}</span>
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((e) => (
                <Link key={e.href} href={withTenant(e.href, tenantCode)}>
                  <Card className="h-full cursor-pointer transition-colors hover:border-primary">
                    <CardContent className="p-4">
                      <p className="text-sm font-medium">{e.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{e.subtitle}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {!visible.length && <p className="py-12 text-center text-sm text-muted-foreground">No reports match “{query}”.</p>}
    </div>
  );
}
