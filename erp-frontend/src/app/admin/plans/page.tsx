'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Check } from 'lucide-react';

const PLANS = [
  {
    code: 'free',
    name: 'Free',
    price_monthly: 0,
    price_annual: 0,
    users: 3,
    modules: ['Selling and CRM', 'Buying and Procurement'],
    status: 'Active',
    color: 'border-gray-200',
  },
  {
    code: 'starter',
    name: 'Starter',
    price_monthly: 29,
    price_annual: 290,
    users: 10,
    modules: ['Selling and CRM', 'Buying and Procurement', 'Inventory and Warehouse', 'Accounting and Finance'],
    status: 'Active',
    color: 'border-blue-200',
    recommended: true,
  },
  {
    code: 'professional',
    name: 'Professional',
    price_monthly: 79,
    price_annual: 790,
    users: 25,
    modules: ['All Starter modules', 'Manufacturing', 'Projects', 'Human Resources', 'Payroll'],
    status: 'Active',
    color: 'border-indigo-200',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    price_monthly: 0,
    price_annual: 0,
    users: 0,
    modules: ['All modules', 'Custom workflows', 'Dedicated support', 'Custom integrations'],
    status: 'Active',
    color: 'border-purple-200',
  },
];

export default function PlansPage() {
  const [plans] = useState(PLANS);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Plans</h1>
          <p className="text-sm text-muted-foreground">Manage subscription plans and pricing</p>
        </div>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Plan</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map((plan) => (
          <div key={plan.code} className={`rounded-xl border-2 ${plan.color} bg-background p-6 relative flex flex-col`}>
            {plan.recommended && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">Recommended</span>
              </div>
            )}
            <div className="mb-4">
              <h3 className="font-bold text-lg">{plan.name}</h3>
              <div className="mt-2">
                {plan.price_monthly === 0 && plan.code !== 'enterprise' ? (
                  <span className="text-2xl font-bold">Free</span>
                ) : plan.code === 'enterprise' ? (
                  <span className="text-2xl font-bold">Custom</span>
                ) : (
                  <div>
                    <span className="text-2xl font-bold">${plan.price_monthly}</span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                    <div className="text-xs text-muted-foreground">${plan.price_annual}/yr (save {Math.round((1 - plan.price_annual / (plan.price_monthly * 12)) * 100)}%)</div>
                  </div>
                )}
              </div>
              {plan.users > 0 && (
                <div className="text-xs text-muted-foreground mt-1">Up to {plan.users} users</div>
              )}
              {plan.users === 0 && plan.code === 'enterprise' && (
                <div className="text-xs text-muted-foreground mt-1">Unlimited users</div>
              )}
            </div>

            <ul className="space-y-2 flex-1 mb-4">
              {plan.modules.map((m) => (
                <li key={m} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1">Edit</Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                {plan.status === 'Active' ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-background p-5">
        <h3 className="font-medium text-sm mb-3">Plan Configuration Notes</h3>
        <p className="text-sm text-muted-foreground">
          Plans shown above are UI placeholders. To persist plans, create a <code className="bg-muted px-1 rounded text-xs">XentraERP Plan</code> DocType
          in Frappe with fields: <code className="bg-muted px-1 rounded text-xs">plan_code</code>, <code className="bg-muted px-1 rounded text-xs">plan_name</code>,
          <code className="bg-muted px-1 rounded text-xs">price_monthly</code>, <code className="bg-muted px-1 rounded text-xs">price_annual</code>,
          <code className="bg-muted px-1 rounded text-xs">max_users</code>, <code className="bg-muted px-1 rounded text-xs">status</code>.
          Then this page will load live data.
        </p>
      </div>
    </div>
  );
}
