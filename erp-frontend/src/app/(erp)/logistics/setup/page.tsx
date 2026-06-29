'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Truck,
  Building2,
  Globe,
  Network,
  Check,
  ArrowRight,
  ArrowLeft,
  Snowflake,
  RotateCcw,
  Ship,
  Package,
  Shuffle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLogisticsStore } from '@/store/logistics-store';
import type { LogisticsModel } from '@/types/logistics';
import { LOGISTICS_MODEL_INFO } from '@/types/logistics';

const MODEL_ICONS: Record<LogisticsModel, typeof Truck> = {
  '1pl': Truck,
  '2pl': Building2,
  '3pl': Globe,
  '4pl': Network,
};

export default function LogisticsSetupPage() {
  const router = useRouter();
  const { config, initializeModel, updateConfig, completeSetup } = useLogisticsStore();
  const [step, setStep] = useState(0);

  const steps = [
    'Select Logistics Model',
    'Company Details',
    'Configure Features',
    'Review & Complete',
  ];

  const handleModelSelect = (model: LogisticsModel) => {
    initializeModel(model);
    setStep(1);
  };

  const handleComplete = () => {
    completeSetup();
    router.push('/logistics');
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Logistics Module Setup</h1>
        <p className="mt-2 text-muted-foreground">
          Configure your logistics operations based on your business model
        </p>
      </div>

      <div className="mb-8 flex items-center justify-between">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                i < step
                  ? 'bg-primary text-primary-foreground'
                  : i === step
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                'ml-2 hidden text-sm sm:block',
                i <= step ? 'font-medium' : 'text-muted-foreground'
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'mx-4 h-px w-8 sm:w-16',
                  i < step ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(LOGISTICS_MODEL_INFO) as LogisticsModel[]).map((model) => {
            const info = LOGISTICS_MODEL_INFO[model];
            const Icon = MODEL_ICONS[model];
            return (
              <Card
                key={model}
                className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
                onClick={() => handleModelSelect(model)}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{info.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-muted-foreground">{info.description}</p>
                  <ul className="mb-4 space-y-1">
                    {info.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="h-3 w-3 text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    <strong>Ideal for:</strong> {info.ideal_for}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {step === 1 && config && (
        <Card>
          <CardHeader>
            <CardTitle>Company Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Company Name</label>
              <Input
                value={config.company_name}
                onChange={(e) => updateConfig({ company_name: e.target.value })}
                placeholder="Enter your company name"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Country</label>
                <Input
                  value={config.country}
                  onChange={(e) => updateConfig({ country: e.target.value })}
                  placeholder="e.g., United Arab Emirates"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Default Currency</label>
                <Input
                  value={config.default_currency}
                  onChange={(e) => updateConfig({ default_currency: e.target.value })}
                  placeholder="e.g., AED"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tax ID / VAT Number</label>
              <Input
                value={config.tax_id}
                onChange={(e) => updateConfig({ tax_id: e.target.value })}
                placeholder="Enter your tax registration number"
              />
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={() => setStep(2)} disabled={!config.company_name || !config.country}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && config && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Features</CardTitle>
            <p className="text-sm text-muted-foreground">
              Features are pre-configured based on your {LOGISTICS_MODEL_INFO[config.model].title} model.
              Toggle to customize.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { key: 'enable_warehousing', label: 'Warehousing', icon: Building2, desc: 'Manage warehouse operations and inventory storage' },
                { key: 'enable_transport', label: 'Transportation', icon: Truck, desc: 'Fleet and carrier management for goods movement' },
                { key: 'enable_last_mile', label: 'Last Mile Delivery', icon: Package, desc: 'Final delivery to end customer' },
                { key: 'enable_reverse_logistics', label: 'Reverse Logistics', icon: RotateCcw, desc: 'Returns, refurbishment, and recycling' },
                { key: 'enable_freight_forwarding', label: 'Freight Forwarding', icon: Ship, desc: 'International freight coordination' },
                { key: 'enable_customs', label: 'Customs Brokerage', icon: Globe, desc: 'Import/export documentation and compliance' },
                { key: 'enable_cold_chain', label: 'Cold Chain', icon: Snowflake, desc: 'Temperature-controlled logistics' },
                { key: 'enable_cross_docking', label: 'Cross Docking', icon: Shuffle, desc: 'Direct transfer without warehousing' },
              ].map(({ key, label, icon: Icon, desc }) => (
                <div
                  key={key}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                    config[key as keyof typeof config]
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  )}
                  onClick={() => updateConfig({ [key]: !config[key as keyof typeof config] })}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                      config[key as keyof typeof config]
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground'
                    )}
                  >
                    {config[key as keyof typeof config] && <Check className="h-3 w-3" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-6">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && config && (
        <Card>
          <CardHeader>
            <CardTitle>Review Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="rounded-lg bg-muted/50 p-4">
                <h3 className="mb-2 font-medium">Logistics Model</h3>
                <p className="text-sm">{LOGISTICS_MODEL_INFO[config.model].title}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-4">
                <h3 className="mb-2 font-medium">Company</h3>
                <div className="grid gap-2 text-sm md:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Name:</span> {config.company_name}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Country:</span> {config.country}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Currency:</span> {config.default_currency}
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-4">
                <h3 className="mb-2 font-medium">Enabled Features</h3>
                <div className="flex flex-wrap gap-2">
                  {config.enable_warehousing && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Warehousing</span>}
                  {config.enable_transport && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Transportation</span>}
                  {config.enable_last_mile && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Last Mile</span>}
                  {config.enable_reverse_logistics && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Reverse Logistics</span>}
                  {config.enable_freight_forwarding && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Freight Forwarding</span>}
                  {config.enable_customs && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Customs</span>}
                  {config.enable_cold_chain && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Cold Chain</span>}
                  {config.enable_cross_docking && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Cross Docking</span>}
                </div>
              </div>
            </div>
            <div className="flex justify-between pt-6">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleComplete}>
                Complete Setup
                <Check className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
