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
  Truck,
  Building2,
  MapPin,
  SlidersHorizontal,
  Globe,
  Coins,
  Tag,
  Boxes,
  Ruler,
  Layers,
  ListTree,
  Landmark,
  UserSquare,
  Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useERPStore } from '@/store/erp-store';
import { XentraLogo } from '@/components/ui/xentra-logo';

// Links to a DocType's metadata-driven screen (/app/<DocType>).
const dt = (doctype: string) => `/app/${encodeURIComponent(doctype)}`;

// Per-section color accents (header + active icon).
const SECTION_ACCENT: Record<string, string> = {
  General: 'text-slate-500 dark:text-slate-400',
  Sales: 'text-blue-600 dark:text-blue-400',
  Purchase: 'text-amber-600 dark:text-amber-400',
  Accounts: 'text-green-600 dark:text-green-400',
  Masters: 'text-purple-600 dark:text-purple-400',
  Configuration: 'text-cyan-600 dark:text-cyan-400',
  Reports: 'text-pink-600 dark:text-pink-400',
  Logistics: 'text-indigo-600 dark:text-indigo-400',
  Settings: 'text-teal-600 dark:text-teal-400',
  System: 'text-slate-500 dark:text-slate-400',
};

const navSections = [
  {
    title: 'General',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Leads', href: dt('Lead'), icon: Users },
      { label: 'Opportunities', href: dt('Opportunity'), icon: BarChart3 },
      { label: 'Quotations', href: dt('Quotation'), icon: FileText },
      { label: 'Sales Orders', href: dt('Sales Order'), icon: ShoppingCart },
      { label: 'Delivery Notes', href: dt('Delivery Note'), icon: Truck },
      { label: 'Sales Invoices', href: dt('Sales Invoice'), icon: CreditCard },
    ],
  },
  {
    title: 'Purchase',
    items: [
      { label: 'Material Requests', href: dt('Material Request'), icon: FileText },
      { label: 'Purchase Orders', href: dt('Purchase Order'), icon: ShoppingCart },
      { label: 'Purchase Receipts', href: dt('Purchase Receipt'), icon: Package },
      { label: 'Purchase Invoices', href: dt('Purchase Invoice'), icon: CreditCard },
    ],
  },
  {
    title: 'Accounts',
    items: [
      { label: 'Journal Entries', href: dt('Journal Entry'), icon: FileText },
      { label: 'Payments', href: dt('Payment Entry'), icon: CreditCard },
      { label: 'Chart of Accounts', href: '/accounts', icon: ListTree },
      { label: 'Cost Centers', href: dt('Cost Center'), icon: Building2 },
    ],
  },
  {
    title: 'Masters',
    items: [
      { label: 'Customers', href: dt('Customer'), icon: Users },
      { label: 'Suppliers', href: dt('Supplier'), icon: Truck },
      { label: 'Items', href: dt('Item'), icon: Package },
      { label: 'Item Groups', href: dt('Item Group'), icon: ListTree },
      { label: 'Brands', href: dt('Brand'), icon: Tag },
      { label: 'Batches', href: dt('Batch'), icon: Boxes },
      { label: 'Warehouses', href: dt('Warehouse'), icon: Warehouse },
      { label: 'Price Lists', href: dt('Price List'), icon: Receipt },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Countries', href: dt('Country'), icon: Globe },
      { label: 'Currencies', href: dt('Currency'), icon: Coins },
      { label: 'UOM', href: dt('UOM'), icon: Ruler },
      { label: 'Salutations', href: dt('Salutation'), icon: UserSquare },
      { label: 'Departments', href: dt('Department'), icon: Layers },
      { label: 'Modes of Payment', href: dt('Mode of Payment'), icon: Landmark },
      { label: 'Payment Terms', href: dt('Payment Terms Template'), icon: FileText },
      { label: 'Tax Categories', href: dt('Tax Category'), icon: Receipt },
      { label: 'Territories', href: dt('Territory'), icon: MapPin },
      { label: 'Customer Groups', href: dt('Customer Group'), icon: Users },
      { label: 'Supplier Groups', href: dt('Supplier Group'), icon: Truck },
    ],
  },
  {
    title: 'Reports',
    items: [{ label: 'Financial Reports', href: '/reports', icon: BarChart3 }],
  },
  {
    title: 'Logistics',
    items: [
      { label: 'Overview', href: '/logistics', icon: Truck },
      { label: 'Shipments', href: '/logistics/shipments', icon: Package },
      { label: 'Carriers', href: '/logistics/carriers', icon: Truck },
      { label: 'Shipping Zones', href: '/logistics/zones', icon: MapPin },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Company Setup', href: '/setup', icon: SlidersHorizontal },
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
        'fixed left-0 top-0 z-40 h-screen border-r bg-background transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      <div className="flex h-16 items-center justify-between border-b px-3">
        {sidebarOpen ? (
          <XentraLogo size="sm" />
        ) : (
          <XentraLogo size="sm" showText={false} />
        )}
        <button onClick={toggleSidebar} className="rounded p-1 hover:bg-accent">
          <ChevronLeft className={cn('h-5 w-5 transition-transform', !sidebarOpen && 'rotate-180')} />
        </button>
      </div>
      <nav className="overflow-y-auto p-2" style={{ height: 'calc(100vh - 4rem)' }}>
        {navSections.map((section) => {
          const accent = SECTION_ACCENT[section.title] || 'text-muted-foreground';
          return (
            <div key={section.title} className="mb-3">
              {sidebarOpen && (
                <p className={cn('mb-1 px-3 pt-2 text-xs font-semibold uppercase tracking-wider', accent)}>
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  // Exact match or a sub-path (href + '/…'), so /app/Item
                  // doesn't also light up /app/Item Group.
                  const active =
                    item.href === '/logistics'
                      ? pathname === '/logistics'
                      : pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
                        active && 'bg-accent text-accent-foreground'
                      )}
                    >
                      <item.icon className={cn('h-5 w-5 shrink-0', active ? accent : 'text-muted-foreground')} />
                      {sidebarOpen && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
