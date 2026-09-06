'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Package, Settings, CreditCard,
  BarChart3, Shield, Bell, Building2, ChevronLeft, LogOut,
  Layers, FileText, Zap, Globe, Server, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { frappe } from '@/lib/frappe';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Tenants',
    items: [
      { label: 'All Tenants', href: '/admin/tenants', icon: Building2 },
      { label: 'Provisioning', href: '/admin/provisioning', icon: Server },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { label: 'Plans', href: '/admin/plans', icon: Layers },
      { label: 'Modules', href: '/admin/modules', icon: Package },
      { label: 'Features', href: '/admin/features', icon: Zap },
      { label: 'Reports', href: '/admin/reports', icon: FileText },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Subscriptions', href: '/admin/subscriptions', icon: CreditCard },
      { label: 'Billing', href: '/admin/billing', icon: BarChart3 },
      { label: 'Coupons', href: '/admin/coupons', icon: Globe },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users },
      { label: 'Audit Logs', href: '/admin/audit', icon: Shield },
      { label: 'Notifications', href: '/admin/notifications', icon: Bell },
      { label: 'Health', href: '/admin/health', icon: Activity },
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);

  async function handleLogout() {
    await frappe.logout();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r bg-background flex flex-col transition-all duration-300',
        open ? 'w-56' : 'w-14'
      )}>
        <div className="flex h-14 items-center justify-between border-b px-3 shrink-0">
          {open && (
            <div>
              <span className="text-sm font-bold">Xentra</span>
              <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded">Admin</span>
            </div>
          )}
          <button onClick={() => setOpen(!open)} className="rounded p-1 hover:bg-accent ml-auto">
            <ChevronLeft className={cn('h-4 w-4 transition-transform', !open && 'rotate-180')} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {navGroups.map((group) => (
            <div key={group.label}>
              {open && (
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {group.label}
                </p>
              )}
              {!open && <div className="my-1 mx-2 border-t border-border" />}
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={!open ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-2.5 mx-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent',
                      active && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {open && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t p-2 shrink-0">
          <Link
            href="/"
            title={!open ? 'ERP Portal' : undefined}
            className="flex items-center gap-2.5 mx-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent mb-1"
          >
            <Building2 className="h-4 w-4 shrink-0" />
            {open && <span>ERP Portal</span>}
          </Link>
          <button
            onClick={handleLogout}
            title={!open ? 'Sign Out' : undefined}
            className="w-full flex items-center gap-2.5 mx-0 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {open && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={cn('flex-1 transition-all duration-300', open ? 'ml-56' : 'ml-14')}>
        <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-background px-6 gap-4">
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">Platform Administration</span>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
