<script setup lang="ts">
// Triage (nurse station): checked-in patients in token order, priority first. Record vitals,
// the presenting complaint, allergies and a priority, then send the patient to the doctor's queue.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Activity, AlertTriangle, Send } from 'lucide-vue-next'
import { errorMessage, flow } from '@/lib/api'
import { bmi } from '@/lib/format'
import { PRIORITIES, VITAL_RANGES, ageYears, anyCritical, priorityTone, tokenLabel, vitalFlag, waitLabel } from '@/lib/flow'
import type { Priority, QueueRow, Vitals } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import { useToast } from '@/composables/useToast'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiBanner from '@/ui/UiBanner.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiStatusBadge from '@/ui/UiStatusBadge.vue'
import DictateField from '@/components/DictateField.vue'

const store = useClinicStore()
const toast = useToast()
const rows = ref<QueueRow[]>([])
const current = ref<QueueRow | null>(null)
const vitals = reactive<Vitals>({})
const form = reactive({ chief_complaint: '', allergies: '', priority: 'Routine' as Priority })
const busy = ref('')
const error = ref('')
let timer: number | undefined

const NUMERIC = ['bp_systolic', 'bp_diastolic', 'pulse', 'temperature', 'resp_rate', 'spo2', 'weight', 'height', 'glucose'] as const
const bmiValue = computed(() => bmi(vitals.weight, vitals.height))
const years = computed(() => ageYears(current.value?.age))
const critical = computed(() => anyCritical(vitals, years.value))

async function load() {
  rows.value = await flow<QueueRow[]>('queue', { stage: 'triage' })
  if (current.value && !rows.value.some((r) => r.name === current.value!.name)) current.value = null
}
function open(r: QueueRow) {
  current.value = r
  error.value = ''
  for (const k of Object.keys(vitals)) delete (vitals as Record<string, unknown>)[k]
  Object.assign(form, { chief_complaint: r.notes || '', allergies: r.allergies || '', priority: r.priority || 'Routine' })
}
async function save(send: boolean) {
  if (!current.value) return
  if (send && !form.chief_complaint.trim()) {
    error.value = 'Add the presenting complaint before sending the patient to the doctor.'
    return
  }
  busy.value = send ? 'send' : 'save'
  error.value = ''
  try {
    const clean = Object.fromEntries(Object.entries(vitals).filter(([, v]) => v !== '' && v != null))
    await flow('save_triage', { appointment: current.value.name, vitals: clean, ...form, send: send ? 1 : 0 })
    toast.success(send ? `${current.value.patient_name} sent to ${store.practitionerName(current.value.practitioner)}` : 'Triage saved')
    if (send) current.value = null
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
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
      <div><h1>Triage</h1><p>{{ rows.length }} waiting for vitals · emergencies and urgent cases first, then by token</p></div>
    </div>

    <div class="tri">
      <UiCard title="Waiting" :padded="false" class="tri__queue">
        <UiEmptyState v-if="!rows.length" :icon="Activity" title="No one waiting" message="Patients appear here as soon as the front desk checks them in." />
        <ul v-else class="list" role="listbox" aria-label="Patients waiting for triage">
          <li v-for="r in rows" :key="r.name">
            <button type="button" class="qi" :class="{ on: current?.name === r.name }" role="option" :aria-selected="current?.name === r.name" @click="open(r)">
              <span class="tok tabular" :class="`tok--${r.priority || 'Routine'}`">{{ tokenLabel(r.token_no) }}</span>
              <span class="grow">
                <strong>{{ r.patient_name }}</strong>
                <span class="small muted block">{{ r.age }} {{ r.gender }} · {{ store.practitionerName(r.practitioner) }}</span>
              </span>
              <span class="small faint tabular">{{ waitLabel(r.waiting_min) }}</span>
            </button>
          </li>
        </ul>
      </UiCard>

      <div v-if="!current" class="tri__empty"><UiEmptyState title="Choose a patient" message="Pick the next token from the list to record their vitals." /></div>
      <UiCard v-else class="tri__form" :padded="false">
        <div class="pt">
          <span class="tok tok--lg tabular" :class="`tok--${form.priority}`">{{ tokenLabel(current.token_no) }}</span>
          <div class="grow">
            <h2>{{ current.patient_name }}</h2>
            <div class="small muted">{{ current.patient }} · {{ current.age }} {{ current.gender }} · {{ current.appointment_type }} with {{ store.practitionerName(current.practitioner) }}</div>
          </div>
        </div>
        <div class="body stack">
          <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
          <UiBanner v-if="critical" tone="danger" title="Critical reading.">Check it again and tell the doctor now; consider marking this patient Emergency.</UiBanner>

          <section>
            <h3 class="sec">Vital signs</h3>
            <div class="vgrid">
              <label v-for="k in NUMERIC" :key="k" class="vit" :class="vitalFlag(k, vitals[k], years)">
                <span class="vit__lbl">{{ VITAL_RANGES[k].label }}</span>
                <span class="vit__in">
                  <input v-model="vitals[k]" type="number" inputmode="decimal" :min="VITAL_RANGES[k].min" :max="VITAL_RANGES[k].max" :step="VITAL_RANGES[k].step || 1" />
                  <span class="unit">{{ VITAL_RANGES[k].unit }}</span>
                </span>
              </label>
              <div class="vit vit--calc">
                <span class="vit__lbl">BMI</span>
                <span class="vit__val tabular">{{ bmiValue ?? '—' }}</span>
              </div>
            </div>
            <div class="f" style="margin-top: 12px">
              <span>Pain score</span>
              <div class="pain" role="radiogroup" aria-label="Pain score 0 to 10">
                <button v-for="n in 11" :key="n" type="button" role="radio" :aria-checked="Number(vitals.pain) === n - 1" class="pain__b" :class="{ on: vitals.pain !== undefined && Number(vitals.pain) === n - 1 }" :style="{ '--h': 140 - (n - 1) * 14 }" @click="vitals.pain = n - 1">{{ n - 1 }}</button>
              </div>
            </div>
          </section>

          <DictateField v-model="form.chief_complaint" label="Presenting complaint" :rows="2" placeholder="e.g. Fever and sore throat for 2 days" />

          <div class="grid grid-2">
            <label class="f">
              <span>Allergies</span>
              <input v-model="form.allergies" placeholder="e.g. Penicillin, peanuts — or NKDA" />
              <span class="row" style="gap: 6px; margin-top: 4px">
                <button type="button" class="chip" @click="form.allergies = 'NKDA'">No known drug allergy</button>
              </span>
            </label>
            <div class="f">
              <span>Priority</span>
              <div class="row" role="radiogroup" aria-label="Priority">
                <button v-for="p in PRIORITIES" :key="p" type="button" role="radio" :aria-checked="form.priority === p" class="chip" :class="{ on: form.priority === p, [`prio-${p}`]: true }" @click="form.priority = p">{{ p }}</button>
              </div>
            </div>
          </div>
          <div v-if="form.allergies && form.allergies !== 'NKDA'" class="alert-strip"><AlertTriangle :size="15" /> Allergy recorded: {{ form.allergies }}</div>
        </div>
        <footer class="foot">
          <UiStatusBadge v-if="form.priority !== 'Routine'" :tone="priorityTone(form.priority)">{{ form.priority }}</UiStatusBadge>
          <span class="grow" />
          <UiButton variant="secondary" :loading="busy === 'save'" @click="save(false)">Save</UiButton>
          <UiButton :loading="busy === 'send'" @click="save(true)"><Send :size="16" /> Send to doctor</UiButton>
        </footer>
      </UiCard>
    </div>
  </div>
</template>

<style scoped>
.tri { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: var(--x-space-4); align-items: start; }
.tri__queue { position: sticky; top: 16px; }
.list { list-style: none; margin: 0; padding: 6px; }
.qi { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px; border: 0; background: none; border-radius: 10px; text-align: start; font: inherit; color: var(--x-text); cursor: pointer; }
.qi:hover { background: var(--x-surface-2); }
.qi.on { background: var(--x-primary-soft); }
.block { display: block; }
.tok { flex: none; width: 48px; height: 38px; display: grid; place-items: center; border-radius: 10px; font-family: var(--x-font-display); font-weight: 800; font-size: 16px; background: var(--x-primary-soft); color: var(--x-primary-text); }
.tok--lg { width: 72px; height: 56px; font-size: 24px; }
.tok--Urgent { background: var(--x-warning-soft); color: var(--x-warning-text); }
.tok--Emergency { background: var(--x-danger-soft); color: var(--x-danger-text); }
.pt { display: flex; gap: 14px; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--x-border); }
.pt h2 { margin: 0; font-size: var(--x-text-lg); }
.body { padding: 20px; }
.sec { margin: 0 0 10px; font-size: var(--x-text-sm); text-transform: uppercase; letter-spacing: 0.05em; color: var(--x-text-muted); }
.vgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.vit { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--x-border); border-radius: var(--x-radius-md); background: var(--x-surface); }
.vit__lbl { font-size: 12px; font-weight: 600; color: var(--x-text-muted); }
.vit__in { display: flex; align-items: baseline; gap: 6px; }
.vit__in input { width: 100%; min-width: 0; border: 0; background: transparent; font: inherit; font-family: var(--x-font-display); font-size: 22px; font-weight: 700; color: var(--x-text); padding: 0; font-variant-numeric: tabular-nums; }
.vit__in input:focus { outline: none; }
.vit:focus-within { border-color: var(--x-primary); box-shadow: var(--x-focus-ring); }
.vit__val { font-family: var(--x-font-display); font-size: 22px; font-weight: 700; }
.vit--calc { background: var(--x-surface-2); }
.unit { font-size: 12px; color: var(--x-text-faint); white-space: nowrap; }
.vit.abnormal { border-color: var(--x-warning); background: var(--x-warning-soft); }
.vit.abnormal .vit__lbl { color: var(--x-warning-text); }
.vit.critical { border-color: var(--x-danger); background: var(--x-danger-soft); }
.vit.critical .vit__lbl { color: var(--x-danger-text); }
.pain { display: grid; grid-template-columns: repeat(11, 1fr); gap: 4px; max-width: 520px; }
.pain__b { min-height: 38px; border: 1px solid var(--x-border); border-radius: 8px; background: var(--x-surface); font: inherit; font-weight: 700; cursor: pointer; color: var(--x-text); }
.pain__b.on { background: hsl(var(--h) 70% 42%); border-color: transparent; color: #fff; }
.prio-Urgent.on { background: var(--x-warning-soft); border-color: var(--x-warning); color: var(--x-warning-text); }
.prio-Emergency.on { background: var(--x-danger-soft); border-color: var(--x-danger); color: var(--x-danger-text); }
.foot { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--x-border); background: var(--x-surface-2); border-radius: 0 0 var(--x-radius-lg) var(--x-radius-lg); }
@media (max-width: 900px) { .tri { grid-template-columns: 1fr; } .tri__queue { position: static; } }
</style>
