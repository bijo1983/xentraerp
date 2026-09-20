<script setup lang="ts">
// Tenant-admin screen: which kind of POS this organization runs (Retail or
// F&B), operating-hours behaviour, exchange rates for foreign-currency
// checkout, the dining tables, and the end-of-day report.
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePosStore, type PosMode } from '@/stores/pos'
import { api } from '@/lib/api'

interface Table {
  name: string
  zone: string
  seats: number
  disabled: number
  status: string
}
interface Eod {
  business_date: string
  currency: string
  invoice_count: number
  gross_sales: number
  net_sales: number
  tax: number
  average_bill: number
  returns: { count: number; total: number }
  by_payment: { mode: string; currency: string; tendered: number; amount: number }[]
  by_cashier: { cashier: string; invoices: number; total: number }[]
  top_items: { item_code: string; item_name: string; qty: number; amount: number }[]
  shifts: { name: string; cashier: string; pos_profile: string; status: string; opened_at: string; closed_at: string; invoice_count: number; total_sales: number; variance: { currency: string; variance: number }[] }[]
  fnb: { billed_orders: number; covers: number; average_per_cover: number; cancelled_orders: number; merged_orders: number }
  warnings: string[]
}

const CORE = 'custom_erp.api.pos_core.'
const FNB = 'custom_erp.api.pos_fnb.'
const router = useRouter()
const pos = usePosStore()

const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)
const tab = ref<'mode' | 'hours' | 'rates' | 'tables' | 'eod'>('mode')

async function run(fn: () => Promise<unknown>, ok?: string) {
  busy.value = true
  error.value = null
  notice.value = null
  try {
    await fn()
    if (ok) notice.value = ok
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

const s = computed(() => pos.settings)

// --- mode
const switchMode = (m: PosMode) => run(() => pos.setMode(m), `Switched to ${m} mode`)

// --- hours
const cutoff = ref('05:00')
onMounted(() => {
  cutoff.value = (pos.settings?.previous_day_until || '05:00:00').slice(0, 5)
  loadTables()
})
const toggle = (key: 'require_shift' | 'pos_247' | 'previous_day_billing') =>
  run(() => pos.saveSettings({ [key]: s.value?.[key] ? 0 : 1 }), 'Saved')
const saveCutoff = () => run(() => pos.saveSettings({ previous_day_until: cutoff.value }), 'Saved')

// --- exchange rates
const fx = ref({ from: 'USD', to: 'BHD', rate: '' })
const saveRate = () =>
  run(() => api.call(CORE + 'set_exchange_rate', { from_currency: fx.value.from.toUpperCase(), to_currency: fx.value.to.toUpperCase(), rate: Number(fx.value.rate) }), 'Rate saved for today')

// --- tables
const tables = ref<Table[]>([])
const nt = ref({ name: '', zone: '', seats: '4' })
async function loadTables() {
  if (!pos.isFnb) return
  try {
    tables.value = await api.call<Table[]>(FNB + 'list_tables')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
const addTable = () =>
  run(async () => {
    await api.call(FNB + 'save_table', { table_name: nt.value.name, zone: nt.value.zone, seats: Number(nt.value.seats) || 4 })
    nt.value = { name: '', zone: nt.value.zone, seats: nt.value.seats }
    await loadTables()
  }, 'Table saved')
const setDisabled = (t: Table) =>
  run(async () => {
    await api.call(FNB + 'save_table', { table_name: t.name, zone: t.zone, seats: t.seats, disabled: t.disabled ? 0 : 1 })
    await loadTables()
  })
const removeTable = (t: Table) =>
  run(async () => {
    if (!window.confirm(`Delete table ${t.name}?`)) return
    await api.call(FNB + 'delete_table', { table: t.name })
    await loadTables()
  })

// --- end of day
const eodDate = ref(pos.settings?.business_date || new Date().toISOString().slice(0, 10))
const eod = ref<Eod | null>(null)
const runEod = () => run(async () => (eod.value = await api.call<Eod>(CORE + 'end_of_day_report', { date: eodDate.value })))
const printReport = () => window.print()
const fmt = (n: number, c = eod.value?.currency || 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).format(n)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>POS settings &amp; reports</h2>
      <span class="pill">Business day {{ s?.business_date }}</span>
      <button class="btn btn-ghost mini" @click="router.push('/registers')">Back</button>
    </div>

    <div class="seg" style="margin-bottom: 16px">
      <button :class="{ on: tab === 'mode' }" @click="tab = 'mode'">Mode</button>
      <button :class="{ on: tab === 'hours' }" @click="tab = 'hours'">Hours &amp; shifts</button>
      <button :class="{ on: tab === 'rates' }" @click="tab = 'rates'">Currencies</button>
      <button v-if="pos.isFnb" :class="{ on: tab === 'tables' }" @click="tab = 'tables'; loadTables()">Tables</button>
      <button :class="{ on: tab === 'eod' }" @click="tab = 'eod'">End of day</button>
    </div>
    <p v-if="error" class="error-box">{{ error }}</p>
    <p v-if="notice" style="color: var(--success)">{{ notice }}</p>

    <div v-if="tab === 'mode'" class="card">
      <h4>What kind of POS is this?</h4>
      <div class="seg">
        <button :class="{ on: pos.mode === 'Retail' }" :disabled="busy" @click="switchMode('Retail')">Retail</button>
        <button :class="{ on: pos.mode === 'F&B' }" :disabled="busy" @click="switchMode('F&B')">F&amp;B (restaurant)</button>
      </div>
      <p style="color: var(--text-muted)">
        <b>Retail</b> — fast counter sales: scan or tap items, take payment. No tables, no kitchen tickets.<br />
        <b>F&amp;B</b> — table management, orders that grow over the meal, kitchen order tickets (KOT), split and merged bills.
        Switching to Retail needs every open table order billed or cancelled first.
      </p>
    </div>

    <div v-if="tab === 'hours'" class="card">
      <h4>Operating hours</h4>
      <label class="row"><input type="checkbox" :checked="!!s?.require_shift" @change="toggle('require_shift')" /> Cashiers must open a shift (with opening cash) before billing</label>
      <label class="row" style="margin-top: 8px"><input type="checkbox" :checked="!!s?.pos_247" @change="toggle('pos_247')" /> 24/7 operation — shifts may run across midnight; no day-end close is required</label>
      <label class="row" style="margin-top: 8px"><input type="checkbox" :checked="!!s?.previous_day_billing" @change="toggle('previous_day_billing')" /> Continue billing on the previous day after midnight, until
        <input v-model="cutoff" type="time" class="fld" @change="saveCutoff" /></label>
      <p style="color: var(--text-muted)">
        With the last option on, sales rung up between 00:00 and the time above are posted to the previous business day, and a table opened before midnight is settled on its own day.
        Without 24/7, a shift left open past the day change must be closed before billing continues.
      </p>
    </div>

    <div v-if="tab === 'rates'" class="card">
      <h4>Foreign-currency checkout — today's exchange rate</h4>
      <p style="color: var(--text-muted); margin-top: 0">Cash in a currency listed here can be taken at checkout and is converted at this rate. 1 unit of the first currency = this many of the second.</p>
      <div class="row">
        <input v-model="fx.from" class="fld" style="width: 80px" maxlength="3" />
        <span>→</span>
        <input v-model="fx.to" class="fld" style="width: 80px" maxlength="3" />
        <input v-model="fx.rate" class="fld tabular" type="number" min="0" step="any" placeholder="Rate" />
        <button class="btn btn-primary mini" :disabled="busy || !fx.rate" @click="saveRate">Save rate</button>
      </div>
    </div>

    <div v-if="tab === 'tables' && pos.isFnb" class="card">
      <h4>Dining tables</h4>
      <div class="row" style="margin-bottom: 12px">
        <input v-model="nt.name" class="fld" placeholder="Table name (T1)" />
        <input v-model="nt.zone" class="fld" placeholder="Zone (Patio)" />
        <input v-model="nt.seats" class="fld tabular" style="width: 80px" type="number" min="1" />
        <button class="btn btn-primary mini" :disabled="busy || !nt.name" @click="addTable">Add table</button>
      </div>
      <table class="simple-table">
        <thead><tr><th>Table</th><th>Zone</th><th class="num">Seats</th><th>Status</th><th /></tr></thead>
        <tbody>
          <tr v-for="t in tables" :key="t.name">
            <td>{{ t.name }}</td><td>{{ t.zone }}</td><td class="num">{{ t.seats }}</td>
            <td><span class="pill" :class="t.status === 'Available' ? 'ok' : t.status === 'Disabled' ? 'bad' : 'warn'">{{ t.status }}</span></td>
            <td class="num">
              <button class="btn btn-ghost mini" @click="setDisabled(t)">{{ t.disabled ? 'Enable' : 'Disable' }}</button>
              <button class="btn btn-ghost mini" style="color: var(--danger)" @click="removeTable(t)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="tab === 'eod'">
      <div class="card">
        <h4>End-of-day report</h4>
        <div class="row">
          <input v-model="eodDate" type="date" class="fld" />
          <button class="btn btn-primary mini" :disabled="busy" @click="runEod">Run report</button>
          <button v-if="eod" class="btn btn-ghost mini" @click="printReport">Print</button>
        </div>
      </div>
      <template v-if="eod">
        <div v-for="w in eod.warnings" :key="w" class="error-box" style="margin-bottom: 10px">{{ w }}</div>
        <div class="card">
          <h4>{{ eod.business_date }} · {{ eod.currency }}</h4>
          <div class="grid2">
            <div class="stat"><div class="v tabular">{{ fmt(eod.gross_sales) }}</div><div class="l">Gross sales ({{ eod.invoice_count }} bills)</div></div>
            <div class="stat"><div class="v tabular">{{ fmt(eod.net_sales) }}</div><div class="l">Net sales</div></div>
            <div class="stat"><div class="v tabular">{{ fmt(eod.tax) }}</div><div class="l">Tax</div></div>
            <div class="stat"><div class="v tabular">{{ fmt(eod.average_bill) }}</div><div class="l">Average bill</div></div>
            <div v-if="pos.isFnb" class="stat"><div class="v tabular">{{ eod.fnb.covers }}</div><div class="l">Covers · {{ fmt(eod.fnb.average_per_cover) }} each</div></div>
            <div class="stat"><div class="v tabular">{{ eod.returns.count }}</div><div class="l">Returns · {{ fmt(eod.returns.total) }}</div></div>
          </div>
        </div>
        <div class="card">
          <h4>Payments received</h4>
          <table class="simple-table"><thead><tr><th>Method</th><th>Currency</th><th class="num">Tendered</th><th class="num">Value ({{ eod.currency }})</th></tr></thead>
            <tbody><tr v-for="(p, i) in eod.by_payment" :key="i"><td>{{ p.mode }}</td><td>{{ p.currency }}</td><td class="num tabular">{{ p.tendered.toFixed(3) }}</td><td class="num tabular">{{ p.amount.toFixed(3) }}</td></tr></tbody></table>
        </div>
        <div class="card">
          <h4>Shifts</h4>
          <table class="simple-table"><thead><tr><th>Shift</th><th>Cashier</th><th>Register</th><th>Status</th><th class="num">Bills</th><th class="num">Sales</th><th>Cash variance</th></tr></thead>
            <tbody><tr v-for="sh in eod.shifts" :key="sh.name"><td>{{ sh.name }}</td><td>{{ sh.cashier }}</td><td>{{ sh.pos_profile }}</td><td>{{ sh.status }}</td><td class="num">{{ sh.invoice_count }}</td><td class="num tabular">{{ sh.total_sales.toFixed(3) }}</td>
              <td><span v-for="v in sh.variance" :key="v.currency" class="pill" :class="Math.abs(v.variance) < 0.0005 ? 'ok' : 'bad'" style="margin-right: 4px">{{ v.currency }} {{ v.variance.toFixed(3) }}</span></td></tr></tbody></table>
        </div>
        <div class="grid2">
          <div class="card"><h4>By cashier</h4><table class="simple-table"><tbody><tr v-for="c in eod.by_cashier" :key="c.cashier"><td>{{ c.cashier }}</td><td class="num">{{ c.invoices }}</td><td class="num tabular">{{ c.total.toFixed(3) }}</td></tr></tbody></table></div>
          <div class="card"><h4>Top items</h4><table class="simple-table"><tbody><tr v-for="i in eod.top_items" :key="i.item_code"><td>{{ i.item_name }}</td><td class="num">{{ i.qty }}</td><td class="num tabular">{{ i.amount.toFixed(3) }}</td></tr></tbody></table></div>
        </div>
      </template>
    </div>
  </div>
</template>
