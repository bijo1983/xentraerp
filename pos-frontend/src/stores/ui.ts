// Device preferences: theme, language, digit style. Applied to <html>.
import { defineStore } from 'pinia'
import { digitStyle, setLocale, type DigitStyle, type Locale } from '@/lib/i18n'
import { readJson, writeJson } from '@/lib/storage'

export type ThemePref = 'light' | 'dark' | 'system'
interface Prefs { theme: ThemePref; locale: Locale; digits: DigitStyle }
const KEY = 'xpos.prefs'

export function resolveTheme(pref: ThemePref, prefersDark: boolean): 'light' | 'dark' {
  return pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref
}

export const useUiStore = defineStore('ui', {
  state: (): Prefs => ({ theme: 'light', locale: 'en', digits: 'latn', ...readJson<Partial<Prefs>>(KEY, {}) }),
  actions: {
    apply() {
      const prefersDark = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
      if (typeof document !== 'undefined') document.documentElement.dataset.theme = resolveTheme(this.theme, prefersDark)
      digitStyle.value = this.digits
      setLocale(this.locale)
    },
    save() {
      writeJson(KEY, { theme: this.theme, locale: this.locale, digits: this.digits })
      this.apply()
    },
    setTheme(theme: ThemePref) {
      this.theme = theme
      this.save()
    },
    setLocale(locale: Locale) {
      this.locale = locale
      this.save()
    },
    setDigits(digits: DigitStyle) {
      this.digits = digits
      this.save()
    },
  },
})
