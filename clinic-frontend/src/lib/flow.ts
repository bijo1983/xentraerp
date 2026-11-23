// Visit-flow helpers shared by the front desk, triage and doctor screens.
import type { AppointmentStatus, Priority, Vitals } from '@/lib/types'
import { bmi } from '@/lib/format'

export const PRIORITIES: Priority[] = ['Routine', 'Urgent', 'Emergency']

export function priorityTone(p?: Priority | null): 'danger' | 'warning' | 'neutral' {
  return p === 'Emergency' ? 'danger' : p === 'Urgent' ? 'warning' : 'neutral'
}

/** Where a checked-in patient is in the visit, in front-desk words. */
export function stageLabel(s: AppointmentStatus): string {
  switch (s) {
    case 'Checked In':
      return 'Waiting for triage'
    case 'Triaged':
      return 'Waiting for doctor'
    case 'In Consultation':
      return 'With doctor'
    case 'Completed':
      return 'Done — to bill'
    default:
      return s
  }
}

export function waitLabel(min: number): string {
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

export function tokenLabel(n?: number | null): string {
  return n ? String(n).padStart(3, '0') : '—'
}

/** Adult reference ranges used to flag a reading (not a diagnosis — a prompt to look again). */
export const VITAL_RANGES: Record<string, { label: string; unit: string; low?: number; high?: number; critLow?: number; critHigh?: number; step?: number; min: number; max: number }> = {
  bp_systolic: { label: 'Systolic', unit: 'mmHg', low: 90, high: 139, critLow: 80, critHigh: 180, min: 40, max: 260 },
  bp_diastolic: { label: 'Diastolic', unit: 'mmHg', low: 60, high: 89, critLow: 50, critHigh: 120, min: 20, max: 180 },
  pulse: { label: 'Pulse', unit: 'bpm', low: 60, high: 100, critLow: 40, critHigh: 130, min: 20, max: 250 },
  temperature: { label: 'Temperature', unit: '°C', low: 36.0, high: 37.5, critLow: 35, critHigh: 39.5, step: 0.1, min: 30, max: 45 },
  resp_rate: { label: 'Resp. rate', unit: '/min', low: 12, high: 20, critLow: 8, critHigh: 30, min: 4, max: 80 },
  spo2: { label: 'SpO₂', unit: '%', low: 95, critLow: 90, min: 50, max: 100 },
  weight: { label: 'Weight', unit: 'kg', step: 0.1, min: 0.3, max: 400 },
  height: { label: 'Height', unit: 'cm', min: 20, max: 250 },
  glucose: { label: 'Glucose (RBS)', unit: 'mg/dL', low: 70, high: 180, critLow: 54, critHigh: 300, min: 10, max: 900 },
  pain: { label: 'Pain', unit: '/10', high: 6, critHigh: 8, min: 0, max: 10 },
}

export type Flag = 'ok' | 'abnormal' | 'critical' | ''

/** Years from an age label like "34 y" or "8 m" (months count as 0). */
export function ageYears(age?: string | null): number | null {
  const m = String(age || '').match(/(\d+)\s*y/)
  return m ? Number(m[1]) : /\d+\s*(m|d|w)/.test(String(age || '')) ? 0 : null
}

/** Flags a reading against adult ranges. Children (under 12) only get temperature, SpO₂ and glucose flagged. */
export function vitalFlag(key: string, value: unknown, years?: number | null): Flag {
  if (years != null && years < 12 && !['temperature', 'spo2', 'glucose'].includes(key)) return ''
  const r = VITAL_RANGES[key]
  const v = Number(value)
  if (!r || value === '' || value == null || Number.isNaN(v)) return ''
  if ((r.critLow != null && v < r.critLow) || (r.critHigh != null && v > r.critHigh)) return 'critical'
  if ((r.low != null && v < r.low) || (r.high != null && v > r.high)) return 'abnormal'
  return 'ok'
}

/** A one-line vitals summary for queue cards: "BP 128/84 · P 88 · T 37.2 · SpO₂ 98". */
export function vitalsLine(v?: Vitals | null): string {
  if (!v) return ''
  const out: string[] = []
  if (v.bp_systolic || v.bp_diastolic) out.push(`BP ${v.bp_systolic || '?'}/${v.bp_diastolic || '?'}`)
  if (v.pulse) out.push(`P ${v.pulse}`)
  if (v.temperature) out.push(`T ${v.temperature}`)
  if (v.spo2) out.push(`SpO₂ ${v.spo2}`)
  if (v.resp_rate) out.push(`RR ${v.resp_rate}`)
  const b = bmi(v.weight, v.height)
  if (b) out.push(`BMI ${b}`)
  return out.join(' · ')
}

export function anyCritical(v?: Vitals | null, years?: number | null): boolean {
  return !!v && Object.entries(v).some(([k, x]) => vitalFlag(k, x, years) === 'critical')
}

/**
 * Quantity to dispense: doses per day x days x units per dose, for countable forms
 * (tablets, capsules, sachets). Liquids, creams, inhalers etc. return '' (dispensed as a pack).
 */
export function dispenseQty(dose: string | undefined, perDay: number | null | undefined, duration: string | undefined, form?: string): string {
  if (!perDay || !duration) return ''
  if (form && !['Tablet', 'Capsule', 'Sachet', 'Suppository', 'Lozenge'].includes(form)) return ''
  const days = durationDays(duration)
  const units = Number(String(dose || '1').replace(/[^\d.½]/g, '').replace('½', '.5')) || 1
  return days ? String(Math.ceil(perDay * days * units)) : ''
}

/** "5 days" -> 5, "2 weeks" -> 14, "1 month" -> 30, "7" -> 7. */
export function durationDays(s: string): number {
  const m = String(s).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|week|weeks|m|mo|month|months)?$/)
  if (!m) return 0
  const n = Number(m[1])
  const u = m[2] || 'd'
  return Math.round(u.startsWith('w') ? n * 7 : u.startsWith('m') ? n * 30 : n)
}

/** Does a medicine look like something the patient is allergic to? (simple text match on the allergy list) */
export function allergyHit(allergies: string | undefined, medicine: string): string {
  if (!allergies || !medicine) return ''
  const med = medicine.toLowerCase()
  const groups: Record<string, string[]> = {
    penicillin: ['amoxicillin', 'ampicillin', 'penicillin', 'cloxacillin', 'flucloxacillin', 'piperacillin', 'co-amoxiclav'],
    sulfa: ['sulfamethoxazole', 'co-trimoxazole', 'sulfasalazine'],
    nsaid: ['ibuprofen', 'diclofenac', 'naproxen', 'aspirin', 'mefenamic', 'ketorolac', 'celecoxib', 'etoricoxib'],
    cephalosporin: ['cef', 'cephalexin'],
  }
  for (const a of allergies.toLowerCase().split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    if (med.includes(a) || a.includes(med.split(' ')[0])) return a
    for (const [g, members] of Object.entries(groups)) if (a.includes(g) && members.some((x) => med.includes(x))) return a
  }
  return ''
}
