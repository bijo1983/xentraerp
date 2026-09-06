'use client';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const sections = [
  {
    title: 'System',
    items: [
      { label: 'System Settings', href: '/app/System%20Settings', desc: 'Global system configuration' },
      { label: 'Email Domain', href: '/app/Email%20Domain', desc: 'Email server settings' },
      { label: 'Email Account', href: '/app/Email%20Account', desc: 'Outgoing/incoming email accounts' },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'Company', href: '/app/Company', desc: 'Company profile and defaults' },
      { label: 'Currency', href: '/app/Currency', desc: 'Supported currencies' },
      { label: 'Currency Exchange', href: '/app/Currency%20Exchange', desc: 'Exchange rates' },
    ],
  },
  {
    title: 'Users & Roles',
    items: [
      { label: 'Users', href: '/app/User', desc: 'User accounts' },
      { label: 'Roles', href: '/app/Role', desc: 'Permission roles' },
      { label: 'Role Profile', href: '/app/Role%20Profile', desc: 'Role bundles for users' },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { label: 'Accounts Settings', href: '/app/Accounts%20Settings', desc: 'Accounting defaults' },
      { label: 'Payment Terms', href: '/app/Payment%20Terms%20Template', desc: 'Payment terms templates' },
      { label: 'Tax Category', href: '/app/Tax%20Category', desc: 'Tax categories' },
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">{s.title}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {s.items.map((item) => (
              <Card key={item.href} className="cursor-pointer hover:border-primary transition-colors" onClick={() => router.push(item.href)}>
                <CardHeader className="pb-2"><CardTitle className="text-base">{item.label}</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground">{item.desc}</p></CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
