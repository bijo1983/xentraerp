import { afterEach, describe, expect, it } from 'vitest'
import { applyDocumentLocale, dir, missingKeys, setLocale, t, translate } from '@/lib/i18n'
import { AR_NEEDS_REVIEW } from '@/locales/ar'

afterEach(() => setLocale('en'))

describe('i18n', () => {
  it('Arabic catalogue covers every English key', () => {
    expect(missingKeys('ar')).toEqual([])
  })
  it('Arabic is flagged as a machine draft needing review', () => {
    expect(AR_NEEDS_REVIEW).toBe(true)
  })
  it('switches direction and lang on <html>', () => {
    setLocale('ar')
    applyDocumentLocale()
    expect(dir.value).toBe('rtl')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
    setLocale('en')
    expect(document.documentElement.dir).toBe('ltr')
  })
  it('interpolates and falls back to English, then to the key', () => {
    expect(t('auth.onDevice', { device: 'Till 1' })).toBe('On Till 1')
    expect(translate('nope.missing')).toBe('nope.missing')
  })
  it('the landing headline is the owner brief headline', () => {
    expect(t('landing.headline')).toBe('Run Every Sale, Table and Store from One Intelligent POS')
  })
})
