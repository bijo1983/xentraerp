'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Package, ChevronLeft,
  ShoppingCart, FileText, Truck, Receipt,
  ClipboardList, ShoppingBag, PackageCheck, FileMinus,
  BookOpen, CreditCard, BarChart2, Building2,
  BarChart3, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useERPStore } from '@/store/erp-store';

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
  const { sidebarOpen, toggleSidebar } = useERPStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r bg-background transition-all duration-300 flex flex-col',
        sidebarOpen ? 'w-56' : 'w-14'
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-3 shrink-0">
        {sidebarOpen && <span className="text-base font-bold tracking-tight">XentraERP</span>}
        <button onClick={toggleSidebar} className="rounded p-1 hover:bg-accent ml-auto">
          <ChevronLeft className={cn('h-4 w-4 transition-transform', !sidebarOpen && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {navGroups.map((group) => (
          <div key={group.label}>
            {sidebarOpen && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
            )}
            {!sidebarOpen && <div className="my-1 mx-2 border-t border-border" />}
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={!sidebarOpen ? item.label : undefined}
                  className={cn(
                    'flex items-center gap-2.5 mx-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent',
                    active && 'bg-accent text-accent-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
