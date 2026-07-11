'use client';

import { ShoppingCart, Users, DollarSign, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { useCompanyDefaults } from '@/hooks/use-company-defaults';
import type { KPIData } from '@/types/erp';

interface KPICardsProps {
  data: KPIData;
}

export function KPICards({ data }: KPICardsProps) {
  const { currency } = useCompanyDefaults();
  const cards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(data.total_revenue, currency || undefined),
      icon: DollarSign,
      color: 'text-green-600 dark:text-green-400',
      chip: 'bg-green-100 dark:bg-green-500/15',
    },
    {
      title: 'Total Orders',
      value: data.total_orders.toLocaleString(),
      icon: ShoppingCart,
      color: 'text-blue-600 dark:text-blue-400',
      chip: 'bg-blue-100 dark:bg-blue-500/15',
    },
    {
      title: 'Pending Orders',
      value: data.pending_orders.toLocaleString(),
      icon: Clock,
      color: 'text-orange-600 dark:text-orange-400',
      chip: 'bg-orange-100 dark:bg-orange-500/15',
    },
    {
      title: 'Customers',
      value: data.total_customers.toLocaleString(),
      icon: Users,
      color: 'text-purple-600 dark:text-purple-400',
      chip: 'bg-purple-100 dark:bg-purple-500/15',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <div className={`flex h-9 w-9 items-center justify-center rounded-full ${card.chip}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
