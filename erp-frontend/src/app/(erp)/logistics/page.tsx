'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Truck,
  Package,
  Building2,
  MapPin,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Settings,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLogisticsStore } from '@/store/logistics-store';
import { LOGISTICS_MODEL_INFO } from '@/types/logistics';
import type { ShipmentStatus } from '@/types/logistics';

const DEMO_STATS = {
  total_shipments: 156,
  in_transit: 23,
  delivered: 118,
  pending: 15,
  avg_delivery_days: 3.2,
  on_time_rate: 94.5,
  total_freight_cost: 45230,
  active_carriers: 4,
  active_warehouses: 3,
};

const DEMO_RECENT_SHIPMENTS = [
  { id: 'SHP-001', tracking: 'XEN240001', customer: 'Al Futtaim Trading', status: 'in_transit' as ShipmentStatus, carrier: 'Aramex', destination: 'Dubai, UAE' },
  { id: 'SHP-002', tracking: 'XEN240002', customer: 'Emirates Steel', status: 'delivered' as ShipmentStatus, carrier: 'FedEx', destination: 'Abu Dhabi, UAE' },
  { id: 'SHP-003', tracking: 'XEN240003', customer: 'Majid Al Futtaim', status: 'pending_pickup' as ShipmentStatus, carrier: 'DHL', destination: 'Sharjah, UAE' },
  { id: 'SHP-004', tracking: 'XEN240004', customer: 'Etihad Cargo', status: 'out_for_delivery' as ShipmentStatus, carrier: 'Own Fleet', destination: 'Ajman, UAE' },
  { id: 'SHP-005', tracking: 'XEN240005', customer: 'Dubai Exports', status: 'at_hub' as ShipmentStatus, carrier: 'Aramex', destination: 'Riyadh, KSA' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  pending_pickup: { label: 'Pending Pickup', color: 'bg-yellow-100 text-yellow-700' },
  picked_up: { label: 'Picked Up', color: 'bg-blue-100 text-blue-700' },
  in_transit: { label: 'In Transit', color: 'bg-indigo-100 text-indigo-700' },
  at_hub: { label: 'At Hub', color: 'bg-purple-100 text-purple-700' },
  out_for_delivery: { label: 'Out for Delivery', color: 'bg-cyan-100 text-cyan-700' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700' },
  failed_delivery: { label: 'Failed', color: 'bg-red-100 text-red-700' },
  returned: { label: 'Returned', color: 'bg-orange-100 text-orange-700' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
};

export default function LogisticsDashboard() {
  const router = useRouter();
  const { config, setupComplete } = useLogisticsStore();

  useEffect(() => {
    if (!setupComplete || !config) {
      router.replace('/logistics/setup');
    }
  }, [setupComplete, config, router]);

  if (!config || !setupComplete) return null;

  const modelInfo = LOGISTICS_MODEL_INFO[config.model];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Logistics</h1>
          <p className="text-muted-foreground">
            {modelInfo.title} &mdash; {config.company_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/logistics/setup')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
          <Button onClick={() => router.push('/logistics/shipments')}>
            <Plus className="mr-2 h-4 w-4" />
            New Shipment
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Shipments</p>
                <p className="text-2xl font-bold">{DEMO_STATS.total_shipments}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100">
                <Truck className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">In Transit</p>
                <p className="text-2xl font-bold">{DEMO_STATS.in_transit}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">On-Time Rate</p>
                <p className="text-2xl font-bold">{DEMO_STATS.on_time_rate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Delivery</p>
                <p className="text-2xl font-bold">{DEMO_STATS.avg_delivery_days} days</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Recent Shipments</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push('/logistics/shipments')}>
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {DEMO_RECENT_SHIPMENTS.map((shipment) => {
                const statusInfo = STATUS_CONFIG[shipment.status];
                return (
                  <div
                    key={shipment.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium">{shipment.tracking}</p>
                        <p className="text-xs text-muted-foreground">{shipment.customer}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="hidden text-right md:block">
                        <p className="text-xs text-muted-foreground">{shipment.carrier}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {shipment.destination}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium',
                          statusInfo.color
                        )}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push('/logistics/shipments')}
            >
              <Package className="mr-2 h-4 w-4" />
              Manage Shipments
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push('/logistics/carriers')}
            >
              <Truck className="mr-2 h-4 w-4" />
              Manage Carriers
            </Button>
            {config.enable_warehousing && (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push('/logistics/warehouses')}
              >
                <Building2 className="mr-2 h-4 w-4" />
                Manage Warehouses
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push('/logistics/zones')}
            >
              <MapPin className="mr-2 h-4 w-4" />
              Shipping Zones
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Carriers</p>
                <p className="text-2xl font-bold">{config.carriers.length || DEMO_STATS.active_carriers}</p>
              </div>
              <Truck className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Warehouses</p>
                <p className="text-2xl font-bold">{config.warehouses.length || DEMO_STATS.active_warehouses}</p>
              </div>
              <Building2 className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Freight Cost (MTD)</p>
                <p className="text-2xl font-bold">
                  {config.default_currency} {DEMO_STATS.total_freight_cost.toLocaleString()}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
