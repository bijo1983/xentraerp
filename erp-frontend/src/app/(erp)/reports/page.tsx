'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, PieChart, FileBarChart } from 'lucide-react';

const REPORTS = [
  { icon: TrendingUp, title: 'Sales Analytics', desc: 'Revenue trends and order volume over time' },
  { icon: PieChart, title: 'Inventory Summary', desc: 'Stock levels across warehouses' },
  { icon: FileBarChart, title: 'Financial Statements', desc: 'Profit & loss, balance sheet' },
  { icon: BarChart3, title: 'Purchase Analytics', desc: 'Supplier spend and order trends' },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Reports</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Card key={r.title}>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <r.icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{r.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{r.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
