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
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      <KPICards data={kpi} />
      <div className="grid gap-4 lg:grid-cols-3">
        <RevenueChart data={kpi.revenue_trend} />
        <OrderStatusChart data={kpi.order_status_distribution} />
      </div>
    </div>
  );
}
