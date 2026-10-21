'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Check, ShoppingCart, Package, Users, BarChart3, Building2, BookOpen, ShieldCheck, Zap, Clock, Menu, X,
  Store, Truck, Handshake, ChefHat, QrCode, ScanBarcode,
} from 'lucide-react';

// "Book a demo" opens the visitor's mail app with a prefilled request to the sales inbox.
const DEMO_EMAIL = 'info@innovegicit.com';
const demoHref = (product: string) =>
  `mailto:${DEMO_EMAIL}?subject=${encodeURIComponent(`${product} demo request`)}&body=${encodeURIComponent(
    `Hello XentraERP team,\n\nI would like a demo of ${product}.\n\nName:\nCompany:\nIndustry:\nCountry:\nPhone:\n`,
  )}`;
const POS_URL = 'https://pos.xentraerp.net';

// Every module, POS included as an equal card that links to its own site.
const MODULES = [
  { icon: BookOpen, label: 'Accounting', desc: 'Journals, payments, chart of accounts' },
  { icon: Package, label: 'Inventory', desc: 'Stock, warehouses, valuation, reorder levels' },
  { icon: Truck, label: 'Purchasing', desc: 'Requests, purchase orders, receipts, supplier bills' },
  { icon: Handshake, label: 'Sales & CRM', desc: 'Leads, quotations, orders, invoices' },
  { icon: Users, label: 'HR & Payroll', desc: 'Employees, attendance, payroll runs' },
  { icon: Building2, label: 'Manufacturing', desc: 'BOMs, work orders, production' },
  { icon: BarChart3, label: 'Reports & Analytics', desc: 'Real-time dashboards & insights' },
  { icon: Store, label: 'XentraERP POS', desc: 'Restaurant & retail point of sale, integrated with accounting, inventory and purchasing', href: POS_URL, tag: 'Restaurant & Retail' },
];

const POS_FEATURES = [
  'Restaurant and retail point of sale',
  'Table management and split billing',
  'Digital and printed KOT, kitchen display',
  'QR ordering at the table',
  'Barcode billing, promotions and loyalty',
  'Returns and exchanges',
  'Multi-currency and multi-branch',
  'Posts live to accounting, inventory and purchasing',
];

const FEATURES = [
  { icon: Zap, title: 'Fast to set up', desc: 'Self-service signup with instant tenant provisioning — no IT team required.' },
  { icon: ShieldCheck, title: 'Enterprise-grade security', desc: 'Tenant isolation, role-based access, and full audit trails built in.' },
  { icon: Clock, title: '1-month free trial', desc: 'Every plan includes a full month with all modules unlocked, no card required.' },
];

// Prices in USD, matching the plans in the admin portal (XentraERP Plan); POS Starter is the
// point-of-sale bundle (POS + Accounting + Inventory).
const PLANS = [
  { name: 'Starter', price: '$25', desc: 'Core accounting, sales, purchasing and stock', features: ['Accounting', 'Sales & CRM', 'Purchasing', 'Inventory', 'Essential reports', 'Unlimited users'] },
  { name: 'POS Starter', price: '$29', desc: 'Point of sale with its back office', badge: 'For restaurants & retail', features: ['XentraERP POS, restaurant & retail', 'Accounting', 'Inventory', 'Kitchen display and KOT', 'Unlimited users'] },
  { name: 'Growth', price: '$49', desc: 'Everything in Starter, plus POS', highlighted: true, features: ['Everything in Starter', 'XentraERP POS', 'Full analytics', 'Website, projects and documents', 'Unlimited users'] },
  { name: 'Professional', price: '$89', desc: 'For growing organizations', features: ['Everything in Growth', 'HR & Payroll', 'Assets and budgets', 'Support, maintenance, contracts', 'Vendor portal'] },
  { name: 'Enterprise', price: '$150', desc: 'Every module and every report', features: ['Everything in Professional', 'Manufacturing', 'Quality and tenders', 'Learning (LMS)', 'Unlimited users'] },
];

export default function LandingPage() {
  const router = useRouter();
  const { user, loading, checkSession } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { checkSession(); }, [checkSession]);

  useEffect(() => {
    if (loading || !user) return;
    if (user.roles?.includes('System Manager')) {
      router.replace('/admin');
      return;
    }
    // Non-admin sessions always belong to a tenant — never land on bare
    // /dashboard. Fall back to /sandbox/dashboard only if no tenant
    // context cookie is present (shouldn't happen via the normal login flow).
    const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )xentra_tenant=([^;]*)/) : null;
    const tenant = match ? decodeURIComponent(match[1]) : 'sandbox';
    router.replace(`/${tenant || 'sandbox'}/dashboard`);
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav + Hero — fixed brand-navy gradient, matching the Xentra web hero reference */}
      <div className="xentra-hero relative overflow-hidden text-white">
        <header className="relative z-20">
          <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
            <span className="flex items-center gap-2 text-lg font-heading font-bold tracking-tight">
              <Image src="/brand/mark.png" alt="XentraERP" width={28} height={28} className="rounded-md" />
              Xentra<span className="text-primary">ERP</span>
            </span>
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
              <a href="#modules" className="hover:text-white transition-colors">Modules</a>
              <a href="#pos" className="hover:text-white transition-colors">POS</a>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            </nav>
            <div className="hidden md:flex items-center gap-3">
              <Link href="/login"><Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white">Sign In</Button></Link>
              <Link href="/signup"><Button size="sm">Get Started</Button></Link>
            </div>
            <button
              className="md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          {menuOpen && (
            <div className="md:hidden border-t border-white/10 px-6 py-4 space-y-3">
              <a href="#modules" className="block text-sm font-medium" onClick={() => setMenuOpen(false)}>Modules</a>
              <a href="#pos" className="block text-sm font-medium" onClick={() => setMenuOpen(false)}>POS</a>
              <a href="#features" className="block text-sm font-medium" onClick={() => setMenuOpen(false)}>Features</a>
              <a href="#pricing" className="block text-sm font-medium" onClick={() => setMenuOpen(false)}>Pricing</a>
              <div className="flex gap-2 pt-2">
                <Link href="/login" className="flex-1"><Button variant="outline" size="sm" className="w-full text-foreground">Sign In</Button></Link>
                <Link href="/signup" className="flex-1"><Button size="sm" className="w-full">Get Started</Button></Link>
              </div>
            </div>
          )}
        </header>

        <section className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-24 grid lg:grid-cols-[1fr_minmax(0,460px)] gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              The XentraERP business platform
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-balance max-w-2xl">
              One platform.
              <br />
              Every business process.
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-xl text-balance">
              Accounting, inventory, purchasing, CRM, HR, manufacturing and point of sale on one live ledger — from
              your first branch to your fiftieth.
            </p>
            <div className="mt-8 flex items-center gap-3 flex-wrap">
              <Link href="/signup">
                <Button size="lg" className="gap-2">
                  Start Free Trial <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href={demoHref('XentraERP')}>
                <Button size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  Book a Demo
                </Button>
              </a>
            </div>
            <p className="mt-4 text-xs text-white/50">1-month free trial · No credit card required · Prices in USD</p>
          </div>

          {/* The platform: modules around one shared ledger (POS is one of them, not the centre) */}
          <div className="hidden lg:grid grid-cols-3 gap-3" aria-hidden="true">
            {MODULES.slice(0, 4).map((m) => <ModuleTile key={m.label} icon={m.icon} label={m.label} accent={!!m.href} />)}
            <div className="row-start-2 col-start-2 rounded-2xl border border-white/25 bg-white/15 backdrop-blur-md p-4 flex flex-col items-center justify-center text-center shadow-[0_0_0_8px_rgba(23,118,255,0.12),0_24px_48px_-20px_rgba(23,118,255,0.7)]">
              <Image src="/brand/mark.png" alt="" width={36} height={36} className="rounded-lg" />
              <span className="mt-2 font-heading font-bold">XentraERP</span>
              <span className="text-[11px] text-white/70">One live ledger</span>
            </div>
            {MODULES.slice(4).map((m) => <ModuleTile key={m.label} icon={m.icon} label={m.label} accent={!!m.href} />)}
          </div>
        </section>
      </div>

      {/* Modules */}
      <section id="modules" className="mx-auto max-w-6xl px-6 py-16 border-t">
        <div className="text-center mb-12">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Every module, one source of truth</h2>
          <p className="mt-2 text-muted-foreground">Start with the modules you need — add more as you grow</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULES.map((m) => {
            const card = (
              <>
                <m.icon className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold text-sm">{m.label}</h3>
                <p className="text-sm text-muted-foreground mt-1">{m.desc}</p>
                {m.tag && <span className="mt-3 inline-block rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">{m.tag}</span>}
              </>
            );
            const cls = 'block rounded-lg border p-5 hover:border-primary/50 hover:-translate-y-0.5 transition-all';
            return m.href
              ? <a key={m.label} href={m.href} className={cls}>{card}</a>
              : <div key={m.label} className={cls}>{card}</div>;
          })}
        </div>
      </section>

      {/* POS spotlight */}
      <section id="pos" className="xentra-hero text-white">
        <div className="mx-auto max-w-6xl px-6 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">XentraERP POS</p>
            <h2 className="mt-2 font-heading text-2xl sm:text-3xl font-bold tracking-tight text-balance">
              The front of house for your business
            </h2>
            <p className="mt-3 text-white/70 text-balance">
              Restaurant and retail point of sale, fully integrated with XentraERP Accounting, Inventory, Purchasing
              and Reporting. Every sale lands in your ledger as it happens.
            </p>
            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <a href={POS_URL}>
                <Button size="lg" className="gap-2">Explore XentraERP POS <ArrowRight className="h-4 w-4" /></Button>
              </a>
              <a href={demoHref('XentraERP POS')}>
                <Button size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  Book a POS Demo
                </Button>
              </a>
            </div>
          </div>
          <ul className="grid sm:grid-cols-2 gap-3">
            {POS_FEATURES.map((f, i) => {
              const Icon = [Store, ChefHat, ChefHat, QrCode, ScanBarcode, ShoppingCart, Building2, BookOpen][i];
              return (
                <li key={f} className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/5 p-3 text-sm">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-sky-300" />
                  <span>{f}</span>
                </li>
              );
            })}
          </ul>
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
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-16 scroll-mt-4">
        <div className="text-center mb-12">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
          <p className="mt-2 text-muted-foreground">Every plan starts with a 1-month free trial · Prices in USD per month</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-xl border p-6 flex flex-col ${p.highlighted ? 'border-primary shadow-lg shadow-primary/10' : ''}`}
            >
              {(p.highlighted || p.badge) && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full text-xs font-medium px-3 py-1 ${p.highlighted ? 'bg-primary text-primary-foreground' : 'bg-teal-500 text-white'}`}>
                  {p.highlighted ? 'Most Popular' : p.badge}
                </span>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums">{p.price}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
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
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Annual billing: pay for 10 months, use 12. Need something else?{' '}
          <a href={`mailto:${DEMO_EMAIL}?subject=${encodeURIComponent('XentraERP custom plan')}`} className="text-primary font-medium hover:underline">Customize your plan</a> and pay per module.
        </p>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Run your business on XentraERP</h2>
          <p className="mt-3 text-muted-foreground">Start free for a month, or book a guided demo with our team.</p>
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/signup">
              <Button size="lg" className="gap-2">
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href={demoHref('XentraERP')}>
              <Button size="lg" variant="outline">Book a Demo</Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} XentraERP. All rights reserved.</span>
          <div className="flex flex-wrap justify-center gap-6">
            <a href={POS_URL} className="hover:text-foreground transition-colors">XentraERP POS</a>
            <a href={`mailto:${DEMO_EMAIL}`} className="hover:text-foreground transition-colors">{DEMO_EMAIL}</a>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ModuleTile({ icon: Icon, label, accent }: { icon: typeof Store; label: string; accent: boolean }) {
  return (
    <div className={`rounded-2xl border backdrop-blur-md p-4 flex flex-col items-center justify-center gap-2 text-center text-xs font-medium ${accent ? 'border-teal-300/60 bg-teal-400/10' : 'border-white/15 bg-white/5'}`}>
      <Icon className={`h-5 w-5 ${accent ? 'text-teal-300' : 'text-sky-300'}`} />
      {label}
    </div>
  );
}
