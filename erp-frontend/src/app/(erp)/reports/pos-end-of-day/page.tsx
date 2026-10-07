'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Play } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// custom_erp.api.pos_core.end_of_day_report — the same report the POS app's
// "End of day" screen shows, for one business day and optionally one location.
interface Eod {
  business_date: string;
  location: string | null;
  currency: string;
  invoice_count: number;
  gross_sales: number;
  net_sales: number;
  tax: number;
  rounding?: number;
  outstanding_balance: number;
  returns: { count: number; total: number };
  average_bill: number;
  by_payment: { mode: string; currency: string; tendered: number; amount: number }[];
  by_location: { location: string; invoices: number; received: number }[];
  by_cashier: { cashier: string; invoices: number; total: number }[];
  top_items: { item_code: string; item_name: string; qty: number; amount: number }[];
  shifts: {
    name: string; cashier: string; pos_profile: string; location: string | null; status: string;
    opened_at: string; closed_at: string; invoice_count: number; total_sales: number;
    variance: { currency: string; variance: number }[];
  }[];
  fnb: { billed_orders: number; covers: number; average_per_cover: number; cancelled_orders: number; merged_orders: number };
  warnings: string[];
}

interface Location { code: string; name: string }

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function PosEndOfDayPage() {
  const tenantCode = useTenantCode();
  const [date, setDate] = useState(today());
  const [location, setLocation] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [eod, setEod] = useState<Eod | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    frappe.call('custom_erp.api.pos_core.list_locations').then((l) => setLocations((l as Location[]) || []), () => setLocations([]));
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setEod((await frappe.call('custom_erp.api.pos_core.end_of_day_report', { date, location: location || undefined })) as Eod);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { exception?: string; _server_messages?: string } }; message?: string };
      let msg = err.response?.data?.exception?.replace(/^[\w.]+:\s*/, '') || err.message || 'Could not run the report.';
      try {
        const m = JSON.parse(err.response?.data?._server_messages || '[]') as string[];
        if (m.length) msg = (JSON.parse(m[0]) as { message: string }).message;
      } catch { /* keep msg */ }
      setError(msg);
      setEod(null);
    } finally {
      setBusy(false);
    }
  }, [date, location]);

  useEffect(() => { run(); }, [run]);

  const money = (n: number) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: eod?.currency || 'USD' }).format(n || 0);
    } catch {
      return (n || 0).toFixed(2);
    }
  };
  const received = eod ? eod.by_payment.reduce((s, p) => s + p.amount, 0) : 0;

  return (
    <div className="space-y-4">
      <Link href={withTenant('/reports', tenantCode)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Reports
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">POS End of Day</h2>
          <p className="text-sm text-muted-foreground">Point of Sale · sales, payments, shifts and cash-up for one business day</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" className="h-9 w-40" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          {locations.length > 0 && (
            <Select value={location || '__all__'} onValueChange={(v) => setLocation(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-9 w-48 shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All locations</SelectItem>
                {locations.map((l) => <SelectItem key={l.code} value={l.code}>{l.code} · {l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={run} disabled={busy}>
            <Play className="mr-1 h-3.5 w-3.5" /> {busy ? 'Running…' : 'Run'}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {eod && (
        <>
          {eod.warnings.map((w) => (
            <div key={w} className="flex items-center gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {w}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={`Gross sales · ${eod.invoice_count} bill${eod.invoice_count === 1 ? '' : 's'}`} value={money(eod.gross_sales)} />
            <Stat label="Received" value={money(received)} />
            <Stat label="Net sales" value={money(eod.net_sales)} />
            <Stat label="Tax" value={money(eod.tax)} />
            {!!eod.rounding && <Stat label="Rounding adjustment" value={money(eod.rounding)} />}
            <Stat label="Average bill" value={money(eod.average_bill)} />
            {eod.outstanding_balance > 0 && <Stat label="Part-paid — still to collect" value={money(eod.outstanding_balance)} warn />}
            <Stat label={`Returns · ${eod.returns.count}`} value={money(eod.returns.total)} />
            {eod.fnb.billed_orders > 0 && <Stat label={`Covers · ${money(eod.fnb.average_per_cover)} each`} value={String(eod.fnb.covers)} />}
            {eod.fnb.cancelled_orders > 0 && <Stat label="Cancelled orders" value={String(eod.fnb.cancelled_orders)} />}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Table
              title="Payments"
              head={['Method', 'Currency', 'Tendered', `Value (${eod.currency})`]}
              numeric={[2, 3]}
              rows={eod.by_payment.map((p) => [p.mode, p.currency, p.tendered.toFixed(3), money(p.amount)])}
              foot={['Total', '', '', money(received)]}
            />
            <Table
              title="By location"
              head={['Location', 'Bills', 'Received']}
              numeric={[1, 2]}
              rows={eod.by_location.map((l) => [l.location || '(no location)', String(l.invoices), money(l.received)])}
            />
            <Table
              title="By cashier"
              head={['Cashier', 'Bills', 'Sales']}
              numeric={[1, 2]}
              rows={eod.by_cashier.map((c) => [c.cashier, String(c.invoices), money(c.total)])}
            />
            <Table
              title="Top items"
              head={['Item', 'Qty', 'Amount']}
              numeric={[1, 2]}
              rows={eod.top_items.map((i) => [i.item_name || i.item_code, String(i.qty), money(i.amount)])}
            />
          </div>

          <Table
            title="Shifts"
            head={['Shift', 'Cashier', 'Register', 'Location', 'Status', 'Opened', 'Closed', 'Bills', 'Sales', 'Cash variance']}
            numeric={[7, 8, 9]}
            rows={eod.shifts.map((s) => [
              s.name, s.cashier, s.pos_profile, s.location || '—', s.status,
              s.opened_at.slice(11, 16), s.closed_at ? s.closed_at.slice(11, 16) : '—',
              String(s.invoice_count), money(s.total_sales),
              s.variance.map((v) => `${v.currency} ${v.variance.toFixed(3)}`).join(', ') || '—',
            ])}
          />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-semibold tabular-nums ${warn ? 'text-warning' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Table({ title, head, rows, numeric, foot }: { title: string; head: string[]; rows: string[][]; numeric: number[]; foot?: string[] }) {
  const align = (i: number) => (numeric.includes(i) ? 'text-right tabular-nums' : 'text-left');
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {!rows.length ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing for this day.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  {head.map((h, i) => (
                    <th key={h} className={`whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${align(i)}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri} className="border-b last:border-0">
                    {r.map((c, i) => <td key={i} className={`whitespace-nowrap px-4 py-1.5 ${align(i)}`}>{c}</td>)}
                  </tr>
                ))}
                {foot && rows.length > 1 && (
                  <tr className="bg-muted/40 font-semibold">
                    {foot.map((c, i) => <td key={i} className={`whitespace-nowrap px-4 py-1.5 ${align(i)}`}>{c}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
