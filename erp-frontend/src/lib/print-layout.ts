// Print layout model + Jinja generator.
//
// A "layout" is a small JSON description of what a printed document should
// look like: which header fields show up and where (left / right / full
// width) and in what order, which item-table columns appear (order, label,
// alignment, width), which total rows, plus header/footer behaviour. It is
// compiled to the Jinja `html` of a REAL Frappe Print Format, so Frappe's own
// PDF engine renders it and the format is usable from anywhere a print format
// is. The layout itself is stored inside that html as a Jinja comment, which
// is how "Customize" re-opens a saved template for editing instead of only
// being able to create new ones.
//
// Deliberately dependency-free (no React / no app imports) so the generator
// can be exercised outside the browser.

export type Align = 'left' | 'center' | 'right';
export type Column = 'left' | 'right' | 'full';
export type PartMode = 'global' | 'custom' | 'none';

export interface DetailField {
  fieldname: string;
  label: string;
  column: Column;
}

export interface ItemColumn {
  fieldname: string;
  label: string;
  align: Align;
  /** Column width in percent of the table, or null for automatic. */
  width: number | null;
}

export interface TotalRow {
  key: string;
  label: string;
}

export interface PrintLayout {
  version: 1;
  itemsFieldname: string | null;
  showTitle: boolean;
  header: { mode: PartMode; html: string; repeat: boolean };
  footer: { mode: PartMode; html: string; pageNumbers: boolean };
  details: DetailField[];
  columns: ItemColumn[];
  totals: TotalRow[];
  showInWords: boolean;
  showTerms: boolean;
  /** Base font size in pt. */
  fontSize: number;
}

/** Minimal shape of a doctype field the layout defaults are derived from. */
export interface FieldInfo {
  fieldname: string;
  label: string;
  component: string;
  options?: string;
  in_list_view?: boolean;
  reqd?: boolean;
}

export const SYSTEM_FIELDNAMES = new Set([
  'name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx',
  'parent', 'parentfield', 'parenttype', 'naming_series', 'amended_from',
]);

// Component kinds that hold a single printable value.
export const PRINTABLE_COMPONENTS = new Set([
  'text', 'number', 'date', 'datetime', 'check', 'select', 'link', 'readonly', 'textarea',
]);

// Totals rows a document can show. `taxes` expands to one row per tax line.
export const TOTAL_CHOICES: Array<{ key: string; label: string }> = [
  { key: 'total', label: 'Total' },
  { key: 'net_total', label: 'Net Total' },
  { key: 'discount_amount', label: 'Discount' },
  { key: 'taxes', label: 'Taxes and Charges' },
  { key: 'total_taxes_and_charges', label: 'Total Taxes and Charges' },
  { key: 'grand_total', label: 'Grand Total' },
  { key: 'rounded_total', label: 'Rounded Total' },
  { key: 'paid_amount', label: 'Paid Amount' },
  { key: 'outstanding_amount', label: 'Outstanding' },
];
// Rows that would print a pointless "0.00" — only shown when non-zero.
const HIDE_WHEN_ZERO = new Set(['discount_amount', 'outstanding_amount', 'paid_amount', 'total_taxes_and_charges']);
const BOLD_TOTALS = new Set(['grand_total', 'rounded_total']);

const ITEM_DEFAULT_ORDER = ['idx', 'item_name', 'item_code', 'description', 'qty', 'uom', 'rate', 'amount'];
const ITEM_DEFAULT_ON = new Set(['idx', 'item_name', 'qty', 'uom', 'rate', 'amount']);
const NUMERIC_COLUMNS = new Set(['qty', 'rate', 'amount', 'base_rate', 'base_amount', 'net_rate', 'net_amount', 'discount_amount']);

// Header fields shown by default, in order, with the side they sit on.
const DETAIL_DEFAULTS: Array<[string, Column]> = [
  ['company', 'left'],
  ['customer_name', 'left'],
  ['supplier_name', 'left'],
  ['party_name', 'left'],
  ['lead_name', 'left'],
  ['transaction_date', 'right'],
  ['posting_date', 'right'],
  ['delivery_date', 'right'],
  ['due_date', 'right'],
  ['status', 'right'],
];

const SAFE_FIELDNAME = /^[A-Za-z0-9_]+$/;

export function isPrintable(f: FieldInfo): boolean {
  return PRINTABLE_COMPONENTS.has(f.component) && !SYSTEM_FIELDNAMES.has(f.fieldname);
}

/** Layout matching what the app's built-in template used to render. */
export function defaultLayout(fields: FieldInfo[], itemsField: FieldInfo | null, itemFields: FieldInfo[]): PrintLayout {
  const byName = new Map(fields.map((f) => [f.fieldname, f]));
  const details: DetailField[] = [];
  for (const [fieldname, column] of DETAIL_DEFAULTS) {
    const f = byName.get(fieldname);
    if (f) details.push({ fieldname, label: f.label, column });
  }
  // Only one party field: prefer the first that exists (customer_name, then
  // supplier_name, ...) so a Quotation doesn't print both a customer and a lead.
  const partyKeys = new Set(['customer_name', 'supplier_name', 'party_name', 'lead_name']);
  const firstParty = details.find((d) => partyKeys.has(d.fieldname));
  const dedupDetails = details.filter((d) => !partyKeys.has(d.fieldname) || d === firstParty);
  // Same for the date: keep the first of the date-like fields.
  const dateKeys = new Set(['transaction_date', 'posting_date']);
  const firstDate = dedupDetails.find((d) => dateKeys.has(d.fieldname));
  const finalDetails = dedupDetails.filter((d) => !dateKeys.has(d.fieldname) || d === firstDate);

  const columns: ItemColumn[] = [];
  const childByName = new Map(itemFields.map((f) => [f.fieldname, f]));
  for (const fieldname of ITEM_DEFAULT_ORDER) {
    if (!ITEM_DEFAULT_ON.has(fieldname)) continue;
    if (fieldname === 'idx') {
      columns.push({ fieldname, label: 'Sr', align: 'left', width: 6 });
      continue;
    }
    const f = childByName.get(fieldname);
    if (f) {
      columns.push({
        fieldname,
        label: fieldname === 'item_name' ? 'Item' : f.label,
        align: NUMERIC_COLUMNS.has(fieldname) ? 'right' : 'left',
        width: null,
      });
    }
  }
  // A child table with none of the usual item columns (Journal Entry accounts,
  // Payment references, ...): fall back to the doctype's own list-view columns.
  if (columns.length <= 1 && itemFields.length) {
    const fallback = itemFields.filter((f) => isPrintable(f) && (f.in_list_view || f.reqd)).slice(0, 6);
    for (const f of fallback) {
      columns.push({ fieldname: f.fieldname, label: f.label, align: f.component === 'number' ? 'right' : 'left', width: null });
    }
  }

  const totals = TOTAL_CHOICES.filter(
    (t) => ['total', 'discount_amount', 'taxes', 'grand_total', 'outstanding_amount'].includes(t.key) && (t.key === 'taxes' || byName.has(t.key))
  ).map((t) => ({ key: t.key, label: t.label }));

  return {
    version: 1,
    itemsFieldname: itemsField?.fieldname || null,
    showTitle: true,
    header: { mode: 'global', html: '', repeat: false },
    footer: { mode: 'global', html: '', pageNumbers: true },
    details: finalDetails,
    columns: itemsField ? columns : [],
    totals,
    showInWords: true,
    showTerms: true,
    fontSize: 10,
  };
}

// ---------------------------------------------------------------- html gen

/** Escapes text placed into markup; braces too so a label can't open a Jinja tag. */
function esc(s: string): string {
  return String(s).replace(/[&<>"{}]/g, (c) => `&#${c.charCodeAt(0)};`);
}


const PAGE_NUMBER = `<p class="text-center small page-number visible-pdf" style="margin:0;">{{ _("Page {0} of {1}").format('<span class="page"></span>', '<span class="topage"></span>') }}</p>`;

const MARKER = 'xentra-layout:v1';

function encodeLayout(layout: PrintLayout): string {
  // encodeURIComponent keeps the payload free of `#}` / `{%` sequences, so
  // arbitrary label and header text can never terminate the Jinja comment.
  return encodeURIComponent(JSON.stringify(layout));
}

/** Layout embedded in a print format's html, or null if it isn't one of ours. */
export function parseLayoutFromHtml(html: string | null | undefined): PrintLayout | null {
  if (!html) return null;
  const m = html.match(new RegExp(`\\{#\\s*${MARKER}\\s+([^\\s#]+)\\s*#\\}`));
  if (!m) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1]));
    return parsed && parsed.version === 1 ? (parsed as PrintLayout) : null;
  } catch {
    return null;
  }
}

function detailCell(fields: DetailField[]): string {
  return fields
    .filter((f) => SAFE_FIELDNAME.test(f.fieldname))
    .map(
      (f) =>
        `      {% if doc.get("${f.fieldname}") not in (None, "") %}<div><strong>${esc(f.label)}</strong>: {{ doc.get_formatted("${f.fieldname}") }}</div>{% endif %}`
    )
    .join('\n');
}

function itemCellValue(fieldname: string): string {
  if (fieldname === 'idx') return '{{ row.idx }}';
  if (fieldname === 'item_name') return '{{ row.item_name or row.item_code or "" }}';
  return `{% if row.get("${fieldname}") is not none %}{{ row.get_formatted("${fieldname}") }}{% endif %}`;
}

function totalRow(t: TotalRow): string {
  const bold = BOLD_TOTALS.has(t.key);
  const wrap = (s: string) => (bold ? `<strong>${s}</strong>` : s);
  if (t.key === 'taxes') {
    return `    {% for t in (doc.get("taxes") or []) %}<tr><td>{{ t.description }}</td><td style="text-align: right;">{{ t.get_formatted("tax_amount") }}</td></tr>{% endfor %}`;
  }
  if (!SAFE_FIELDNAME.test(t.key)) return '';
  const guard = HIDE_WHEN_ZERO.has(t.key) ? `doc.get("${t.key}")` : `doc.get("${t.key}") is not none`;
  return `    {% if ${guard} %}<tr><td>${wrap(esc(t.label))}</td><td style="text-align: right;">${wrap(`{{ doc.get_formatted("${t.key}") }}`)}</td></tr>{% endif %}`;
}

export function buildLayoutHtml(layout: PrintLayout): string {
  const left = layout.details.filter((d) => d.column === 'left');
  const right = layout.details.filter((d) => d.column === 'right');
  const full = layout.details.filter((d) => d.column === 'full');

  const detailsBlock = layout.details.length
    ? `
  <table style="width: 100%; margin-bottom: 10px; border-collapse: collapse;">
    <tr>
      <td style="width: 50%; vertical-align: top;">
${detailCell(left)}
      </td>
      <td style="width: 50%; vertical-align: top; text-align: right;">
${detailCell(right)}
      </td>
    </tr>${full.length ? `\n    <tr><td colspan="2" style="vertical-align: top;">\n${detailCell(full)}\n    </td></tr>` : ''}
  </table>`
    : '';

  const cols = layout.columns.filter((c) => c.fieldname === 'idx' || SAFE_FIELDNAME.test(c.fieldname));
  const itemsBlock =
    layout.itemsFieldname && SAFE_FIELDNAME.test(layout.itemsFieldname) && cols.length
      ? `
  {% if doc.get("${layout.itemsFieldname}") %}
  <table class="table table-bordered" style="margin-top: 6px; width: 100%;">
    <thead>
      <tr>
${cols
  .map(
    (c) =>
      `        <th style="text-align: ${c.align};${c.width ? ` width: ${Math.max(1, Math.min(100, Math.round(c.width)))}%;` : ''}">${esc(c.label)}</th>`
  )
  .join('\n')}
      </tr>
    </thead>
    <tbody>
      {% for row in doc.get("${layout.itemsFieldname}") %}
      <tr>
${cols.map((c) => `        <td style="text-align: ${c.align};">${itemCellValue(c.fieldname)}</td>`).join('\n')}
      </tr>
      {% endfor %}
    </tbody>
  </table>
  {% endif %}`
      : '';

  const totalsBlock = layout.totals.length
    ? `
  <table style="width: 40%; margin-left: auto; margin-top: 10px;">
${layout.totals.map(totalRow).filter(Boolean).join('\n')}
  </table>`
    : '';

  // Header. "global" = the tenant's (default or chosen) Letter Head, exactly as
  // any other print format; "custom" = this template's own HTML; "none".
  const titleBlock = layout.showTitle
    ? `<div style="text-align: center; margin: 6px 0 10px;"><h2 style="margin: 0;">{{ _(doc.doctype) }}</h2><div style="color: #666;">{{ doc.name }}</div></div>`
    : '';
  let headerInner = '';
  if (layout.header.mode === 'global') {
    headerInner = `{% if letter_head and not no_letterhead %}<div class="letter-head">{{ letter_head }}</div>{% endif %}`;
  } else if (layout.header.mode === 'custom') {
    headerInner = `<div class="xp-header">${layout.header.html}</div>`;
  }
  const headerBlock = headerInner
    ? layout.header.repeat
      ? `<div id="header-html" class="hidden-pdf">${headerInner}</div>`
      : headerInner
    : '';

  // Footer — a `footer-html` element is what Frappe lifts into the PDF's
  // repeating page footer.
  const footerParts: string[] = [];
  if (layout.footer.mode === 'global') {
    footerParts.push(`{% if not no_letterhead and footer %}<div class="letter-head-footer">{{ footer }}</div>{% endif %}`);
  } else if (layout.footer.mode === 'custom') {
    footerParts.push(`<div class="xp-footer">${layout.footer.html}</div>`);
  }
  if (layout.footer.pageNumbers) footerParts.push(PAGE_NUMBER);
  const footerBlock = footerParts.length ? `<div id="footer-html" class="visible-pdf">${footerParts.join('')}</div>` : '';

  const inWords = layout.showInWords ? `\n  {% if doc.get("in_words") %}<p><em>{{ doc.in_words }}</em></p>{% endif %}` : '';
  const terms = layout.showTerms
    ? `\n  {% if doc.get("terms") %}<div style="margin-top: 12px;"><strong>{{ _("Terms and Conditions") }}</strong><div>{{ doc.terms }}</div></div>{% endif %}`
    : '';

  return `{# ${MARKER} ${encodeLayout(layout)} #}
<style>.xp-root, .xp-root td, .xp-root th { font-size: ${Math.max(6, Math.min(24, layout.fontSize))}pt; }</style>
<div class="xp-root">
  ${headerBlock}
  ${titleBlock}
${detailsBlock}
${itemsBlock}
${totalsBlock}${inWords}${terms}
  ${footerBlock}
</div>`;
}

