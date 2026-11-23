<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { clinic } from '@/lib/api'
import { addDays, fromMinutes, isoDate, slots, toMinutes, weekday } from '@/lib/format'
import { statusClass } from '@/lib/appointments'
import type { Appointment } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import UiButton from '@/ui/UiButton.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiModal from '@/ui/UiModal.vue'
import AppointmentActions from '@/components/AppointmentActions.vue'
import BookDialog from '@/components/BookDialog.vue'

const store = useClinicStore()
const router = useRouter()
const date = ref(isoDate())
const appts = ref<Appointment[]>([])
const only = ref<string>('')
const booking = ref<{ time?: string; practitioner?: string; appointment?: Appointment | null } | null>(null)
const selected = ref<Appointment | null>(null)
const step = computed(() => store.settings?.slot_minutes || 15)
const times = computed(() => slots((store.settings?.opening_time || '09:00').slice(0, 5), (store.settings?.closing_time || '21:00').slice(0, 5), step.value))
const columns = computed(() => (store.ctx?.practitioners || []).filter((p) => !only.value || p.name === only.value))
const ROW = 30 // px per slot

async function load() {
  appts.value = await clinic<Appointment[]>('list_appointments', { date: date.value })
}
function byPractitioner(p: string) {
  return appts.value.filter((a) => a.practitioner === p && a.status !== 'Cancelled')
}
function top(a: Appointment) {
  return ((toMinutes(a.appointment_time) - toMinutes(times.value[0] || '09:00')) / step.value) * ROW
}
function height(a: Appointment) {
  return Math.max(ROW - 2, ((a.duration || step.value) / step.value) * ROW - 2)
}
function slotClick(p: string, t: string) {
  if (store.can('appointments')) booking.value = { time: t, practitioner: p }
}
const nowLine = computed(() => {
  if (date.value !== isoDate()) return null
  const n = new Date()
  const m = n.getHours() * 60 + n.getMinutes()
  const start = toMinutes(times.value[0] || '09:00')
  return m < start || m > start + times.value.length * step.value ? null : ((m - start) / step.value) * ROW
})
watch(date, load)
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Appointments</h1>
        <p>{{ weekday(date) }} · {{ appts.filter((a) => a.status !== 'Cancelled').length }} booked</p>
      </div>
      <div class="row">
        <UiButton variant="secondary" size="sm" aria-label="Previous day" @click="date = addDays(date, -1)"><ChevronLeft :size="16" /></UiButton>
        <input v-model="date" type="date" class="ctl" style="width: auto" />
        <UiButton variant="secondary" size="sm" aria-label="Next day" @click="date = addDays(date, 1)"><ChevronRight :size="16" /></UiButton>
        <UiButton variant="ghost" size="sm" @click="date = isoDate()">Today</UiButton>
        <select v-model="only" class="ctl" style="width: auto">
          <option value="">All practitioners</option>
          <option v-for="p in store.ctx?.practitioners || []" :key="p.name" :value="p.name">{{ p.practitioner_name }}</option>
        </select>
        <UiButton v-if="store.can('appointments')" @click="booking = {}"><CalendarPlus :size="17" /> Book</UiButton>
      </div>
    </div>

    <UiEmptyState v-if="!columns.length" title="No practitioners yet" message="Add your doctors and therapists in Setup → Practitioners to start booking.">
      <UiButton v-if="store.can('setup')" @click="router.push('/setup?tab=practitioners')">Add practitioners</UiButton>
    </UiEmptyState>

    <div v-else class="cal">
      <div class="cal__head" :style="{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(180px, 1fr))` }">
        <div />
        <div v-for="p in columns" :key="p.name" class="cal__col-head">
          <span class="dot" :style="{ background: p.color || 'var(--x-primary)' }" />
          <div>
            <strong>{{ p.practitioner_name }}</strong>
            <div class="small muted">{{ p.specialty }} · {{ byPractitioner(p.name).length }} appts</div>
          </div>
        </div>
      </div>
      <div class="cal__body" :style="{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(180px, 1fr))` }">
        <div class="cal__times">
          <div v-for="t in times" :key="t" class="cal__time" :style="{ height: ROW + 'px' }">{{ t.endsWith(':00') ? t : '' }}</div>
        </div>
        <div v-for="p in columns" :key="p.name" class="cal__col">
          <button v-for="t in times" :key="t" type="button" class="cal__slot" :class="{ hour: t.endsWith(':00') }" :style="{ height: ROW + 'px' }" :aria-label="`Book ${p.practitioner_name} at ${t}`" @click="slotClick(p.name, t)" />
          <div v-if="nowLine !== null" class="cal__now" :style="{ top: nowLine + 'px' }" />
          <button
            v-for="a in byPractitioner(p.name)"
            :key="a.name"
            type="button"
            class="appt"
            :class="statusClass(a.status)"
            :style="{ top: top(a) + 'px', height: height(a) + 'px' }"
            @click="selected = a"
          >
            <span class="appt__time tabular">{{ a.appointment_time }}–{{ fromMinutes(toMinutes(a.appointment_time) + (a.duration || step)) }}</span>
            <strong class="appt__name">{{ a.patient_name }}</strong>
            <span class="appt__type">{{ a.appointment_type }}</span>
          </button>
        </div>
      </div>
    </div>

    <UiModal :open="!!selected" :title="selected?.patient_name" size="sm" @close="selected = null">
      <div v-if="selected" class="stack">
        <div class="row"><span :class="statusClass(selected.status)">{{ selected.status }}</span><span class="muted">{{ selected.appointment_type }}</span></div>
        <div><strong class="tabular">{{ selected.appointment_time }}</strong> · {{ selected.duration }} min with {{ store.practitionerName(selected.practitioner) }}</div>
        <div v-if="selected.notes" class="muted">{{ selected.notes }}</div>
        <AppointmentActions :appointment="selected" @changed="selected = null; load()" />
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="router.push({ name: 'patient', params: { id: selected!.patient } })">Patient file</UiButton>
        <UiButton v-if="store.can('appointments') && selected && ['Booked', 'Confirmed'].includes(selected.status)" variant="secondary" @click="booking = { appointment: selected }; selected = null">Reschedule</UiButton>
      </template>
    </UiModal>
    <BookDialog
      :open="!!booking"
      :date="date"
      :time="booking?.time"
      :practitioner="booking?.practitioner"
      :appointment="booking?.appointment"
      @close="booking = null"
      @saved="booking = null; load()"
    />
  </div>
</template>

<style scoped>
.cal { border: 1px solid var(--x-border); border-radius: var(--x-radius-lg); background: var(--x-surface); overflow: auto; max-height: calc(100dvh - 190px); }
.cal__body { padding-top: 8px; }
.cal__head, .cal__body { display: grid; min-width: fit-content; }
.cal__head { position: sticky; top: 0; z-index: 2; background: var(--x-surface); border-bottom: 1px solid var(--x-border); }
.cal__col-head { display: flex; align-items: center; gap: 10px; padding: 12px; border-inline-start: 1px solid var(--x-border); }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.cal__times { border-inline-end: 1px solid var(--x-border); }
.cal__time { font-size: 11px; color: var(--x-text-faint); text-align: end; padding-inline-end: 8px; transform: translateY(-6px); font-variant-numeric: tabular-nums; }
.cal__col { position: relative; border-inline-start: 1px solid var(--x-surface-3); }
.cal__slot { display: block; width: 100%; border: 0; border-top: 1px dashed var(--x-surface-3); background: transparent; cursor: copy; padding: 0; }
.cal__slot.hour { border-top: 1px solid var(--x-border); }
.cal__slot:hover { background: var(--x-primary-soft); }
.cal__now { position: absolute; inset-inline: 0; height: 2px; background: var(--x-danger); z-index: 1; pointer-events: none; }
.appt { position: absolute; inset-inline: 4px; border: 0; border-radius: 8px; padding: 4px 8px; text-align: start; font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 0; overflow: hidden; box-shadow: var(--x-shadow-xs); border-inline-start: 3px solid currentColor; z-index: 1; }
.appt::before { display: none; }
.appt__time { font-size: 11px; opacity: 0.85; }
.appt__name { font-size: 12.5px; color: var(--x-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.appt__type { font-size: 11px; color: var(--x-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
