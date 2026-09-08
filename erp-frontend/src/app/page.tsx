'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Check, ShoppingCart, Package, Users, BarChart3,
  Building2, BookOpen, ShieldCheck, Zap, Clock, Menu, X,
} from 'lucide-react';

const MODULES = [
  { icon: ShoppingCart, label: 'Sales & CRM', desc: 'Leads, quotations, orders, invoices' },
  { icon: Package, label: 'Purchase & Inventory', desc: 'Procurement, stock, warehouses' },
  { icon: BookOpen, label: 'Accounting', desc: 'Journals, payments, chart of accounts' },
  { icon: Users, label: 'HR & Payroll', desc: 'Employees, attendance, payroll runs' },
  { icon: Building2, label: 'Manufacturing', desc: 'BOMs, work orders, production' },
  { icon: BarChart3, label: 'Reports & Analytics', desc: 'Real-time dashboards & insights' },
];

const FEATURES = [
  { icon: Zap, title: 'Fast to set up', desc: 'Self-service signup with instant tenant provisioning — no IT team required.' },
  { icon: ShieldCheck, title: 'Enterprise-grade security', desc: 'Tenant isolation, role-based access, and full audit trails built in.' },
  { icon: Clock, title: '1-month free trial', desc: 'Every plan includes a full month with all modules unlocked, no card required.' },
];

const PLANS = [
  { name: 'Starter', price: '₹0', period: '/mo', desc: 'For small teams getting started', features: ['Up to 5 users', 'Core Sales & Purchase', 'Basic Reports', 'Email support'] },
  { name: 'Professional', price: '₹4,999', period: '/mo', desc: 'For growing businesses', highlighted: true, features: ['Up to 25 users', 'All ERP modules', 'Manufacturing & Projects', 'Priority support'] },
  { name: 'Enterprise', price: 'Custom', period: '', desc: 'For large organizations', features: ['Unlimited users', 'Custom modules', 'Dedicated support', 'SLA & onboarding'] },
];

export default function LandingPage() {
  const router = useRouter();
  const { user, loading, checkSession } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { checkSession(); }, [checkSession]);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav + Hero — fixed brand-navy gradient, matching the Xentra web hero reference */}
      <div className="xentra-hero relative overflow-hidden text-white">
        <header className="relative z-20">
          <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
            <span className="flex items-center gap-2 text-lg font-heading font-bold tracking-tight">
              <Image src="/brand/mark.png" alt="Xentra" width={28} height={28} className="rounded-md" />
              xentra
            </span>
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
              <a href="#modules" className="hover:text-white transition-colors">Modules</a>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            </nav>
            <div className="hidden md:flex items-center gap-3">
              <Link href="/login"><Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white">Sign In</Button></Link>
              <Link href="/signup"><Button size="sm">Get Started</Button></Link>
            </div>
            <button className="md:hidden" onClick={() => setMenuOpen((v) => !v)}>
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          {menuOpen && (
            <div className="md:hidden border-t border-white/10 px-6 py-4 space-y-3">
              <a href="#modules" className="block text-sm font-medium" onClick={() => setMenuOpen(false)}>Modules</a>
              <a href="#features" className="block text-sm font-medium" onClick={() => setMenuOpen(false)}>Features</a>
              <a href="#pricing" className="block text-sm font-medium" onClick={() => setMenuOpen(false)}>Pricing</a>
              <div className="flex gap-2 pt-2">
                <Link href="/login" className="flex-1"><Button variant="outline" size="sm" className="w-full text-foreground">Sign In</Button></Link>
                <Link href="/signup" className="flex-1"><Button size="sm" className="w-full">Get Started</Button></Link>
              </div>
            </div>
          )}
        </header>

        {/* Decorative X watermark, drawn in CSS so it stays crisp at any size */}
        <div className="pointer-events-none absolute -right-24 top-1/2 -translate-y-1/2 hidden lg:block opacity-90">
          <div className="relative h-[420px] w-[420px]">
            <div
              className="absolute inset-0 rotate-45"
              style={{ background: 'linear-gradient(135deg,#3B82F6 0%,#1D4ED8 100%)', clipPath: 'polygon(0% 42%, 42% 42%, 42% 0%, 58% 0%, 58% 42%, 100% 42%, 100% 58%, 58% 58%, 58% 100%, 42% 100%, 42% 58%, 0% 58%)' }}
            />
            <div
              className="absolute inset-0 -rotate-45"
              style={{ background: 'linear-gradient(135deg,#60A5FA 0%,#3B82F6 100%)', opacity: 0.55, clipPath: 'polygon(0% 42%, 42% 42%, 42% 0%, 58% 0%, 58% 42%, 100% 42%, 100% 58%, 58% 58%, 58% 100%, 42% 100%, 42% 58%, 0% 58%)' }}
            />
          </div>
        </div>

        <section className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            1-month free trial · all modules included
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-balance max-w-2xl">
            Enterprise.
            <br />
            Simplified.
          </h1>
          <p className="mt-6 text-lg text-white/70 max-w-xl text-balance">
            Xentra delivers a complete ERP — sales, purchase, inventory, accounting and HR — that empowers
            businesses to grow, scale and succeed.
          </p>
          <div className="mt-8 flex items-center gap-3 flex-wrap">
            <Link href="/signup">
              <Button size="lg" className="gap-2">
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                Sign In
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-white/50">No credit card required · Cancel anytime</p>
        </section>
      </div>

      {/* Modules */}
      <section id="modules" className="mx-auto max-w-6xl px-6 py-16 border-t">
        <div className="text-center mb-12">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Every module your business needs</h2>
          <p className="mt-2 text-muted-foreground">Pick what you need at signup — add more as you grow</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map((m) => (
            <div key={m.label} className="rounded-lg border p-5 hover:border-primary/50 transition-colors">
              <m.icon className="h-5 w-5 text-primary mb-3" />
              <h3 className="font-semibold text-sm">{m.label}</h3>
              <p className="text-sm text-muted-foreground mt-1">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-muted/30 border-y">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-2">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
          <p className="mt-2 text-muted-foreground">Every plan starts with a 1-month free trial</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl border p-6 flex flex-col ${p.highlighted ? 'border-primary shadow-lg shadow-primary/10 relative' : ''}`}
            >
              {p.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs font-medium px-3 py-1">
                  Most Popular
                </span>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums">{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.period}</span>
              </div>
              <ul className="mt-6 space-y-2.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-6">
                <Button className="w-full" variant={p.highlighted ? 'default' : 'outline'}>
                  Get Started
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Ready to run your business on Xentra?</h2>
          <p className="mt-3 text-muted-foreground">Set up your organization in minutes. No credit card required.</p>
          <Link href="/signup" className="inline-block mt-6">
            <Button size="lg" className="gap-2">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Xentra. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
