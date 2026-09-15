'use client';
import { CompiledField } from '@/lib/meta-compiler';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Props {
  fields: CompiledField[];
  doc: Record<string, unknown>;
}

// Party/total/discount fields on a transaction doctype (Sales Order,
// Quotation, Sales/Purchase Invoice, Delivery Note, ...) routinely end up
// buried inside whichever tab their own Section Break happened to land in —
// "Totals"/"Currency and Price List" sections have no child table so
// consolidateTabs (dynamic-form.tsx) folds them into the trailing "More
// Details" tab. Reported directly: the customer/supplier, grand total, and
// discount aren't visible without hunting through tabs. Rather than special-
// casing which tab these belong in per doctype, surface them in one always-
// visible strip above the tab bar (same generic fieldnames.has(...) pattern
// already used for the Company/Currency defaults effect below) — visible no
// matter which tab is open, and updates live as the user fills the form in.
export function RecordSummary({ fields, doc }: Props) {
  const names = new Set(fields.map((f) => f.fieldname));
  const has = (f: string) => names.has(f);
  const raw = (f: string) => doc[f];
  const str = (f: string) => {
    const v = raw(f);
    return v === undefined || v === null || v === '' ? null : String(v);
  };
  const num = (f: string) => {
    const v = raw(f);
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };

  const currency = str('currency') || undefined;
  const items: { label: string; value: string }[] = [];

  const party =
    (has('customer_name') && str('customer_name')) ||
    (has('customer') && str('customer')) ||
    (has('supplier_name') && str('supplier_name')) ||
    (has('supplier') && str('supplier')) ||
    (has('party_name') && str('party_name')) ||
    (has('lead_name') && str('lead_name'));
  if (party) {
    const label = has('supplier_name') || has('supplier') ? 'Supplier' : has('lead_name') ? 'Lead' : has('party_name') && !has('customer') ? 'Party' : 'Customer';
    items.push({ label, value: party });
  }

  const dateField = has('transaction_date') ? 'transaction_date' : has('posting_date') ? 'posting_date' : has('delivery_date') ? 'delivery_date' : null;
  if (dateField) {
    const d = str(dateField);
    if (d) items.push({ label: 'Date', value: formatDate(d) });
  }

  const totalField = has('grand_total') ? 'grand_total' : has('rounded_total') ? 'rounded_total' : has('total') ? 'total' : null;
  if (totalField) {
    const v = num(totalField);
    if (v !== null) items.push({ label: 'Grand Total', value: formatCurrency(v, currency) });
  }

  if (has('discount_amount')) {
    const v = num('discount_amount');
    if (v) {
      const pct = has('additional_discount_percentage') ? num('additional_discount_percentage') : null;
      items.push({ label: pct ? `Discount (${pct}%)` : 'Discount', value: formatCurrency(v, currency) });
    }
  }

  if (has('outstanding_amount')) {
    const v = num('outstanding_amount');
    if (v) items.push({ label: 'Outstanding', value: formatCurrency(v, currency) });
  }

  if (has('status')) {
    const s = str('status');
    if (s) items.push({ label: 'Status', value: s });
  }

  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-b bg-muted/20 px-5 py-3">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{it.label}</span>
          <span className="text-sm font-semibold">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
