'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, Scale, BookOpen, ArrowDownCircle, ArrowUpCircle, FileText } from 'lucide-react';

// Standard ERPNext financial Query Reports surfaced via the report runner.
const REPORTS = [
  { name: 'Trial Balance', icon: Scale, desc: 'Debit/credit balances across all accounts' },
  { name: 'Profit and Loss Statement', icon: TrendingUp, desc: 'Income and expense over a period' },
  { name: 'Balance Sheet', icon: BarChart3, desc: 'Assets, liabilities and equity' },
  { name: 'General Ledger', icon: BookOpen, desc: 'All GL entries with running balance' },
  { name: 'Accounts Receivable', icon: ArrowDownCircle, desc: 'Outstanding customer balances' },
  { name: 'Accounts Payable', icon: ArrowUpCircle, desc: 'Outstanding supplier balances' },
  { name: 'Sales Register', icon: FileText, desc: 'Sales invoices with tax breakup' },
  { name: 'Purchase Register', icon: FileText, desc: 'Purchase invoices with tax breakup' },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Reports</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.name} href={`/reports/${encodeURIComponent(r.name)}`}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <r.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{r.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{r.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
