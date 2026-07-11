'use client';

import Link from 'next/link';
import {
  ShoppingCart,
  Package,
  Warehouse,
  Landmark,
  Receipt,
  FileText,
  SlidersHorizontal,
  Boxes,
  ListTree,
  Building2,
  Ruler,
  Tag,
  Users,
  Truck,
  MapPin,
  Globe,
  Coins,
  UserSquare,
  Layers,
  CreditCard,
  Building,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const dt = (d: string) => `/app/${encodeURIComponent(d)}`;
const single = (d: string) => `/app/${encodeURIComponent(d)}/${encodeURIComponent(d)}`;

interface Item {
  label: string;
  desc: string;
  href: string;
  icon: typeof ShoppingCart;
}
interface Group {
  title: string;
  accent: string; // header + icon color
  items: Item[];
}

const GROUPS: Group[] = [
  {
    title: 'Company',
    accent: 'text-slate-600 dark:text-slate-300',
    items: [
      { label: 'Company Setup', desc: 'Create the company, install defaults and country masters.', href: '/setup', icon: Building },
      { label: 'Onboarding Wizard', desc: 'Guided step-by-step workspace setup and go-live checklist.', href: '/onboarding', icon: SlidersHorizontal },
      { label: 'System Settings', desc: 'Date/number format, time zone, session, security policies.', href: single('System Settings'), icon: SlidersHorizontal },
      { label: 'Print Settings', desc: 'Letterheads, print formats and PDF output options.', href: single('Print Settings'), icon: FileText },
    ],
  },
  {
    title: 'Selling',
    accent: 'text-blue-600 dark:text-blue-400',
    items: [
      { label: 'Selling Settings', desc: 'Default customer group, territory, price list and SO behavior.', href: single('Selling Settings'), icon: ShoppingCart },
      { label: 'Price Lists', desc: 'Selling price lists used on quotations and orders.', href: dt('Price List'), icon: Receipt },
      { label: 'Customer Groups', desc: 'Classify customers for pricing and reporting.', href: dt('Customer Group'), icon: Users },
      { label: 'Territories', desc: 'Geographic segmentation for sales.', href: dt('Territory'), icon: MapPin },
      { label: 'Sales Tax Templates', desc: 'Sales taxes & charges applied on invoices.', href: dt('Sales Taxes and Charges Template'), icon: Receipt },
    ],
  },
  {
    title: 'Buying',
    accent: 'text-amber-600 dark:text-amber-400',
    items: [
      { label: 'Buying Settings', desc: 'Default supplier group, buying price list and PO behavior.', href: single('Buying Settings'), icon: Package },
      { label: 'Supplier Groups', desc: 'Classify suppliers for reporting and defaults.', href: dt('Supplier Group'), icon: Truck },
      { label: 'Purchase Tax Templates', desc: 'Purchase taxes & charges applied on bills.', href: dt('Purchase Taxes and Charges Template'), icon: Receipt },
    ],
  },
  {
    title: 'Stock',
    accent: 'text-purple-600 dark:text-purple-400',
    items: [
      { label: 'Stock Settings', desc: 'Valuation method, default warehouse, batch/serial behavior.', href: single('Stock Settings'), icon: Warehouse },
      { label: 'Warehouses', desc: 'Stock locations for the company.', href: dt('Warehouse'), icon: Warehouse },
      { label: 'Item Groups', desc: 'Item classification tree.', href: dt('Item Group'), icon: ListTree },
      { label: 'Units of Measure', desc: 'UOMs used across items and transactions.', href: dt('UOM'), icon: Ruler },
      { label: 'Brands', desc: 'Item brands.', href: dt('Brand'), icon: Tag },
      { label: 'Batches', desc: 'Batch/expiry tracking records.', href: dt('Batch'), icon: Boxes },
    ],
  },
  {
    title: 'Accounts',
    accent: 'text-green-600 dark:text-green-400',
    items: [
      { label: 'Accounts Settings', desc: 'Default accounts, posting rules and fiscal controls.', href: single('Accounts Settings'), icon: Landmark },
      { label: 'Chart of Accounts', desc: 'The account tree for the company.', href: '/accounts', icon: ListTree },
      { label: 'Cost Centers', desc: 'Cost attribution structure.', href: dt('Cost Center'), icon: Building2 },
      { label: 'Payment Terms', desc: 'Due-date schedules and credit terms.', href: dt('Payment Terms Template'), icon: FileText },
      { label: 'Modes of Payment', desc: 'Cash/bank/card payment modes.', href: dt('Mode of Payment'), icon: CreditCard },
      { label: 'Tax Categories', desc: 'Tax category grouping for rules.', href: dt('Tax Category'), icon: Receipt },
      { label: 'Asset Categories', desc: 'Fixed-asset categories and depreciation defaults.', href: dt('Asset Category'), icon: Boxes },
    ],
  },
  {
    title: 'Configuration',
    accent: 'text-cyan-600 dark:text-cyan-400',
    items: [
      { label: 'Countries', desc: 'Country master.', href: dt('Country'), icon: Globe },
      { label: 'Currencies', desc: 'Enable currencies and set symbols/decimals.', href: dt('Currency'), icon: Coins },
      { label: 'Salutations', desc: 'Contact salutations.', href: dt('Salutation'), icon: UserSquare },
      { label: 'Departments', desc: 'Organizational departments.', href: dt('Department'), icon: Layers },
    ],
  },
];

export default function SettingsWorkspace() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Everything that controls what your workspace shows and how it behaves.
        </p>
      </div>

      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <h3 className={`text-xs font-semibold uppercase tracking-wider ${group.accent}`}>{group.title}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => (
              <Link key={item.href + item.label} href={item.href}>
                <Card className="h-full transition-all hover:border-primary hover:shadow-sm">
                  <CardContent className="flex items-start gap-3 pt-5">
                    <div className="rounded-lg bg-muted p-2">
                      <item.icon className={`h-5 w-5 ${group.accent}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
