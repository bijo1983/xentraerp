// The ONE money formatter for the POS (Phase 1 rule: no hard-coded decimals).
//
// Precision comes from the currency itself: ERPNext's Currency record when the app has
// loaded it (fraction_units: BHD 1000 -> 3 decimals, AED 100 -> 2, JPY 1/0 -> 0), else
// the ISO 4217 default that Intl knows for that code (same values). Never a literal 2 or 3.
// Phase 2 moves arithmetic to server-supplied amounts; this file is display only.
import { intlLocale } from '@/lib/i18n'

export interface CurrencyMeta {
  code: string
  /** decimal places; derived from ERPNext Currency.fraction_units when known */
  decimals?: number | null
  symbol?: string | null
  /** ERPNext symbol_on_right */
  symbolOnRight?: boolean
}

const registry = new Map<string, CurrencyMeta>()

/** log10 of ERPNext's fraction_units (1000 -> 3). 0/1/missing -> 0 decimals; non powers of ten -> null. */
export function decimalsFromFractionUnits(units: number | null | undefined): number | null {
  if (units === null || units === undefined) return null
  const u = Number(units)
  if (!Number.isFinite(u) || u <= 1) return 0
  const d = Math.round(Math.log10(u))
  return 10 ** d === u ? d : null
}

export function registerCurrency(meta: CurrencyMeta) {
  registry.set(meta.code.toUpperCase(), { ...registry.get(meta.code.toUpperCase()), ...meta, code: meta.code.toUpperCase() })
}

export function currencyMeta(code: string): CurrencyMeta {
  return registry.get((code || '').toUpperCase()) || { code: (code || '').toUpperCase() }
}

export function clearCurrencies() {
  registry.clear()
}

/** Decimal places for a currency: ERPNext record if registered, else ISO default from Intl. */
export function currencyDecimals(code: string): number {
  const meta = currencyMeta(code)
  if (typeof meta.decimals === 'number') return meta.decimals
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: meta.code }).resolvedOptions().maximumFractionDigits ?? 0
  } catch {
    return 0
  }
}

export interface MoneyOptions {
  /** show the currency code/symbol (default true) */
  symbol?: boolean
  /** Intl locale override (receipts force 'en': thermal printers only print ASCII) */
  locale?: string
}

export function formatMoney(amount: number | string | null | undefined, code: string, opts: MoneyOptions = {}): string {
  const n = Number(amount ?? 0)
  const value = Number.isFinite(n) ? n : 0
  const meta = currencyMeta(code)
  const decimals = currencyDecimals(code)
  const showSymbol = opts.symbol !== false
  const loc = opts.locale || intlLocale()
  try {
    if (showSymbol && !meta.symbol) {
      return new Intl.NumberFormat(loc, { style: 'currency', currency: meta.code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
    }
  } catch {
    /* unknown ISO code: fall through to plain number + code */
  }
  const num = new Intl.NumberFormat(loc, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
  if (!showSymbol) return num
  const sym = meta.symbol || meta.code
  return meta.symbolOnRight ? `${num} ${sym}` : `${sym} ${num}`
}

// ------------------------------------------------------------ company currency
let companyCode = ''

/** Called with get_pos_settings().company_currency (the ERPNext Currency record). */
export function setCompanyCurrency(meta: { code: string; fraction_units?: number | null; symbol?: string | null; symbol_on_right?: number | boolean } | null | undefined) {
  if (!meta?.code) return
  companyCode = meta.code.toUpperCase()
  registerCurrency({
    code: meta.code,
    decimals: decimalsFromFractionUnits(meta.fraction_units ?? null),
    symbol: meta.symbol || null,
    symbolOnRight: !!meta.symbol_on_right,
  })
}

export function companyCurrency(): string {
  return companyCode
}

/** Money in the company currency (falls back to the given code until settings are loaded). */
export function formatCompanyMoney(amount: number | string | null | undefined, fallbackCode = ''): string {
  return formatMoney(amount, companyCode || fallbackCode)
}
