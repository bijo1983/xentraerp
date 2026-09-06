'use client';

import { Package, ShoppingCart, ShoppingBag, Warehouse, Factory, FolderKanban, HardDrive, Users, Wallet, ShieldCheck, LifeBuoy, Wrench, CreditCard as POSIcon, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const MODULES = [
  { code: 'accounting', name: 'Accounting and Finance', icon: Wallet, category: 'Core', free: true },
  { code: 'selling', name: 'Selling and CRM', icon: ShoppingCart, category: 'Core', free: true },
  { code: 'buying', name: 'Buying and Procurement', icon: ShoppingBag, category: 'Core', free: true },
  { code: 'stock', name: 'Inventory and Warehouse', icon: Warehouse, category: 'Core', free: false },
  { code: 'manufacturing', name: 'Manufacturing', icon: Factory, category: 'Operations', free: false },
  { code: 'projects', name: 'Projects', icon: FolderKanban, category: 'Operations', free: false },
  { code: 'assets', name: 'Assets', icon: HardDrive, category: 'Operations', free: false },
  { code: 'hr', name: 'Human Resources', icon: Users, category: 'People', free: false },
  { code: 'payroll', name: 'Payroll', icon: Wallet, category: 'People', free: false },
  { code: 'quality', name: 'Quality Management', icon: ShieldCheck, category: 'Operations', free: false },
  { code: 'support', name: 'Support and Helpdesk', icon: LifeBuoy, category: 'Service', free: false },
  { code: 'maintenance', name: 'Maintenance', icon: Wrench, category: 'Service', free: false },
  { code: 'pos', name: 'Point of Sale', icon: POSIcon, category: 'Retail', free: false },
  { code: 'website', name: 'Website and E-Commerce', icon: Globe, category: 'Retail', free: false },
];

const categories = Array.from(new Set(MODULES.map((m) => m.category)));

export default function ModulesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Modules</h1>
          <p className="text-sm text-muted-foreground">Module catalogue available to tenants</p>
        </div>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Register Module</Button>
      </div>

      {categories.map((cat) => (
        <div key={cat}>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{cat}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MODULES.filter((m) => m.category === cat).map((m) => (
              <div key={m.code} className="rounded-lg border bg-background p-4 flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <m.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{m.name}</span>
                    {m.free && <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">FREE</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono">{m.code}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-lg border bg-background p-5">
        <p className="text-sm text-muted-foreground">
          To persist module configuration, create a <code className="bg-muted px-1 rounded text-xs">XentraERP Module</code> DocType with
          fields for dependencies, pricing, and included reports as described in the platform specification.
        </p>
      </div>
    </div>
  );
}
