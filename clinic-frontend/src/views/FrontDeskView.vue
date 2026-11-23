<script setup lang="ts">
// Front desk / reception: today's bookings (check in → token), walk-ins, the live queue through
// triage and the doctor, and visits the doctor has finished that are waiting to be billed.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarPlus, Footprints, Printer, Receipt, RefreshCw, UserPlus } from 'lucide-vue-next'
import { clinic, errorMessage, flow } from '@/lib/api'
import { isoDate, money, weekday } from '@/lib/format'
import { priorityTone, stageLabel, tokenLabel, waitLabel } from '@/lib/flow'
import { statusClass } from '@/lib/appointments'
import type { Appointment, BillingQueueRow, Patient, QueueRow, TokenTicket } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import { useToast } from '@/composables/useToast'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiStatusBadge from '@/ui/UiStatusBadge.vue'
import BookDialog from '@/components/BookDialog.vue'
import PatientDialog from '@/components/PatientDialog.vue'
import WalkInDialog from '@/components/WalkInDialog.vue'
import TokenDialog from '@/components/TokenDialog.vue'

const store = useClinicStore()
const router = useRouter()
const toast = useToast()
const today = isoDate()
const appts = ref<Appointment[]>([])
const inClinic = ref<QueueRow[]>([])
const toBill = ref<BillingQueueRow[]>([])
const booking = ref(false)
const registering = ref(false)
const walkIn = ref(false)
const ticket = ref<TokenTicket | null>(null)
const busy = ref('')
const loadedAt = ref('')
let timer: number | undefined

const expected = computed(() => appts.value.filter((a) => a.status === 'Booked' || a.status === 'Confirmed'))
const counts = computed(() => ({
  triage: inClinic.value.filter((r) => r.status === 'Checked In').length,
  doctor: inClinic.value.filter((r) => r.status === 'Triaged').length,
  consult: inClinic.value.filter((r) => r.status === 'In Consultation').length,
}))

async function load() {
  const [a, q, b] = await Promise.all([
    clinic<Appointment[]>('list_appointments', { date: today }),
    flow<QueueRow[]>('queue', { stage: 'all' }),
    store.can('billing') ? clinic<BillingQueueRow[]>('billing_queue') : Promise.resolve([]),
  ])
  appts.value = a
  inClinic.value = q
  toBill.value = b
  loadedAt.value = new Date().toTimeString().slice(0, 5)
}
async function checkIn(a: Appointment) {
  busy.value = a.name
  try {
    ticket.value = await flow<TokenTicket>('check_in', { name: a.name })
    await load()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = ''
  }
}
async function setStatus(a: Appointment, status: string) {
  busy.value = a.name
  try {
    await clinic('set_appointment_status', { name: a.name, status })
    await load()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = ''
  }
}
function reprint(name: string) {
  window.open(router.resolve({ name: 'token', params: { id: name }, query: { auto: '1' } }).href, 'clinza-token', 'width=420,height=640')
}
function walkedIn(t: TokenTicket) {
  walkIn.value = false
  ticket.value = t
  load()
}
function registered(p: Patient) {
  registering.value = false
  toast.success(`${p.patient_name} registered (${p.name})`)
}
onMounted(() => {
  load()
  timer = window.setInterval(load, 20000)
})
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Front desk</h1>
        <p>{{ weekday(today) }} · updated {{ loadedAt }} <button type="button" class="link-btn" aria-label="Refresh" @click="load"><RefreshCw :size="13" /></button></p>
      </div>
      <div class="row">
        <UiButton v-if="store.can('patients')" variant="secondary" @click="registering = true"><UserPlus :size="17" /> New patient</UiButton>
        <UiButton variant="secondary" @click="booking = true"><CalendarPlus :size="17" /> Book appointment</UiButton>
        <UiButton @click="walkIn = true"><Footprints :size="17" /> Walk-in</UiButton>
      </div>
    </div>

    <div class="flowbar" aria-label="Patients in each stage">
      <div class="fstep"><span class="fstep__n">{{ expected.length }}</span><span>Expected</span></div>
      <div class="fstep"><span class="fstep__n">{{ counts.triage }}</span><span>Waiting for triage</span></div>
      <div class="fstep"><span class="fstep__n">{{ counts.doctor }}</span><span>Waiting for doctor</span></div>
      <div class="fstep"><span class="fstep__n">{{ counts.consult }}</span><span>With doctor</span></div>
      <div v-if="store.can('billing')" class="fstep fstep--bill"><span class="fstep__n">{{ toBill.length }}</span><span>Ready to bill</span></div>
    </div>

    <div class="desk">
      <UiCard title="Appointments to check in" :padded="false">
        <UiEmptyState v-if="!expected.length" title="Nobody else expected today" message="Booked patients appear here until they arrive. Walk-ins go straight to the queue." />
        <ul v-else class="list">
          <li v-for="a in expected" :key="a.name" class="item">
            <div class="time tabular">{{ a.appointment_time }}</div>
            <div class="grow">
              <strong>{{ a.patient_name }}</strong>
              <div class="small muted">{{ store.practitionerName(a.practitioner) }} · {{ a.appointment_type }} <span :class="statusClass(a.status)" class="st-sm">{{ a.status }}</span></div>
            </div>
            <div class="row acts">
              <button type="button" class="act" :disabled="busy === a.name" @click="setStatus(a, 'No Show')">No show</button>
              <UiButton size="sm" :loading="busy === a.name" @click="checkIn(a)">Check in</UiButton>
            </div>
          </li>
        </ul>
      </UiCard>

      <UiCard title="In the clinic now" :padded="false">
        <UiEmptyState v-if="!inClinic.length" title="Nobody waiting" message="Checked-in patients show here with their token, from triage until the doctor finishes." />
        <ul v-else class="list">
          <li v-for="r in inClinic" :key="r.name" class="item">
            <div class="tok tabular" :class="`tok--${r.priority || 'Routine'}`">{{ tokenLabel(r.token_no) }}</div>
            <div class="grow">
              <strong>{{ r.patient_name }}</strong> <span class="small faint">{{ r.age }} {{ r.gender }}</span>
              <div class="small muted">{{ store.practitionerName(r.practitioner) }}<span v-if="r.source === 'Walk-in'"> · walk-in</span></div>
            </div>
            <div class="stage">
              <span :class="statusClass(r.status)">{{ stageLabel(r.status) }}</span>
              <div class="small faint tabular">waiting {{ waitLabel(r.waiting_min) }}</div>
            </div>
            <UiStatusBadge v-if="r.priority && r.priority !== 'Routine'" size="sm" :tone="priorityTone(r.priority)">{{ r.priority }}</UiStatusBadge>
            <button type="button" class="icon-btn" :aria-label="`Reprint token ${tokenLabel(r.token_no)}`" title="Reprint token" @click="reprint(r.name)"><Printer :size="16" /></button>
          </li>
        </ul>
      </UiCard>
    </div>

    <UiCard v-if="store.can('billing')" title="Ready to bill" :padded="false">
      <UiEmptyState v-if="!toBill.length" :icon="Receipt" title="Nothing to bill" message="When the doctor completes a visit, it comes here for billing and payment." />
      <div v-else class="tbl-wrap" style="border: 0; border-radius: 0">
        <table class="tbl">
          <thead><tr><th>Token</th><th>Patient</th><th>Doctor</th><th>Cover</th><th class="right">Charges</th><th /></tr></thead>
          <tbody>
            <tr v-for="b in toBill" :key="b.name" class="clickable" @click="router.push({ name: 'bill', params: { id: b.name } })">
              <td class="tabular"><strong>{{ tokenLabel(b.token_no) }}</strong></td>
              <td><strong>{{ b.patient_name }}</strong><div class="small faint">{{ b.patient }}</div></td>
              <td>{{ store.practitionerName(b.practitioner) }}</td>
              <td>{{ b.policy ? 'Insurance' : 'Self-pay' }}</td>
              <td class="right tabular">{{ money(b.total, store.currency) }}</td>
              <td class="right"><UiButton size="sm" @click.stop="router.push({ name: 'bill', params: { id: b.name } })">Bill &amp; collect</UiButton></td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <BookDialog :open="booking" :date="today" @close="booking = false" @saved="booking = false; load()" />
    <PatientDialog :open="registering" @close="registering = false" @saved="registered" />
    <WalkInDialog :open="walkIn" @close="walkIn = false" @done="walkedIn" />
    <TokenDialog :ticket="ticket" @close="ticket = null" />
  </div>
</template>

<style scoped>
.flowbar { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0; border: 1px solid var(--x-border); border-radius: var(--x-radius-lg); background: var(--x-surface); overflow: hidden; box-shadow: var(--x-shadow-xs); }
.fstep { position: relative; display: flex; align-items: center; gap: 10px; padding: 14px 18px; font-weight: 600; color: var(--x-text-muted); font-size: var(--x-text-sm); }
.fstep + .fstep { border-inline-start: 1px solid var(--x-border); }
.fstep__n { font-family: var(--x-font-display); font-size: 26px; font-weight: 700; color: var(--x-text); font-variant-numeric: tabular-nums; }
.fstep--bill .fstep__n { color: var(--x-primary-text); }
.desk { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: var(--x-space-4); align-items: start; }
.list { list-style: none; margin: 0; padding: 0; }
.item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--x-surface-3); }
.item:first-child { border-top: 0; }
.time { font-weight: 700; width: 48px; flex: none; }
.tok { flex: none; width: 52px; height: 40px; display: grid; place-items: center; border-radius: 10px; font-family: var(--x-font-display); font-weight: 800; font-size: 18px; background: var(--x-primary-soft); color: var(--x-primary-text); }
.tok--Urgent { background: var(--x-warning-soft); color: var(--x-warning-text); }
.tok--Emergency { background: var(--x-danger-soft); color: var(--x-danger-text); }
.stage { text-align: end; }
.st-sm { margin-inline-start: 6px; padding: 1px 8px; font-size: 11px; }
.act { border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-danger-text); border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.icon-btn { border: 0; background: none; color: var(--x-text-muted); cursor: pointer; width: 34px; height: 34px; border-radius: 8px; flex: none; display: grid; place-items: center; }
.icon-btn:hover { background: var(--x-surface-3); color: var(--x-text); }
.link-btn { border: 0; background: none; color: var(--x-text-muted); cursor: pointer; vertical-align: middle; padding: 2px; }
@media (max-width: 1000px) { .desk { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .acts .act { display: none; } .stage .small { display: none; } }
</style>
