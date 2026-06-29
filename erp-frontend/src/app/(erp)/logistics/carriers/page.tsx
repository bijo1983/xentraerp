'use client';

import { useState } from 'react';
import { Plus, Truck, Check, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLogisticsStore } from '@/store/logistics-store';
import type { CarrierConfig } from '@/types/logistics';

export default function CarriersPage() {
  const { config, addCarrier, removeCarrier } = useLogisticsStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'contracted' as CarrierConfig['type'],
    tracking_enabled: true,
    api_key: '',
    services: '',
  });

  const handleAdd = () => {
    addCarrier({
      id: crypto.randomUUID(),
      name: form.name,
      type: form.type,
      tracking_enabled: form.tracking_enabled,
      api_key: form.api_key || undefined,
      services: form.services.split(',').map((s) => s.trim()).filter(Boolean),
      active: true,
    });
    setForm({ name: '', type: 'contracted', tracking_enabled: true, api_key: '', services: '' });
    setShowForm(false);
  };

  const carriers = config?.carriers || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Carriers</h1>
          <p className="text-muted-foreground">Manage your transportation providers</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Carrier
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add New Carrier</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Carrier Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Aramex, DHL, FedEx"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as CarrierConfig['type'] })}
                >
                  <option value="own_fleet">Own Fleet</option>
                  <option value="contracted">Contracted</option>
                  <option value="marketplace">Marketplace</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Services (comma-separated)</label>
              <Input
                value={form.services}
                onChange={(e) => setForm({ ...form, services: e.target.value })}
                placeholder="e.g., Express, Standard, Same Day, Overnight"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">API Key (optional)</label>
                <Input
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  placeholder="For tracking integration"
                />
              </div>
              <div className="flex items-center gap-2 pt-7">
                <input
                  type="checkbox"
                  checked={form.tracking_enabled}
                  onChange={(e) => setForm({ ...form, tracking_enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <label className="text-sm">Enable tracking</label>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleAdd} disabled={!form.name}>
                Add Carrier
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {carriers.map((carrier) => (
          <Card key={carrier.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Truck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{carrier.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {carrier.type.replace('_', ' ')}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeCarrier(carrier.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-1">
                {carrier.services.map((s) => (
                  <span key={s} className="rounded bg-muted px-2 py-0.5 text-xs">
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  {carrier.tracking_enabled ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <X className="h-3 w-3 text-red-500" />
                  )}
                  Tracking
                </div>
                <div className="flex items-center gap-1">
                  <div className={cn('h-2 w-2 rounded-full', carrier.active ? 'bg-green-500' : 'bg-gray-400')} />
                  {carrier.active ? 'Active' : 'Inactive'}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {carriers.length === 0 && !showForm && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Truck className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">No carriers configured</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Carrier
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
