<script setup lang="ts">
// Management dashboard: where the management sign-in lands (lib/nav.ts landingRoute). Every
// figure comes from the end-of-day report (pos_core.end_of_day_report) — the same numbers the
// EOD report and shift cash-up show — fetched for the last seven business days: today's KPIs
// against the previous day, a seven-day sales trend, payment mix, best sellers, locations,
// cashiers and open shifts. Nothing here writes.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, HandCoins, Receipt, RefreshCw, RotateCcw, Users, Wallet } from 'lucide-vue-next'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { t } from '@/lib/i18n'
import { usePosStore } from '@/stores/pos'
import { UiButton, UiCard, UiErrorState, UiSkeleton } from '@/ui'

interface Eod {
  business_date: string
  currency: string
  invoice_count: number
  gross_sales: number
  net_sales: number
  tax: number
  average_bill: number
  outstanding_balance?: number
  returns: { count: number; total: number }
  by_payment: { mode: string; currency: string; tendered: number; amount: number }[]
  by_location?: { location: string; invoices: number; received: number }[]
  by_cashier: { cashier: string; invoices: number; total: number }[]
  top_items: { item_code: string; item_name: string; qty: number; amount: number }[]
  shifts: { name: string; cashier: string; pos_profile: string; location?: string | null; status: string; opened_at: string; invoice_count: number; total_sales: number }[]
  fnb: { billed_orders: number; covers: number; average_per_cover: number; cancelled_orders: number }
  warnings: string[]
}
interface Loc { code: string; name: string; disabled: number }

const CORE = 'custom_erp.api.pos_core.'
const DAYS = 7
const router = useRouter()
const pos = usePosStore()

const days = ref<Eod[]>([]) // oldest first; the last one is the current business day
const locations = ref<Loc[]>([])
const location = ref('')
const loading = ref(true)
const refreshing = ref(false)
const failed = ref(false)
const updatedAt = ref<Date | null>(null)

const businessDate = computed(() => pos.settings?.business_date || new Date().toISOString().slice(0, 10))
function shift(date: string, by: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + by)
  return d.toISOString().slice(0, 10)
}
const dates = computed(() => Array.from({ length: DAYS }, (_, i) => shift(businessDate.value, i - DAYS + 1)))
const eod = (date: string) => api.call<Eod>(CORE + 'end_of_day_report', { date, location: location.value || undefined })

async function load(onlyToday = false) {
  failed.value = false
  try {
    if (onlyToday && days.value.length === DAYS) {
      const today = await eod(dates.value[DAYS - 1])
      days.value = [...days.value.slice(0, -1), today]
    } else {
      days.value = await Promise.all(dates.value.map(eod))
    }
    updatedAt.value = new Date()
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
async function refresh() {
  refreshing.value = true
  await load()
  refreshing.value = false
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  api.call<Loc[]>(CORE + 'list_locations').then((l) => (locations.value = l.filter((x) => !x.disabled))).catch(() => undefined)
  await load()
  // Today's figures move during service; the earlier days don't.
  timer = setInterval(() => document.visibilityState === 'visible' && load(true), 120_000)
})
onBeforeUnmount(() => clearInterval(timer))
watch(location, () => {
  loading.value = true
  load()
})

const today = computed(() => days.value[DAYS - 1])
const yesterday = computed(() => days.value[DAYS - 2])
const ccy = computed(() => today.value?.currency || '')
const money = (v: number) => formatMoney(v, ccy.value)
const showFnb = computed(() => pos.navContext.modes.includes('F&B'))

function change(now: number, before: number | undefined) {
  if (!before) return null
  return ((now - before) / Math.abs(before)) * 100
}
const kpis = computed(() => {
  const d = today.value
  const y = yesterday.value
  if (!d) return []
  const out = [
    { key: 'sales', icon: Wallet, tone: 'sky', label: t('dash.kpi.sales'), value: money(d.gross_sales), delta: change(d.gross_sales, y?.gross_sales), note: t('dash.kpi.salesNote', { net: money(d.net_sales), tax: money(d.tax) }) },
    { key: 'bills', icon: Receipt, tone: 'emerald', label: t('dash.kpi.bills'), value: String(d.invoice_count), delta: change(d.invoice_count, y?.invoice_count), note: t('dash.kpi.avgBill', { value: money(d.average_bill) }) },
  ]
  if (showFnb.value) {
    out.push({ key: 'covers', icon: Users, tone: 'violet', label: t('dash.kpi.covers'), value: String(d.fnb.covers), delta: change(d.fnb.covers, y?.fnb.covers), note: t('dash.kpi.perCover', { value: money(d.fnb.average_per_cover) }) })
  }
  out.push(
    { key: 'due', icon: HandCoins, tone: 'amber', label: t('dash.kpi.due'), value: money(d.outstanding_balance || 0), delta: null, note: t('dash.kpi.dueNote') },
    { key: 'returns', icon: RotateCcw, tone: 'rose', label: t('dash.kpi.returns'), value: money(Math.abs(d.returns.total)), delta: null, note: t('dash.kpi.returnsNote', { count: d.returns.count }) },
  )
  return out
})

// Seven-day trend: bars scaled to the best day.
const trend = computed(() => {
  const max = Math.max(1, ...days.value.map((d) => d.gross_sales))
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' })
  return days.value.map((d, i) => ({
    date: d.business_date,
    label: fmt.format(new Date(`${d.business_date}T00:00:00Z`)),
    value: d.gross_sales,
    pct: (d.gross_sales / max) * 100,
    today: i === DAYS - 1,
  }))
})
const weekTotal = computed(() => days.value.reduce((s, d) => s + d.gross_sales, 0))
const weekBills = computed(() => days.value.reduce((s, d) => s + d.invoice_count, 0))

// Payment mix in company currency (amount, not tendered — change is already taken out).
const payments = computed(() => {
  const by = new Map<string, number>()
  for (const p of today.value?.by_payment || []) by.set(p.mode, (by.get(p.mode) || 0) + p.amount)
  const total = [...by.values()].reduce((s, v) => s + v, 0) || 1
  return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([mode, amount]) => ({ mode, amount, pct: (amount / total) * 100 }))
})
const topItems = computed(() => (today.value?.top_items || []).slice(0, 6))
const topMax = computed(() => Math.max(1, ...topItems.value.map((i) => i.amount)))
const byLocation = computed(() => (today.value?.by_location || []).filter((l) => l.location || (today.value?.by_location || []).length > 1))
const cashiers = computed(() => (today.value?.by_cashier || []).slice(0, 5))
const openShifts = computed(() => (today.value?.shifts || []).filter((s) => s.status === 'Open'))
const locationName = (code: string) => locations.value.find((l) => l.code === code)?.name || code || t('dash.noLocation')
const time = (iso: string) => (iso ? new Date(iso.replace(' ', 'T')).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '')
const who = (user: string) => user.split('@')[0]
</script>

<template>
  <div class="dash">
    <header class="dash__head">
      <div>
        <p class="dash__eyebrow">{{ t('dash.eyebrow') }}</p>
        <h1>{{ t('dash.title') }}</h1>
        <p class="dash__sub">
          {{ t('dash.businessDay', { date: businessDate }) }}
          <template v-if="updatedAt"> · {{ t('dash.updated', { time: updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }) }}</template>
        </p>
      </div>
      <div class="dash__tools">
        <label v-if="locations.length > 1" class="dash__loc">
          <span class="x-sr-only">{{ t('dash.location') }}</span>
          <select v-model="location">
            <option value="">{{ t('dash.allLocations') }}</option>
            <option v-for="l in locations" :key="l.code" :value="l.code">{{ l.name }}</option>
          </select>
        </label>
        <UiButton variant="secondary" :disabled="refreshing" @click="refresh">
          <RefreshCw :size="16" :class="{ spin: refreshing }" aria-hidden="true" />{{ t('dash.refresh') }}
        </UiButton>
        <UiButton v-if="pos.can('reports')" variant="ghost" @click="router.push('/admin')">{{ t('dash.fullReport') }}</UiButton>
      </div>
    </header>

    <UiErrorState v-if="failed && !today" :retry="true" @retry="refresh" />

    <template v-else>
      <!-- KPIs -->
      <ul class="dash__kpis" :aria-busy="loading">
        <template v-if="loading">
          <li v-for="i in 5" :key="i" class="kpi"><UiSkeleton :lines="3" /></li>
        </template>
        <li v-for="k in kpis" v-else :key="k.key" class="kpi">
          <div class="kpi__top">
            <span class="kpi__ic x-art" :class="`x-art--${k.tone}`" aria-hidden="true"><component :is="k.icon" :size="18" :stroke-width="1.9" /></span>
            <span class="kpi__label">{{ k.label }}</span>
          </div>
          <b class="kpi__value x-tabular">{{ k.value }}</b>
          <div class="kpi__foot">
            <span v-if="k.delta !== null" class="kpi__delta" :class="k.delta >= 0 ? 'up' : 'down'" :title="t('dash.vsYesterday')">
              <component :is="k.delta >= 0 ? ArrowUpRight : ArrowDownRight" :size="14" aria-hidden="true" />{{ Math.abs(k.delta).toFixed(0) }}%
              <span class="x-sr-only">{{ t('dash.vsYesterday') }}</span>
            </span>
            <small>{{ k.note }}</small>
          </div>
        </li>
      </ul>

      <div v-if="today?.warnings.length" class="dash__warn" role="status">
        <AlertTriangle :size="18" aria-hidden="true" />
        <ul><li v-for="w in today.warnings" :key="w">{{ w }}</li></ul>
      </div>

      <div class="dash__grid">
        <!-- seven-day trend -->
        <UiCard class="span-2" :title="t('dash.trend')">
          <template #actions>
            <span class="muted x-tabular">{{ t('dash.weekTotal', { total: money(weekTotal), bills: weekBills }) }}</span>
          </template>
          <UiSkeleton v-if="loading" height="200px" />
          <ol v-else class="bars" :aria-label="t('dash.trend')">
            <li v-for="b in trend" :key="b.date" :class="{ today: b.today }">
              <span class="bars__val x-tabular">{{ money(b.value) }}</span>
              <span class="bars__track"><span class="bars__bar" :style="{ height: `${Math.max(b.pct, 2)}%` }" /></span>
              <span class="bars__day">{{ b.today ? t('dash.today') : b.label }}</span>
            </li>
          </ol>
        </UiCard>

        <!-- payment mix -->
        <UiCard :title="t('dash.payments')">
          <UiSkeleton v-if="loading" :lines="4" />
          <p v-else-if="!payments.length" class="muted">{{ t('dash.noSales') }}</p>
          <ul v-else class="meter">
            <li v-for="p in payments" :key="p.mode">
              <div class="meter__row"><span>{{ p.mode }}</span><b class="x-tabular">{{ money(p.amount) }}</b></div>
              <span class="meter__track"><span class="meter__fill" :style="{ width: `${p.pct}%` }" /></span>
            </li>
          </ul>
        </UiCard>

        <!-- best sellers -->
        <UiCard :title="t('dash.topItems')">
          <UiSkeleton v-if="loading" :lines="5" />
          <p v-else-if="!topItems.length" class="muted">{{ t('dash.noSales') }}</p>
          <ol v-else class="meter meter--ranked">
            <li v-for="it in topItems" :key="it.item_code">
              <div class="meter__row"><span>{{ it.item_name || it.item_code }} <small class="muted x-tabular">× {{ it.qty }}</small></span><b class="x-tabular">{{ money(it.amount) }}</b></div>
              <span class="meter__track"><span class="meter__fill meter__fill--alt" :style="{ width: `${(it.amount / topMax) * 100}%` }" /></span>
            </li>
          </ol>
        </UiCard>

        <!-- cashiers -->
        <UiCard :title="t('dash.cashiers')">
          <UiSkeleton v-if="loading" :lines="4" />
          <p v-else-if="!cashiers.length" class="muted">{{ t('dash.noSales') }}</p>
          <table v-else class="tbl">
            <tbody>
              <tr v-for="c in cashiers" :key="c.cashier">
                <th scope="row">{{ who(c.cashier) }}</th>
                <td class="muted x-tabular">{{ t('dash.bills', { count: c.invoices }) }}</td>
                <td class="x-tabular">{{ money(c.total) }}</td>
              </tr>
            </tbody>
          </table>
        </UiCard>

        <!-- locations -->
        <UiCard v-if="byLocation.length > 1 && !location" :title="t('dash.locations')">
          <table class="tbl">
            <tbody>
              <tr v-for="l in byLocation" :key="l.location">
                <th scope="row">{{ locationName(l.location) }}</th>
                <td class="muted x-tabular">{{ t('dash.bills', { count: l.invoices }) }}</td>
                <td class="x-tabular">{{ money(l.received) }}</td>
              </tr>
            </tbody>
          </table>
        </UiCard>

        <!-- open shifts -->
        <UiCard :title="t('dash.openShifts')">
          <UiSkeleton v-if="loading" :lines="3" />
          <p v-else-if="!openShifts.length" class="muted">{{ t('dash.noOpenShifts') }}</p>
          <table v-else class="tbl">
            <tbody>
              <tr v-for="s in openShifts" :key="s.name">
                <th scope="row"><Clock :size="14" aria-hidden="true" /> {{ who(s.cashier) }} <small class="muted">{{ s.pos_profile }}</small></th>
                <td class="muted x-tabular">{{ t('dash.since', { time: time(s.opened_at) }) }}</td>
                <td class="x-tabular">{{ money(s.total_sales) }}</td>
              </tr>
            </tbody>
          </table>
        </UiCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dash { max-width: 1280px; margin: 0 auto; padding: 28px clamp(16px, 3vw, 32px) 48px; display: flex; flex-direction: column; gap: 24px; }
.dash__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.dash__head h1 { margin: 4px 0; font-family: var(--x-font-display); font-size: clamp(24px, 2.4vw, 32px); font-weight: 800; letter-spacing: -0.02em; }
.dash__eyebrow { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--x-primary-text); }
.dash__sub { margin: 0; color: var(--x-text-muted); font-size: 14px; }
.dash__tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dash__loc select { min-height: 44px; padding: 0 12px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.dash__kpis { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
.kpi { display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: var(--x-radius-lg); background: var(--x-surface); border: 1px solid var(--x-border); box-shadow: var(--x-shadow-sm); min-width: 0; }
.kpi__top { display: flex; align-items: center; gap: 10px; }
.kpi__ic { width: 36px; height: 36px; border-radius: 10px; flex: none; }
.kpi__label { font-size: 14px; font-weight: 600; color: var(--x-text-muted); }
.kpi__value { font-family: var(--x-font-display); font-size: clamp(22px, 2vw, 28px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; overflow-wrap: anywhere; }
.kpi__foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--x-text-muted); }
.kpi__delta { display: inline-flex; align-items: center; gap: 2px; padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 12px; }
.kpi__delta.up { background: var(--x-success-soft); color: var(--x-success-text); }
.kpi__delta.down { background: var(--x-danger-soft); color: var(--x-danger-text); }

.dash__warn { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border-radius: var(--x-radius-lg); background: var(--x-warning-soft); color: var(--x-warning-text); font-size: 14px; }
.dash__warn ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }

.dash__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: start; }
.span-2 { grid-column: span 2; }
.muted { color: var(--x-text-muted); font-size: 13px; }
p.muted { margin: 0; }

.bars { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; height: 220px; }
.bars li { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
.bars__val { font-size: 11px; color: var(--x-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.bars__track { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.bars__bar { display: block; width: 100%; border-radius: 8px 8px 3px 3px; background: color-mix(in srgb, var(--x-primary) 28%, transparent); transition: height 400ms var(--x-ease); }
.bars li.today .bars__bar { background: var(--x-primary); }
.bars li.today .bars__val { color: var(--x-text); font-weight: 700; }
.bars__day { font-size: 12px; font-weight: 600; color: var(--x-text-muted); }

.meter { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.meter__row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; margin-bottom: 6px; }
.meter__row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meter__track { display: block; height: 8px; border-radius: 999px; background: var(--x-surface-3); overflow: hidden; }
.meter__fill { display: block; height: 100%; border-radius: inherit; background: var(--x-primary); }
.meter__fill--alt { background: var(--x-success); }

.tbl { width: 100%; border-collapse: collapse; font-size: 14px; }
.tbl th, .tbl td { padding: 10px 0; border-bottom: 1px solid var(--x-border); text-align: start; font-weight: 500; }
.tbl tr:last-child :is(th, td) { border-bottom: 0; }
.tbl td { text-align: end; padding-inline-start: 12px; white-space: nowrap; }
.tbl th small { display: block; }

@media (max-width: 1023px) {
  .dash__grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 767px) {
  .dash__grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: auto; }
  .dash__kpis { grid-template-columns: 1fr 1fr; gap: 12px; }
  .kpi { padding: 16px; }
  .kpi__value { font-size: 20px; }
  .bars { gap: 6px; height: 180px; }
  .bars__val { display: none; }
}
</style>
