<script setup lang="ts">
// The doctor's consultation. Clinical only: triage vitals, complaint, history and examination
// (typed or dictated), specialty charts, ICD-10 diagnoses, prescription by generic name, advice
// and follow-up. Charges, insurance and payment are handled at the front desk (VisitBillView).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Activity, AlertTriangle, CheckCircle2, History, Mic, Printer, Receipt, Save, Trash2 } from 'lucide-vue-next'
import { clinic, errorMessage, flow } from '@/lib/api'
import { addDays, bmi, isoDate, niceDate } from '@/lib/format'
import { VITAL_RANGES, ageYears, priorityTone, tokenLabel, vitalFlag } from '@/lib/flow'
import { rememberIcd, searchIcd } from '@/lib/icd10'
import { DICTATION_LANGS, useDictation } from '@/composables/useDictation'
import type { Diagnosis, Encounter, Patient, RxItem, Vitals } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import { useToast } from '@/composables/useToast'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiBanner from '@/ui/UiBanner.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import UiStatusBadge from '@/ui/UiStatusBadge.vue'
import ChartForm from '@/components/ChartForm.vue'
import DictateField from '@/components/DictateField.vue'
import RxEditor from '@/components/RxEditor.vue'

type Dx = Diagnosis & { certainty?: 'Provisional' | 'Confirmed' }

const route = useRoute()
const router = useRouter()
const store = useClinicStore()
const toast = useToast()
const dict = useDictation()
const enc = ref<Encounter | null>(null)
const patient = ref<Patient | null>(null)
const freqs = ref<{ code: string; label: string; per_day: number | null }[]>([])
const activeTpl = ref('')
const dirty = ref(false)
const busy = ref('')
const error = ref('')
const icdQuery = ref('')
const icdHi = ref(0)
const editVitals = ref(false)

// The consultation note replaces the generic SOAP and vitals templates; specialty charts stay.
const CORE = ['vitals', 'soap']
const locked = computed(() => !store.can('chart') || ['Billed', 'Cancelled'].includes(enc.value?.status || ''))
const completed = computed(() => enc.value?.status !== 'Draft')
const templates = computed(() => store.ctx?.templates || {})
const specialty = computed(() => (enc.value?.templates || []).filter((k) => !CORE.includes(k) && templates.value[k]))
const unusedTemplates = computed(() => Object.keys(templates.value).filter((k) => !CORE.includes(k) && !enc.value?.templates.includes(k)))
const icdHits = computed(() => searchIcd(icdQuery.value, 10))
const vitals = computed<Vitals>(() => (enc.value?.chart_data.vitals as Vitals) || {})
const vitalKeys = computed(() => Object.keys(VITAL_RANGES).filter((k) => vitals.value[k as keyof Vitals] !== undefined && vitals.value[k as keyof Vitals] !== ''))
const bmiValue = computed(() => bmi(vitals.value.weight, vitals.value.height))
const pastVisits = computed(() => (patient.value?.encounters || []).filter((e) => e.name !== enc.value?.name).slice(0, 6))
const followUps = [
  ['3 days', 3],
  ['1 week', 7],
  ['2 weeks', 14],
  ['1 month', 30],
  ['3 months', 90],
] as const

const EXAM_PHRASES = [
  'Conscious, alert and oriented. No acute distress.',
  'Chest clear bilaterally, no added sounds.',
  'S1 S2 heard, no murmurs.',
  'Abdomen soft, non-tender, no organomegaly.',
  'Throat congested, tonsils not enlarged.',
  'No pallor, icterus, cyanosis, clubbing or oedema.',
  'Tympanic membranes intact bilaterally.',
]

async function load() {
  const e = await clinic<Encounter>('get_encounter', { name: route.params.id })
  if (!store.can('chart')) {
    router.replace({ name: 'bill', params: { id: e.name } })
    return
  }
  // Older visits kept the note inside the SOAP template; bring it into the consultation fields.
  const soap = (e.chart_data.soap || {}) as Record<string, string>
  e.chief_complaint = e.chief_complaint || soap.chief_complaint || ''
  e.history = e.history || [soap.hpi, soap.past_history].filter(Boolean).join('\n') || ''
  e.examination = e.examination || soap.examination || ''
  e.advice = e.advice || soap.advice || ''
  enc.value = e
  activeTpl.value = specialty.value[0] || ''
  dirty.value = false
  patient.value = await clinic<Patient>('get_patient', { name: e.patient }).catch(() => null)
}
function touch() {
  dirty.value = true
}
watch(
  () => enc.value && [enc.value.chief_complaint, enc.value.history, enc.value.examination, enc.value.advice, enc.value.notes, enc.value.follow_up_date],
  (n, o) => {
    if (o && n) touch()
  },
  { deep: true },
)
function addTemplate(k: string) {
  if (!enc.value || !k) return
  enc.value.templates.push(k)
  activeTpl.value = k
  touch()
}
function removeTemplate(k: string) {
  if (!enc.value) return
  enc.value.templates = enc.value.templates.filter((t) => t !== k)
  activeTpl.value = specialty.value[0] || ''
  touch()
}
function setVitals(v: Record<string, unknown>) {
  if (!enc.value) return
  enc.value.chart_data.vitals = v
  if (!enc.value.templates.includes('vitals')) enc.value.templates.unshift('vitals')
  touch()
}
function addPhrase(p: string) {
  if (!enc.value) return
  const cur = enc.value.examination || ''
  enc.value.examination = cur ? `${cur.replace(/\s+$/, '')}\n${p}` : p
}
function addDx(code: string, description: string) {
  if (!enc.value) return
  const list = enc.value.diagnoses as Dx[]
  if (!list.some((d) => d.code === code && code)) list.push({ code, description, primary: list.length ? 0 : 1, certainty: 'Confirmed' })
  rememberIcd(code, description)
  icdQuery.value = ''
  touch()
}
function onIcdKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    icdHi.value = Math.min(icdHi.value + 1, icdHits.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    icdHi.value = Math.max(icdHi.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const hit = icdQuery.value.trim() ? icdHits.value[icdHi.value] : null
    if (hit) addDx(hit[0], hit[1])
    else addFreeDx()
  }
}
function addFreeDx() {
  const q = icdQuery.value.trim()
  if (!q) return
  const looksLikeCode = /^[A-Z]\d{2}(\.\w{1,4})?$/i.test(q)
  addDx(looksLikeCode ? q.toUpperCase() : '', looksLikeCode ? '' : q)
}
function setPrimary(d: Dx) {
  enc.value?.diagnoses.forEach((x) => (x.primary = x === d ? 1 : 0))
  touch()
}
function toggleCertainty(d: Dx) {
  d.certainty = d.certainty === 'Provisional' ? 'Confirmed' : 'Provisional'
  touch()
}
function setFollowUp(days: number) {
  if (!enc.value) return
  enc.value.follow_up_date = addDays(enc.value.encounter_date || isoDate(), days)
}
function followUpLabel() {
  const f = enc.value?.follow_up_date
  return f ? niceDate(f) : ''
}

async function save(complete = false): Promise<boolean> {
  if (!enc.value) return false
  if (complete && !enc.value.diagnoses.length) {
    error.value = 'Add at least one diagnosis (an ICD-10 code, or a provisional diagnosis) before completing the visit.'
    return false
  }
  busy.value = complete ? 'complete' : 'save'
  error.value = ''
  try {
    const e = enc.value
    const saved = await clinic<Encounter>('save_encounter', {
      data: {
        name: e.name, templates: e.templates, chart_data: e.chart_data, diagnoses: e.diagnoses, notes: e.notes || '',
        chief_complaint: e.chief_complaint || '', history: e.history || '', examination: e.examination || '', advice: e.advice || '',
        follow_up_date: e.follow_up_date || '',
        prescriptions: e.prescriptions.map((rx) => {
          const { _brands, _strengths, ...rest } = rx as RxItem & { _brands?: string[]; _strengths?: string[] }
          void _brands
          void _strengths
          return rest
        }),
        complete: complete ? 1 : 0,
      },
    })
    // keep the brand/strength suggestions on screen
    saved.prescriptions = saved.prescriptions.map((rx, i) => ({ ...e.prescriptions[i], ...rx }))
    enc.value = { ...saved, chief_complaint: saved.chief_complaint || '', history: saved.history || '', examination: saved.examination || '', advice: saved.advice || '' }
    dirty.value = false
    if (complete) {
      dict.stop()
      toast.success(`${saved.patient_doc.patient_name}: visit completed and sent to the front desk`)
      router.push({ name: 'consult' })
    } else toast.success('Saved')
    return true
  } catch (err) {
    error.value = errorMessage(err)
    return false
  } finally {
    busy.value = ''
  }
}
function printRx() {
  if (!enc.value) return
  const href = router.resolve({ name: 'print', params: { kind: 'prescription', id: enc.value.name } }).href
  const go = () => window.open(href, '_blank', 'noopener')
  if (dirty.value) save().then((ok) => ok && go())
  else go()
}
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (!locked.value && dirty.value) save()
  }
}
onBeforeRouteLeave(() => {
  dict.stop()
  if (dirty.value && !locked.value) return window.confirm('Leave without saving this consultation?')
  return true
})
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  const [, ref_] = await Promise.all([load(), flow<{ frequencies: typeof freqs.value }>('prescribing_reference').catch(() => ({ frequencies: [] }))])
  freqs.value = ref_.frequencies
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="page">
    <div v-if="!enc" style="padding: 24px"><UiSkeleton :lines="8" /></div>
    <template v-else>
      <div class="page-head head">
        <div class="row" style="gap: 14px; align-items: center">
          <span v-if="enc.appointment_doc?.token_no" class="tok tabular" :class="`tok--${enc.appointment_doc.priority || 'Routine'}`" title="Token">{{ tokenLabel(enc.appointment_doc.token_no) }}</span>
          <div>
            <div class="row"><h1>{{ enc.patient_doc.patient_name }}</h1><UiStatusBadge :tone="enc.status === 'Draft' ? 'primary' : enc.status === 'Billed' ? 'success' : 'neutral'">{{ enc.status === 'Draft' ? 'In consultation' : enc.status }}</UiStatusBadge>
              <UiStatusBadge v-if="enc.appointment_doc?.priority && enc.appointment_doc.priority !== 'Routine'" :tone="priorityTone(enc.appointment_doc.priority)">{{ enc.appointment_doc.priority }}</UiStatusBadge></div>
            <p class="tabular">
              <router-link :to="{ name: 'patient', params: { id: enc.patient } }">{{ enc.patient }}</router-link>
              · {{ enc.patient_doc.age }} {{ enc.patient_doc.gender || '' }}<span v-if="enc.patient_doc.blood_group"> · {{ enc.patient_doc.blood_group }}</span>
              · {{ niceDate(enc.encounter_date) }} · {{ enc.practitioner_doc?.practitioner_name }}<span v-if="enc.appointment_doc?.appointment_type"> · {{ enc.appointment_doc.appointment_type }}</span>
            </p>
          </div>
        </div>
        <div class="row">
          <label v-if="dict.supported && !locked" class="lang" title="Dictation language"><Mic :size="14" aria-hidden="true" />
            <select :value="dict.lang.value" aria-label="Dictation language" @change="dict.setLang(($event.target as HTMLSelectElement).value)"><option v-for="l in DICTATION_LANGS" :key="l.code" :value="l.code">{{ l.label }}</option></select>
          </label>
          <UiButton v-if="enc.prescriptions.length" variant="secondary" @click="printRx"><Printer :size="16" /> Prescription</UiButton>
          <UiButton v-if="!locked" variant="secondary" :loading="busy === 'save'" :disabled="!dirty" @click="save()"><Save :size="16" /> Save</UiButton>
          <UiButton v-if="!locked && !completed" :loading="busy === 'complete'" @click="save(true)"><CheckCircle2 :size="16" /> Complete visit</UiButton>
          <UiButton v-if="store.can('billing') && enc.status === 'Completed'" variant="secondary" @click="router.push({ name: 'bill', params: { id: enc.name } })"><Receipt :size="16" /> Billing</UiButton>
        </div>
      </div>

      <div v-if="enc.patient_doc.allergies && enc.patient_doc.allergies !== 'NKDA'" class="alert-strip big"><AlertTriangle :size="16" /> Allergies: {{ enc.patient_doc.allergies }}</div>
      <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
      <UiBanner v-if="dict.error.value" tone="warning">{{ dict.error.value }}</UiBanner>
      <UiBanner v-if="completed && !locked" tone="info">This visit is completed and with the front desk for billing. You can still correct the notes until it is billed.</UiBanner>

      <div class="split">
        <div class="stack">
          <UiCard :padded="false">
            <div class="vit-head">
              <h2 class="card-t"><Activity :size="16" /> Triage</h2>
              <span v-if="enc.triage_at" class="small faint">recorded {{ String(enc.triage_at).slice(11, 16) }}</span>
              <span class="grow" />
              <UiButton v-if="!locked && templates.vitals" size="sm" variant="ghost" @click="editVitals = !editVitals">{{ editVitals ? 'Done' : vitalKeys.length ? 'Edit vitals' : 'Add vitals' }}</UiButton>
            </div>
            <div v-if="!editVitals" class="vit-row">
              <div v-for="k in vitalKeys" :key="k" class="vchip" :class="vitalFlag(k, vitals[k as keyof Vitals], ageYears(enc.patient_doc.age))">
                <span class="vchip__l">{{ VITAL_RANGES[k].label }}</span>
                <span class="vchip__v tabular">{{ vitals[k as keyof Vitals] }}<small>{{ VITAL_RANGES[k].unit }}</small></span>
              </div>
              <div v-if="bmiValue" class="vchip"><span class="vchip__l">BMI</span><span class="vchip__v tabular">{{ bmiValue }}</span></div>
              <p v-if="!vitalKeys.length" class="muted small" style="margin: 0">No vitals recorded — this patient wasn't triaged.</p>
            </div>
            <div v-else style="padding: 0 20px 16px"><ChartForm :template="templates.vitals" :model-value="enc.chart_data.vitals" @update:model-value="setVitals" /></div>
          </UiCard>

          <UiCard title="Consultation note">
            <div class="stack">
              <DictateField v-model="enc.chief_complaint" label="Chief complaint" :rows="2" :disabled="locked" placeholder="Main reason for the visit, in the patient's words" />
              <DictateField v-model="enc.history" label="History of present illness" :rows="4" :disabled="locked" hint="onset · duration · severity · associated symptoms · past history · current medicines" />
              <DictateField v-model="enc.examination" label="Examination" :rows="5" :disabled="locked" placeholder="General and systemic examination findings" />
              <div v-if="!locked" class="phrases">
                <span class="small faint">Quick insert:</span>
                <button v-for="p in EXAM_PHRASES" :key="p" type="button" class="mini" @click="addPhrase(p)">{{ p }}</button>
              </div>
            </div>
          </UiCard>

          <UiCard v-if="specialty.length || unusedTemplates.length" :padded="false">
            <div class="tabs" style="padding: 0 12px">
              <span class="tabs-lbl">Specialty exam</span>
              <button v-for="k in specialty" :key="k" type="button" class="tab" :class="{ on: activeTpl === k }" @click="activeTpl = k">
                {{ templates[k]?.label || k }}
                <span v-if="!locked" class="x" role="button" aria-label="Remove chart" @click.stop="removeTemplate(k)">×</span>
              </button>
              <select v-if="!locked && unusedTemplates.length" class="ctl add-tpl" :value="''" aria-label="Add a chart" @change="addTemplate(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
                <option value="" disabled>+ Add chart</option>
                <option v-for="k in unusedTemplates" :key="k" :value="k">{{ templates[k].label }}</option>
              </select>
            </div>
            <div v-if="activeTpl && templates[activeTpl]" style="padding: 20px">
              <ChartForm :template="templates[activeTpl]" :model-value="enc.chart_data[activeTpl]" :readonly="locked" @update:model-value="enc.chart_data[activeTpl] = $event; touch()" />
            </div>
          </UiCard>

          <UiCard title="Diagnosis (ICD-10)">
            <div class="stack">
              <div v-for="(d, i) in enc.diagnoses as Dx[]" :key="i" class="dx">
                <button type="button" class="chip" :class="{ on: d.primary }" :disabled="locked" :aria-pressed="!!d.primary" @click="setPrimary(d)">{{ d.primary ? 'Primary' : 'Secondary' }}</button>
                <button type="button" class="chip" :class="{ prov: d.certainty === 'Provisional' }" :disabled="locked" @click="toggleCertainty(d)">{{ d.certainty === 'Provisional' ? 'Provisional' : 'Confirmed' }}</button>
                <strong class="tabular code">{{ d.code || '—' }}</strong>
                <span class="grow">{{ d.description }}</span>
                <button v-if="!locked" type="button" class="icon-btn" aria-label="Remove diagnosis" @click="enc.diagnoses.splice(i, 1); touch()"><Trash2 :size="15" /></button>
              </div>
              <div v-if="!locked" class="dx-search">
                <input v-model="icdQuery" class="ctl" role="combobox" aria-label="Search ICD-10" :aria-expanded="!!icdQuery" placeholder="Search ICD-10 by code, condition or abbreviation (J06, URTI, hypertension, caries)…" @input="icdHi = 0" @keydown="onIcdKey" />
                <ul v-if="icdQuery && icdHits.length" class="hits" role="listbox">
                  <li v-for="([c, d], i) in icdHits" :key="c"><button type="button" role="option" :aria-selected="i === icdHi" :class="{ on: i === icdHi }" @mouseenter="icdHi = i" @click="addDx(c, d)"><strong class="tabular">{{ c }}</strong> {{ d }}</button></li>
                  <li><button type="button" class="typed" @click="addFreeDx">Use “{{ icdQuery.trim() }}” as typed</button></li>
                </ul>
                <div v-else-if="!icdQuery" class="row recent">
                  <span class="small faint">Recent:</span>
                  <button v-for="[c, d] in icdHits.slice(0, 6)" :key="c" type="button" class="mini" :title="d" @click="addDx(c, d)">{{ c }} · {{ d.length > 28 ? d.slice(0, 28) + '…' : d }}</button>
                </div>
              </div>
            </div>
          </UiCard>

          <UiCard title="Prescription">
            <RxEditor v-model="enc.prescriptions" :allergies="enc.patient_doc.allergies" :disabled="locked" :frequencies="freqs" @change="touch" />
          </UiCard>

          <UiCard title="Advice & follow-up">
            <div class="stack">
              <DictateField v-model="enc.advice" label="Advice to patient" :rows="3" :disabled="locked" placeholder="Diet, rest, warning signs to return for…" />
              <div class="f">
                <span>Follow-up</span>
                <div class="row">
                  <button v-for="[l, d] in followUps" :key="l" type="button" class="chip" :class="{ on: enc.follow_up_date === addDays(enc.encounter_date || isoDate(), d) }" :disabled="locked" @click="setFollowUp(d)">{{ l }}</button>
                  <input v-model="enc.follow_up_date" type="date" class="ctl" style="width: auto" :disabled="locked" aria-label="Follow-up date" />
                  <button v-if="enc.follow_up_date && !locked" type="button" class="mini" @click="enc.follow_up_date = null">No follow-up</button>
                </div>
                <span v-if="followUpLabel()" class="small muted">Review on {{ followUpLabel() }} — the front desk books it.</span>
              </div>
              <DictateField v-model="enc.notes" label="Private notes (not printed)" :rows="2" :disabled="locked" />
            </div>
          </UiCard>
        </div>

        <aside class="stack sticky">
          <UiCard>
            <template #default>
              <h2 class="card-t"><History :size="16" /> Patient summary</h2>
              <dl class="kv">
                <dt>Allergies</dt><dd :class="{ danger: enc.patient_doc.allergies && enc.patient_doc.allergies !== 'NKDA' }">{{ enc.patient_doc.allergies || 'Not recorded' }}</dd>
                <dt>Chronic</dt><dd>{{ enc.patient_doc.chronic_conditions || '—' }}</dd>
                <dt v-if="patient?.blood_group">Blood group</dt><dd v-if="patient?.blood_group">{{ patient.blood_group }}</dd>
              </dl>
              <h3 class="sub">Previous visits</h3>
              <p v-if="!pastVisits.length" class="small muted" style="margin: 0">First visit.</p>
              <ol v-else class="past">
                <li v-for="v in pastVisits" :key="v.name">
                  <router-link :to="{ name: 'encounter', params: { id: v.name } }" class="small"><strong>{{ niceDate(v.encounter_date) }}</strong></router-link>
                  <span class="small faint"> · {{ store.practitionerName(v.practitioner) }}</span>
                  <div class="small">{{ (v.diagnoses || []).map((d) => d.description || d.code).join('; ') || 'No diagnosis recorded' }}</div>
                </li>
              </ol>
            </template>
          </UiCard>
          <div class="small faint tips">
            Tip: press <kbd>Ctrl</kbd>+<kbd>M</kbd> in a note to dictate, <kbd>Ctrl</kbd>+<kbd>S</kbd> to save. Say “full stop”, “comma”, “new line”.
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.head h1 { margin: 0; }
.sticky { position: sticky; top: 16px; }
.tok { flex: none; width: 64px; height: 52px; display: grid; place-items: center; border-radius: 12px; font-family: var(--x-font-display); font-weight: 800; font-size: 22px; background: var(--x-primary-soft); color: var(--x-primary-text); }
.tok--Urgent { background: var(--x-warning-soft); color: var(--x-warning-text); }
.tok--Emergency { background: var(--x-danger-soft); color: var(--x-danger-text); }
.alert-strip.big { font-size: var(--x-text-sm); padding: 10px 14px; }
.lang { display: inline-flex; align-items: center; gap: 6px; color: var(--x-text-muted); border: 1px solid var(--x-border); border-radius: var(--x-radius-md); padding: 0 8px; min-height: 44px; background: var(--x-surface); }
.lang select { border: 0; background: transparent; font: inherit; font-size: 13px; color: var(--x-text); }
.card-t { display: flex; align-items: center; gap: 8px; margin: 0; font-size: var(--x-text-md); }
.vit-head { display: flex; align-items: center; gap: 10px; padding: 14px 20px; }
.vit-row { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 16px; }
.vchip { display: flex; flex-direction: column; padding: 6px 12px; border-radius: 10px; background: var(--x-surface-2); border: 1px solid var(--x-border); min-width: 84px; }
.vchip__l { font-size: 11px; font-weight: 600; color: var(--x-text-muted); }
.vchip__v { font-family: var(--x-font-display); font-weight: 700; font-size: 18px; }
.vchip__v small { font-size: 11px; font-weight: 500; color: var(--x-text-faint); margin-inline-start: 3px; }
.vchip.abnormal { background: var(--x-warning-soft); border-color: var(--x-warning); }
.vchip.abnormal .vchip__l { color: var(--x-warning-text); }
.vchip.critical { background: var(--x-danger-soft); border-color: var(--x-danger); }
.vchip.critical .vchip__l, .vchip.critical .vchip__v { color: var(--x-danger-text); }
.phrases { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mini { border: 1px dashed var(--x-border-strong); background: none; border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; color: var(--x-text-muted); cursor: pointer; }
.mini:hover { color: var(--x-primary-text); border-color: var(--x-primary); }
.tabs-lbl { align-self: center; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--x-text-faint); padding-inline-end: 6px; }
.tab .x { margin-inline-start: 6px; opacity: 0.5; padding: 0 4px; }
.tab .x:hover { opacity: 1; color: var(--x-danger-text); }
.add-tpl { width: auto; min-height: 34px; margin: 6px 0 6px auto; font-size: 13px; }
.dx { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--x-surface-3); }
.dx .code { min-width: 64px; }
.chip.prov { background: var(--x-warning-soft); border-color: var(--x-warning); color: var(--x-warning-text); }
.dx-search { position: relative; }
.recent { gap: 6px; margin-top: 8px; }
.hits { list-style: none; margin: 4px 0 0; padding: 4px; border: 1px solid var(--x-border); border-radius: var(--x-radius-md); background: var(--x-surface); box-shadow: var(--x-shadow-md); position: absolute; inset-inline: 0; z-index: 5; max-height: 340px; overflow: auto; }
.hits button { width: 100%; text-align: start; border: 0; background: none; font: inherit; color: var(--x-text); padding: 7px 10px; border-radius: 8px; cursor: pointer; }
.hits button.on, .hits button:hover { background: var(--x-primary-soft); }
.hits .typed { color: var(--x-primary-text); font-weight: 600; }
.icon-btn { border: 0; background: none; color: var(--x-text-muted); cursor: pointer; width: 32px; height: 32px; border-radius: 8px; flex: none; }
.icon-btn:hover { background: var(--x-danger-soft); color: var(--x-danger-text); }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 12px 0; font-size: var(--x-text-sm); }
.kv dt { color: var(--x-text-muted); }
.kv dd { margin: 0; }
.kv .danger { color: var(--x-danger-text); font-weight: 700; }
.sub { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--x-text-faint); margin: 14px 0 8px; }
.past { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.past li { border-inline-start: 2px solid var(--x-primary-soft); padding-inline-start: 10px; }
.tips { padding: 0 4px; line-height: 1.6; }
kbd { font: inherit; font-size: 11px; border: 1px solid var(--x-border); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; background: var(--x-surface); }
@media (max-width: 1100px) { .sticky { position: static; } }
</style>
