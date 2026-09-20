import { ReceiptBuilder } from './escpos'

// A kitchen order ticket, as printed for the pass. Big table / token first —
// that is what the kitchen calls out — then each item with its quantity and
// any note (well done, no onions, ...) impossible to miss.
export interface KotData {
  name: string
  order_type: 'Dine In' | 'Take Away'
  table: string | null
  token: string | null
  time: string
  items: { item_name: string; qty: number; note: string }[]
  guest?: string | null
}

const WIDTH = 32

function heading(k: KotData): string {
  return k.order_type === 'Take Away' ? `TAKE AWAY ${k.token ?? ''}`.trim() : `TABLE ${k.table ?? ''}`.trim()
}

// Raw ESC/POS for a Bluetooth thermal printer (same 32-column assumption as receipts).
export function buildKotBytes(k: KotData): Uint8Array {
  const r = new ReceiptBuilder()
  r.init()
  r.align('center').bold(true).doubleSize(true).line(heading(k)).doubleSize(false).line(`KOT ${k.name.replace(/^KOT-/, '')}`).bold(false)
  r.line(k.time)
  if (k.guest) r.line(k.guest)
  r.align('left').divider(WIDTH)
  for (const i of k.items) {
    r.bold(true).doubleSize(true).line(`${i.qty} x ${i.item_name}`).doubleSize(false).bold(false)
    if (i.note) r.bold(true).line(`  >> ${i.note}`).bold(false)
  }
  r.divider(WIDTH)
  r.feed(3)
  r.cut()
  return r.build()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

function ticketHtml(k: KotData): string {
  const rows = k.items
    .map((i) => `<div class="it"><b>${i.qty} × ${escapeHtml(i.item_name)}</b>${i.note ? `<div class="nt">» ${escapeHtml(i.note)}</div>` : ''}</div>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(k.name)}</title><style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; color: #000; margin: 0; padding: 8px; }
  .c { text-align: center; } .h { font-size: 24px; font-weight: 700; } .s { font-size: 12px; }
  hr { border: none; border-top: 2px dashed #000; margin: 8px 0; }
  .it { font-size: 18px; padding: 4px 0; } .nt { font-size: 15px; font-weight: 700; margin-left: 12px; }
  </style></head><body>
  <div class="c h">${escapeHtml(heading(k))}</div><div class="c s">KOT ${escapeHtml(k.name.replace(/^KOT-/, ''))} · ${escapeHtml(k.time)}</div>
  ${k.guest ? `<div class="c s">${escapeHtml(k.guest)}</div>` : ''}<hr />${rows}<hr />
  </body></html>`
}

// Prints through a hidden iframe rather than a pop-up window: a kitchen screen prints
// tickets as they arrive (not from a click), and browsers block pop-ups opened that way.
// The browser still shows its print dialog unless it is started with kiosk-printing
// (Chrome: --kiosk-printing) — or use a Bluetooth thermal printer, which is silent.
export function printKotViaBrowser(k: KotData) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentWindow?.document
  if (!doc || !frame.contentWindow) {
    frame.remove()
    throw new Error('Could not open the print frame.')
  }
  doc.open()
  doc.write(ticketHtml(k))
  doc.close()
  frame.onload = () => undefined
  setTimeout(() => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 2000)
  }, 150)
}
