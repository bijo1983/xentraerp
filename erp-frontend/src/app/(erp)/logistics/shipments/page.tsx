'use client';

import { useState } from 'react';
import { Plus, Search, Filter, Package, MapPin, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ShipmentStatus } from '@/types/logistics';

const STATUS_CONFIG: Record<ShipmentStatus, { label: string; color: string }> = {
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

const DEMO_SHIPMENTS = [
  { id: 'SHP-001', tracking: 'XEN240001', customer: 'Al Futtaim Trading', status: 'in_transit' as ShipmentStatus, carrier: 'Aramex', origin: 'Dubai WH-1', destination: 'Dubai, UAE', weight: 25.5, cost: 150, currency: 'AED', date: '2026-06-28' },
  { id: 'SHP-002', tracking: 'XEN240002', customer: 'Emirates Steel', status: 'delivered' as ShipmentStatus, carrier: 'FedEx', origin: 'Abu Dhabi WH-2', destination: 'Abu Dhabi, UAE', weight: 120, cost: 450, currency: 'AED', date: '2026-06-27' },
  { id: 'SHP-003', tracking: 'XEN240003', customer: 'Majid Al Futtaim', status: 'pending_pickup' as ShipmentStatus, carrier: 'DHL', origin: 'Dubai WH-1', destination: 'Sharjah, UAE', weight: 8.2, cost: 85, currency: 'AED', date: '2026-06-29' },
  { id: 'SHP-004', tracking: 'XEN240004', customer: 'Etihad Cargo', status: 'out_for_delivery' as ShipmentStatus, carrier: 'Own Fleet', origin: 'Jebel Ali WH-3', destination: 'Ajman, UAE', weight: 45, cost: 200, currency: 'AED', date: '2026-06-29' },
  { id: 'SHP-005', tracking: 'XEN240005', customer: 'Dubai Exports', status: 'at_hub' as ShipmentStatus, carrier: 'Aramex', origin: 'Dubai WH-1', destination: 'Riyadh, KSA', weight: 200, cost: 1200, currency: 'AED', date: '2026-06-28' },
  { id: 'SHP-006', tracking: 'XEN240006', customer: 'Sharjah Cement', status: 'draft' as ShipmentStatus, carrier: 'DHL', origin: 'Sharjah WH-4', destination: 'Muscat, Oman', weight: 500, cost: 2800, currency: 'AED', date: '2026-06-29' },
];

export default function ShipmentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | 'all'>('all');

  const filtered = DEMO_SHIPMENTS.filter((s) => {
    const matchesSearch =
      s.tracking.toLowerCase().includes(search.toLowerCase()) ||
      s.customer.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Shipments</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Shipment
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search by tracking number or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ShipmentStatus | 'all')}
        >
          <option value="all">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tracking</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Carrier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Route</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Weight</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Cost</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((shipment) => {
                const statusInfo = STATUS_CONFIG[shipment.status];
                return (
                  <tr key={shipment.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium">{shipment.tracking}</p>
                      <p className="text-xs text-muted-foreground">{shipment.date}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{shipment.customer}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm">
                        <Truck className="h-3 w-3" />
                        {shipment.carrier}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <p>{shipment.origin}</p>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {shipment.destination}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{shipment.weight} kg</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {shipment.currency} {shipment.cost}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusInfo.color)}>
                        {statusInfo.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
