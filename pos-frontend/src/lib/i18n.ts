// Minimal i18n for the POS (EN + AR, RTL). Deliberately not vue-i18n: its message
// compiler needs `new Function`, which the Content-Security-Policy (no 'unsafe-eval')
// forbids. Messages are flat dotted keys with {name} placeholders.
//
// Numbers: Western (Latin) digits by default; a per-device setting switches Arabic to
// Arabic-Indic digits (٠١٢٣…). Money still goes through lib/money.ts.
import { computed, ref } from 'vue'
import type { App } from 'vue'
import en from '@/locales/en'
import ar from '@/locales/ar'

export type Locale = 'en' | 'ar'
export type DigitStyle = 'latn' | 'arab'
export type Messages = Record<string, string>

const catalogs: Record<Locale, Messages> = { en, ar }
export const LOCALES: { code: Locale; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
]

export const locale = ref<Locale>('en')
export const digitStyle = ref<DigitStyle>('latn')
export const dir = computed(() => (locale.value === 'ar' ? 'rtl' : 'ltr'))

export function translate(key: string, params?: Record<string, string | number>, lang: Locale = locale.value): string {
  const raw = catalogs[lang]?.[key] ?? catalogs.en[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`))
}

export function t(key: string, params?: Record<string, string | number>): string {
  return translate(key, params)
}

/** BCP-47 tag for Intl, honouring the digit setting (ar-u-nu-latn = Arabic, Latin digits). */
export function intlLocale(lang: Locale = locale.value, digits: DigitStyle = digitStyle.value): string {
  return lang === 'ar' ? `ar-u-nu-${digits}` : 'en'
}

export function formatNumber(n: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(intlLocale(), opts).format(n)
}

export function applyDocumentLocale(doc: Document = document) {
  doc.documentElement.lang = locale.value
  doc.documentElement.dir = dir.value
}

export function setLocale(next: Locale) {
  locale.value = next
  if (typeof document !== 'undefined') applyDocumentLocale()
}

export function missingKeys(lang: Locale): string[] {
  return Object.keys(catalogs.en).filter((k) => !(k in catalogs[lang]))
}

export const i18nPlugin = {
  install(app: App) {
    app.config.globalProperties.$t = t
  },
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: typeof t
  }
}
