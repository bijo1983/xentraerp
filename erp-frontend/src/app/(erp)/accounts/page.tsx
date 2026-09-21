'use client';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTenantCode, withTenant } from '@/lib/tenant';

const sections = [
  {
    title: 'Transactions',
    items: [
      { label: 'Journal Entries', href: '/app/Journal%20Entry', desc: 'Manual accounting entries' },
      { label: 'Payments', href: '/app/Payment%20Entry', desc: 'Customer & supplier payments' },
      { label: 'Sales Invoices', href: '/app/Sales%20Invoice', desc: 'Customer invoices' },
      { label: 'Purchase Invoices', href: '/app/Purchase%20Invoice', desc: 'Supplier bills' },
    ],
  },
  {
    title: 'Masters',
    items: [
      { label: 'Chart of Accounts', href: '/app/Account', desc: 'Account hierarchy' },
      { label: 'Cost Centers', href: '/app/Cost%20Center', desc: 'Cost center hierarchy' },
      { label: 'Fiscal Years', href: '/app/Fiscal%20Year', desc: 'Accounting periods' },
    ],
  },
];

export default function AccountsPage() {
  const router = useRouter();
  const tenantCode = useTenantCode();
  return (
    <div className="space-y-7">
      <h2 className="text-2xl font-semibold tracking-tight">Accounts</h2>
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.items.map((item) => (
              <Card
                key={item.href}
                className="cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevation-sm"
                onClick={() => router.push(withTenant(item.href, tenantCode))}
              >
                <CardHeader className="pb-1.5 pt-4 px-4"><CardTitle className="text-[15px] font-semibold">{item.label}</CardTitle></CardHeader>
                <CardContent className="px-4 pb-4"><p className="text-sm text-muted-foreground">{item.desc}</p></CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Button className="shadow-elevation-xs" onClick={() => router.push(withTenant('/app/Journal%20Entry/new', tenantCode))}>New Journal Entry</Button>
        <Button variant="outline" onClick={() => router.push(withTenant('/app/Payment%20Entry/new', tenantCode))}>New Payment</Button>
      </div>
    </div>
  );
}
