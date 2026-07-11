'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/store/auth-store';
import { frappe } from '@/lib/frappe';
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
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loginAs, setLoginAs] = useState<'customer' | 'admin'>('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signupMsg, setSignupMsg] = useState<string | null>(null);
  const [signupErr, setSignupErr] = useState<string | null>(null);
  const [signupBusy, setSignupBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      // Admin → SaaS Admin Platform. Customer → their tenant workspace,
      // entered via the tenant slug (/jjcompany) so the tenant context
      // (xentra_tenant cookie → backend routing) is established at login.
      // Slug is configurable per deployment; defaults to this tenant.
      const slug = process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG || 'jjcompany';
      router.push(loginAs === 'admin' ? '/admin' : `/${slug}`);
    } catch {
      // error is set in store
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupMsg(null);
    setSignupErr(null);
    setSignupBusy(true);
    try {
      await frappe.signUp(email, fullName);
      setSignupMsg('Account request submitted. Check your email to set a password, then sign in.');
      setMode('login');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { exception?: string; _server_messages?: string } } })?.response?.data
          ?.exception || 'Sign up is not enabled on this workspace. Contact your administrator.';
      setSignupErr(message);
    } finally {
      setSignupBusy(false);
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
            <h1 className="text-2xl font-bold tracking-tight">
              {mode === 'signup'
                ? 'Create your account'
                : loginAs === 'admin'
                  ? 'Admin Sign In'
                  : 'Welcome back'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'signup'
                ? 'Sign up to get started with XentraERP'
                : loginAs === 'admin'
                  ? 'Sign in to the SaaS Admin Platform'
                  : 'Sign in to your XentraERP workspace'}
            </p>
          </div>

          {/* Customer / Admin sign-in switch */}
          {mode === 'login' && (
            <div className="flex rounded-lg border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setLoginAs('customer')}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  loginAs === 'customer' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Customer Sign In
              </button>
              <button
                type="button"
                onClick={() => setLoginAs('admin')}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  loginAs === 'admin' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Admin Sign In
              </button>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}
              {signupMsg && (
                <div className="rounded-md bg-green-100 p-3 text-sm text-green-700">{signupMsg}</div>
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
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              {signupErr && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{signupErr}</div>
              )}
              <div className="space-y-2">
                <label htmlFor="fullName" className="text-sm font-medium">Full Name</label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="signupEmail" className="text-sm font-medium">Work Email</label>
                <Input
                  id="signupEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="h-11"
                />
              </div>
              <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={signupBusy}>
                {signupBusy ? 'Submitting...' : (
                  <span className="flex items-center justify-center gap-2">
                    Sign Up <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {mode === 'login' ? (
              <>
                Don&apos;t have an account?{' '}
                <button type="button" className="text-primary hover:underline" onClick={() => setMode('signup')}>
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button type="button" className="text-primary hover:underline" onClick={() => setMode('login')}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
