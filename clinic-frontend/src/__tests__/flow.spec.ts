import { describe, expect, it } from 'vitest'
import { allergyHit, dispenseQty, durationDays, tokenLabel, vitalFlag, vitalsLine } from '@/lib/flow'
import { searchIcd } from '@/lib/icd10'
import { appendText, cleanTranscript } from '@/composables/useDictation'

describe('visit flow helpers', () => {
  it('pads tokens', () => {
    expect(tokenLabel(7)).toBe('007')
    expect(tokenLabel(null)).toBe('—')
  })
  it('flags vitals', () => {
    expect(vitalFlag('spo2', 97)).toBe('ok')
    expect(vitalFlag('spo2', 93)).toBe('abnormal')
    expect(vitalFlag('spo2', 86)).toBe('critical')
    expect(vitalFlag('temperature', 38.2)).toBe('abnormal')
    expect(vitalFlag('bp_systolic', '')).toBe('')
  })
  it('summarises vitals', () => {
    expect(vitalsLine({ bp_systolic: 120, bp_diastolic: 80, pulse: 72, weight: 70, height: 175 })).toBe('BP 120/80 · P 72 · BMI 22.9')
  })
  it('works out quantities for countable forms only', () => {
    expect(durationDays('2 weeks')).toBe(14)
    expect(durationDays('1 month')).toBe(30)
    expect(dispenseQty('1', 3, '5 days', 'Tablet')).toBe('15')
    expect(dispenseQty('2', 2, '7', 'Capsule')).toBe('28')
    expect(dispenseQty('5 ml', 3, '5 days', 'Syrup')).toBe('')
    expect(dispenseQty('1', null, '5 days', 'Tablet')).toBe('')
  })
  it('spots allergy matches, including drug classes', () => {
    expect(allergyHit('Penicillin', 'Amoxicillin')).toBe('penicillin')
    expect(allergyHit('NSAIDs; peanuts', 'Ibuprofen')).toBe('nsaids')
    expect(allergyHit('Penicillin', 'Paracetamol')).toBe('')
    expect(allergyHit('', 'Amoxicillin')).toBe('')
  })
})

describe('ICD-10 search', () => {
  it('finds by code prefix and by abbreviation', () => {
    expect(searchIcd('J06')[0][0]).toBe('J06.9')
    expect(searchIcd('htn').some(([c]) => c === 'I10')).toBe(true)
    expect(searchIcd('urti')[0][0]).toBe('J06.9')
    expect(searchIcd('toothache').some(([c]) => c === 'K04.0')).toBe(true)
  })
})

describe('dictation', () => {
  it('turns spoken punctuation into text', () => {
    expect(cleanTranscript('fever for two days full stop no cough')).toBe('Fever for two days. No cough')
    expect(cleanTranscript('chest clear new line abdomen soft')).toBe('Chest clear\nAbdomen soft')
  })
  it('appends with spacing', () => {
    expect(appendText('Fever.', 'No cough')).toBe('Fever. No cough')
    expect(appendText('', 'No cough')).toBe('No cough')
  })
})

describe('children', () => {
  it('does not flag a child pulse against adult ranges', async () => {
    const { vitalFlag, ageYears } = await import('@/lib/flow')
    expect(ageYears('5 y')).toBe(5)
    expect(vitalFlag('pulse', 110, 5)).toBe('')
    expect(vitalFlag('temperature', 38.9, 5)).toBe('abnormal')
  })
})
