import { describe, expect, it } from 'vitest'
import { addDays, bmi, decimalsFor, fromMinutes, money, slots, splitShare, toMinutes } from '@/lib/format'
import { nextActions, statusClass } from '@/lib/appointments'
import { searchIcd } from '@/lib/icd10'
import { parseErrorBody } from '@/lib/api'

describe('format', () => {
  it('uses 3 decimals for dinar currencies', () => {
    expect(decimalsFor('BHD')).toBe(3)
    expect(decimalsFor('AED')).toBe(2)
    expect(money(12.5, 'OMR')).toBe('OMR 12.500')
    expect(money(1234.5, 'INR')).toBe('INR 1,234.50')
  })
  it('builds calendar slots and times', () => {
    expect(slots('09:00', '10:00', 15)).toEqual(['09:00', '09:15', '09:30', '09:45'])
    expect(toMinutes('13:30')).toBe(810)
    expect(fromMinutes(545)).toBe('09:05')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('computes BMI', () => {
    expect(bmi(70, 175)).toBe(22.9)
    expect(bmi('', 175)).toBeNull()
  })
  it('splits insurer / patient share like the backend', () => {
    expect(splitShare(200, 80)).toEqual([160, 40])
    expect(splitShare(200, 80, 25)).toEqual([175, 25])
    expect(splitShare(100, 0)).toEqual([0, 100])
  })
})

describe('appointments', () => {
  it('offers check-in before a visit can start', () => {
    expect(nextActions('Booked').map((a) => a.status)).toContain('Checked In')
    expect(nextActions('Checked In')[0].status).toBe('start')
    expect(nextActions('Completed')).toEqual([])
    expect(statusClass('No Show')).toBe('st st-No-Show')
  })
})

describe('icd10', () => {
  it('finds by code prefix and by words', () => {
    expect(searchIcd('I10')[0][0]).toBe('I10')
    expect(searchIcd('hypertension').some(([c]) => c === 'I10')).toBe(true)
  })
})

describe('api errors', () => {
  it('parses the [CODE] prefix from server messages', () => {
    const body = { _server_messages: JSON.stringify([JSON.stringify({ message: '[SLOT_TAKEN] 10:00 is already booked for Ali.' })]) }
    expect(parseErrorBody(body, 417)).toEqual({ code: 'SLOT_TAKEN', message: '10:00 is already booked for Ali.' })
  })
  it('never shows a 500 body', () => {
    expect(parseErrorBody({ exception: 'Traceback…' }, 500).code).toBe('SERVER_ERROR')
  })
})
