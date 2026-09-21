<script setup lang="ts">
// Book a party (or look at / act on a booking): name, phone, party size, date, time and the
// tables to hold for them. Seating a booking opens its order (several tables are joined for a
// big party).
import { ref, computed } from 'vue'

export interface Booking {
  name: string
  guest: string
  phone: string
  party_size: number
  date: string
  time: string
  meal: string
  status: string
  tables: string[]
  order: string | null
  order_status: string | null
  notes: string
}
interface TableChoice { name: string; seats: number; zone: string; status?: string }

const props = defineProps<{ booking?: Booking | null; tables: TableChoice[]; date: string; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{
  (e: 'save', v: { name?: string; guest: string; phone: string; party: number; date: string; time: string; meal: string; tables: string[]; notes: string }): void
  (e: 'seat', name: string, tables: string[]): void
  (e: 'cancelBooking', name: string): void
  (e: 'noShow', name: string): void
  (e: 'close'): void
}>()

const b = props.booking
const guest = ref(b?.guest || '')
const phone = ref(b?.phone || '')
const party = ref(String(b?.party_size || 2))
const date = ref(b?.date || props.date)
const time = ref(b?.time || '19:00')
const meal = ref(b?.meal || '')
const notes = ref(b?.notes || '')
const held = ref<string[]>(b?.tables ? [...b.tables] : [])
const editable = computed(() => !b || b.status === 'Booked')
// A table someone is dining at can't seat this party now (only matters when seating).
const busyTable = (name: string) => props.tables.find((x) => x.name === name)?.status === 'Occupied'
// A booking made without holding a table (common: the table isn't known until they arrive)
// would otherwise leave "Seat now" greyed out with no hint. Suggest the smallest free table
// that fits the party — highlighted, and easy to change.
const suggested = ref(false)
if (b && b.status === 'Booked' && !held.value.length) {
  const fit = props.tables
    .filter((t) => t.status !== 'Occupied' && t.status !== 'Disabled' && t.seats >= b.party_size)
    .sort((x, y) => x.seats - y.seats)[0]
  if (fit) {
    held.value = [fit.name]
    suggested.value = true
  }
}
const seatBlocked = computed(() => held.value.find(busyTable))
const seatHint = computed(() => {
  if (!b) return ''
  if (!held.value.length) return 'Pick the table (or tables) to seat them at — then Seat now is enabled.'
  if (seatBlocked.value) return `Table ${seatBlocked.value} is occupied — pick a free table, or settle the bill there first.`
  return suggested.value ? `No table was held for this booking, so ${held.value.join(', ')} is suggested. Change it if you like.` : ''
})
const seatsHeld = computed(() => held.value.reduce((n, t) => n + (props.tables.find((x) => x.name === t)?.seats || 0), 0))

function toggle(t: string) {
  if (!editable.value) return
  held.value = held.value.includes(t) ? held.value.filter((x) => x !== t) : [...held.value, t]
}
</script>

<template>
  <div class="modal-back" @click.self="emit('close')">
    <div class="modal" style="width: 540px">
      <h3 style="margin: 0 0 12px">{{ booking ? `Booking · ${booking.status}` : 'New reservation' }}</h3>
      <div class="row" style="margin-bottom: 8px">
        <input v-model="guest" class="fld" style="flex: 2" placeholder="Guest name" :disabled="!editable" />
        <input v-model="phone" class="fld" style="flex: 1" placeholder="Phone" inputmode="tel" :disabled="!editable" />
      </div>
      <div class="row" style="margin-bottom: 8px">
        <input v-model="party" class="fld tabular" style="width: 80px" type="number" min="1" placeholder="Guests" :disabled="!editable" />
        <input v-model="date" class="fld" type="date" :disabled="!editable" />
        <input v-model="time" class="fld" type="time" :disabled="!editable" />
        <select v-model="meal" class="fld" :disabled="!editable"><option value="">Meal (auto)</option><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Other</option></select>
      </div>
      <p class="sub2" style="margin: 8px 0 6px">Tables to hold <span v-if="held.length">— {{ seatsHeld }} seats for {{ party }} guests</span></p>
      <div class="row" style="margin-bottom: 8px">
        <button v-for="t in tables" :key="t.name" class="cat-chip" :class="{ active: held.includes(t.name) }" :disabled="!editable && !held.includes(t.name)" @click="toggle(t.name)">{{ t.name }} <small>· {{ t.seats }}{{ t.status === 'Occupied' ? ' · occupied' : '' }}</small></button>
      </div>
      <p v-if="seatHint" class="sub2" style="margin: 0 0 8px" :style="{ color: !held.length || seatBlocked ? 'var(--danger)' : 'var(--text-muted)' }">{{ seatHint }}</p>
      <input v-model="notes" class="fld" style="width: 100%" placeholder="Notes (window seat, birthday…)" :disabled="!editable" />
      <p v-if="error" class="error-box" style="margin-top: 10px">{{ error }}</p>
      <div class="row" style="margin-top: 14px">
        <button class="btn btn-ghost" @click="emit('close')">Close</button>
        <template v-if="booking && booking.status === 'Booked'">
          <button class="btn btn-ghost" style="color: var(--danger)" :disabled="busy" @click="emit('cancelBooking', booking.name)">Cancel booking</button>
          <button class="btn btn-ghost" :disabled="busy" @click="emit('noShow', booking.name)">No show</button>
          <button class="btn btn-primary" :disabled="busy || !held.length || !!seatBlocked" @click="emit('seat', booking.name, held)">Seat now</button>
        </template>
        <button v-if="editable" class="btn btn-primary" style="margin-left: auto" :disabled="busy || !guest" @click="emit('save', { name: booking?.name, guest, phone, party: Number(party) || 1, date, time, meal, tables: held, notes })">{{ booking ? 'Save changes' : 'Book' }}</button>
      </div>
    </div>
  </div>
</template>
