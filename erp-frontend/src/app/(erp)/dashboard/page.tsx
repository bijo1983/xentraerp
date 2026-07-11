'use client';

import { useEffect } from 'react';
import { useERPStore } from '@/store/erp-store';
import { KPICards } from '@/components/dashboard/kpi-cards';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { OrderStatusChart } from '@/components/dashboard/order-status-chart';

export default function DashboardPage() {
  const { kpi, kpiLoading, fetchKPI } = useERPStore();

  useEffect(() => {
    fetchKPI();
  }, [fetchKPI]);

  if (kpiLoading || !kpi) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Overview of your business performance</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-lg border bg-card shadow-sm" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-[380px] animate-pulse rounded-lg border bg-card shadow-sm lg:col-span-2" />
          <div className="h-[380px] animate-pulse rounded-lg border bg-card shadow-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Overview of your business performance</p>
      </div>
      <KPICards data={kpi} />
      <div className="grid gap-4 lg:grid-cols-3">
        <RevenueChart data={kpi.revenue_trend} />
        <OrderStatusChart data={kpi.order_status_distribution} />
      </div>
    </div>
  );
}
