// Minimal ESC/POS command builder — enough for a basic itemized receipt on
// the common 58mm/80mm thermal printers this style of register uses. Not a
// full ESC/POS implementation (no images/barcodes) — just what a receipt
// needs: bold/centered header text, plain lines, a cut at the end.
//
// Thermal printers read raw bytes, not a string API, so everything here
// builds a Uint8Array to hand to the Bluetooth (or, later, USB/serial)
// transport rather than trying to "print a string" directly.

const ESC = 0x1b
const GS = 0x1d

export class ReceiptBuilder {
  private chunks: number[] = []

  private push(...bytes: number[]) {
    this.chunks.push(...bytes)
    return this
  }

  private text(s: string) {
    // Thermal printers are byte-oriented and almost universally expect a
    // single-byte code page (CP437/similar), not UTF-8 — non-ASCII
    // characters (accents, currency symbols beyond $) may not render
    // correctly on real hardware. Good enough for Stage 1; a proper code
    // page table is a follow-up if a tenant's receipts need it.
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i)
      this.chunks.push(code < 256 ? code : 0x3f) // '?' for anything out of range
    }
    return this
  }

  init() {
    return this.push(ESC, 0x40) // ESC @  — initialize printer
  }
  align(mode: 'left' | 'center' | 'right') {
    const n = mode === 'center' ? 1 : mode === 'right' ? 2 : 0
    return this.push(ESC, 0x61, n) // ESC a n
  }
  bold(on: boolean) {
    return this.push(ESC, 0x45, on ? 1 : 0) // ESC E n
  }
  doubleSize(on: boolean) {
    return this.push(GS, 0x21, on ? 0x11 : 0x00) // GS ! n (double width+height)
  }
  line(s = '') {
    this.text(s)
    return this.push(0x0a)
  }
  divider(width = 32) {
    return this.line('-'.repeat(width))
  }
  // Left-justified label with a right-justified value on the same line,
  // padded to a fixed character width (standard 58mm printers are ~32
  // columns at the default font; 80mm printers are ~48 — configurable
  // since the actual width depends on the tenant's real hardware).
  row(label: string, value: string, width = 32) {
    const space = Math.max(1, width - label.length - value.length)
    return this.line(label + ' '.repeat(space) + value)
  }
  feed(lines = 1) {
    return this.push(0x0a).push(...Array(Math.max(0, lines - 1)).fill(0x0a))
  }
  cut() {
    return this.push(GS, 0x56, 0x01) // GS V 1 — partial cut
  }

  build(): Uint8Array {
    return new Uint8Array(this.chunks)
  }
}
