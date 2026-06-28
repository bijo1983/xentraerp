'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface OrderStatusChartProps {
  data: { status: string; count: number }[];
}

export function OrderStatusChart({ data }: OrderStatusChartProps) {
  const options: ApexCharts.ApexOptions = {
    chart: { type: 'donut' },
    labels: data.map((d) => d.status),
    colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],
    legend: { position: 'bottom' },
    dataLabels: { enabled: true },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Order Status</CardTitle>
      </CardHeader>
      <CardContent>
        <Chart options={options} series={data.map((d) => d.count)} type="donut" height={300} />
      </CardContent>
    </Card>
  );
}
