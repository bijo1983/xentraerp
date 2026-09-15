// Generates the Jinja `html` for a custom Print Format, so "add extra
// fields, save as a reusable template" produces a REAL Frappe Print Format
// record (selectable from the format dropdown for every future print of
// that doctype, just like any format an admin builds in Desk) rather than
// something only this app's UI understands.
//
// `add_header` is Frappe's own built-in macro (frappe/templates/
// print_formats/standard_macros.html) — the exact same one the bundled
// "Standard" fallback and every shipped ERPNext Jinja print format (e.g.
// erpnext/accounts/print_format/credit_note) call for the letterhead +
// document-title block, so this gets the tenant's real Letter Head/company
// branding for free instead of reimplementing it. `doc`, `letter_head`,
// `no_letterhead`, and the `_`/`frappe` Jinja globals are part of the
// standard context Frappe passes into ANY print format render — confirmed
// against frappe/www/printview.py's `args` dict, not special to "Standard".
export interface PrintFieldPick {
  fieldname: string;
  label: string;
}

export interface BuildCustomPrintHtmlOpts {
  itemsFieldname?: string | null;
  headerFields: PrintFieldPick[];
  itemFields: PrintFieldPick[];
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

export function buildCustomPrintHtml({ itemsFieldname, headerFields, itemFields }: BuildCustomPrintHtmlOpts): string {
  const headerRowsBlock = headerFields.length
    ? `
  <table style="width: 100%; margin-bottom: 10px;">
${headerFields
  .map(
    (f) => `    {% if doc.get("${f.fieldname}") not in (None, "") %}
    <tr><td style="width: 32%;"><strong>${esc(f.label)}</strong></td><td>{{ doc.get_formatted("${f.fieldname}") }}</td></tr>
    {% endif %}`
  )
  .join('\n')}
  </table>`
    : '';

  const itemsBlock = itemsFieldname
    ? `
  {% if doc.get("${itemsFieldname}") %}
  <table class="table table-bordered" style="margin-top: 10px; width: 100%;">
    <thead>
      <tr>
        <th>Sr</th>
        <th>Item</th>
        <th>Qty</th>
        <th>UOM</th>
        <th style="text-align: right;">Rate</th>
${itemFields.map((f) => `        <th style="text-align: right;">${esc(f.label)}</th>`).join('\n')}
        <th style="text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      {% for row in doc.get("${itemsFieldname}") %}
      <tr>
        <td>{{ row.idx }}</td>
        <td>{{ row.item_name or row.item_code or row.description or "" }}</td>
        <td>{{ row.qty if row.get("qty") is not none else "" }}</td>
        <td>{{ row.uom or "" }}</td>
        <td style="text-align: right;">{{ row.get_formatted("rate") if row.get("rate") is not none else "" }}</td>
${itemFields.map((f) => `        <td style="text-align: right;">{{ row.get_formatted("${f.fieldname}") }}</td>`).join('\n')}
        <td style="text-align: right;">{{ row.get_formatted("amount") if row.get("amount") is not none else "" }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  {% endif %}`
    : '';

  return `{%- from "templates/print_formats/standard_macros.html" import add_header with context -%}
<div class="page-break">
  {{ add_header(0, 1, doc, letter_head, no_letterhead) }}

  <table style="width: 100%; margin-bottom: 8px;">
    <tr>
      <td style="width: 50%; vertical-align: top;">
        <strong>{{ _("Company") }}</strong>: {{ doc.get("company") or "" }}
      </td>
      <td style="width: 50%; vertical-align: top; text-align: right;">
        {% if doc.meta.has_field("transaction_date") %}<strong>{{ _("Date") }}</strong>: {{ doc.get_formatted("transaction_date") }}<br>{% endif %}
        {% if doc.meta.has_field("posting_date") %}<strong>{{ _("Date") }}</strong>: {{ doc.get_formatted("posting_date") }}<br>{% endif %}
        {% if doc.meta.has_field("due_date") and doc.get("due_date") %}<strong>{{ _("Due Date") }}</strong>: {{ doc.get_formatted("due_date") }}<br>{% endif %}
      </td>
    </tr>
    <tr>
      <td style="vertical-align: top;">
        <strong>{{ _("Customer") if doc.meta.has_field("customer") else (_("Supplier") if doc.meta.has_field("supplier") else _("Party")) }}</strong>:
        {{ doc.get("customer_name") or doc.get("customer") or doc.get("supplier_name") or doc.get("supplier") or doc.get("party_name") or "" }}
      </td>
      <td style="vertical-align: top; text-align: right;">
        {% if doc.meta.has_field("status") %}<strong>{{ _("Status") }}</strong>: {{ doc.status }}{% endif %}
      </td>
    </tr>
  </table>
${headerRowsBlock}
${itemsBlock}

  <table style="width: 40%; margin-left: auto; margin-top: 10px;">
    {% if doc.meta.has_field("total") %}<tr><td>{{ _("Total") }}</td><td style="text-align: right;">{{ doc.get_formatted("total") }}</td></tr>{% endif %}
    {% if doc.meta.has_field("discount_amount") and doc.get("discount_amount") %}<tr><td>{{ _("Discount") }}{% if doc.get("additional_discount_percentage") %} ({{ doc.additional_discount_percentage }}%){% endif %}</td><td style="text-align: right;">{{ doc.get_formatted("discount_amount") }}</td></tr>{% endif %}
    {% if doc.get("taxes") %}
      {% for t in doc.taxes %}
      <tr><td>{{ t.description }}</td><td style="text-align: right;">{{ t.get_formatted("tax_amount") }}</td></tr>
      {% endfor %}
    {% endif %}
    {% if doc.meta.has_field("grand_total") %}<tr><td><strong>{{ _("Grand Total") }}</strong></td><td style="text-align: right;"><strong>{{ doc.get_formatted("grand_total") }}</strong></td></tr>{% endif %}
    {% if doc.meta.has_field("outstanding_amount") and doc.get("outstanding_amount") %}<tr><td>{{ _("Outstanding") }}</td><td style="text-align: right;">{{ doc.get_formatted("outstanding_amount") }}</td></tr>{% endif %}
  </table>
  {% if doc.get("in_words") %}<p><em>{{ doc.in_words }}</em></p>{% endif %}

  {% if doc.meta.has_field("terms") and doc.get("terms") %}
  <div style="margin-top: 12px;"><strong>{{ _("Terms and Conditions") }}</strong><div>{{ doc.terms }}</div></div>
  {% endif %}
</div>`;
}
