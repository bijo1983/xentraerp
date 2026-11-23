import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ChartForm from '@/components/ChartForm.vue'
import ToothChart from '@/components/ToothChart.vue'
import EyeDiagram from '@/components/EyeDiagram.vue'
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
    const t16 = w.find('[aria-label^="Tooth 16"]')
    await t16.trigger('click')
    const first = w.emitted('update:modelValue')![0][0] as Record<string, string>
    expect(first).toEqual({ 16: 'Caries' })
    await w.setProps({ modelValue: first })
    await t16.trigger('click')
    expect(w.emitted('update:modelValue')![1][0]).toEqual({})
  })
  it('draws every permanent tooth with roots and marks a single surface', async () => {
    const w = mount(ToothChart, { props: { modelValue: {}, conditions: ['Sound', 'Caries', 'Crown'] } })
    expect(w.findAll('.crown')).toHaveLength(32)
    expect(w.findAll('.root').length).toBeGreaterThan(32)
    // tooth 16 (upper right first molar): its right-hand surface faces the midline, so it is mesial
    const surf = w.findAll('polygon.surf').filter((p) => p.find('title').text().startsWith('16 mesial'))
    await surf[0].trigger('click')
    expect(w.emitted('update:modelValue')![0][0]).toEqual({ '16:M': 'Caries' })
  })
  it('a whole-tooth condition clicked on a surface marks the tooth', async () => {
    const w = mount(ToothChart, { props: { modelValue: {}, conditions: ['Sound', 'Caries', 'Crown'] } })
    await w.findAll('.chip').find((c) => c.text() === 'Crown')!.trigger('click')
    await w.findAll('polygon.surf')[0].trigger('click')
    expect(Object.values(w.emitted('update:modelValue')![0][0] as object)).toEqual(['Crown'])
  })
})

describe('EyeDiagram', () => {
  it('records a finding for the tapped part of the right eye and updates the cup live', async () => {
    const w = mount(EyeDiagram, { props: { modelValue: {} } })
    await w.findAll('.reg').find((b) => b.text().startsWith('Lens'))!.trigger('click')
    await w.findAll('.ed__edit .chip').find((b) => b.text() === 'Nuclear sclerosis')!.trigger('click')
    expect(w.emitted('update:modelValue')![0][0]).toEqual({ od: { lens: 'Nuclear sclerosis' } })
    await w.find('input[type=range]').setValue('0.7')
    expect(w.emitted('update:modelValue')![1][0]).toMatchObject({ od_cd: 0.7 })
    await w.setProps({ modelValue: { od: { lens: 'Nuclear sclerosis' }, od_cd: 0.7 } })
    expect(w.text()).toContain('OD — Lens: Nuclear sclerosis, C/D 0.70')
  })
})
