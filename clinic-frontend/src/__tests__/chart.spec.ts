import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ChartForm from '@/components/ChartForm.vue'
import ToothChart from '@/components/ToothChart.vue'
import type { ChartTemplate } from '@/lib/types'

const vitals: ChartTemplate = {
  label: 'Vitals',
  sections: [{ label: 'Vitals', fields: [{ key: 'weight', label: 'Weight', type: 'number', unit: 'kg' }, { key: 'height', label: 'Height', type: 'number', unit: 'cm' }, { key: 'pain', label: 'Pain', type: 'scale' }] }],
}

describe('ChartForm', () => {
  it('emits field updates and shows BMI', async () => {
    const w = mount(ChartForm, { props: { template: vitals, modelValue: { weight: 70, height: 175 } } })
    expect(w.text()).toContain('22.9')
    await w.findAll('.scale__b')[7].trigger('click')
    expect(w.emitted('update:modelValue')![0][0]).toMatchObject({ pain: 7, weight: 70 })
  })
  it('read-only mode shows values without inputs', () => {
    const w = mount(ChartForm, { props: { template: vitals, modelValue: { weight: 70 }, readonly: true } })
    expect(w.find('input[type=number]').exists()).toBe(false)
    expect(w.text()).toContain('70')
  })
})

describe('ToothChart', () => {
  it('marks a tooth with the chosen condition and clears it on second tap', async () => {
    const w = mount(ToothChart, { props: { modelValue: {}, conditions: ['Sound', 'Caries', 'Filled'] } })
    const t16 = w.findAll('.tooth').find((b) => b.text().startsWith('16'))!
    await t16.trigger('click')
    const first = w.emitted('update:modelValue')![0][0] as Record<string, string>
    expect(first).toEqual({ 16: 'Caries' })
    await w.setProps({ modelValue: first })
    await t16.trigger('click')
    expect(w.emitted('update:modelValue')![1][0]).toEqual({})
  })
})
