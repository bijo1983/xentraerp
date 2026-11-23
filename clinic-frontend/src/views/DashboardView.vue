<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarPlus, Stethoscope, UserPlus } from 'lucide-vue-next'
import { clinic } from '@/lib/api'
import { isoDate, money, weekday } from '@/lib/format'
import { statusClass } from '@/lib/appointments'
import type { Appointment, Encounter, Patient } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiBanner from '@/ui/UiBanner.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import AppointmentActions from '@/components/AppointmentActions.vue'
import BookDialog from '@/components/BookDialog.vue'
import PatientDialog from '@/components/PatientDialog.vue'

interface Dash {
  appointments: number
  by_status: Record<string, number>
  new_patients: number
  billed_today?: number
  unpaid_total?: number
  open_claims?: number
  open_claims_amount?: number
}
const store = useClinicStore()
const router = useRouter()
const today = isoDate()
const dash = ref<Dash | null>(null)
const appts = ref<Appointment[]>([])
const loading = ref(true)
const booking = ref(false)
const registering = ref(false)
const mine = ref(!!store.ctx?.practitioner)

const shown = computed(() => (mine.value && store.ctx?.practitioner ? appts.value.filter((a) => a.practitioner === store.ctx?.practitioner) : appts.value))
const waiting = computed(() => appts.value.filter((a) => a.status === 'Checked In').length)

async function load() {
  loading.value = true
  try {
    const [d, a] = await Promise.all([
      clinic<Dash>('dashboard', { date: today }),
      store.can('appointments') || store.can('billing') ? clinic<Appointment[]>('list_appointments', { date: today }) : Promise.resolve([]),
    ])
    dash.value = d
    appts.value = a
  } finally {
    loading.value = false
  }
}
async function walkIn() {
  if (!store.ctx?.practitioner) {
    router.push('/patients')
    return
  }
  router.push('/patients')
}
function registered(p: Patient) {
  registering.value = false
  router.push({ name: 'patient', params: { id: p.name } })
}
async function openVisit(a: Appointment) {
  if (a.encounter) router.push({ name: 'encounter', params: { id: a.encounter } })
  else if (store.can('chart') && a.status === 'Checked In') {
    const enc = await clinic<Encounter>('start_encounter', { appointment: a.name })
    router.push({ name: 'encounter', params: { id: enc.name } })
  } else router.push({ name: 'patient', params: { id: a.patient } })
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Good {{ new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening' }}, {{ store.ctx?.full_name?.split(' ')[0] }}</h1>
        <p>{{ weekday(today) }} · {{ store.settings?.clinic_name }}</p>
      </div>
      <div class="row">
        <UiButton v-if="store.can('patients')" variant="secondary" @click="registering = true"><UserPlus :size="17" /> New patient</UiButton>
        <UiButton v-if="store.can('appointments')" @click="booking = true"><CalendarPlus :size="17" /> Book appointment</UiButton>
      </div>
    </div>

    <UiBanner v-if="!store.ctx?.configured" tone="warning" title="Finish setting up your clinic.">
      Choose your clinic type and check your tax details in Setup before you bill.
      <template #action><UiButton v-if="store.can('setup')" size="sm" @click="router.push('/setup')">Open setup</UiButton></template>
    </UiBanner>

    <div class="grid grid-4">
      <div class="kpi"><div class="kpi__label">Appointments today</div><div class="kpi__value">{{ dash?.appointments ?? '—' }}</div><div class="kpi__sub">{{ dash?.by_status?.Completed || 0 }} completed · {{ dash?.by_status?.['No Show'] || 0 }} no-show</div></div>
      <div class="kpi"><div class="kpi__label">Waiting now</div><div class="kpi__value">{{ waiting }}</div><div class="kpi__sub">checked in, not yet seen</div></div>
      <div v-if="dash?.billed_today !== undefined" class="kpi"><div class="kpi__label">Billed today</div><div class="kpi__value">{{ money(dash.billed_today, store.currency) }}</div><div class="kpi__sub">unpaid overall {{ money(dash.unpaid_total, store.currency) }}</div></div>
      <div v-else class="kpi"><div class="kpi__label">New patients</div><div class="kpi__value">{{ dash?.new_patients ?? '—' }}</div><div class="kpi__sub">registered today</div></div>
      <div v-if="dash?.open_claims !== undefined" class="kpi"><div class="kpi__label">Open claims</div><div class="kpi__value">{{ dash.open_claims }}</div><div class="kpi__sub">{{ money(dash.open_claims_amount, store.currency) }} awaiting insurers</div></div>
      <div v-else class="kpi"><div class="kpi__label">New patients</div><div class="kpi__value">{{ dash?.new_patients ?? '—' }}</div><div class="kpi__sub">registered today</div></div>
    </div>

    <UiCard title="Today's queue" :padded="false">
      <template #actions>
        <label v-if="store.ctx?.practitioner" class="check small"><input v-model="mine" type="checkbox" /> My patients only</label>
        <UiButton size="sm" variant="ghost" @click="router.push('/appointments')">Day view</UiButton>
      </template>
      <div v-if="loading" style="padding: 20px"><UiSkeleton :lines="4" /></div>
      <UiEmptyState v-else-if="!shown.length" :icon="Stethoscope" title="No appointments today" message="Book one, or register a walk-in patient and start their visit from the patient page.">
        <UiButton v-if="store.can('appointments')" size="sm" @click="booking = true">Book appointment</UiButton>
        <UiButton v-if="store.can('patients')" size="sm" variant="secondary" @click="walkIn">Walk-in</UiButton>
      </UiEmptyState>
      <div v-else class="tbl-wrap" style="border: 0; border-radius: 0">
        <table class="tbl">
          <thead><tr><th>Time</th><th>Patient</th><th>Practitioner</th><th>Visit</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="a in shown" :key="a.name" class="clickable" @click="openVisit(a)">
              <td class="tabular nowrap"><strong>{{ a.appointment_time }}</strong> <span class="faint small">{{ a.duration }}m</span></td>
              <td><strong>{{ a.patient_name }}</strong><div class="small faint">{{ a.patient }}</div></td>
              <td>{{ store.practitionerName(a.practitioner) }}</td>
              <td>{{ a.appointment_type }}</td>
              <td><span :class="statusClass(a.status)">{{ a.status }}</span></td>
              <td class="right"><AppointmentActions :appointment="a" compact @changed="load" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>
    <BookDialog :open="booking" :date="today" @close="booking = false" @saved="booking = false; load()" />
    <PatientDialog :open="registering" @close="registering = false" @saved="registered" />
  </div>
</template>
