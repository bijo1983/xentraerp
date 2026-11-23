<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Printer, Receipt } from 'lucide-vue-next'
import { clinic } from '@/lib/api'
import { money, niceDate } from '@/lib/format'
import type { BillingQueueRow, InvoiceRow } from '@/lib/types'
import { tokenLabel } from '@/lib/flow'
import { useClinicStore } from '@/stores/clinic'
import UiButton from '@/ui/UiButton.vue'
import UiSearchField from '@/ui/UiSearchField.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiStatusBadge from '@/ui/UiStatusBadge.vue'
import PayDialog from '@/components/PayDialog.vue'

const store = useClinicStore()
const router = useRouter()
const rows = ref<InvoiceRow[]>([])
const status = ref<'' | 'unpaid' | 'paid'>('unpaid')
const q = ref('')
const paying = ref<InvoiceRow | null>(null)
const toBill = ref<BillingQueueRow[]>([])
let timer: number | undefined

const totals = computed(() => ({
  billed: rows.value.reduce((s, r) => s + Number(r.rounded_total || r.grand_total), 0),
  due: rows.value.reduce((s, r) => s + Number(r.outstanding_amount), 0),
}))
async function load() {
  const [r, b] = await Promise.all([clinic<InvoiceRow[]>('list_invoices', { status: status.value, query: q.value }), clinic<BillingQueueRow[]>('billing_queue').catch(() => [])])
  rows.value = r
  toBill.value = b
}
function tone(r: InvoiceRow) {
  return r.outstanding_amount <= 0 ? 'success' : r.status === 'Overdue' ? 'danger' : r.outstanding_amount < (r.rounded_total || r.grand_total) ? 'warning' : 'neutral'
}
function encounterOf(r: InvoiceRow) {
  return (r.remarks || '').split(' ')[1]
}
watch(status, load)
watch(q, () => {
  window.clearTimeout(timer)
  timer = window.setTimeout(load, 250)
})
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Billing</h1><p>Every bill is a submitted Sales Invoice in Accounting; payments are Payment Entries against it.</p></div>
    </div>
    <div v-if="toBill.length" class="ready">
      <h2 class="ready__t">Ready to bill <span class="faint">· {{ toBill.length }}</span></h2>
      <div class="ready__list">
        <button v-for="b in toBill" :key="b.name" type="button" class="ready__i" @click="router.push({ name: 'bill', params: { id: b.name } })">
          <span class="tabular tok">{{ tokenLabel(b.token_no) }}</span>
          <span class="grow"><strong>{{ b.patient_name }}</strong><span class="small muted block">{{ store.practitionerName(b.practitioner) }} · {{ b.policy ? 'Insurance' : 'Self-pay' }}</span></span>
          <span class="tabular">{{ money(b.total, store.currency) }}</span>
        </button>
      </div>
    </div>
    <div class="row">
      <button v-for="[k, l] in ([['unpaid', 'Unpaid'], ['paid', 'Paid'], ['', 'All']] as const)" :key="k" type="button" class="chip" :class="{ on: status === k }" @click="status = k">{{ l }}</button>
      <div class="grow" style="max-width: 360px; margin-inline-start: auto"><UiSearchField v-model="q" placeholder="Search patient / insurer" /></div>
    </div>
    <div class="grid grid-3">
      <div class="kpi"><div class="kpi__label">Bills listed</div><div class="kpi__value">{{ rows.length }}</div></div>
      <div class="kpi"><div class="kpi__label">Billed</div><div class="kpi__value">{{ money(totals.billed, store.currency) }}</div></div>
      <div class="kpi"><div class="kpi__label">Outstanding</div><div class="kpi__value">{{ money(totals.due, store.currency) }}</div></div>
    </div>
    <UiEmptyState v-if="!rows.length" :icon="Receipt" title="No bills here" message="Bills appear when a visit is billed from the visit screen." />
    <div v-else class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>Invoice</th><th>Date</th><th>Bill to</th><th class="right">Total</th><th class="right">Outstanding</th><th>Status</th><th /></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.name">
            <td class="tabular">{{ r.name }}<div class="small faint">{{ encounterOf(r) }}</div></td>
            <td class="nowrap">{{ niceDate(r.posting_date) }}</td>
            <td>{{ r.customer_name }}</td>
            <td class="right tabular">{{ money(r.rounded_total || r.grand_total, r.currency) }}</td>
            <td class="right tabular">{{ money(r.outstanding_amount, r.currency) }}</td>
            <td><UiStatusBadge :tone="tone(r)" size="sm">{{ r.outstanding_amount <= 0 ? 'Paid' : r.status }}</UiStatusBadge></td>
            <td class="right">
              <div class="row" style="justify-content: flex-end">
                <UiButton v-if="r.outstanding_amount > 0" size="sm" @click="paying = r">Pay</UiButton>
                <UiButton v-if="encounterOf(r)?.startsWith('ENC')" size="sm" variant="ghost" @click="router.push({ name: 'bill', params: { id: encounterOf(r) } })">Visit</UiButton>
                <a class="chip" :href="router.resolve({ name: 'print', params: { kind: 'invoice', id: r.name } }).href" target="_blank" rel="noopener"><Printer :size="14" /> Print</a>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PayDialog :open="!!paying" :invoice="paying?.name || ''" :outstanding="paying?.outstanding_amount || 0" :currency="paying?.currency" :who="paying?.customer_name" @close="paying = null" @paid="paying = null; load()" />
  </div>
</template>

<style scoped>
.ready { display: flex; flex-direction: column; gap: 8px; }
.ready__t { margin: 0; font-size: var(--x-text-md); }
.ready__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.ready__i { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--x-primary); border-radius: var(--x-radius-lg); background: var(--x-surface); font: inherit; color: var(--x-text); text-align: start; cursor: pointer; box-shadow: var(--x-shadow-xs); }
.ready__i:hover { background: var(--x-primary-soft); }
.tok { font-family: var(--x-font-display); font-weight: 800; color: var(--x-primary-text); background: var(--x-primary-soft); border-radius: 8px; padding: 6px 8px; }
.block { display: block; }
</style>
