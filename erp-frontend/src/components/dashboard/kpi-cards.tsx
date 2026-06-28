'use client';

import { ShoppingCart, Users, DollarSign, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { KPIData } from '@/types/erp';

interface KPICardsProps {
  data: KPIData;
}

export function KPICards({ data }: KPICardsProps) {
  const cards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(data.total_revenue),
      icon: DollarSign,
      color: 'text-green-600',
    },
    {
      title: 'Total Orders',
      value: data.total_orders.toLocaleString(),
      icon: ShoppingCart,
      color: 'text-blue-600',
    },
    {
      title: 'Pending Orders',
      value: data.pending_orders.toLocaleString(),
      icon: Clock,
      color: 'text-orange-600',
    },
    {
      title: 'Customers',
      value: data.total_customers.toLocaleString(),
      icon: Users,
      color: 'text-purple-600',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={`h-5 w-5 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
