'use client';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Accounts</h2>
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">{s.title}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {s.items.map((item) => (
              <Card key={item.href} className="cursor-pointer hover:border-primary transition-colors" onClick={() => router.push(item.href)}>
                <CardHeader className="pb-2"><CardTitle className="text-base">{item.label}</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground">{item.desc}</p></CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <Button onClick={() => router.push('/app/Journal%20Entry/new')}>New Journal Entry</Button>
        <Button variant="outline" onClick={() => router.push('/app/Payment%20Entry/new')}>New Payment</Button>
      </div>
    </div>
  );
}
