'use client';

import { useState } from 'react';
import { Plus, Building2, Trash2, Snowflake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLogisticsStore } from '@/store/logistics-store';
import type { WarehouseConfig } from '@/types/logistics';

export default function WarehousesPage() {
  const { config, addWarehouse, removeWarehouse } = useLogisticsStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'owned' as WarehouseConfig['type'],
    address: '',
    city: '',
    country: '',
    capacity_sqm: '',
    cold_storage: false,
  });

  const handleAdd = () => {
    addWarehouse({
      id: crypto.randomUUID(),
      name: form.name,
      type: form.type,
      address: form.address,
      city: form.city,
      country: form.country,
      capacity_sqm: Number(form.capacity_sqm) || 0,
      cold_storage: form.cold_storage,
      active: true,
    });
    setForm({ name: '', type: 'owned', address: '', city: '', country: '', capacity_sqm: '', cold_storage: false });
    setShowForm(false);
  };

  const warehouses = config?.warehouses || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Warehouses</h1>
          <p className="text-muted-foreground">Manage storage and distribution centers</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Warehouse
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add New Warehouse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Warehouse Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Dubai Main Warehouse"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as WarehouseConfig['type'] })}
                >
                  <option value="owned">Owned</option>
                  <option value="rented">Rented</option>
                  <option value="third_party">Third Party</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Address</label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Street address"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">City</label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="e.g., Dubai"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Country</label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  placeholder="e.g., UAE"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Capacity (sqm)</label>
                <Input
                  type="number"
                  value={form.capacity_sqm}
                  onChange={(e) => setForm({ ...form, capacity_sqm: e.target.value })}
                  placeholder="e.g., 5000"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.cold_storage}
                onChange={(e) => setForm({ ...form, cold_storage: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              <label className="text-sm">Cold storage facility</label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleAdd} disabled={!form.name || !form.city}>
                Add Warehouse
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {warehouses.map((wh) => (
          <Card key={wh.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{wh.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {wh.type.replace('_', ' ')}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeWarehouse(wh.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                <p>{wh.address}</p>
                <p>{wh.city}, {wh.country}</p>
                <p>{wh.capacity_sqm.toLocaleString()} sqm</p>
              </div>
              {wh.cold_storage && (
                <div className="mt-3 flex items-center gap-1 text-xs text-blue-600">
                  <Snowflake className="h-3 w-3" />
                  Cold Storage
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {warehouses.length === 0 && !showForm && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">No warehouses configured</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Warehouse
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
