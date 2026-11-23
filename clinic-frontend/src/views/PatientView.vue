<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, CalendarPlus, Pencil, Plus, Printer, ShieldCheck, Stethoscope } from 'lucide-vue-next'
import { clinic } from '@/lib/api'
import { money, niceDate } from '@/lib/format'
import { statusClass } from '@/lib/appointments'
import type { Encounter, Patient, Policy } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import UiStatusBadge from '@/ui/UiStatusBadge.vue'
import PatientDialog from '@/components/PatientDialog.vue'
import PolicyDialog from '@/components/PolicyDialog.vue'
import BookDialog from '@/components/BookDialog.vue'
import PayDialog from '@/components/PayDialog.vue'

const route = useRoute()
const router = useRouter()
const store = useClinicStore()
const p = ref<Patient | null>(null)
const tab = ref<'visits' | 'appointments' | 'bills'>('visits')
const editing = ref(false)
const policyOpen = ref<Policy | null | undefined>(undefined)
const booking = ref(false)
const paying = ref<{ name: string; outstanding: number } | null>(null)
const starting = ref(false)
const activePolicy = computed(() => p.value?.policies.find((x) => x.active && (!x.valid_to || x.valid_to >= new Date().toISOString().slice(0, 10))))

async function load() {
  p.value = await clinic<Patient>('get_patient', { name: route.params.id })
}
async function startVisit() {
  starting.value = true
  try {
    const enc = await clinic<Encounter>('start_encounter', { patient: p.value!.name })
    router.push({ name: 'encounter', params: { id: enc.name } })
  } finally {
    starting.value = false
  }
}
function printUrl(kind: string, name: string) {
  return router.resolve({ name: 'print', params: { kind, id: name } }).href
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div v-if="!p" style="padding: 24px"><UiSkeleton :lines="6" /></div>
    <template v-else>
      <div class="page-head">
        <div class="row" style="gap: 16px; align-items: center">
          <div class="avatar" aria-hidden="true">{{ p.patient_name.slice(0, 1) }}</div>
          <div>
            <h1>{{ p.patient_name }}</h1>
            <p class="tabular">
              {{ p.name }} · {{ p.age || '—' }} {{ p.gender || '' }}<span v-if="p.blood_group"> · {{ p.blood_group }}</span> · {{ p.mobile || 'no mobile' }}<span v-if="p.id_number"> · {{ p.id_type }} {{ p.id_number }}</span>
            </p>
          </div>
        </div>
        <div class="row">
          <UiButton variant="secondary" @click="editing = true"><Pencil :size="16" /> Edit</UiButton>
          <UiButton v-if="store.can('appointments')" variant="secondary" @click="booking = true"><CalendarPlus :size="16" /> Book</UiButton>
          <UiButton v-if="store.can('chart')" :loading="starting" @click="startVisit"><Stethoscope :size="16" /> Start visit</UiButton>
        </div>
      </div>

      <div v-if="p.allergies" class="alert-strip"><AlertTriangle :size="16" /> Allergies: {{ p.allergies }}</div>

      <div class="split">
        <div class="stack">
          <div class="tabs" role="tablist">
            <button v-for="t in (['visits', 'appointments', 'bills'] as const)" :key="t" type="button" class="tab" :class="{ on: tab === t }" role="tab" :aria-selected="tab === t" @click="tab = t">
              {{ t === 'visits' ? `Visits (${p.encounters.length})` : t === 'appointments' ? `Appointments (${p.appointments.length})` : `Bills (${p.invoices.length})` }}
            </button>
          </div>
          <div v-if="tab === 'visits'" class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Date</th><th>Visit</th><th>Practitioner</th><th>Diagnosis</th><th>Status</th></tr></thead>
              <tbody>
                <tr v-for="e in p.encounters" :key="e.name" class="clickable" @click="router.push({ name: 'encounter', params: { id: e.name } })">
                  <td class="nowrap">{{ niceDate(e.encounter_date) }}</td>
                  <td class="tabular muted">{{ e.name }}</td>
                  <td>{{ store.practitionerName(e.practitioner) }}</td>
                  <td>{{ e.diagnoses.map((d) => d.code || d.description).join(', ') || '—' }}</td>
                  <td><UiStatusBadge :tone="e.status === 'Billed' ? 'success' : e.status === 'Completed' ? 'primary' : 'neutral'" size="sm">{{ e.status }}</UiStatusBadge></td>
                </tr>
                <tr v-if="!p.encounters.length"><td colspan="5" class="empty-row">No visits yet.</td></tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="tab === 'appointments'" class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Date</th><th>Time</th><th>Practitioner</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                <tr v-for="a in p.appointments" :key="a.name">
                  <td>{{ niceDate(a.appointment_date) }}</td>
                  <td class="tabular">{{ String(a.appointment_time).slice(0, 5) }}</td>
                  <td>{{ store.practitionerName(a.practitioner) }}</td>
                  <td>{{ a.appointment_type }}</td>
                  <td><span :class="statusClass(a.status)">{{ a.status }}</span></td>
                </tr>
                <tr v-if="!p.appointments.length"><td colspan="5" class="empty-row">No appointments.</td></tr>
              </tbody>
            </table>
          </div>
          <div v-else class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Invoice</th><th>Date</th><th class="right">Total</th><th class="right">Outstanding</th><th></th></tr></thead>
              <tbody>
                <tr v-for="i in p.invoices" :key="i.name">
                  <td class="tabular">{{ i.name }}</td>
                  <td>{{ niceDate(i.posting_date) }}</td>
                  <td class="right tabular">{{ money(i.rounded_total || i.grand_total, i.currency) }}</td>
                  <td class="right tabular">{{ money(i.outstanding_amount, i.currency) }}</td>
                  <td class="right">
                    <div class="row" style="justify-content: flex-end">
                      <UiButton v-if="i.outstanding_amount > 0" size="sm" @click="paying = { name: i.name, outstanding: i.outstanding_amount }">Pay</UiButton>
                      <a class="chip" :href="printUrl('invoice', i.name)" target="_blank" rel="noopener"><Printer :size="14" /> Print</a>
                    </div>
                  </td>
                </tr>
                <tr v-if="!p.invoices.length"><td colspan="5" class="empty-row">No bills.</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="stack">
          <UiCard title="Insurance">
            <template #actions><UiButton size="sm" variant="ghost" @click="policyOpen = null"><Plus :size="15" /> Add</UiButton></template>
            <div v-if="!p.policies.length" class="muted small">Self-pay. Add a policy to split bills with the insurer and raise claims.</div>
            <button v-for="pol in p.policies" :key="pol.name" type="button" class="policy" :class="{ off: !pol.active }" @click="policyOpen = pol">
              <ShieldCheck :size="18" />
              <div class="grow">
                <strong>{{ pol.payer }}</strong>
                <div class="small muted">{{ pol.policy_no }} · covers {{ pol.coverage_pct }}%<span v-if="pol.copay_cap"> · co-pay cap {{ money(pol.copay_cap, store.currency) }}</span></div>
                <div v-if="pol.valid_to" class="small faint">valid to {{ niceDate(pol.valid_to) }}</div>
              </div>
              <UiStatusBadge v-if="pol === activePolicy" tone="success" size="sm">Active</UiStatusBadge>
            </button>
          </UiCard>
          <UiCard title="Medical summary">
            <dl class="dl">
              <dt>Allergies</dt><dd>{{ p.allergies || 'None recorded' }}</dd>
              <dt>Chronic conditions</dt><dd>{{ p.chronic_conditions || 'None recorded' }}</dd>
              <dt>Nationality</dt><dd>{{ p.nationality || '—' }}</dd>
              <dt>Email</dt><dd>{{ p.email || '—' }}</dd>
            </dl>
          </UiCard>
        </div>
      </div>
      <PatientDialog :open="editing" :patient="p" @close="editing = false" @saved="editing = false; load()" />
      <PolicyDialog :open="policyOpen !== undefined" :patient="p.name" :policy="policyOpen" @close="policyOpen = undefined" @saved="policyOpen = undefined; load()" />
      <BookDialog :open="booking" :patient="p" @close="booking = false" @saved="booking = false; load()" />
      <PayDialog :open="!!paying" :invoice="paying?.name || ''" :outstanding="paying?.outstanding || 0" :currency="store.currency" :who="p.patient_name" @close="paying = null" @paid="paying = null; load()" />
    </template>
  </div>
</template>

<style scoped>
.avatar { width: 56px; height: 56px; border-radius: 18px; background: var(--x-brand-gradient); color: #fff; display: grid; place-items: center; font-family: var(--x-font-display); font-size: 24px; font-weight: 700; }
.policy { width: 100%; display: flex; gap: 10px; align-items: flex-start; text-align: start; font: inherit; color: var(--x-text); border: 1px solid var(--x-border); background: var(--x-surface-2); border-radius: var(--x-radius-md); padding: 10px 12px; cursor: pointer; margin-top: 8px; }
.policy:hover { border-color: var(--x-primary); }
.policy.off { opacity: 0.6; }
.policy > svg { color: var(--x-primary-text); flex: none; margin-top: 2px; }
.dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
.dl dt { color: var(--x-text-muted); font-size: var(--x-text-xs); }
.dl dd { margin: 0; }
</style>
