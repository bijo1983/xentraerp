import type { AppointmentStatus } from '@/lib/types'

/** CSS class for a status pill (`st st-Checked-In`). */
export function statusClass(s: string): string {
  return `st st-${s.replace(/\s+/g, '-')}`
}

/** The front-desk actions offered for an appointment in each status. */
export function nextActions(s: AppointmentStatus): { label: string; status: AppointmentStatus | 'start' | 'token'; tone?: 'primary' | 'danger' }[] {
  switch (s) {
    case 'Booked':
      return [{ label: 'Confirm', status: 'Confirmed' }, { label: 'Check in', status: 'Checked In', tone: 'primary' }, { label: 'No show', status: 'No Show', tone: 'danger' }, { label: 'Cancel', status: 'Cancelled', tone: 'danger' }]
    case 'Confirmed':
      return [{ label: 'Check in', status: 'Checked In', tone: 'primary' }, { label: 'No show', status: 'No Show', tone: 'danger' }, { label: 'Cancel', status: 'Cancelled', tone: 'danger' }]
    case 'Checked In':
    case 'Triaged':
      return [{ label: 'Call in', status: 'start', tone: 'primary' }, { label: 'Token', status: 'token' }, { label: 'Cancel', status: 'Cancelled', tone: 'danger' }]
    case 'In Consultation':
      return [{ label: 'Open visit', status: 'start', tone: 'primary' }]
    default:
      return []
  }
}
