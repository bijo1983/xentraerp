<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, CheckCircle2, Pill, Plus, Printer, Receipt, Save, Trash2 } from 'lucide-vue-next'
import { clinic, errorMessage } from '@/lib/api'
import { money, niceDate, round, splitShare } from '@/lib/format'
import { searchIcd } from '@/lib/icd10'
import type { Diagnosis, Encounter, Patient, Policy, RxItem, ServiceLine, TaxClass } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import { useToast } from '@/composables/useToast'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiBanner from '@/ui/UiBanner.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import UiStatusBadge from '@/ui/UiStatusBadge.vue'
import ChartForm from '@/components/ChartForm.vue'
import PayDialog from '@/components/PayDialog.vue'

const route = useRoute()
const router = useRouter()
const store = useClinicStore()
const toast = useToast()
const enc = ref<Encounter | null>(null)
const policies = ref<Policy[]>([])
const activeTpl = ref('')
const dirty = ref(false)
const busy = ref('')
const error = ref('')
const icdQuery = ref('')
const paying = ref<{ name: string; outstanding: number; who: string } | null>(null)
const invoiceInfo = ref<Record<string, { outstanding: number; total: number }>>({})

const locked = computed(() => enc.value?.status === 'Billed' || enc.value?.status === 'Cancelled')
const canChart = computed(() => store.can('chart') && !locked.value)
const templates = computed(() => store.ctx?.templates || {})
const unusedTemplates = computed(() => Object.keys(templates.value).filter((k) => !enc.value?.templates.includes(k)))
const icdHits = computed(() => (icdQuery.value ? searchIcd(icdQuery.value) : []))
const policy = computed(() => policies.value.find((p) => p.name === enc.value?.policy) || enc.value?.policy_doc || null)

function rateOf(cls?: TaxClass): number {
  const v = store.settings?.tax_classes?.[cls || 'healthcare']
  return store.settings?.tax_regime === 'None' || v === 'exempt' || v == null ? 0 : Number(v)
}
const preview = computed(() => {
  const lines = enc.value?.services || []
  const cov = policy.value ? Number(policy.value.coverage_pct || 0) : 0
  let net = 0, tax = 0, payer = 0, patient = 0
  for (const l of lines) {
    const amt = round((Number(l.qty) || 0) * (Number(l.rate) || 0))
    const [pa, pt] = policy.value ? splitShare(amt, cov) : [0, amt]
    net += amt
    tax += (amt * rateOf(l.tax_class)) / 100
    payer += pa
    patient += pt
  }
  const cap = Number(policy.value?.copay_cap || 0)
  if (policy.value && cap > 0 && patient > cap) {
    payer += patient - cap
    patient = cap
  }
  return { net: round(net), tax: round(tax), total: round(net + tax), payer: round(payer), patient: round(patient), cov }
})

async function load() {
  const e = await clinic<Encounter>('get_encounter', { name: route.params.id })
  e.services = e.services.map((s) => ({ ...s, service: s.item_name }))
  enc.value = e
  activeTpl.value = e.templates[0] || Object.keys(templates.value)[0] || ''
  dirty.value = false
  if (store.can('patients')) {
    const p = await clinic<Patient>('get_patient', { name: e.patient }).catch(() => null)
    policies.value = (p?.policies || []).filter((x) => x.active)
    for (const inv of p?.invoices || []) invoiceInfo.value[inv.name] = { outstanding: inv.outstanding_amount, total: inv.rounded_total || inv.grand_total }
  }
}
function touch() {
  dirty.value = true
}
function addTemplate(k: string) {
  if (!enc.value) return
  enc.value.templates.push(k)
  activeTpl.value = k
  touch()
}
function removeTemplate(k: string) {
  if (!enc.value) return
  enc.value.templates = enc.value.templates.filter((t) => t !== k)
  activeTpl.value = enc.value.templates[0] || ''
  touch()
}
function addDx(code: string, description: string) {
  if (!enc.value) return
  if (!enc.value.diagnoses.some((d) => d.code === code && code)) enc.value.diagnoses.push({ code, description, primary: enc.value.diagnoses.length ? 0 : 1 })
  icdQuery.value = ''
  touch()
}
function addFreeDx() {
  const q = icdQuery.value.trim()
  if (!q) return
  const looksLikeCode = /^[A-Z]\d{2}(\.\w{1,4})?$/i.test(q)
  addDx(looksLikeCode ? q.toUpperCase() : '', looksLikeCode ? '' : q)
}
function setPrimary(d: Diagnosis) {
  enc.value?.diagnoses.forEach((x) => (x.primary = x === d ? 1 : 0))
  touch()
}
function addRx() {
  enc.value?.prescriptions.push({ medicine: '', dose: '', frequency: '', duration: '', route: 'Oral' } as RxItem)
  touch()
}
function addService(name: string) {
  const s = store.ctx?.services.find((x) => x.name === name)
  if (!s || !enc.value) return
  enc.value.services.push({ service: s.name, item_name: s.name, qty: 1, rate: s.rate, tax_class: s.tax_class, code: s.code } as ServiceLine)
  touch()
}

async function save(complete = false) {
  if (!enc.value) return
  busy.value = complete ? 'complete' : 'save'
  error.value = ''
  try {
    const e = enc.value
    const saved = await clinic<Encounter>('save_encounter', {
      data: {
        name: e.name, templates: e.templates, chart_data: e.chart_data, diagnoses: e.diagnoses, notes: e.notes, policy: e.policy || '',
        prescriptions: e.prescriptions, services: e.services.map((s) => ({ service: s.service || s.item_name, qty: s.qty, rate: s.rate, code: s.code })),
        complete: complete ? 1 : 0,
      },
    })
    saved.services = saved.services.map((s) => ({ ...s, service: s.item_name }))
    enc.value = saved
    dirty.value = false
    toast.success(complete ? 'Visit completed' : 'Saved')
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    busy.value = ''
  }
}
async function bill() {
  if (!enc.value) return
  if (dirty.value && store.can('chart')) await save()
  busy.value = 'bill'
  error.value = ''
  try {
    const r = await clinic<{ patient_invoice: string; payer_invoice: string; claim: string }>('bill_encounter', { name: enc.value.name })
    toast.success(r.payer_invoice ? `Billed: ${r.patient_invoice || '—'} (patient) and ${r.payer_invoice} (insurer), claim ${r.claim}` : `Billed: ${r.patient_invoice}`)
    await load()
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    busy.value = ''
  }
}
function printHref(kind: string, name: string) {
  return router.resolve({ name: 'print', params: { kind, id: name } }).href
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div v-if="!enc" style="padding: 24px"><UiSkeleton :lines="8" /></div>
    <template v-else>
      <div class="page-head">
        <div>
          <div class="row"><h1>{{ enc.patient_doc.patient_name }}</h1><UiStatusBadge :tone="enc.status === 'Billed' ? 'success' : enc.status === 'Completed' ? 'primary' : 'neutral'">{{ enc.status }}</UiStatusBadge></div>
          <p class="tabular">
            <router-link :to="{ name: 'patient', params: { id: enc.patient } }">{{ enc.patient }}</router-link>
            · {{ enc.patient_doc.age }} {{ enc.patient_doc.gender || '' }} · {{ niceDate(enc.encounter_date) }} · {{ enc.practitioner_doc?.practitioner_name }} · {{ enc.name }}
          </p>
        </div>
        <div class="row">
          <a v-if="enc.prescriptions.length && store.can('chart')" class="x-link-btn" :href="printHref('prescription', enc.name)" target="_blank" rel="noopener"><Pill :size="16" /> Prescription</a>
          <UiButton v-if="canChart" variant="secondary" :loading="busy === 'save'" :disabled="!dirty" @click="save()"><Save :size="16" /> Save</UiButton>
          <UiButton v-if="canChart && enc.status === 'Draft'" variant="secondary" :loading="busy === 'complete'" @click="save(true)"><CheckCircle2 :size="16" /> Complete visit</UiButton>
          <UiButton v-if="store.can('billing') && !locked" :loading="busy === 'bill'" :disabled="!enc.services.length" @click="bill"><Receipt :size="16" /> Bill visit</UiButton>
        </div>
      </div>

      <div v-if="enc.patient_doc.allergies" class="alert-strip"><AlertTriangle :size="16" /> Allergies: {{ enc.patient_doc.allergies }}</div>
      <div v-if="enc.patient_doc.chronic_conditions" class="small muted">Chronic: {{ enc.patient_doc.chronic_conditions }}</div>
      <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>

      <div class="split">
        <div class="stack">
          <UiCard v-if="store.can('chart')" :padded="false">
            <div class="tabs" style="padding: 0 12px">
              <button v-for="k in enc.templates" :key="k" type="button" class="tab" :class="{ on: activeTpl === k }" @click="activeTpl = k">
                {{ templates[k]?.label || k }}
                <span v-if="canChart && enc.templates.length > 1" class="x" role="button" aria-label="Remove template" @click.stop="removeTemplate(k)">×</span>
              </button>
              <select v-if="canChart && unusedTemplates.length" class="ctl add-tpl" :value="''" aria-label="Add chart template" @change="addTemplate(($event.target as HTMLSelectElement).value)">
                <option value="" disabled>+ Add template</option>
                <option v-for="k in unusedTemplates" :key="k" :value="k">{{ templates[k].label }}</option>
              </select>
            </div>
            <div style="padding: 20px">
              <ChartForm
                v-if="activeTpl && templates[activeTpl]"
                :template="templates[activeTpl]"
                :model-value="enc.chart_data[activeTpl]"
                :readonly="!canChart"
                @update:model-value="enc.chart_data[activeTpl] = $event; touch()"
              />
              <p v-else class="muted">Add a chart template to start documenting.</p>
            </div>
          </UiCard>

          <UiCard v-if="store.can('chart')" title="Diagnosis (ICD-10)">
            <div class="stack">
              <div v-for="(d, i) in enc.diagnoses" :key="i" class="dx">
                <button type="button" class="chip" :class="{ on: d.primary }" :disabled="!canChart" @click="setPrimary(d)">{{ d.primary ? 'Primary' : 'Secondary' }}</button>
                <strong class="tabular">{{ d.code || '—' }}</strong>
                <span class="grow">{{ d.description }}</span>
                <button v-if="canChart" type="button" class="icon-btn" aria-label="Remove diagnosis" @click="enc.diagnoses.splice(i, 1); touch()"><Trash2 :size="15" /></button>
              </div>
              <div v-if="canChart" class="dx-search">
                <input v-model="icdQuery" class="ctl" placeholder="Search ICD-10 code or condition (e.g. J06, hypertension)…" @keydown.enter.prevent="addFreeDx" />
                <ul v-if="icdHits.length" class="hits">
                  <li v-for="[c, d] in icdHits" :key="c"><button type="button" @click="addDx(c, d)"><strong class="tabular">{{ c }}</strong> {{ d }}</button></li>
                </ul>
              </div>
            </div>
          </UiCard>

          <UiCard v-if="store.can('chart')" title="Prescription">
            <template #actions><UiButton v-if="canChart" size="sm" variant="ghost" @click="addRx"><Plus :size="15" /> Add medicine</UiButton></template>
            <div v-if="enc.prescriptions.length" class="tbl-wrap">
              <table class="tbl">
                <thead><tr><th>Medicine (generic)</th><th>Strength</th><th>Form</th><th>Dose</th><th>Frequency</th><th>Route</th><th>Duration</th><th>Qty</th><th v-if="canChart" /></tr></thead>
                <tbody>
                  <tr v-for="(rx, i) in enc.prescriptions" :key="i">
                    <td><input v-model="rx.medicine" :disabled="!canChart" placeholder="e.g. Amoxicillin" @input="touch" /></td>
                    <td><input v-model="rx.strength" :disabled="!canChart" placeholder="500 mg" @input="touch" /></td>
                    <td><select v-model="rx.dosage_form" :disabled="!canChart" @change="touch"><option v-for="f in ['', 'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Cream', 'Ointment', 'Drops', 'Inhaler', 'Sachet', 'Other']" :key="f">{{ f }}</option></select></td>
                    <td><input v-model="rx.dose" :disabled="!canChart" placeholder="1 tab" @input="touch" /></td>
                    <td><input v-model="rx.frequency" :disabled="!canChart" placeholder="TDS" list="freq" @input="touch" /></td>
                    <td><input v-model="rx.route" :disabled="!canChart" list="routes" @input="touch" /></td>
                    <td><input v-model="rx.duration" :disabled="!canChart" placeholder="5 days" @input="touch" /></td>
                    <td><input v-model="rx.quantity" :disabled="!canChart" style="width: 60px" @input="touch" /></td>
                    <td v-if="canChart"><button type="button" class="icon-btn" aria-label="Remove" @click="enc.prescriptions.splice(i, 1); touch()"><Trash2 :size="15" /></button></td>
                  </tr>
                </tbody>
              </table>
              <datalist id="freq"><option>OD</option><option>BD</option><option>TDS</option><option>QID</option><option>HS</option><option>PRN</option><option>STAT</option><option>Once weekly</option></datalist>
              <datalist id="routes"><option>Oral</option><option>Topical</option><option>IM</option><option>IV</option><option>SC</option><option>Inhaled</option><option>Ophthalmic</option><option>Otic</option><option>Nasal</option></datalist>
            </div>
            <p v-else class="muted small" style="margin: 0">No medicines prescribed.</p>
          </UiCard>

          <UiCard v-if="store.can('chart')" title="Clinical notes">
            <label class="f"><textarea v-model="enc.notes" :disabled="!canChart" rows="3" aria-label="Clinical notes" @input="touch" /></label>
          </UiCard>
        </div>

        <div class="stack sticky">
          <UiCard title="Services & charges">
            <div class="stack">
              <div v-for="(s, i) in enc.services" :key="i" class="svc">
                <div class="grow">
                  <strong>{{ s.item_name }}</strong>
                  <div class="small faint">{{ s.code }}<span v-if="rateOf(s.tax_class)"> · tax {{ rateOf(s.tax_class) }}%</span><span v-else> · {{ store.settings?.tax_classes?.[s.tax_class || 'healthcare'] === 'exempt' ? 'exempt' : 'zero-rated' }}</span></div>
                </div>
                <input v-model.number="s.qty" type="number" min="1" class="ctl qty" :disabled="!canChart" aria-label="Quantity" @input="touch" />
                <input v-model.number="s.rate" type="number" min="0" step="0.001" class="ctl rate" :disabled="!canChart" aria-label="Rate" @input="touch" />
                <button v-if="canChart" type="button" class="icon-btn" aria-label="Remove" @click="enc.services.splice(i, 1); touch()"><Trash2 :size="15" /></button>
              </div>
              <select v-if="canChart" class="ctl" :value="''" aria-label="Add a service" @change="addService(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
                <option value="" disabled>+ Add service or medicine</option>
                <optgroup v-for="cat in ['Service', 'Medicine', 'Consumable']" :key="cat" :label="cat">
                  <option v-for="s in (store.ctx?.services || []).filter((x) => x.category === cat)" :key="s.name" :value="s.name">{{ s.name }} — {{ money(s.rate, store.currency) }}</option>
                </optgroup>
              </select>
              <label v-if="canChart" class="f">
                <span>Insurance</span>
                <select v-model="enc.policy" @change="touch">
                  <option :value="null">Self-pay</option>
                  <option v-for="p in policies" :key="p.name" :value="p.name">{{ p.payer }} · {{ p.policy_no }} ({{ p.coverage_pct }}%)</option>
                </select>
              </label>
              <dl class="totals tabular">
                <dt>Net</dt><dd>{{ money(preview.net, store.currency) }}</dd>
                <dt>{{ store.settings?.tax_regime === 'GST' ? 'GST' : 'VAT' }} (est.)</dt><dd>{{ money(preview.tax, store.currency) }}</dd>
                <template v-if="policy">
                  <dt>Insurer ({{ preview.cov }}%)</dt><dd>{{ money(preview.payer, store.currency) }} + tax</dd>
                  <dt>Patient pays</dt><dd>{{ money(preview.patient, store.currency) }} + tax</dd>
                </template>
                <dt class="total">Total</dt><dd class="total">{{ money(preview.total, store.currency) }}</dd>
              </dl>
              <p class="small faint" style="margin: 0">Billing posts submitted Sales Invoices to Accounting{{ policy ? ' — one to the patient, one to the insurer, and opens a claim' : '' }}.</p>
            </div>
          </UiCard>

          <UiCard v-if="enc.patient_invoice || enc.payer_invoice" title="Bills">
            <div class="stack">
              <div v-for="[inv, who] in ([[enc.patient_invoice, 'Patient'], [enc.payer_invoice, 'Insurer']] as const).filter(([i]) => !!i)" :key="inv!" class="svc">
                <div class="grow"><strong>{{ who }}</strong><div class="small muted tabular">{{ inv }}<span v-if="invoiceInfo[inv!]"> · due {{ money(invoiceInfo[inv!].outstanding, store.currency) }}</span></div></div>
                <UiButton v-if="who === 'Patient' && store.can('billing') && (invoiceInfo[inv!]?.outstanding ?? 1) > 0" size="sm" @click="paying = { name: inv!, outstanding: invoiceInfo[inv!]?.outstanding ?? preview.total, who: enc.patient_doc.patient_name }">Pay</UiButton>
                <a v-if="store.can('billing')" class="chip" :href="printHref('invoice', inv!)" target="_blank" rel="noopener"><Printer :size="14" /> Print</a>
              </div>
              <router-link v-if="enc.claim && store.can('claims')" class="small" :to="{ name: 'claims', query: { open: enc.claim } }">Claim {{ enc.claim }} →</router-link>
            </div>
          </UiCard>
        </div>
      </div>
      <PayDialog :open="!!paying" :invoice="paying?.name || ''" :outstanding="paying?.outstanding || 0" :currency="store.currency" :who="paying?.who" @close="paying = null" @paid="paying = null; load()" />
    </template>
  </div>
</template>

<style scoped>
.sticky { position: sticky; top: 16px; }
.tab .x { margin-inline-start: 6px; opacity: 0.5; padding: 0 4px; }
.tab .x:hover { opacity: 1; color: var(--x-danger-text); }
.add-tpl { width: auto; min-height: 34px; margin: 6px 0 6px auto; font-size: 13px; }
.dx { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--x-surface-3); }
.dx-search { position: relative; }
.hits { list-style: none; margin: 4px 0 0; padding: 4px; border: 1px solid var(--x-border); border-radius: var(--x-radius-md); background: var(--x-surface); box-shadow: var(--x-shadow-md); position: absolute; inset-inline: 0; z-index: 5; }
.hits button { width: 100%; text-align: start; border: 0; background: none; font: inherit; color: var(--x-text); padding: 7px 10px; border-radius: 8px; cursor: pointer; }
.hits button:hover { background: var(--x-primary-soft); }
.svc { display: flex; align-items: center; gap: 8px; }
.qty { width: 60px; min-height: 34px; padding: 4px 8px; }
.rate { width: 96px; min-height: 34px; padding: 4px 8px; text-align: end; }
.totals { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; margin: 0; padding-top: 10px; border-top: 1px solid var(--x-border); }
.totals dt { color: var(--x-text-muted); }
.totals dd { margin: 0; text-align: end; }
.totals .total { font-weight: 700; font-size: var(--x-text-md); color: var(--x-text); }
.icon-btn { border: 0; background: none; color: var(--x-text-muted); cursor: pointer; width: 32px; height: 32px; border-radius: 8px; flex: none; }
.icon-btn:hover { background: var(--x-danger-soft); color: var(--x-danger-text); }
.x-link-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 16px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); text-decoration: none; font-weight: 600; }
@media (max-width: 1100px) { .sticky { position: static; } }
</style>
