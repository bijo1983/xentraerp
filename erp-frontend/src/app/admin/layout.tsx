'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Boxes,
  ScrollText,
  ReceiptText,
  Landmark,
  Settings,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

const dt = (name: string) => `/admin/app/${encodeURIComponent(name)}`;
const NAV = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Tenants', href: '/admin/tenants', icon: Building2 },
  { label: 'Subscription Plans', href: dt('Xentra Subscription Plan'), icon: CreditCard },
  { label: 'Modules', href: dt('Xentra Module'), icon: Boxes },
  { label: 'Subscriptions', href: dt('Xentra Subscription'), icon: ScrollText },
  { label: 'Invoices', href: dt('Xentra Invoice'), icon: ReceiptText },
  { label: 'Receipts', href: dt('Xentra Receipt'), icon: Landmark },
  { label: 'Platform Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, checkSession, logout } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    checkSession().finally(() => setChecked(true));
  }, [checkSession]);

  useEffect(() => {
    if (checked && !user) router.replace('/login');
  }, [checked, user, router]);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-background">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <p className="text-sm font-bold leading-none">
              <span className="text-primary">Xentra</span> Admin
            </p>
            <p className="text-[10px] text-muted-foreground">SaaS Platform</p>
          </div>
        </div>
        <nav className="space-y-0.5 p-2">
          {NAV.map((item) => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
                  active && 'bg-accent text-accent-foreground'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="ml-64 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-6">
          <span className="text-sm font-semibold">SaaS Administration</span>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard" className="text-primary hover:underline">
              Go to ERP →
            </Link>
            <span className="text-muted-foreground">{user.full_name}</span>
            <button onClick={logout} className="rounded p-1.5 hover:bg-accent">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-10 sm:p-6 lg:p-8">{children}</main>
        <footer className="border-t bg-background px-6 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} XentraERP SaaS Platform
        </footer>
      </div>
    </div>
  );
}
