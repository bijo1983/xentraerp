'use client';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenantCode, withTenant } from '@/lib/tenant';

const reports = [
  { label: 'Trial Balance', name: 'Trial Balance', desc: 'Debit/credit summary by account' },
  { label: 'Profit and Loss', name: 'Profit and Loss Statement', desc: 'Income vs expense' },
  { label: 'Balance Sheet', name: 'Balance Sheet', desc: 'Assets, liabilities, equity' },
  { label: 'General Ledger', name: 'General Ledger', desc: 'Full transaction ledger' },
  { label: 'Accounts Receivable', name: 'Accounts Receivable', desc: 'Outstanding customer balances' },
  { label: 'Accounts Payable', name: 'Accounts Payable', desc: 'Outstanding supplier balances' },
  { label: 'Sales Analytics', name: 'Sales Analytics', desc: 'Sales breakdown by item/customer' },
  { label: 'Purchase Analytics', name: 'Purchase Analytics', desc: 'Purchase breakdown by item/supplier' },
  { label: 'Stock Balance', name: 'Stock Balance', desc: 'Item quantities by warehouse' },
  { label: 'Item-wise Sales', name: 'Item-wise Sales Register', desc: 'Sales register by item' },
];

export default function ReportsPage() {
  const router = useRouter();
  const tenantCode = useTenantCode();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Reports</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((r) => (
          <Card
            key={r.name}
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => router.push(withTenant(`/app/query-report/${encodeURIComponent(r.name)}`, tenantCode))}
          >
            <CardHeader className="pb-2"><CardTitle className="text-base">{r.label}</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{r.desc}</p></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
