<script setup lang="ts">
// Front desk / cashier: bill a visit the doctor has completed. Services and prices, insurance
// cover, then a submitted Sales Invoice (patient, and insurer when covered) and payment.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarPlus, Pill, Plus, Printer, Receipt, Save, Trash2 } from 'lucide-vue-next'
import { clinic, errorMessage } from '@/lib/api'
import { isoDate, money, niceDate, round, splitShare } from '@/lib/format'
import { tokenLabel } from '@/lib/flow'
import type { Encounter, Patient, Policy, ServiceLine, TaxClass } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import { useToast } from '@/composables/useToast'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiBanner from '@/ui/UiBanner.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import UiStatusBadge from '@/ui/UiStatusBadge.vue'
import PayDialog from '@/components/PayDialog.vue'
import BookDialog from '@/components/BookDialog.vue'

const route = useRoute()
const router = useRouter()
const store = useClinicStore()
const toast = useToast()
const enc = ref<Encounter | null>(null)
const policies = ref<Policy[]>([])
const dirty = ref(false)
const busy = ref('')
const error = ref('')
const paying = ref<{ name: string; outstanding: number; who: string } | null>(null)
const invoiceInfo = ref<Record<string, { outstanding: number; total: number }>>({})
const booking = ref(false)

const locked = computed(() => enc.value?.status === 'Billed' || enc.value?.status === 'Cancelled')
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
  dirty.value = false
  const p = await clinic<Patient>('get_patient', { name: e.patient }).catch(() => null)
  const day = e.encounter_date || isoDate()
  // Only policies that cover the visit date (the server checks the same before billing).
  policies.value = (p?.policies || []).filter((x) => x.active && (!x.valid_from || x.valid_from <= day) && (!x.valid_to || x.valid_to >= day))
  for (const inv of p?.invoices || []) invoiceInfo.value[inv.name] = { outstanding: inv.outstanding_amount, total: inv.rounded_total || inv.grand_total }
}
function touch() {
  dirty.value = true
}
function addService(name: string) {
  const s = store.ctx?.services.find((x) => x.name === name)
  if (!s || !enc.value) return
  enc.value.services.push({ service: s.name, item_name: s.name, qty: 1, rate: s.rate, tax_class: s.tax_class, code: s.code } as ServiceLine)
  touch()
}
async function save(): Promise<boolean> {
  if (!enc.value) return false
  busy.value = 'save'
  error.value = ''
  try {
    const saved = await clinic<Encounter>('save_billing', {
      name: enc.value.name,
      services: enc.value.services.map((s) => ({ service: s.service || s.item_name, qty: s.qty, rate: s.rate, code: s.code })),
      policy: enc.value.policy || '',
    })
    saved.services = saved.services.map((s) => ({ ...s, service: s.item_name }))
    enc.value = saved
    dirty.value = false
    return true
  } catch (err) {
    error.value = errorMessage(err)
    return false
  } finally {
    busy.value = ''
  }
}
async function bill() {
  if (!enc.value) return
  // Never bill an older saved version: if the unsaved changes can't be saved, stop here.
  if (dirty.value && !(await save())) return
  busy.value = 'bill'
  error.value = ''
  try {
    const r = await clinic<{ patient_invoice: string; payer_invoice: string; claim: string }>('bill_encounter', { name: enc.value.name })
    toast.success(r.payer_invoice ? `Billed: ${r.patient_invoice || '—'} (patient) and ${r.payer_invoice} (insurer), claim ${r.claim}` : `Billed: ${r.patient_invoice}`)
    await load()
    const inv = enc.value?.patient_invoice
    if (inv && (invoiceInfo.value[inv]?.outstanding ?? 1) > 0) paying.value = { name: inv, outstanding: invoiceInfo.value[inv]?.outstanding ?? preview.value.patient, who: enc.value!.patient_doc.patient_name }
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
          <div class="row"><h1>Bill · {{ enc.patient_doc.patient_name }}</h1><UiStatusBadge :tone="enc.status === 'Billed' ? 'success' : enc.status === 'Completed' ? 'primary' : 'warning'">{{ enc.status === 'Draft' ? 'With doctor' : enc.status === 'Completed' ? 'Ready to bill' : enc.status }}</UiStatusBadge></div>
          <p class="tabular">
            <span v-if="enc.appointment_doc?.token_no">Token {{ tokenLabel(enc.appointment_doc.token_no) }} · </span>
            <router-link :to="{ name: 'patient', params: { id: enc.patient } }">{{ enc.patient }}</router-link>
            · {{ niceDate(enc.encounter_date) }} · {{ enc.practitioner_doc?.practitioner_name }} · {{ enc.name }}
          </p>
        </div>
        <div class="row">
          <a v-if="enc.prescriptions.length" class="x-link-btn" :href="printHref('prescription', enc.name)" target="_blank" rel="noopener"><Pill :size="16" /> Prescription</a>
          <UiButton v-if="enc.follow_up_date && store.can('appointments')" variant="secondary" @click="booking = true"><CalendarPlus :size="16" /> Book follow-up {{ niceDate(enc.follow_up_date) }}</UiButton>
          <UiButton v-if="!locked" variant="secondary" :loading="busy === 'save'" :disabled="!dirty" @click="save"><Save :size="16" /> Save</UiButton>
          <UiButton v-if="!locked" :loading="busy === 'bill'" :disabled="!enc.services.length || enc.status === 'Draft'" @click="bill"><Receipt :size="16" /> Bill visit</UiButton>
        </div>
      </div>

      <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
      <UiBanner v-if="enc.status === 'Draft'" tone="warning">The doctor hasn't completed this visit yet. You can prepare the charges; billing opens once the visit is completed.</UiBanner>

      <div class="split">
        <UiCard title="Services & charges">
          <div class="stack">
            <div v-for="(s, i) in enc.services" :key="i" class="svc">
              <div class="grow">
                <strong>{{ s.item_name }}</strong>
                <div class="small faint">{{ s.code }}<span v-if="rateOf(s.tax_class)"> · tax {{ rateOf(s.tax_class) }}%</span><span v-else> · {{ store.settings?.tax_classes?.[s.tax_class || 'healthcare'] === 'exempt' ? 'exempt' : 'zero-rated' }}</span></div>
              </div>
              <input v-model.number="s.qty" type="number" min="1" class="ctl qty" :disabled="locked" aria-label="Quantity" @input="touch" />
              <input v-model.number="s.rate" type="number" min="0" step="0.001" class="ctl rate" :disabled="locked" aria-label="Rate" @input="touch" />
              <span class="amt tabular">{{ money(round((Number(s.qty) || 0) * (Number(s.rate) || 0)), store.currency) }}</span>
              <button v-if="!locked" type="button" class="icon-btn" aria-label="Remove" @click="enc.services.splice(i, 1); touch()"><Trash2 :size="15" /></button>
            </div>
            <p v-if="!enc.services.length" class="muted small" style="margin: 0">No charges yet — add the consultation and any procedures.</p>
            <div v-if="!locked" class="add">
              <Plus :size="15" aria-hidden="true" />
              <select class="ctl" :value="''" aria-label="Add a service" @change="addService(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
                <option value="" disabled>Add service, procedure, medicine or consumable</option>
                <optgroup v-for="cat in ['Service', 'Medicine', 'Consumable']" :key="cat" :label="cat">
                  <option v-for="s in (store.ctx?.services || []).filter((x) => x.category === cat)" :key="s.name" :value="s.name">{{ s.name }} — {{ money(s.rate, store.currency) }}</option>
                </optgroup>
              </select>
            </div>
          </div>
        </UiCard>

        <div class="stack sticky">
          <UiCard title="Payment">
            <div class="stack">
              <label class="f">
                <span>Who pays</span>
                <select v-model="enc.policy" :disabled="locked" @change="touch">
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

          <UiCard v-if="enc.diagnoses.length" title="Diagnosis (for the claim)">
            <ul class="dxl">
              <li v-for="d in enc.diagnoses" :key="d.code + d.description"><strong class="tabular">{{ d.code || '—' }}</strong> {{ d.description }}<span v-if="d.primary" class="small faint"> · primary</span></li>
            </ul>
          </UiCard>

          <UiCard v-if="enc.patient_invoice || enc.payer_invoice" title="Bills">
            <div class="stack">
              <div v-for="[inv, who] in ([[enc.patient_invoice, 'Patient'], [enc.payer_invoice, 'Insurer']] as const).filter(([i]) => !!i)" :key="inv!" class="svc">
                <div class="grow"><strong>{{ who }}</strong><div class="small muted tabular">{{ inv }}<span v-if="invoiceInfo[inv!]"> · due {{ money(invoiceInfo[inv!].outstanding, store.currency) }}</span></div></div>
                <UiButton v-if="who === 'Patient' && (invoiceInfo[inv!]?.outstanding ?? 1) > 0" size="sm" @click="paying = { name: inv!, outstanding: invoiceInfo[inv!]?.outstanding ?? preview.total, who: enc.patient_doc.patient_name }">Collect payment</UiButton>
                <a class="chip" :href="printHref('invoice', inv!)" target="_blank" rel="noopener"><Printer :size="14" /> Print</a>
              </div>
              <router-link v-if="enc.claim && store.can('claims')" class="small" :to="{ name: 'claims', query: { open: enc.claim } }">Claim {{ enc.claim }} →</router-link>
            </div>
          </UiCard>
        </div>
      </div>
      <PayDialog :open="!!paying" :invoice="paying?.name || ''" :outstanding="paying?.outstanding || 0" :currency="store.currency" :who="paying?.who" @close="paying = null" @paid="paying = null; load()" />
      <BookDialog :open="booking" :date="enc.follow_up_date || undefined" :practitioner="enc.practitioner" :patient="{ name: enc.patient, patient_name: enc.patient_doc.patient_name }" @close="booking = false" @saved="booking = false; toast.success('Follow-up booked')" />
    </template>
  </div>
</template>

<style scoped>
.sticky { position: sticky; top: 16px; }
.svc { display: flex; align-items: center; gap: 8px; }
.qty { width: 64px; min-height: 36px; padding: 4px 8px; }
.rate { width: 104px; min-height: 36px; padding: 4px 8px; text-align: end; }
.amt { width: 110px; text-align: end; font-weight: 600; }
.add { display: flex; align-items: center; gap: 8px; color: var(--x-text-muted); }
.totals { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; margin: 0; padding-top: 10px; border-top: 1px solid var(--x-border); }
.totals dt { color: var(--x-text-muted); }
.totals dd { margin: 0; text-align: end; }
.totals .total { font-weight: 700; font-size: var(--x-text-md); color: var(--x-text); }
.dxl { margin: 0; padding-inline-start: 18px; display: flex; flex-direction: column; gap: 4px; font-size: var(--x-text-sm); }
.icon-btn { border: 0; background: none; color: var(--x-text-muted); cursor: pointer; width: 32px; height: 32px; border-radius: 8px; flex: none; }
.icon-btn:hover { background: var(--x-danger-soft); color: var(--x-danger-text); }
.x-link-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 16px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); text-decoration: none; font-weight: 600; }
@media (max-width: 1100px) { .sticky { position: static; } }
</style>
