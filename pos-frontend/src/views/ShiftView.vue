<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePosStore, type Shift, type CashRow } from '@/stores/pos'
import { api } from '@/lib/api'

const router = useRouter()
const auth = useAuthStore()
const pos = usePosStore()
const profile = computed(() => auth.posProfile!)

interface Report extends Shift {
  cash: (CashRow & { cash_in: number })[]
}

const report = ref<Report | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)
const closedSummary = ref<Shift | null>(null)

// Opening float, per currency.
const opening = ref<{ currency: string; amount: string }[]>([{ currency: profile.value.currency, amount: '' }])
const currencies = ref<string[]>([profile.value.currency])
// Closing count, per currency.
const counted = ref<Record<string, string>>({})
const notes = ref('')

onMounted(async () => {
  try {
    const list = await api.call<{ currency: string }[]>('custom_erp.api.pos_core.list_checkout_currencies', { pos_profile: profile.value.name })
    currencies.value = list.map((c) => c.currency)
  } catch {
    /* register currency only */
  }
  await refresh()
})

async function refresh() {
  if (!pos.shift) {
    report.value = null
    return
  }
  try {
    report.value = await api.call<Report>('custom_erp.api.pos_core.shift_report', { shift: pos.shift.name })
    for (const c of report.value.cash) if (!(c.currency in counted.value)) counted.value[c.currency] = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function money(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n)
}

function addCurrency() {
  const used = new Set(opening.value.map((o) => o.currency))
  const next = currencies.value.find((c) => !used.has(c))
  if (next) opening.value.push({ currency: next, amount: '' })
}

async function open() {
  busy.value = true
  error.value = null
  try {
    const cash: Record<string, number> = {}
    for (const o of opening.value) cash[o.currency] = Number(o.amount) || 0
    await pos.openShift(profile.value.name, cash)
    router.push(pos.isFnb ? '/floor' : '/terminal')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

const countedAll = computed(() => !!report.value && report.value.cash.every((c) => counted.value[c.currency] !== undefined && counted.value[c.currency] !== ''))

async function close() {
  busy.value = true
  error.value = null
  try {
    const c: Record<string, number> = {}
    for (const [k, v] of Object.entries(counted.value)) c[k] = Number(v) || 0
    closedSummary.value = await pos.closeShift(c, notes.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function finish() {
  closedSummary.value = null
  router.push('/registers')
}
</script>

<template>
  <div class="page" style="max-width: 720px">
    <div class="page-head">
      <h2>Shift · {{ profile.name }}</h2>
      <span class="pill">Business day {{ pos.settings?.business_date }}</span>
      <span v-if="pos.settings?.pos_247" class="pill ok">24/7</span>
      <button class="btn btn-ghost mini" @click="router.push('/registers')">Back</button>
    </div>

    <!-- Just closed: the result -->
    <div v-if="closedSummary" class="card">
      <h4>Shift closed</h4>
      <table class="simple-table">
        <thead><tr><th>Currency</th><th class="num">Opening</th><th class="num">Expected</th><th class="num">Counted</th><th class="num">Variance</th></tr></thead>
        <tbody>
          <tr v-for="c in closedSummary.cash" :key="c.currency">
            <td>{{ c.currency }}</td>
            <td class="num tabular">{{ money(c.opening, c.currency) }}</td>
            <td class="num tabular">{{ money(c.expected, c.currency) }}</td>
            <td class="num tabular">{{ money(c.counted, c.currency) }}</td>
            <td class="num tabular"><span class="pill" :class="Math.abs(c.variance) < 0.0005 ? 'ok' : 'bad'">{{ money(c.variance, c.currency) }}</span></td>
          </tr>
        </tbody>
      </table>
      <p style="color: var(--text-muted)">{{ closedSummary.invoice_count }} sales · {{ closedSummary.total_sales.toFixed(3) }} total</p>
      <button class="btn btn-primary" @click="finish">Done</button>
    </div>

    <!-- No shift: open one -->
    <div v-else-if="!pos.shift" class="card">
      <h4>Open a shift</h4>
      <p style="color: var(--text-muted); margin-top: 0">Count the cash in the drawer to start. Enter what is in each currency.</p>
      <div v-for="(o, i) in opening" :key="i" class="row" style="margin-bottom: 8px">
        <select v-model="o.currency" class="fld">
          <option v-for="c in currencies" :key="c" :value="c">{{ c }}</option>
        </select>
        <input v-model="o.amount" class="fld tabular" type="number" min="0" step="any" inputmode="decimal" placeholder="Opening cash" />
        <button v-if="opening.length > 1" class="btn btn-ghost mini" @click="opening.splice(i, 1)">✕</button>
      </div>
      <button v-if="currencies.length > opening.length" class="btn btn-ghost mini" @click="addCurrency">+ Another currency</button>
      <p v-if="error" class="error-box">{{ error }}</p>
      <div style="margin-top: 14px"><button class="btn btn-primary" :disabled="busy" @click="open">{{ busy ? 'Opening…' : 'Open shift' }}</button></div>
    </div>

    <!-- Shift open: live drawer + close -->
    <template v-else-if="report">
      <div class="card">
        <h4>Open since {{ report.opened_at }}</h4>
        <div class="grid2">
          <div class="stat"><div class="v tabular">{{ report.invoice_count }}</div><div class="l">Sales this shift</div></div>
          <div class="stat"><div class="v tabular">{{ report.total_sales.toFixed(3) }}</div><div class="l">Total sales</div></div>
        </div>
        <table v-if="report.by_payment?.length" class="simple-table" style="margin-top: 12px">
          <thead><tr><th>Payment</th><th>Currency</th><th class="num">Tendered</th></tr></thead>
          <tbody><tr v-for="(p, i) in report.by_payment" :key="i"><td>{{ p.mode }}</td><td>{{ p.currency }}</td><td class="num tabular">{{ p.tendered.toFixed(3) }}</td></tr></tbody>
        </table>
      </div>

      <div class="card">
        <h4>Close shift — count the drawer</h4>
        <table class="simple-table">
          <thead><tr><th>Currency</th><th class="num">Opening</th><th class="num">Cash taken</th><th class="num">Should hold</th><th class="num">Counted</th></tr></thead>
          <tbody>
            <tr v-for="c in report.cash" :key="c.currency">
              <td>{{ c.currency }}</td>
              <td class="num tabular">{{ c.opening.toFixed(3) }}</td>
              <td class="num tabular">{{ c.cash_in.toFixed(3) }}</td>
              <td class="num tabular">{{ c.expected.toFixed(3) }}</td>
              <td class="num"><input v-model="counted[c.currency]" class="fld tabular" style="width: 110px" type="number" min="0" step="any" inputmode="decimal" /></td>
            </tr>
          </tbody>
        </table>
        <input v-model="notes" class="fld" style="width: 100%; margin-top: 10px" placeholder="Notes (optional)" />
        <p v-if="error" class="error-box">{{ error }}</p>
        <div class="row" style="margin-top: 14px">
          <button class="btn btn-ghost" @click="router.push(pos.isFnb ? '/floor' : '/terminal')">Keep selling</button>
          <button class="btn btn-primary" :disabled="busy || !countedAll" @click="close">{{ busy ? 'Closing…' : 'Close shift' }}</button>
        </div>
      </div>
    </template>
    <p v-else-if="error" class="error-box">{{ error }}</p>
  </div>
</template>
