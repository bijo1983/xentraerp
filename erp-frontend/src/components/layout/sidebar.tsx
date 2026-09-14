'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Package, ChevronLeft,
  ShoppingCart, FileText, Truck, Receipt,
  ClipboardList, ShoppingBag, PackageCheck, FileMinus,
  BookOpen, CreditCard, BarChart2, Building2,
  BarChart3, Settings, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useERPStore } from '@/store/erp-store';
import { useTenantCode, withTenant } from '@/lib/tenant';

const navGroups = [
  {
    label: 'General',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Leads', href: '/leads', icon: Users },
      { label: 'Opportunities', href: '/opportunities', icon: BarChart2 },
      { label: 'Quotations', href: '/quotations', icon: FileText },
      { label: 'Sales Orders', href: '/sales', icon: ShoppingCart },
      { label: 'Delivery Notes', href: '/delivery-notes', icon: Truck },
      { label: 'Sales Invoices', href: '/sales-invoices', icon: Receipt },
    ],
  },
  {
    label: 'Purchase',
    items: [
      { label: 'Material Requests', href: '/material-requests', icon: ClipboardList },
      { label: 'Purchase Orders', href: '/purchase', icon: ShoppingBag },
      { label: 'Purchase Receipts', href: '/purchase-receipts', icon: PackageCheck },
      { label: 'Purchase Invoices', href: '/purchase-invoices', icon: FileMinus },
    ],
  },
  {
    label: 'Accounts',
    items: [
      { label: 'Journal Entries', href: '/journal-entries', icon: BookOpen },
      { label: 'Payments', href: '/payments', icon: CreditCard },
      { label: 'Chart of Accounts', href: '/chart-of-accounts', icon: BarChart2 },
      { label: 'Cost Centers', href: '/cost-centers', icon: Building2 },
    ],
  },
  {
    label: 'Masters',
    items: [
      { label: 'Customers', href: '/customers', icon: Users },
      { label: 'Suppliers', href: '/suppliers', icon: Building2 },
      { label: 'Items', href: '/items', icon: Package },
      { label: 'Inventory', href: '/inventory', icon: Package },
    ],
  },
  {
    label: 'Other',
    items: [
      { label: 'Reports', href: '/reports', icon: BarChart3 },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const tenantCode = useTenantCode();
  const { sidebarOpen, toggleSidebar } = useERPStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-smooth transition-[width] duration-200 flex flex-col',
        sidebarOpen ? 'w-56' : 'w-14'
      )}
    >
      <div className="flex h-14 items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Image src="/brand/mark.png" alt="XentraERP" width={22} height={22} className="rounded-md shrink-0" />
          {sidebarOpen && <span className="text-sm font-semibold tracking-tight truncate">XentraERP</span>}
        </div>
        <button
          onClick={toggleSidebar}
          className="ml-auto rounded-md p-1 text-muted-foreground transition-smooth transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronLeft className={cn('h-3.5 w-3.5 transition-transform duration-200', !sidebarOpen && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-1.5 py-1 space-y-0.5">
        {navGroups.map((group) => (
          <div key={group.label}>
            {sidebarOpen && (
              <p className="px-2.5 pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80 first:pt-2">
                {group.label}
              </p>
            )}
            {!sidebarOpen && <div className="my-1.5 mx-2 border-t border-sidebar-border" />}
            {group.items.map((item) => {
              const href = withTenant(item.href, tenantCode);
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={item.href}
                  href={href}
                  title={!sidebarOpen ? item.label : undefined}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-smooth transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                  )}
                  <item.icon className={cn('h-[15px] w-[15px] shrink-0', active && 'text-primary')} />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Only the platform admin's own sandbox/default context can jump back
          to platform administration — real tenants don't get this link. */}
      {(!tenantCode || tenantCode === 'sandbox') && (
        <div className="border-t border-sidebar-border p-1.5 shrink-0">
          <Link
            href="/admin"
            title={!sidebarOpen ? 'Admin Portal' : undefined}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-smooth transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Shield className="h-[15px] w-[15px] shrink-0" />
            {sidebarOpen && <span>Admin Portal</span>}
          </Link>
        </div>
      )}
    </aside>
  );
}
