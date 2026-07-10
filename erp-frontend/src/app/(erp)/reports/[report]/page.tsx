'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { useCompanyDefaults } from '@/hooks/use-company-defaults';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

interface ReportColumn {
  label: string;
  fieldname: string;
  fieldtype?: string;
}
type ReportRow = Record<string, unknown> | unknown[];

export default function ReportViewPage() {
  const router = useRouter();
  const params = useParams();
  const reportName = decodeURIComponent(String(params.report));
  const { company } = useCompanyDefaults();

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fiscalYear, setFiscalYear] = useState('');
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed default date range + fiscal year from the latest Fiscal Year.
  useEffect(() => {
    (async () => {
      try {
        const fy = await frappe.getList('Fiscal Year', {
          fields: JSON.stringify(['name', 'year_start_date', 'year_end_date']),
          order_by: 'year_start_date desc',
          limit_page_length: 1,
        });
        const cur = Array.isArray(fy) ? fy[0] : undefined;
        if (cur) {
          setFiscalYear(cur.name);
          setFromDate(cur.year_start_date);
          setToDate(cur.year_end_date);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const run = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    setError(null);
    try {
      const res = await frappe.runReport(reportName, {
        company,
        fiscal_year: fiscalYear,
        from_date: fromDate,
        to_date: toDate,
        periodicity: 'Yearly',
      });
      setColumns((res.columns as ReportColumn[]) || []);
      setRows((res.result as ReportRow[]) || []);
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { exception?: string } } })?.response?.data?.exception ||
        (e instanceof Error ? e.message : 'Failed to run report.');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [company, reportName, fiscalYear, fromDate, toDate]);

  // Auto-run once company + dates are ready.
  useEffect(() => {
    if (company && fromDate && toDate) run();
  }, [company, fromDate, toDate, run]);

  const cellValue = (row: ReportRow, col: ReportColumn, idx: number) => {
    const v = Array.isArray(row) ? row[idx] : (row as Record<string, unknown>)[col.fieldname];
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return String(v);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/reports')} className="rounded p-1.5 hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-2xl font-bold">{reportName}</h2>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Company</label>
            <Input value={company || ''} disabled readOnly />
          </div>
          <Button type="button" onClick={run} disabled={loading || !company}>
            {loading ? 'Running…' : 'Run'}
          </Button>
        </CardContent>
      </Card>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : columns.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No data. Adjust the filters and Run.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {columns.map((c) => (
                      <th key={c.fieldname} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} className="border-b last:border-0 hover:bg-muted/30">
                      {columns.map((c, ci) => {
                        const isNum = c.fieldtype === 'Currency' || c.fieldtype === 'Float' || c.fieldtype === 'Int';
                        return (
                          <td key={c.fieldname} className={`whitespace-nowrap px-3 py-2 ${isNum ? 'text-right tabular-nums' : ''}`}>
                            {cellValue(row, c, ci)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
