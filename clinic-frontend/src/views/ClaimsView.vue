<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Printer, ShieldCheck } from 'lucide-vue-next'
import { clinic, errorMessage } from '@/lib/api'
import { money, niceDate } from '@/lib/format'
import type { Claim, ClaimRow, ClaimStatus, Payer } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import { useToast } from '@/composables/useToast'
import UiButton from '@/ui/UiButton.vue'
import UiModal from '@/ui/UiModal.vue'
import UiBanner from '@/ui/UiBanner.vue'
import UiInput from '@/ui/UiInput.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiStatusBadge from '@/ui/UiStatusBadge.vue'

const store = useClinicStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const tab = ref<'claims' | 'insurers'>('claims')
const rows = ref<ClaimRow[]>([])
const status = ref<string>('')
const claim = ref<Claim | null>(null)
const upd = reactive({ status: '' as ClaimStatus | '', approved_amount: '' as number | '', payer_reference: '', rejection_reason: '', preauth_no: '' })
const pay = reactive({ amount: 0, reference_no: '' })
const busy = ref('')
const error = ref('')
const payerForm = ref<(Payer & { submission_email?: string; portal_url?: string; tax_id?: string }) | null>(null)
const STATUSES: ClaimStatus[] = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Partially Approved', 'Rejected', 'Paid']
const PAYER_TYPES = ['Insurer', 'TPA', 'Government scheme', 'Corporate']
const counts = computed(() => Object.fromEntries(STATUSES.map((s) => [s, rows.value.filter((r) => r.status === s).length])))
const shown = computed(() => (status.value ? rows.value.filter((r) => r.status === status.value) : rows.value))

function tone(s: string) {
  return s === 'Paid' ? 'success' : s === 'Rejected' ? 'danger' : s === 'Approved' || s === 'Partially Approved' ? 'primary' : s === 'Draft' ? 'neutral' : 'warning'
}
async function load() {
  rows.value = await clinic<ClaimRow[]>('list_claims')
}
async function open(name: string) {
  error.value = ''
  claim.value = await clinic<Claim>('get_claim', { name })
  Object.assign(upd, { status: claim.value.status, approved_amount: claim.value.approved_amount || '', payer_reference: claim.value.payer_reference || '', rejection_reason: claim.value.rejection_reason || '', preauth_no: claim.value.preauth_no || '' })
  pay.amount = Math.max(0, Number(claim.value.approved_amount || claim.value.claimed_amount) - Number(claim.value.paid_amount || 0))
  pay.reference_no = ''
}
async function saveClaim() {
  if (!claim.value) return
  busy.value = 'save'
  error.value = ''
  try {
    claim.value = await clinic<Claim>('update_claim', { name: claim.value.name, ...upd })
    toast.success(`Claim ${claim.value.name}: ${claim.value.status}`)
    load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
async function recordPayment() {
  if (!claim.value) return
  busy.value = 'pay'
  error.value = ''
  try {
    claim.value = await clinic<Claim>('record_claim_payment', { name: claim.value.name, amount: pay.amount, reference_no: pay.reference_no || undefined })
    toast.success('Insurer payment recorded in Accounting')
    load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
async function savePayer() {
  if (!payerForm.value) return
  busy.value = 'payer'
  error.value = ''
  try {
    await clinic('save_payer', { data: { ...payerForm.value, payer_name: payerForm.value.name } })
    payerForm.value = null
    await store.load()
    toast.success('Insurer saved')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
watch(
  () => route.query.open,
  (v) => {
    if (typeof v === 'string') open(v)
  },
  { immediate: true },
)
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Insurance claims</h1><p>{{ store.ctx?.standards.claim_form }}</p></div>
      <UiButton v-if="tab === 'insurers'" @click="payerForm = { name: '', payer_type: 'Insurer', default_coverage: 80 }"><Plus :size="16" /> Add insurer</UiButton>
    </div>
    <div class="tabs">
      <button type="button" class="tab" :class="{ on: tab === 'claims' }" @click="tab = 'claims'">Claims ({{ rows.length }})</button>
      <button type="button" class="tab" :class="{ on: tab === 'insurers' }" @click="tab = 'insurers'">Insurers ({{ store.ctx?.payers.length || 0 }})</button>
    </div>

    <template v-if="tab === 'claims'">
      <div class="row">
        <button type="button" class="chip" :class="{ on: !status }" @click="status = ''">All</button>
        <button v-for="s in STATUSES" :key="s" type="button" class="chip" :class="{ on: status === s }" @click="status = s">{{ s }} <span class="faint">{{ counts[s] }}</span></button>
      </div>
      <UiEmptyState v-if="!shown.length" :icon="ShieldCheck" title="No claims" message="A claim is opened automatically when a visit with an insurance policy is billed." />
      <div v-else class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Claim</th><th>Date</th><th>Patient</th><th>Insurer</th><th class="right">Claimed</th><th class="right">Approved</th><th class="right">Paid</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="r in shown" :key="r.name" class="clickable" @click="open(r.name)">
              <td class="tabular">{{ r.name }}</td>
              <td class="nowrap">{{ niceDate(r.claim_date) }}</td>
              <td>{{ r.patient_name }}</td>
              <td>{{ r.payer }}</td>
              <td class="right tabular">{{ money(r.claimed_amount, store.currency) }}</td>
              <td class="right tabular">{{ r.approved_amount ? money(r.approved_amount, store.currency) : '—' }}</td>
              <td class="right tabular">{{ r.paid_amount ? money(r.paid_amount, store.currency) : '—' }}</td>
              <td><UiStatusBadge :tone="tone(r.status)" size="sm">{{ r.status }}</UiStatusBadge></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-else class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>Insurer / TPA</th><th>Code</th><th>Type</th><th class="right">Default cover</th><th>Claim standard</th></tr></thead>
        <tbody>
          <tr v-for="p in store.ctx?.payers || []" :key="p.name" class="clickable" @click="payerForm = { ...p }">
            <td><strong>{{ p.name }}</strong></td>
            <td class="tabular">{{ p.payer_code }}</td>
            <td>{{ p.payer_type }}</td>
            <td class="right">{{ p.default_coverage }}%</td>
            <td class="small muted">{{ p.claim_standard }}</td>
          </tr>
          <tr v-if="!store.ctx?.payers.length"><td colspan="5" class="empty-row">No insurers yet. Add the insurers and TPAs you work with.</td></tr>
        </tbody>
      </table>
    </div>

    <UiModal :open="!!claim" :title="claim ? `Claim ${claim.name}` : ''" size="lg" @close="claim = null; router.replace({ query: {} })">
      <div v-if="claim" class="stack">
        <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
        <div class="grid grid-3">
          <div><div class="small muted">Patient</div><strong>{{ claim.patient_name }}</strong><div class="small faint">{{ claim.patient }}</div></div>
          <div><div class="small muted">Insurer</div><strong>{{ claim.payer }}</strong><div class="small faint">{{ claim.policy_doc?.policy_no }} · member {{ claim.policy_doc?.member_id || '—' }}</div></div>
          <div><div class="small muted">Invoice</div><strong class="tabular">{{ claim.invoice }}</strong><div class="small faint">claimed {{ money(claim.claimed_amount, store.currency) }}</div></div>
        </div>
        <div class="small"><strong>Diagnosis:</strong> {{ claim.diagnoses.map((d) => `${d.code} ${d.description}`.trim()).join('; ') || '—' }}</div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Service</th><th>Code</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead>
            <tbody><tr v-for="(it, i) in claim.items" :key="i"><td>{{ it.service }}</td><td class="tabular">{{ it.code }}</td><td class="right">{{ it.qty }}</td><td class="right tabular">{{ money(it.amount, store.currency) }}</td></tr></tbody>
          </table>
        </div>
        <template v-if="claim.status !== 'Paid'">
          <div class="grid grid-3">
            <label class="f"><span>Status</span><select v-model="upd.status"><option v-for="s in STATUSES.filter((x) => x !== 'Paid')" :key="s">{{ s }}</option></select></label>
            <label class="f"><span>Approved amount</span><input v-model.number="upd.approved_amount" type="number" min="0" step="0.001" /></label>
            <UiInput v-model="upd.payer_reference" label="Insurer reference" />
            <UiInput v-model="upd.preauth_no" label="Pre-authorisation no." />
            <label v-if="upd.status === 'Rejected'" class="f" style="grid-column: span 2"><span>Rejection reason</span><input v-model="upd.rejection_reason" required /></label>
          </div>
          <div class="row"><UiButton :loading="busy === 'save'" @click="saveClaim">Update claim</UiButton></div>
          <div v-if="['Approved', 'Partially Approved', 'Under Review', 'Submitted'].includes(claim.status)" class="pay">
            <strong>Record insurer payment</strong>
            <div class="row">
              <input v-model.number="pay.amount" type="number" min="0" step="0.001" class="ctl" style="width: 160px" aria-label="Amount" />
              <input v-model="pay.reference_no" class="ctl" style="width: 220px" placeholder="Remittance / transfer ref." aria-label="Reference" />
              <UiButton variant="secondary" :loading="busy === 'pay'" :disabled="!pay.amount" @click="recordPayment">Record payment</UiButton>
            </div>
            <span class="small faint">Posts a Payment Entry against the insurer invoice. Any amount the insurer doesn't pay stays outstanding on that invoice.</span>
          </div>
        </template>
        <UiBanner v-else tone="success">Paid {{ money(claim.paid_amount, store.currency) }} · {{ claim.payment_entry }}</UiBanner>
      </div>
      <template #footer>
        <a v-if="claim" class="chip" :href="router.resolve({ name: 'print', params: { kind: 'claim', id: claim.name } }).href" target="_blank" rel="noopener"><Printer :size="14" /> Print claim form</a>
      </template>
    </UiModal>

    <UiModal :open="!!payerForm" :title="payerForm?.name ? payerForm.name : 'Add insurer'" @close="payerForm = null">
      <form v-if="payerForm" id="payer-form" class="stack" @submit.prevent="savePayer">
        <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
        <div class="grid grid-2">
          <UiInput v-model="payerForm.name" label="Name" required />
          <UiInput v-model="payerForm.payer_code" label="Payer code / licence" />
          <label class="f"><span>Type</span><select v-model="payerForm.payer_type"><option v-for="t in PAYER_TYPES" :key="t">{{ t }}</option></select></label>
          <label class="f"><span>Default cover (%)</span><input v-model.number="payerForm.default_coverage" type="number" min="0" max="100" /></label>
          <UiInput v-model="payerForm.claim_standard" label="Claim channel" :hint="store.region === 'GCC' ? 'e.g. DHA eClaimLink, DOH Shafafiya, NPHIES' : store.region === 'India' ? 'e.g. TPA portal, PM-JAY' : 'e.g. insurer portal'" />
          <UiInput v-model="payerForm.submission_email" label="Claims email" type="email" />
          <UiInput v-model="payerForm.tax_id" :label="(store.settings?.tax_id_label || 'Tax ID') + ' of insurer'" />
        </div>
      </form>
      <template #footer>
        <UiButton variant="secondary" @click="payerForm = null">Cancel</UiButton>
        <UiButton type="submit" form="payer-form" :loading="busy === 'payer'">Save</UiButton>
      </template>
    </UiModal>
  </div>
</template>

<style scoped>
.pay { display: flex; flex-direction: column; gap: 8px; padding: 14px; background: var(--x-surface-2); border-radius: var(--x-radius-md); }
</style>
