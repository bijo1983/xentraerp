'use client';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenantCode, withTenant } from '@/lib/tenant';

// href: null means Single doctype → form at /app/DocType/DocType
// href: '/route' means list doctype with a dedicated list page
const sections = [
  {
    title: 'System',
    items: [
      { label: 'System Settings', single: 'System Settings', desc: 'Global system configuration' },
      { label: 'Email Account', single: 'Email Account', desc: 'Outgoing/incoming email accounts' },
      { label: 'Email Domain', list: 'Email Domain', desc: 'Email domain settings' },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'Company', list: 'Company', desc: 'Company profile and defaults' },
      { label: 'Currency', list: 'Currency', desc: 'Supported currencies' },
      { label: 'Currency Exchange', list: 'Currency Exchange', desc: 'Exchange rates' },
      { label: 'Fiscal Year', list: 'Fiscal Year', desc: 'Accounting periods' },
    ],
  },
  {
    title: 'Users & Roles',
    items: [
      { label: 'Users', list: 'User', desc: 'User accounts' },
      { label: 'Roles', list: 'Role', desc: 'Permission roles' },
      { label: 'Role Profile', list: 'Role Profile', desc: 'Role bundles for users' },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { label: 'Accounts Settings', single: 'Accounts Settings', desc: 'Accounting defaults' },
      { label: 'Payment Terms Template', list: 'Payment Terms Template', desc: 'Payment terms' },
      { label: 'Tax Category', list: 'Tax Category', desc: 'Tax categories' },
      { label: 'Mode of Payment', list: 'Mode of Payment', desc: 'Cash, bank, card etc.' },
    ],
  },
  {
    title: 'Stock',
    items: [
      { label: 'Stock Settings', single: 'Stock Settings', desc: 'Inventory defaults' },
      { label: 'Warehouse', list: 'Warehouse', desc: 'Warehouse locations' },
      { label: 'Item Group', list: 'Item Group', desc: 'Item categories' },
      { label: 'UOM', list: 'UOM', desc: 'Units of measure' },
    ],
  },
  {
    title: 'Selling',
    items: [
      { label: 'Selling Settings', single: 'Selling Settings', desc: 'Sales defaults' },
      { label: 'Customer Group', list: 'Customer Group', desc: 'Customer categories' },
      { label: 'Territory', list: 'Territory', desc: 'Sales territories' },
      { label: 'Sales Person', list: 'Sales Person', desc: 'Sales team' },
    ],
  },
  {
    title: 'Buying',
    items: [
      { label: 'Buying Settings', single: 'Buying Settings', desc: 'Purchase defaults' },
      { label: 'Supplier Group', list: 'Supplier Group', desc: 'Supplier categories' },
      { label: 'Supplier Scorecard', list: 'Supplier Scorecard', desc: 'Supplier evaluation' },
    ],
  },
];

type SectionItem = {
  label: string;
  desc: string;
  single?: string;
  list?: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const tenantCode = useTenantCode();

  function navigate(item: SectionItem) {
    if (item.single) {
      router.push(withTenant(`/app/${encodeURIComponent(item.single)}/${encodeURIComponent(item.single)}`, tenantCode));
    } else if (item.list) {
      router.push(withTenant(`/app/${encodeURIComponent(item.list)}`, tenantCode));
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">System configuration and master data setup</p>
      </div>
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{s.title}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {s.items.map((item) => (
              <Card
                key={item.label}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => navigate(item)}
              >
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
