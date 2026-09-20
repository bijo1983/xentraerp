<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePrinterStore } from '@/stores/printer'
import { usePosStore } from '@/stores/pos'
import { api } from '@/lib/api'
import PayDialog from '@/components/PayDialog.vue'
import type { ReceiptData } from '@/lib/receipt'

interface Line {
  item_code: string
  item_name: string
  qty: number
  rate: number
  amount: number
  note: string
  kot_qty: number
}
interface Order {
  name: string
  table: string
  merged_tables: string[]
  pos_profile: string
  status: string
  guests: number
  total: number
  invoice: string | null
  draft_invoice?: string | null
  balance?: number
  bill_closed: number
  items: Line[]
}
interface MenuItem {
  name: string
  item_name: string
  item_group: string
  standard_rate: number
}
interface FloorTable {
  name: string
  status: string
  orders: { name: string; total: number; merged: boolean }[]
}
interface Totals {
  net: number
  tax: number
  grand: number
  due: number
}

const FNB = 'custom_erp.api.pos_fnb.'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const printer = usePrinterStore()
const pos = usePosStore()
const profile = computed(() => auth.posProfile!)

const order = ref<Order | null>(null)
const menu = ref<MenuItem[]>([])
const priceMap = ref<Record<string, number>>({})
const floor = ref<FloorTable[]>([])
const search = ref('')
const group = ref('all')
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)

const paying = ref(false)
const payDue = ref(0)
const payError = ref<string | null>(null)
const totals = ref<Totals | null>(null)

const panel = ref<null | 'split' | 'merge' | 'transfer' | 'more'>(null)
const splitQty = ref<Record<string, string>>({})
const mergeBillTarget = ref('')
const mergeTableTarget = ref('')
const transferTarget = ref('')

const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: profile.value.currency }).format(n)
const orderId = computed(() => String(route.params.id))
const partPaid = computed(() => order.value?.status === 'Part Paid')
// A closed check, or one that already has a posted invoice + receipts, can't be edited.
const locked = computed(() => !!order.value?.bill_closed || partPaid.value)

function fail(e: unknown) {
  error.value = e instanceof Error ? e.message : String(e)
}

async function loadOrder() {
  order.value = await api.call<Order>(FNB + 'get_order', { order: orderId.value })
  if (order.value.status !== 'Open' && order.value.status !== 'Part Paid') router.replace('/floor')
}
async function loadFloor() {
  floor.value = await api.call<FloorTable[]>(FNB + 'list_tables', { pos_profile: profile.value.name })
}

onMounted(async () => {
  try {
    await Promise.all([loadOrder(), loadFloor()])
    menu.value = await api.getList<MenuItem>('Item', {
      fields: ['name', 'item_name', 'item_group', 'standard_rate'],
      filters: [['disabled', '=', 0], ['is_sales_item', '=', 1]],
      limit_page_length: 300,
    })
    if (profile.value.selling_price_list) {
      const prices = await api.getList<{ item_code: string; price_list_rate: number }>('Item Price', {
        fields: ['item_code', 'price_list_rate'],
        filters: [['price_list', '=', profile.value.selling_price_list], ['selling', '=', 1]],
        limit_page_length: 500,
      })
      const map: Record<string, number> = {}
      for (const p of prices) map[p.item_code] = p.price_list_rate
      priceMap.value = map
    }
  } catch (e) {
    fail(e)
  }
})

const groups = computed(() => [...new Set(menu.value.map((m) => m.item_group))])
const visible = computed(() => {
  let list = menu.value
  if (group.value !== 'all') list = list.filter((m) => m.item_group === group.value)
  const q = search.value.trim().toLowerCase()
  return q ? list.filter((m) => m.item_name.toLowerCase().includes(q)) : list
})
const rateOf = (m: MenuItem) => priceMap.value[m.name] ?? m.standard_rate ?? 0

// Other bills on this table (a split table) and the other tables / bills the
// merge and transfer pickers offer.
const tableBills = computed(() => {
  const t = floor.value.find((x) => x.name === order.value?.table)
  return (t?.orders || []).filter((o) => o.name !== orderId.value)
})
const mergeableBills = computed(() =>
  floor.value.flatMap((t) => t.orders.filter((o) => o.name !== orderId.value && !o.merged).map((o) => ({ name: o.name, label: `${t.name} · ${money(o.total)}` })))
)
const freeTables = computed(() => floor.value.filter((t) => t.status === 'Available' || t.status === 'Reserved'))

// Every change is applied on the server (which prices the lines); what comes
// back is what is shown.
async function push(lines: Line[]) {
  if (!order.value) return
  busy.value = true
  error.value = null
  try {
    order.value = await api.call<Order>(FNB + 'set_order_items', {
      order: order.value.name,
      items: JSON.stringify(lines.map((l) => ({ item_code: l.item_code, qty: l.qty, note: l.note }))),
    })
  } catch (e) {
    fail(e)
    await loadOrder()
  } finally {
    busy.value = false
  }
}

function add(m: MenuItem) {
  if (!order.value || locked.value) return
  const lines = order.value.items.map((l) => ({ ...l }))
  const same = lines.find((l) => l.item_code === m.name && !l.note)
  if (same) same.qty += 1
  else lines.push({ item_code: m.name, item_name: m.item_name, qty: 1, rate: rateOf(m), amount: rateOf(m), note: '', kot_qty: 0 })
  push(lines)
}
function step(i: number, delta: number) {
  if (!order.value || locked.value) return
  const lines = order.value.items.map((l) => ({ ...l }))
  const l = lines[i]
  l.qty += delta
  if (l.qty < l.kot_qty) {
    error.value = `${l.item_name}: ${l.kot_qty} already sent to the kitchen — it can't be reduced here.`
    return
  }
  push(l.qty <= 0 ? lines.filter((_, k) => k !== i) : lines)
}
function setNote(i: number, note: string) {
  if (!order.value || locked.value) return
  const lines = order.value.items.map((l) => ({ ...l }))
  lines[i].note = note
  push(lines)
}

async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  error.value = null
  notice.value = null
  try {
    return await fn()
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

const sendKot = () =>
  run(async () => {
    const k = await api.call<{ kot: string }>(FNB + 'send_kot', { order: orderId.value })
    notice.value = `Sent to the kitchen — ${k.kot}`
    await loadOrder()
  })

const closeBill = () =>
  run(async () => {
    const r = await api.call<{ order: Order; totals: Totals }>(FNB + 'close_bill', { order: orderId.value })
    order.value = r.order
    totals.value = r.totals
    notice.value = `Bill closed — ${money(r.totals.due)} due (tax ${money(r.totals.tax)})`
  })

const reopenBill = () =>
  run(async () => {
    order.value = await api.call<Order>(FNB + 'reopen_bill', { order: orderId.value })
    totals.value = null
  })

const startPay = () =>
  run(async () => {
    const t = await api.call<Totals>(FNB + 'bill_totals', { order: orderId.value })
    totals.value = t
    payDue.value = t.due
    payError.value = null
    paying.value = true
  })

async function pay(payments: { mode_of_payment: string; currency: string; tendered: number }[], partial = false) {
  if (!order.value) return
  busy.value = true
  payError.value = null
  try {
    const r = await api.call<{
      invoice: string
      total: number
      change: number
      partial?: boolean
      balance?: number
      payments: { mode_of_payment: string; currency: string; tendered: number }[]
      lines: { name: string; qty: number; rate: number; amount: number }[]
    }>(FNB + 'bill_order', { order: order.value.name, payments: JSON.stringify(payments), allow_partial: partial ? 1 : 0 })
    paying.value = false
    const receipt: ReceiptData = {
      orgName: auth.orgName || profile.value.company,
      posProfile: `${profile.value.name} · Table ${order.value.table}`,
      invoiceName: r.invoice,
      cashier: auth.user?.full_name || '',
      timestamp: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
      currency: profile.value.currency,
      lines: r.lines,
      total: r.total,
      paymentMethod: r.payments.map((p) => `${p.mode_of_payment} ${p.tendered} ${p.currency}`).join(' + ') + (r.change ? ` (change ${r.change})` : ''),
    }
    printer.printReceipt(receipt).catch(() => {})
    await loadFloor()
    if (r.partial) {
      // Part payment: the invoice is posted and Partly Paid; the table stays with its balance open.
      notice.value = `Part payment taken — ${money(r.balance || 0)} still to collect on ${r.invoice}`
      await loadOrder()
      return
    }
    const stillHere = tableBills.value
    router.push(stillHere.length ? `/order/${stillHere[0].name}` : '/floor')
  } catch (e) {
    payError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function openSplit() {
  splitQty.value = {}
  panel.value = panel.value === 'split' ? null : 'split'
}
const doSplit = () =>
  run(async () => {
    if (!order.value) return
    const moves = order.value.items
      .map((l) => ({ item_code: l.item_code, note: l.note, qty: Number(splitQty.value[`${l.item_code}|${l.note}`]) || 0 }))
      .filter((m) => m.qty > 0)
    const r = await api.call<{ source: Order; new: Order }>(FNB + 'split_order', { order: orderId.value, moves: JSON.stringify(moves) })
    order.value = r.source
    await loadFloor()
    notice.value = `Split done — new bill ${r.new.name} on this table`
    panel.value = null
  })

const doMergeBill = () =>
  run(async () => {
    if (!mergeBillTarget.value) return
    order.value = await api.call<Order>(FNB + 'merge_orders', { target: orderId.value, source: mergeBillTarget.value })
    mergeBillTarget.value = ''
    await loadFloor()
    notice.value = 'Bills merged'
    panel.value = null
  })

const doMergeTable = () =>
  run(async () => {
    if (!mergeTableTarget.value) return
    order.value = await api.call<Order>(FNB + 'merge_tables', { order: orderId.value, table: mergeTableTarget.value })
    mergeTableTarget.value = ''
    await loadFloor()
    notice.value = 'Table joined to this party'
  })

const unmerge = (table: string) =>
  run(async () => {
    order.value = await api.call<Order>(FNB + 'unmerge_table', { order: orderId.value, table })
    await loadFloor()
  })

const doTransfer = () =>
  run(async () => {
    if (!transferTarget.value) return
    await api.call(FNB + 'transfer_table', { order: orderId.value, to_table: transferTarget.value })
    transferTarget.value = ''
    await Promise.all([loadOrder(), loadFloor()])
    notice.value = 'Moved to the new table'
    panel.value = null
  })

const newBill = () =>
  run(async () => {
    if (!order.value) return
    const o = await api.call<Order>(FNB + 'open_order', { table: order.value.table, pos_profile: profile.value.name, guests: 1, new_bill: 1 })
    router.push(`/order/${o.name}`)
  })

const cancel = () =>
  run(async () => {
    if (!window.confirm('Cancel this order? Anything already in the kitchen will be cancelled too.')) return
    await api.call(FNB + 'cancel_order', { order: orderId.value })
    router.push('/floor')
  })

const unsent = computed(() => (order.value?.items || []).some((l) => l.qty > l.kot_qty))
</script>

<template>
  <div class="order-shell">
    <div class="term-main">
      <div class="term-topbar">
        <button class="btn btn-ghost mini" @click="router.push('/floor')">← Tables</button>
        <div class="brand">Table {{ order?.table }}</div>
        <span v-for="t in order?.merged_tables || []" :key="t" class="pill">+ {{ t }} <a style="cursor: pointer" title="Un-merge" @click="unmerge(t)">✕</a></span>
        <span class="reg-pill">{{ order?.guests }} guests</span>
        <div class="term-search"><span class="icn">⌕</span><input v-model="search" type="text" placeholder="Search menu…" /></div>
      </div>
      <div class="cat-rail">
        <div class="cat-chip" :class="{ active: group === 'all' }" @click="group = 'all'">All</div>
        <div v-for="g in groups" :key="g" class="cat-chip" :class="{ active: group === g }" @click="group = g">{{ g }}</div>
      </div>
      <div class="item-grid" :style="locked ? 'opacity:.45;pointer-events:none' : ''">
        <button v-for="m in visible" :key="m.name" class="item-tile" @click="add(m)">
          <div class="cat-tag">{{ m.item_group }}</div>
          <div><div class="nm">{{ m.item_name }}</div><div class="pr tabular">{{ money(rateOf(m)) }}</div></div>
        </button>
      </div>
    </div>

    <div class="cart">
      <div class="cart-head">
        <div class="row1"><h3>Order {{ order?.name }}</h3><span v-if="partPaid" class="pill warn">part paid</span><span v-else-if="locked" class="pill warn">bill closed</span></div>
        <div v-if="tableBills.length" class="row" style="margin-top: 6px">
          <span class="sub2">Other bills:</span>
          <a v-for="b in tableBills" :key="b.name" class="pill" style="cursor: pointer" @click="router.push(`/order/${b.name}`)">{{ b.name.slice(-5) }} · {{ money(b.total) }}</a>
        </div>
      </div>

      <div class="cart-lines">
        <div v-if="!order?.items.length" class="cart-empty">Tap a menu item to add it</div>
        <div v-for="(l, i) in order?.items" :key="l.item_code + l.note" class="line">
          <div class="sw" :style="`background: ${l.kot_qty >= l.qty ? 'var(--success)' : 'var(--accent)'}`" />
          <div class="info">
            <div class="nm">{{ l.item_name }}</div>
            <div class="unit tabular">{{ money(l.rate) }} · <span :style="l.kot_qty >= l.qty ? 'color:var(--success)' : 'color:var(--warning)'">{{ l.kot_qty >= l.qty ? 'in kitchen' : `${l.qty - l.kot_qty} to send` }}</span></div>
            <input class="fld" style="margin: 4px 0; width: 100%; padding: 5px 8px; font-size: 12px" :value="l.note" :disabled="locked || l.kot_qty > 0" placeholder="Note (no onions…)" @change="setNote(i, ($event.target as HTMLInputElement).value)" />
            <div class="stepper"><button :disabled="locked" @click="step(i, -1)">–</button><span class="qty">{{ l.qty }}</span><button :disabled="locked" @click="step(i, 1)">+</button></div>
          </div>
          <div class="amt tabular">{{ money(l.amount) }}</div>
        </div>
      </div>

      <div class="cart-totals">
        <div class="trow grand"><span>Total</span><span class="val tabular">{{ money(order?.total || 0) }}</span></div>
        <div v-if="totals && locked && !partPaid" class="trow"><span>Due incl. tax</span><span class="val tabular">{{ money(totals.due) }}</span></div>
        <div v-if="partPaid" class="trow" style="color: var(--warning)"><span>Balance to collect</span><span class="val tabular">{{ money(order?.balance || 0) }}</span></div>
      </div>

      <p v-if="error" class="error-box" style="margin: 0 20px 10px">{{ error }}</p>
      <p v-if="notice" style="margin: 0 20px 10px; color: var(--success); font-size: 13px">{{ notice }}</p>

      <div v-if="panel === 'split'" class="card" style="margin: 0 14px 10px">
        <h4>Split — quantity to move to a new bill</h4>
        <div v-for="l in order?.items" :key="l.item_code + l.note" class="sel-line">
          <span style="flex: 1">{{ l.item_name }} <small class="sub2">({{ l.qty }})</small></span>
          <input v-model="splitQty[`${l.item_code}|${l.note}`]" class="fld tabular" type="number" min="0" :max="l.qty" step="any" placeholder="0" />
        </div>
        <button class="btn btn-primary mini" style="margin-top: 8px" :disabled="busy" @click="doSplit">Create new bill</button>
      </div>
      <div v-if="panel === 'merge'" class="card" style="margin: 0 14px 10px">
        <h4>Merge</h4>
        <div class="row" style="margin-bottom: 8px">
          <select v-model="mergeBillTarget" class="fld" style="flex: 1"><option value="">Merge another bill into this…</option><option v-for="b in mergeableBills" :key="b.name" :value="b.name">{{ b.label }}</option></select>
          <button class="btn btn-primary mini" :disabled="!mergeBillTarget || busy" @click="doMergeBill">Merge bill</button>
        </div>
        <div class="row">
          <select v-model="mergeTableTarget" class="fld" style="flex: 1"><option value="">Join a table to this party…</option><option v-for="t in floor.filter((x) => x.status !== 'Disabled' && x.name !== order?.table && !(order?.merged_tables || []).includes(x.name))" :key="t.name" :value="t.name">{{ t.name }} ({{ t.status }})</option></select>
          <button class="btn btn-primary mini" :disabled="!mergeTableTarget || busy" @click="doMergeTable">Join table</button>
        </div>
      </div>
      <div v-if="panel === 'transfer'" class="card" style="margin: 0 14px 10px">
        <h4>Move to another table</h4>
        <div class="row">
          <select v-model="transferTarget" class="fld" style="flex: 1"><option value="">Choose a free table…</option><option v-for="t in freeTables" :key="t.name" :value="t.name">{{ t.name }}</option></select>
          <button class="btn btn-primary mini" :disabled="!transferTarget || busy" @click="doTransfer">Move</button>
        </div>
      </div>

      <div v-if="!partPaid" class="row" style="padding: 0 14px 10px">
        <button class="btn btn-ghost mini" :disabled="locked || (order?.items.length || 0) < 2" @click="openSplit">Split</button>
        <button class="btn btn-ghost mini" :disabled="locked" @click="panel = panel === 'merge' ? null : 'merge'">Merge</button>
        <button class="btn btn-ghost mini" @click="panel = panel === 'transfer' ? null : 'transfer'">Move table</button>
        <button class="btn btn-ghost mini" @click="newBill">New bill</button>
        <button class="btn btn-ghost mini" style="color: var(--danger)" @click="cancel">Cancel</button>
      </div>
      <div v-if="!partPaid" class="row" style="padding: 0 14px 14px">
        <button class="btn btn-ghost" style="flex: 1" :disabled="busy || locked || !unsent" @click="sendKot">Send to kitchen (KOT)</button>
        <button v-if="!locked" class="btn btn-ghost" style="flex: 1" :disabled="busy || !order?.items.length" @click="closeBill">Close bill</button>
        <button v-else class="btn btn-ghost" style="flex: 1" :disabled="busy" @click="reopenBill">Re-open</button>
      </div>
      <button class="charge-btn" :disabled="busy || !order?.items.length" @click="startPay"><span>{{ partPaid ? 'Collect balance' : 'Pay' }}</span><span class="r tabular">{{ money(partPaid ? order?.balance || 0 : order?.total || 0) }}</span></button>
    </div>

    <PayDialog
      v-if="paying"
      :pos-profile="profile.name"
      :currency="profile.currency"
      :due="payDue"
      :methods="profile.payment_methods"
      :busy="busy"
      :error="payError"
      :allow-partial="pos.draftMode"
      :balance-of="partPaid ? order?.balance || 0 : 0"
      @pay="pay"
      @cancel="paying = false"
    />
  </div>
</template>
