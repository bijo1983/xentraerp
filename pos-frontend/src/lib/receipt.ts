import { ReceiptBuilder } from './escpos'

export interface ReceiptLine {
  name: string
  qty: number
  rate: number
  amount: number
}

export interface ReceiptData {
  orgName: string
  posProfile: string
  invoiceName: string
  cashier: string
  timestamp: string
  currency: string
  lines: ReceiptLine[]
  total: number
  paymentMethod: string
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n)
  } catch {
    return n.toFixed(2)
  }
}

// Builds the raw ESC/POS byte sequence for a Bluetooth thermal printer.
// Column width assumes a 32-character line (the default font on a 58mm
// printer) — an 80mm printer can fit more per line, but 32 stays readable
// on both rather than truncating on the smaller one.
export function buildReceiptBytes(data: ReceiptData): Uint8Array {
  const WIDTH = 32
  const r = new ReceiptBuilder()
  r.init()
  r.align('center').bold(true).doubleSize(true).line(data.orgName).doubleSize(false).bold(false)
  r.line(data.posProfile)
  r.line(data.timestamp)
  r.feed(1)
  r.align('left').divider(WIDTH)
  for (const line of data.lines) {
    r.line(`${line.qty} x ${line.name}`)
    r.row('', money(line.amount, data.currency), WIDTH)
  }
  r.divider(WIDTH)
  r.bold(true).row('TOTAL', money(data.total, data.currency), WIDTH).bold(false)
  r.row('Paid via', data.paymentMethod, WIDTH)
  r.feed(1)
  r.align('center').line(data.invoiceName)
  r.line('Thank you!')
  r.feed(3)
  r.cut()
  return r.build()
}

// Browser-print fallback (network/AirPrint-connected printers, or just a
// desktop printer) — opens a narrow print-styled window and invokes the
// browser's own print dialog, rather than fighting the main app's layout
// with @media print overrides.
export function printReceiptViaBrowser(data: ReceiptData) {
  const win = window.open('', '_blank', 'width=380,height=600')
  if (!win) throw new Error('Could not open the print window — check this browser is not blocking popups.')

  const rows = data.lines
    .map(
      (l) => `
        <div class="line">
          <span>${l.qty} × ${escapeHtml(l.name)}</span>
          <span>${escapeHtml(money(l.amount, data.currency))}</span>
        </div>`,
    )
    .join('')

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.invoiceName)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; margin: 0; padding: 8px; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .big { font-size: 16px; }
  hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  .line { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
  .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 14px; padding-top: 4px; }
</style>
</head>
<body>
  <div class="center bold big">${escapeHtml(data.orgName)}</div>
  <div class="center">${escapeHtml(data.posProfile)}</div>
  <div class="center">${escapeHtml(data.timestamp)}</div>
  <hr />
  ${rows}
  <hr />
  <div class="total"><span>TOTAL</span><span>${escapeHtml(money(data.total, data.currency))}</span></div>
  <div class="line"><span>Paid via</span><span>${escapeHtml(data.paymentMethod)}</span></div>
  <hr />
  <div class="center">${escapeHtml(data.invoiceName)}</div>
  <div class="center">Thank you!</div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`)
  win.document.close()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}
