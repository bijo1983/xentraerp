'use client';

import { useState } from 'react';
import { Plus, MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLogisticsStore } from '@/store/logistics-store';

export default function ZonesPage() {
  const { config, addZone, removeZone } = useLogisticsStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    countries: '',
    delivery_days_min: '',
    delivery_days_max: '',
    base_rate: '',
    per_kg_rate: '',
  });

  const handleAdd = () => {
    addZone({
      id: crypto.randomUUID(),
      name: form.name,
      countries: form.countries.split(',').map((c) => c.trim()).filter(Boolean),
      delivery_days_min: Number(form.delivery_days_min) || 1,
      delivery_days_max: Number(form.delivery_days_max) || 3,
      base_rate: Number(form.base_rate) || 0,
      per_kg_rate: Number(form.per_kg_rate) || 0,
      currency: config?.default_currency || 'USD',
    });
    setForm({ name: '', countries: '', delivery_days_min: '', delivery_days_max: '', base_rate: '', per_kg_rate: '' });
    setShowForm(false);
  };

  const zones = config?.zones || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shipping Zones</h1>
          <p className="text-muted-foreground">Configure delivery zones and rates</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Zone
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add Shipping Zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Zone Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., GCC, Middle East, Europe"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Countries (comma-separated)</label>
                <Input
                  value={form.countries}
                  onChange={(e) => setForm({ ...form, countries: e.target.value })}
                  placeholder="e.g., UAE, KSA, Oman, Bahrain"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Min Days</label>
                <Input
                  type="number"
                  value={form.delivery_days_min}
                  onChange={(e) => setForm({ ...form, delivery_days_min: e.target.value })}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Days</label>
                <Input
                  type="number"
                  value={form.delivery_days_max}
                  onChange={(e) => setForm({ ...form, delivery_days_max: e.target.value })}
                  placeholder="3"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Base Rate ({config?.default_currency})</label>
                <Input
                  type="number"
                  value={form.base_rate}
                  onChange={(e) => setForm({ ...form, base_rate: e.target.value })}
                  placeholder="50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Per Kg Rate ({config?.default_currency})</label>
                <Input
                  type="number"
                  value={form.per_kg_rate}
                  onChange={(e) => setForm({ ...form, per_kg_rate: e.target.value })}
                  placeholder="5"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleAdd} disabled={!form.name}>
                Add Zone
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {zones.map((zone) => (
          <Card key={zone.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{zone.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {zone.delivery_days_min}-{zone.delivery_days_max} business days
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeZone(zone.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-1">
                {zone.countries.map((c) => (
                  <span key={c} className="rounded bg-muted px-2 py-0.5 text-xs">
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Base: </span>
                  <span className="font-medium">{zone.currency} {zone.base_rate}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Per kg: </span>
                  <span className="font-medium">{zone.currency} {zone.per_kg_rate}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {zones.length === 0 && !showForm && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MapPin className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">No shipping zones configured</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Zone
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
