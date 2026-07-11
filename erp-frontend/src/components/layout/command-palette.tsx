'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';

interface Command {
  label: string;
  href: string;
  group: string;
  keywords?: string;
}

const dt = (name: string) => `/app/${encodeURIComponent(name)}`;

// Navigable destinations for the ⌘K palette.
const COMMANDS: Command[] = [
  { label: 'Dashboard', href: '/dashboard', group: 'Go to' },
  { label: 'Reports', href: '/reports', group: 'Go to' },
  { label: 'Company Setup', href: '/setup', group: 'Go to' },
  { label: 'Onboarding', href: '/onboarding', group: 'Go to' },
  // Lists
  { label: 'Leads', href: dt('Lead'), group: 'Sales' },
  { label: 'Opportunities', href: dt('Opportunity'), group: 'Sales' },
  { label: 'Quotations', href: dt('Quotation'), group: 'Sales' },
  { label: 'Sales Orders', href: dt('Sales Order'), group: 'Sales' },
  { label: 'Delivery Notes', href: dt('Delivery Note'), group: 'Sales' },
  { label: 'Sales Invoices', href: dt('Sales Invoice'), group: 'Sales' },
  { label: 'Material Requests', href: dt('Material Request'), group: 'Purchase' },
  { label: 'Purchase Orders', href: dt('Purchase Order'), group: 'Purchase' },
  { label: 'Purchase Receipts', href: dt('Purchase Receipt'), group: 'Purchase' },
  { label: 'Purchase Invoices', href: dt('Purchase Invoice'), group: 'Purchase' },
  { label: 'Journal Entries', href: dt('Journal Entry'), group: 'Accounts' },
  { label: 'Payments', href: dt('Payment Entry'), group: 'Accounts' },
  { label: 'Chart of Accounts', href: dt('Account'), group: 'Accounts' },
  { label: 'Customers', href: dt('Customer'), group: 'Masters' },
  { label: 'Suppliers', href: dt('Supplier'), group: 'Masters' },
  { label: 'Items', href: dt('Item'), group: 'Masters' },
  { label: 'Warehouses', href: dt('Warehouse'), group: 'Masters' },
  // Quick creates
  { label: 'New Sales Order', href: `${dt('Sales Order')}/new`, group: 'Create', keywords: 'add so' },
  { label: 'New Purchase Order', href: `${dt('Purchase Order')}/new`, group: 'Create', keywords: 'add po' },
  { label: 'New Customer', href: `${dt('Customer')}/new`, group: 'Create', keywords: 'add' },
  { label: 'New Item', href: `${dt('Item')}/new`, group: 'Create', keywords: 'add' },
  { label: 'New Payment', href: `${dt('Payment Entry')}/new`, group: 'Create', keywords: 'add receipt' },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q) || c.keywords?.includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) go(results[active].href);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or jump to…"
            className="h-12 w-full bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-auto py-2">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No matches.</p>
          )}
          {results.map((c, i) => (
            <button
              key={c.href + c.label}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(c.href)}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                i === active ? 'bg-accent' : ''
              }`}
            >
              <span>
                <span className="text-xs text-muted-foreground">{c.group}</span>
                <span className="ml-2">{c.label}</span>
              </span>
              {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
