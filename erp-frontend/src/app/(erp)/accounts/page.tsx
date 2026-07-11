'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown, Folder, FileText } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { useCompanyDefaults } from '@/hooks/use-company-defaults';
import { Card, CardContent } from '@/components/ui/card';

interface Account {
  name: string;
  account_name?: string;
  parent_account?: string | null;
  is_group?: number;
  root_type?: string;
  account_type?: string;
  account_currency?: string;
}

// Color accent per accounting root type.
const ROOT_COLOR: Record<string, string> = {
  Asset: 'text-blue-600 dark:text-blue-400',
  Liability: 'text-amber-600 dark:text-amber-400',
  Equity: 'text-purple-600 dark:text-purple-400',
  Income: 'text-green-600 dark:text-green-400',
  Expense: 'text-red-600 dark:text-red-400',
};
const ROOT_BADGE: Record<string, string> = {
  Asset: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  Liability: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Equity: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  Income: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  Expense: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

export default function ChartOfAccountsPage() {
  const { company } = useCompanyDefaults();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!company) return;
    setLoading(true);
    (async () => {
      try {
        const data = await frappe.getList('Account', {
          fields: JSON.stringify([
            'name',
            'account_name',
            'parent_account',
            'is_group',
            'root_type',
            'account_type',
            'account_currency',
          ]),
          filters: JSON.stringify([['company', '=', company]]),
          order_by: 'lft asc',
          limit_page_length: 0,
        });
        setAccounts(data || []);
      } catch {
        setError('Failed to load the Chart of Accounts.');
      } finally {
        setLoading(false);
      }
    })();
  }, [company]);

  // Build parent → children map.
  const { roots, childrenOf } = useMemo(() => {
    const byParent: Record<string, Account[]> = {};
    const names = new Set(accounts.map((a) => a.name));
    const rootList: Account[] = [];
    for (const a of accounts) {
      const parent = a.parent_account && names.has(a.parent_account) ? a.parent_account : null;
      if (!parent) rootList.push(a);
      else (byParent[parent] ||= []).push(a);
    }
    return { roots: rootList, childrenOf: byParent };
  }, [accounts]);

  const toggle = (name: string) => setExpanded((e) => ({ ...e, [name]: !e[name] }));

  const renderNode = (acc: Account, depth: number, rootType?: string): React.ReactNode => {
    const kids = childrenOf[acc.name] || [];
    const isGroup = acc.is_group === 1 || kids.length > 0;
    const isOpen = expanded[acc.name] ?? depth < 1;
    const rt = acc.root_type || rootType;
    return (
      <div key={acc.name}>
        <div
          className="flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-muted/50"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          {isGroup ? (
            <button onClick={() => toggle(acc.name)} className="rounded p-0.5 hover:bg-accent">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          {isGroup ? (
            <Folder className={`h-4 w-4 ${rt ? ROOT_COLOR[rt] : 'text-muted-foreground'}`} />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
          <Link
            href={`/app/${encodeURIComponent('Account')}/${encodeURIComponent(acc.name)}`}
            className={`text-sm hover:underline ${isGroup ? 'font-medium' : ''}`}
          >
            {acc.account_name || acc.name}
          </Link>
          {acc.account_type && (
            <span className="ml-1 text-xs text-muted-foreground">· {acc.account_type}</span>
          )}
          {depth === 0 && rt && (
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${ROOT_BADGE[rt] || ''}`}>
              {rt}
            </span>
          )}
        </div>
        {isGroup && isOpen && kids.map((k) => renderNode(k, depth + 1, rt))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Chart of Accounts</h2>
        <p className="text-sm text-muted-foreground">{company || '—'}</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Root-type legend */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(ROOT_BADGE).map((rt) => (
          <span key={rt} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROOT_BADGE[rt]}`}>
            {rt}
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="p-3">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading tree…</div>
          ) : accounts.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              No accounts yet. Create a company to install the Chart of Accounts.
            </div>
          ) : (
            <div>{roots.map((r) => renderNode(r, 0))}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
