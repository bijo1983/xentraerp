'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BarChart3,
  Truck,
  Users,
  Warehouse,
  CreditCard,
  ArrowRight,
  Zap,
  Shield,
  Globe,
  Blocks,
} from 'lucide-react';

const FEATURES = [
  { icon: Truck, title: 'Smart Logistics', desc: '1PL to 4PL configurable supply chain management' },
  { icon: CreditCard, title: 'Full Accounting', desc: 'Multi-currency, tax-compliant chart of accounts' },
  { icon: Warehouse, title: 'Inventory Control', desc: 'Real-time stock tracking across warehouses' },
  { icon: Users, title: 'CRM & Sales', desc: 'End-to-end customer lifecycle management' },
  { icon: BarChart3, title: 'Analytics', desc: 'Live dashboards and business intelligence' },
  { icon: Blocks, title: 'Modular Design', desc: 'Pay only for the modules you need' },
];

const HIGHLIGHTS = [
  { icon: Zap, text: 'Deploy in minutes, not months' },
  { icon: Shield, text: 'Enterprise-grade security' },
  { icon: Globe, text: 'Multi-tenant SaaS architecture' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, error } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-12 text-white">
        <div>
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="XentraERP" width={48} height={48} priority />
            <div>
              <span className="text-2xl font-bold tracking-tight">
                <span className="text-primary">Xentra</span>ERP
              </span>
              <p className="text-sm text-slate-400">Next-Generation Modular ERP Platform</p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold leading-tight">
              One platform.<br />
              Every module you need.<br />
              <span className="text-primary">Pay only for what you use.</span>
            </h2>
            <p className="mt-4 max-w-md text-slate-300">
              XentraERP brings enterprise-grade resource planning to small and medium businesses
              with a plug-and-play modular architecture.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <f.icon className="mb-2 h-5 w-5 text-primary" />
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="mt-1 text-xs text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-6">
            {HIGHLIGHTS.map((h) => (
              <div key={h.text} className="flex items-center gap-2 text-sm text-slate-300">
                <h.icon className="h-4 w-4 text-primary" />
                {h.text}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} XentraERP. All rights reserved.</p>
      </div>

      {/* Right panel - Login */}
      <div className="flex w-full items-center justify-center bg-background px-6 lg:w-[45%]">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex justify-center">
            <div className="flex items-center gap-2">
              <Image src="/logo.svg" alt="XentraERP" width={40} height={40} priority />
              <span className="text-2xl font-bold tracking-tight">
                <span className="text-primary">Xentra</span>ERP
              </span>
            </div>
          </div>

          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to your XentraERP workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email or Username</label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com or Administrator"
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">Password</label>
                <button type="button" className="text-xs text-primary hover:underline">
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={loading}>
              {loading ? 'Signing in...' : (
                <span className="flex items-center justify-center gap-2">
                  Sign In <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{' '}
            <button type="button" className="text-primary hover:underline">Request access</button>
          </p>
        </div>
      </div>
    </div>
  );
}
