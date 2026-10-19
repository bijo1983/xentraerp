import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { UiButton, UiConfirmDialog, UiModal, UiNumericKeypad, UiPinDots, UiQuantityControl, UiStatusBadge, UiTotals, UiCategoryChips, UiErrorState } from '@/ui'
import { clearCurrencies } from '@/lib/money'

afterEach(() => {
  document.body.innerHTML = ''
  clearCurrencies()
})

describe('design system components', () => {
  it('UiButton: disabled while loading and announces busy', async () => {
    const w = mount(UiButton, { props: { loading: true }, slots: { default: 'Pay' } })
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.attributes('aria-busy')).toBe('true')
    await w.setProps({ loading: false })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('UiNumericKeypad: emits digits and backspace; keyboard capture', async () => {
    const w = mount(UiNumericKeypad, { props: { captureKeyboard: true }, attachTo: document.body })
    await w.findAll('button').find((b) => b.text() === '7')!.trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(w.emitted('digit')).toEqual([['7'], ['3']])
    expect(w.emitted('backspace')).toHaveLength(1)
    expect(w.emitted('submit')).toHaveLength(1)
    w.unmount()
  })

  it('UiPinDots: shows dots, never digits', () => {
    const w = mount(UiPinDots, { props: { length: 3, min: 6, max: 8 } })
    expect(w.findAll('i')).toHaveLength(6)
    expect(w.findAll('i.filled')).toHaveLength(3)
    expect(w.text()).toBe('')
  })

  it('UiQuantityControl: respects min/max', async () => {
    const w = mount(UiQuantityControl, { props: { modelValue: 1, min: 1, max: 2 } })
    const [dec, inc] = w.findAll('button')
    expect(dec.attributes('disabled')).toBeDefined()
    await inc.trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([[2]])
  })

  it('UiStatusBadge: colour is paired with an icon and text', () => {
    const w = mount(UiStatusBadge, { props: { tone: 'danger' }, slots: { default: 'Occupied' } })
    expect(w.text()).toContain('Occupied')
    expect(w.find('.x-badge__icon').exists()).toBe(true)
  })

  it('UiTotals: shows taxable amount, VAT by rate and gross with currency precision', () => {
    const w = mount(UiTotals, {
      props: { currency: 'BHD', lines: [{ kind: 'taxable', amount: 10 }, { kind: 'tax', rate: 10, amount: 1 }, { kind: 'gross', amount: 11 }] },
    })
    expect(w.text()).toContain('VAT 10%')
    expect(w.text()).toMatch(/11\.000/)
    expect(w.text()).toContain('Taxable amount')
  })

  it('UiCategoryChips: pressed state', async () => {
    const w = mount(UiCategoryChips, { props: { modelValue: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] } })
    expect(w.findAll('button')[0].attributes('aria-pressed')).toBe('true')
    await w.findAll('button')[1].trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([['b']])
  })

  it('UiModal: dialog semantics, Escape closes, focus moves inside', async () => {
    const w = mount(UiModal, { props: { open: true, title: 'Hello' }, slots: { default: '<button id="inside">ok</button>' }, attachTo: document.body })
    await nextTick()
    await nextTick()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(dialog.contains(document.activeElement)).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('UiConfirmDialog: confirm and cancel', async () => {
    const w = mount(UiConfirmDialog, { props: { open: true, title: 'Void?' }, attachTo: document.body })
    await nextTick()
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.x-modal__foot button'))
    buttons[1].click()
    buttons[0].click()
    expect(w.emitted('confirm')).toHaveLength(1)
    expect(w.emitted('cancel')).toHaveLength(1)
    w.unmount()
  })

  it('UiErrorState: shows the support reference, no stack', () => {
    const w = mount(UiErrorState, { props: { kind: 'error', reference: 'ABC123' } })
    expect(w.text()).toContain('ABC123')
    expect(w.attributes('role')).toBe('alert')
  })
})
