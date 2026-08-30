'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface RevenueChartProps {
  data: { date: string; amount: number }[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  const options: ApexCharts.ApexOptions = {
    chart: { type: 'area', toolbar: { show: false }, zoom: { enabled: false } },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    xaxis: {
      categories: data.map((d) => d.date),
      labels: { style: { fontSize: '12px' } },
    },
    yaxis: {
      labels: {
        formatter: (val: number) =>
          new Intl.NumberFormat('en-IN', { notation: 'compact', compactDisplay: 'short' }).format(val),
      },
    },
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1 },
    },
    colors: ['#3b82f6'],
    tooltip: {
      y: {
        formatter: (val: number) =>
          new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val),
      },
    },
  };

  const series = [{ name: 'Revenue', data: data.map((d) => d.amount) }];

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Revenue Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <Chart options={options} series={series} type="area" height={300} />
      </CardContent>
    </Card>
  );
}
