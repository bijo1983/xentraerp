import { afterEach, describe, expect, it } from 'vitest'
import { clearCurrencies, companyCurrency, currencyDecimals, decimalsFromFractionUnits, formatCompanyMoney, formatMoney, registerCurrency, setCompanyCurrency } from '@/lib/money'
import { digitStyle, setLocale } from '@/lib/i18n'

afterEach(() => {
  clearCurrencies()
  setLocale('en')
  digitStyle.value = 'latn'
})

describe('currency precision comes from the currency, never a literal', () => {
  it('derives decimals from ERPNext fraction_units', () => {
    expect(decimalsFromFractionUnits(1000)).toBe(3) // BHD
    expect(decimalsFromFractionUnits(100)).toBe(2) // AED
    expect(decimalsFromFractionUnits(1)).toBe(0) // JPY
    expect(decimalsFromFractionUnits(0)).toBe(0)
    expect(decimalsFromFractionUnits(5)).toBeNull()
    expect(decimalsFromFractionUnits(undefined)).toBeNull()
  })

  it('falls back to the ISO 4217 default for unregistered currencies', () => {
    expect(currencyDecimals('BHD')).toBe(3)
    expect(currencyDecimals('AED')).toBe(2)
    expect(currencyDecimals('JPY')).toBe(0)
  })

  it('formats BHD with 3, AED with 2 and JPY with 0 decimals', () => {
    expect(formatMoney(2.5, 'BHD')).toMatch(/2\.500/)
    expect(formatMoney(2.5, 'AED')).toMatch(/2\.50(?!\d)/)
    expect(formatMoney(1250, 'JPY')).toMatch(/1,250(?![.\d])/)
  })

  it('uses the ERPNext Currency record when registered (symbol and precision)', () => {
    registerCurrency({ code: 'XYZ', decimals: 4, symbol: 'X$' })
    expect(formatMoney(1, 'XYZ')).toBe('X$ 1.0000')
    registerCurrency({ code: 'ABC', decimals: 1, symbol: 'ab', symbolOnRight: true })
    expect(formatMoney(3, 'ABC')).toBe('3.0 ab')
  })

  it('company currency comes from get_pos_settings().company_currency', () => {
    setCompanyCurrency({ code: 'BHD', fraction_units: 1000, symbol: 'BD', symbol_on_right: 0 })
    expect(companyCurrency()).toBe('BHD')
    expect(formatCompanyMoney(2)).toBe('BD 2.000')
  })

  it('handles bad input without throwing', () => {
    expect(formatMoney(null, 'BHD')).toMatch(/0\.000/)
    expect(formatMoney('abc', 'BHD')).toMatch(/0\.000/)
    expect(formatMoney(5, 'NOTACODE')).toMatch(/5/)
  })

  it('Arabic uses Latin digits by default and Arabic-Indic when chosen', () => {
    setLocale('ar')
    expect(formatMoney(12.5, 'BHD', { symbol: false })).toMatch(/12[.,٫]500/)
    digitStyle.value = 'arab'
    expect(formatMoney(12.5, 'BHD', { symbol: false })).toMatch(/[١٢٥٠]/)
  })

  it('receipts can force an ASCII locale', () => {
    setLocale('ar')
    digitStyle.value = 'arab'
    expect(formatMoney(1, 'BHD', { locale: 'en' })).toMatch(/1\.000/)
  })
})

describe('currency symbol follows the screen language', () => {
  it('shows an Arabic-script ERPNext symbol only when the screen is in Arabic', () => {
    setCompanyCurrency({ code: 'BHD', fraction_units: 1000, symbol: '.د.ب', symbol_on_right: 1 })
    expect(formatMoney(1.5, 'BHD')).toBe('BHD 1.500')
    expect(formatMoney(1.5, 'BHD')).not.toMatch(/[؀-ۿ]/)
    setLocale('ar')
    expect(formatMoney(1.5, 'BHD')).toMatch(/د\.ب/)
  })
  it('keeps a Latin symbol in either language', () => {
    registerCurrency({ code: 'USD', decimals: 2, symbol: '$' })
    expect(formatMoney(3, 'USD')).toBe('$ 3.00')
  })
})
