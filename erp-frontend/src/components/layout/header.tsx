'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut, User, Search, Plus } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { XentraLogo } from '@/components/ui/xentra-logo';
import { CommandPalette } from './command-palette';

const dt = (name: string) => `/app/${encodeURIComponent(name)}`;
const QUICK_CREATE = [
  { label: 'Sales Order', href: `${dt('Sales Order')}/new` },
  { label: 'Purchase Order', href: `${dt('Purchase Order')}/new` },
  { label: 'Customer', href: `${dt('Customer')}/new` },
  { label: 'Supplier', href: `${dt('Supplier')}/new` },
  { label: 'Item', href: `${dt('Item')}/new` },
  { label: 'Payment', href: `${dt('Payment Entry')}/new` },
];

export function Header() {
  const { user, logout } = useAuthStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Global ⌘K / Ctrl+K shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-6">
      <XentraLogo size="sm" />

      {/* Command / search trigger */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="mx-6 hidden max-w-md flex-1 items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground hover:bg-muted md:flex"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      <div className="flex items-center gap-3">
        {/* Quick create */}
        <div className="relative">
          <Button size="sm" onClick={() => setCreateOpen((o) => !o)} onBlur={() => setTimeout(() => setCreateOpen(false), 150)}>
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
          {createOpen && (
            <div className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-md border bg-popover shadow-lg">
              {QUICK_CREATE.map((q) => (
                <Link
                  key={q.href}
                  href={q.href}
                  className="block px-3 py-2 text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  New {q.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {user && (
          <>
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <User className="h-4 w-4" />
              <span>{user.full_name}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
