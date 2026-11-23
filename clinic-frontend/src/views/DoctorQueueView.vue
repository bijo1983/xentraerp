<script setup lang="ts">
// Doctor's queue: patients triaged (or checked in, if the clinic skips triage), priority first.
// Calling a patient in opens the consultation.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Stethoscope } from 'lucide-vue-next'
import { errorMessage, flow } from '@/lib/api'
import { ageYears, anyCritical, priorityTone, stageLabel, tokenLabel, vitalsLine, waitLabel } from '@/lib/flow'
import { statusClass } from '@/lib/appointments'
import type { Encounter, QueueRow } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import { useToast } from '@/composables/useToast'
import UiButton from '@/ui/UiButton.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiStatusBadge from '@/ui/UiStatusBadge.vue'

const store = useClinicStore()
const router = useRouter()
const toast = useToast()
const rows = ref<QueueRow[]>([])
const mine = ref(!!store.ctx?.practitioner)
const busy = ref('')
let timer: number | undefined

const ready = computed(() => rows.value.filter((r) => r.status === 'Triaged').length)

async function load() {
  rows.value = await flow<QueueRow[]>('queue', { stage: 'doctor', practitioner: mine.value ? store.ctx?.practitioner || '' : '' })
}
async function callIn(r: QueueRow) {
  busy.value = r.name
  try {
    const e = await flow<Encounter>('call_in', { appointment: r.name })
    router.push({ name: 'encounter', params: { id: e.name } })
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = ''
  }
}
onMounted(() => {
  load()
  timer = window.setInterval(load, 15000)
})
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Consultations</h1><p>{{ ready }} ready after triage · {{ rows.length }} in your queue</p></div>
      <label v-if="store.ctx?.practitioner" class="check small"><input v-model="mine" type="checkbox" @change="load" /> My patients only</label>
    </div>
    <UiEmptyState v-if="!rows.length" :icon="Stethoscope" title="No patients waiting" message="Patients appear here after triage. The front desk checks them in and gives them a token." />
    <div v-else class="cards">
      <article v-for="r in rows" :key="r.name" class="qc" :class="{ now: r.status === 'In Consultation', crit: anyCritical(r.vitals, ageYears(r.age)) }">
        <div class="qc__top">
          <span class="tok tabular" :class="`tok--${r.priority || 'Routine'}`">{{ tokenLabel(r.token_no) }}</span>
          <div class="grow">
            <strong class="qc__name">{{ r.patient_name }}</strong>
            <div class="small muted">{{ r.age }} {{ r.gender }} · {{ r.appointment_type }}<span v-if="!mine"> · {{ store.practitionerName(r.practitioner) }}</span></div>
          </div>
          <UiStatusBadge v-if="r.priority && r.priority !== 'Routine'" size="sm" :tone="priorityTone(r.priority)">{{ r.priority }}</UiStatusBadge>
        </div>
        <p class="qc__cc">{{ r.chief_complaint || r.notes || 'No complaint recorded at triage.' }}</p>
        <div v-if="vitalsLine(r.vitals)" class="qc__vit tabular" :class="{ crit: anyCritical(r.vitals, ageYears(r.age)) }">{{ vitalsLine(r.vitals) }}</div>
        <div v-if="r.allergies && r.allergies !== 'NKDA'" class="alert-strip"><AlertTriangle :size="14" /> {{ r.allergies }}</div>
        <div class="qc__foot">
          <span :class="statusClass(r.status)">{{ stageLabel(r.status) }}</span>
          <span class="small faint tabular">{{ waitLabel(r.waiting_min) }}</span>
          <span class="grow" />
          <UiButton size="sm" :variant="r.status === 'Checked In' ? 'secondary' : 'primary'" :loading="busy === r.name" @click="callIn(r)">{{ r.status === 'In Consultation' ? 'Resume' : r.status === 'Checked In' ? 'See without triage' : 'Call in' }}</UiButton>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--x-space-4); }
.qc { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--x-border); border-radius: var(--x-radius-lg); background: var(--x-surface); box-shadow: var(--x-shadow-sm); }
.qc.now { border-color: var(--x-primary); box-shadow: 0 0 0 3px var(--x-primary-soft); }
.qc__top { display: flex; align-items: center; gap: 12px; }
.qc__name { font-size: var(--x-text-md); }
.qc__cc { margin: 0; color: var(--x-text); line-height: 1.45; }
.qc__vit { font-size: 12.5px; color: var(--x-text-muted); background: var(--x-surface-2); border-radius: 8px; padding: 6px 10px; }
.qc__vit.crit { background: var(--x-danger-soft); color: var(--x-danger-text); font-weight: 600; }
.qc__foot { display: flex; align-items: center; gap: 10px; margin-top: auto; padding-top: 6px; border-top: 1px solid var(--x-surface-3); }
.tok { flex: none; width: 52px; height: 42px; display: grid; place-items: center; border-radius: 10px; font-family: var(--x-font-display); font-weight: 800; font-size: 18px; background: var(--x-primary-soft); color: var(--x-primary-text); }
.tok--Urgent { background: var(--x-warning-soft); color: var(--x-warning-text); }
.tok--Emergency { background: var(--x-danger-soft); color: var(--x-danger-text); }
</style>
