// Money/date formatting. GCC dinar/rial currencies use 3 decimals (BHD, KWD, OMR).
const THREE = new Set(['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD'])

export function decimalsFor(currency?: string | null): number {
  return currency && THREE.has(currency.toUpperCase()) ? 3 : 2
}

export function money(value: number | string | null | undefined, currency?: string | null): string {
  const n = Number(value || 0)
  const d = decimalsFor(currency)
  const num = n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  return currency ? `${currency} ${num}` : num
}

export function round(n: number, d = 2): number {
  const f = 10 ** d
  return Math.round((n + Number.EPSILON) * f) / f
}

export function isoDate(d: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoDate(new Date(y, m - 1, d + days))
}

export function niceDate(iso?: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function fromMinutes(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}

/** Time slots between opening and closing, every `step` minutes. */
export function slots(open = '09:00', close = '21:00', step = 15): string[] {
  const out: string[] = []
  for (let m = toMinutes(open); m + step <= toMinutes(close); m += step) out.push(fromMinutes(m))
  return out
}

/** Body-mass index from kg and cm (one decimal), or null. */
export function bmi(weightKg: unknown, heightCm: unknown): number | null {
  const w = Number(weightKg)
  const h = Number(heightCm) / 100
  if (!w || !h) return null
  return round(w / (h * h), 1)
}

/** Insurer / patient share of an amount (mirrors clinic_catalog.split_share). */
export function splitShare(amount: number, coveragePct: number, copayCap = 0): [number, number] {
  const c = Math.max(0, Math.min(100, coveragePct || 0))
  let patient = round((amount * (100 - c)) / 100)
  if (copayCap > 0) patient = Math.min(patient, round(copayCap))
  return [round(amount - patient), patient]
}
