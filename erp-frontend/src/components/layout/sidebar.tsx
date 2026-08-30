'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  FileText,
  Settings,
  BarChart3,
  Warehouse,
  CreditCard,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useERPStore } from '@/store/erp-store';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Sales Orders', href: '/sales', icon: ShoppingCart },
  { label: 'Purchase Orders', href: '/purchase', icon: FileText },
  { label: 'Customers', href: '/customers', icon: Users },
  { label: 'Items', href: '/items', icon: Package },
  { label: 'Inventory', href: '/inventory', icon: Warehouse },
  { label: 'Accounts', href: '/accounts', icon: CreditCard },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useERPStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r bg-background transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      <div className="flex h-16 items-center justify-between border-b px-4">
        {sidebarOpen && <span className="text-lg font-bold">ERP</span>}
        <button onClick={toggleSidebar} className="rounded p-1 hover:bg-accent">
          <ChevronLeft className={cn('h-5 w-5 transition-transform', !sidebarOpen && 'rotate-180')} />
        </button>
      </div>
      <nav className="space-y-1 p-2">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
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
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
