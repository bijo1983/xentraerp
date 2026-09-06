'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface HealthCheck {
  label: string;
  status: 'ok' | 'fail' | 'checking';
  detail?: string;
}

export default function HealthPage() {
  const [checks, setChecks] = useState<HealthCheck[]>([
    { label: 'Frappe Backend', status: 'checking' },
    { label: 'Session Authentication', status: 'checking' },
  ]);

  useEffect(() => {
    async function run() {
      try {
        const res = await fetch('/api/method/frappe.auth.get_logged_user');
        setChecks((c) => c.map((chk) =>
          chk.label === 'Frappe Backend'
            ? { ...chk, status: res.ok ? 'ok' : 'fail', detail: `HTTP ${res.status}` }
            : chk
        ));
        const data = await res.json().catch(() => null);
        setChecks((c) => c.map((chk) =>
          chk.label === 'Session Authentication'
            ? { ...chk, status: data?.message && data.message !== 'Guest' ? 'ok' : 'fail', detail: data?.message || 'No session' }
            : chk
        ));
      } catch {
        setChecks((c) => c.map((chk) => ({ ...chk, status: 'fail', detail: 'Request failed' })));
      }
    }
    run();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">System Health</h1>
        <p className="text-sm text-muted-foreground">Live connectivity checks</p>
      </div>
      <div className="rounded-lg border bg-background divide-y">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="font-medium text-sm">{c.label}</div>
              {c.detail && <div className="text-xs text-muted-foreground mt-0.5">{c.detail}</div>}
            </div>
            {c.status === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {c.status === 'ok' && <CheckCircle className="h-4 w-4 text-green-600" />}
            {c.status === 'fail' && <XCircle className="h-4 w-4 text-red-600" />}
          </div>
        ))}
      </div>
    </div>
  );
}
