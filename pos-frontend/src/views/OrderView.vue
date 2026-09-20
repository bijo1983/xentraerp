<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePrinterStore } from '@/stores/printer'
import { usePosStore } from '@/stores/pos'
import { api } from '@/lib/api'
import PayDialog from '@/components/PayDialog.vue'
import ItemNoteDialog from '@/components/ItemNoteDialog.vue'
import type { ReceiptData } from '@/lib/receipt'
import type { KotData } from '@/lib/kot'

interface Line { item_code: string; item_name: string; qty: number; rate: number; amount: number; note: string; kot_qty: number }
// A line being edited: `saved_qty` is what the server already holds (a waiter can't go below it).
interface Draft extends Line { saved_qty: number }
interface Order {
  name: string; table: string | null; order_type: 'Dine In' | 'Take Away'; token: string | null; guest_name: string | null
  merged_tables: string[]; pos_profile: string; status: string; guests: number; total: number; invoice: string | null
  draft_invoice?: string | null; balance?: number; bill_closed: number; items: Line[]
}
interface KotOut { kot: string; table: string | null; order_type: 'Dine In' | 'Take Away'; token: string | null; items: { item_name: string; qty: number; note: string }[]; created: string }
interface MenuItem { item_code: string; item_name: string; item_group: string; rate: number }
interface FloorTable { name: string; status: string; orders: { name: string; total: number; merged: boolean }[] }
interface Totals { net: number; tax: number; grand: number; due: number }

const FNB = 'custom_erp.api.pos_fnb.'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const printer = usePrinterStore()
const pos = usePosStore()
const profile = computed(() => auth.posProfile!)

const order = ref<Order | null>(null)
const draft = ref<Draft[]>([])
const dirty = ref(false)
const menu = ref<MenuItem[]>([])
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
const noteFor = ref<number | null>(null)

const panel = ref<null | 'split' | 'merge' | 'transfer'>(null)
const splitQty = ref<Record<string, string>>({})
const mergeBillTarget = ref('')
const mergeTableTarget = ref('')
const transferTarget = ref('')

const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: profile.value.currency }).format(n)
const orderId = computed(() => String(route.params.id))
const partPaid = computed(() => order.value?.status === 'Part Paid')
const takeAway = computed(() => order.value?.order_type === 'Take Away')
// A closed check, or one that already has a posted invoice + receipts, can't be edited.
const locked = computed(() => !!order.value?.bill_closed || partPaid.value)
const draftTotal = computed(() => draft.value.reduce((s, l) => s + l.qty * l.rate, 0))
const unsent = computed(() => draft.value.some((l) => l.qty > l.kot_qty))
const canBill = computed(() => pos.can('bill'))
const canModify = computed(() => pos.can('modify'))

function fail(e: unknown) { error.value = e instanceof Error ? e.message : String(e) }

function syncFromOrder() {
  draft.value = (order.value?.items || []).map((l) => ({ ...l, saved_qty: l.qty }))
  dirty.value = false
}
async function loadOrder() {
  order.value = await api.call<Order>(FNB + 'get_order', { order: orderId.value })
  if (order.value.status !== 'Open' && order.value.status !== 'Part Paid') router.replace('/floor')
  syncFromOrder()
}
async function loadFloor() {
  floor.value = await api.call<FloorTable[]>(FNB + 'list_tables', { pos_profile: profile.value.name })
}

onMounted(async () => {
  try {
    await Promise.all([loadOrder(), loadFloor()])
    // The register's menu, priced from its price list, minus anything a supervisor has hidden.
    menu.value = await api.call<MenuItem[]>('custom_erp.api.pos_core.list_menu', { pos_profile: profile.value.name })
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

const tableBills = computed(() => {
  const t = floor.value.find((x) => x.name === order.value?.table)
  return (t?.orders || []).filter((o) => o.name !== orderId.value)
})
const mergeableBills = computed(() =>
  floor.value.flatMap((t) => t.orders.filter((o) => o.name !== orderId.value && !o.merged).map((o) => ({ name: o.name, label: `${t.name} · ${money(o.total)}` })))
)
const freeTables = computed(() => floor.value.filter((t) => t.status === 'Available' || t.status === 'Reserved'))

// ---- editing the cart (nothing reaches the server or the kitchen until Save)
const floorQty = (l: Draft) => (canModify.value ? l.kot_qty : l.saved_qty)

function add(m: MenuItem) {
  if (!order.value || locked.value) return
  const same = draft.value.find((l) => l.item_code === m.item_code && !l.note && l.kot_qty === 0)
  if (same) {
    same.qty += 1
  } else {
    draft.value.push({ item_code: m.item_code, item_name: m.item_name, qty: 1, rate: m.rate, amount: m.rate, note: '', kot_qty: 0, saved_qty: 0 })
    // A new dish: ask for any special request (well done, crunchy, ...) unless switched off.
    if (pos.promptNotes) noteFor.value = draft.value.length - 1
  }
  dirty.value = true
  notice.value = null
}
function step(i: number, delta: number) {
  if (locked.value) return
  const l = draft.value[i]
  const q = l.qty + delta
  if (q < floorQty(l) || (q <= 0 && floorQty(l) > 0)) {
    error.value = canModify.value
      ? `${l.item_name}: ${l.kot_qty} already sent to the kitchen — it can't be reduced here.`
      : `A waiter can add items but not reduce or remove them — ask a cashier.`
    return
  }
  error.value = null
  if (q <= 0) draft.value.splice(i, 1)
  else l.qty = q
  dirty.value = true
}
function editNote(i: number) {
  const l = draft.value[i]
  if (locked.value || l.kot_qty > 0 || (l.saved_qty > 0 && !canModify.value)) return
  noteFor.value = i
}
function setNote(note: string) {
  if (noteFor.value === null) return
  const l = draft.value[noteFor.value]
  // Merge into an identical line if the note now matches one (same dish, same request).
  l.note = note
  const twin = draft.value.findIndex((x, k) => k !== noteFor.value && x.item_code === l.item_code && x.note === note && x.kot_qty === 0)
  if (twin >= 0 && l.saved_qty === 0) {
    draft.value[twin].qty += l.qty
    draft.value.splice(noteFor.value, 1)
  }
  noteFor.value = null
  dirty.value = true
}

async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  error.value = null
  try {
    return await fn()
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

function toKot(k: KotOut): KotData {
  return {
    name: k.kot, order_type: k.order_type, table: k.table, token: k.token, items: k.items,
    time: new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date()),
    guest: order.value?.guest_name,
  }
}

// Saving the order is what sends it to the kitchen: the server files the ticket for whatever
// is new (kitchen screen shows it at once) and, if this device has a kitchen printer, it prints.
const save = () =>
  run(async () => {
    if (!order.value) return
    notice.value = null
    const r = await api.call<Order & { kot: KotOut | null }>(FNB + 'set_order_items', {
      order: order.value.name,
      items: JSON.stringify(draft.value.map((l) => ({ item_code: l.item_code, qty: l.qty, note: l.note }))),
    })
    order.value = r
    syncFromOrder()
    if (r.kot) {
      notice.value = `Saved — sent to the kitchen (${r.kot.kot})`
      if (printer.autoKotTerminal) printer.printKot(toKot(r.kot)).catch((e) => (error.value = `Saved, but the kitchen ticket didn't print: ${e instanceof Error ? e.message : e}`))
    } else {
      notice.value = 'Order saved'
    }
  })

const sendKot = () =>
  run(async () => {
    const k = await api.call<KotOut>(FNB + 'send_kot', { order: orderId.value })
    notice.value = `Sent to the kitchen — ${k.kot}`
    if (printer.autoKotTerminal) printer.printKot(toKot(k)).catch(() => undefined)
    await loadOrder()
  })

const closeBill = () =>
  run(async () => {
    const r = await api.call<{ order: Order; totals: Totals }>(FNB + 'close_bill', { order: orderId.value })
    order.value = r.order
    syncFromOrder()
    totals.value = r.totals
    notice.value = `Bill closed — ${money(r.totals.due)} due (tax ${money(r.totals.tax)})`
  })

const reopenBill = () =>
  run(async () => {
    order.value = await api.call<Order>(FNB + 'reopen_bill', { order: orderId.value })
    syncFromOrder()
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
      invoice: string; total: number; change: number; partial?: boolean; balance?: number
      payments: { mode_of_payment: string; currency: string; tendered: number }[]
      lines: { name: string; qty: number; rate: number; amount: number }[]
    }>(FNB + 'bill_order', { order: order.value.name, payments: JSON.stringify(payments), allow_partial: partial ? 1 : 0 })
    paying.value = false
    const receipt: ReceiptData = {
      orgName: auth.orgName || profile.value.company,
      posProfile: `${profile.value.name} · ${takeAway.value ? `Take away ${order.value.token ?? ''}` : `Table ${order.value.table}`}`,
      invoiceName: r.invoice, cashier: auth.user?.full_name || '',
      timestamp: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
      currency: profile.value.currency, lines: r.lines, total: r.total,
      paymentMethod: r.payments.map((p) => `${p.mode_of_payment} ${p.tendered} ${p.currency}`).join(' + ') + (r.change ? ` (change ${r.change})` : ''),
    }
    printer.printReceipt(receipt).catch(() => {})
    await loadFloor()
    if (r.partial) {
      notice.value = `Part payment taken — ${money(r.balance || 0)} still to collect on ${r.invoice}`
      await loadOrder()
      return
    }
    router.push(tableBills.value.length ? `/order/${tableBills.value[0].name}` : '/floor')
  } catch (e) {
    payError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function openSplit() { splitQty.value = {}; panel.value = panel.value === 'split' ? null : 'split' }
const doSplit = () =>
  run(async () => {
    if (!order.value) return
    const moves = order.value.items.map((l) => ({ item_code: l.item_code, note: l.note, qty: Number(splitQty.value[`${l.item_code}|${l.note}`]) || 0 })).filter((m) => m.qty > 0)
    const r = await api.call<{ source: Order; new: Order }>(FNB + 'split_order', { order: orderId.value, moves: JSON.stringify(moves) })
    order.value = r.source
    syncFromOrder()
    await loadFloor()
    notice.value = `Split done — new bill ${r.new.name}`
    panel.value = null
  })
const doMergeBill = () =>
  run(async () => {
    if (!mergeBillTarget.value) return
    order.value = await api.call<Order>(FNB + 'merge_orders', { target: orderId.value, source: mergeBillTarget.value })
    syncFromOrder()
    mergeBillTarget.value = ''
    await loadFloor()
    notice.value = 'Bills merged'
    panel.value = null
  })
const doMergeTable = () =>
  run(async () => {
    if (!mergeTableTarget.value) return
    order.value = await api.call<Order>(FNB + 'merge_tables', { order: orderId.value, table: mergeTableTarget.value })
    syncFromOrder()
    mergeTableTarget.value = ''
    await loadFloor()
    notice.value = 'Table joined to this party'
  })
const unmerge = (table: string) => run(async () => { order.value = await api.call<Order>(FNB + 'unmerge_table', { order: orderId.value, table }); await loadFloor() })
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
    if (!order.value?.table) return
    const o = await api.call<Order>(FNB + 'open_order', { table: order.value.table, pos_profile: profile.value.name, guests: 1, new_bill: 1 })
    router.push(`/order/${o.name}`)
  })
const cancel = () =>
  run(async () => {
    if (!window.confirm('Cancel this order? Anything already in the kitchen will be cancelled too.')) return
    await api.call(FNB + 'cancel_order', { order: orderId.value })
    router.push('/floor')
  })
</script>

<template>
  <div class="order-shell">
    <div class="term-main">
      <div class="term-topbar">
        <button class="btn btn-ghost mini" @click="router.push('/floor')">← Tables</button>
        <div class="brand">{{ takeAway ? `Take away · ${order?.token ?? ''}` : `Table ${order?.table}` }}</div>
        <span v-if="takeAway && order?.guest_name" class="reg-pill">{{ order.guest_name }}</span>
        <span v-for="t in order?.merged_tables || []" :key="t" class="pill">+ {{ t }} <a v-if="canModify" style="cursor: pointer" title="Un-merge" @click="unmerge(t)">✕</a></span>
        <span v-if="!takeAway" class="reg-pill">{{ order?.guests }} guests</span>
        <label class="pill" style="cursor: pointer" title="Print the kitchen ticket from this device when the order is saved"><input type="checkbox" :checked="printer.autoKotTerminal" @change="printer.setAutoKot('terminal', ($event.target as HTMLInputElement).checked)" /> KOT printer</label>
        <div class="term-search"><span class="icn">⌕</span><input v-model="search" type="text" placeholder="Search menu…" /></div>
      </div>
      <div class="cat-rail">
        <div class="cat-chip" :class="{ active: group === 'all' }" @click="group = 'all'">All</div>
        <div v-for="g in groups" :key="g" class="cat-chip" :class="{ active: group === g }" @click="group = g">{{ g }}</div>
      </div>
      <div class="item-grid" :style="locked ? 'opacity:.45;pointer-events:none' : ''">
        <button v-for="m in visible" :key="m.item_code" class="item-tile" @click="add(m)">
          <div class="cat-tag">{{ m.item_group }}</div>
          <div><div class="nm">{{ m.item_name }}</div><div class="pr tabular">{{ money(m.rate) }}</div></div>
        </button>
      </div>
    </div>

    <div class="cart">
      <div class="cart-head">
        <div class="row1">
          <h3>{{ takeAway ? 'Take-away order' : 'Order' }} {{ order?.name }}</h3>
          <span v-if="partPaid" class="pill warn">part paid</span><span v-else-if="locked" class="pill warn">bill closed</span><span v-else-if="dirty" class="pill warn">unsaved</span>
        </div>
        <div v-if="tableBills.length" class="row" style="margin-top: 6px">
          <span class="sub2">Other bills:</span>
          <a v-for="b in tableBills" :key="b.name" class="pill" style="cursor: pointer" @click="router.push(`/order/${b.name}`)">{{ b.name.slice(-5) }} · {{ money(b.total) }}</a>
        </div>
      </div>

      <div class="cart-lines">
        <div v-if="!draft.length" class="cart-empty">Tap a menu item to add it</div>
        <div v-for="(l, i) in draft" :key="l.item_code + l.note + i" class="line">
          <div class="sw" :style="`background: ${l.kot_qty >= l.qty && l.qty > 0 ? 'var(--success)' : 'var(--accent)'}`" />
          <div class="info">
            <div class="nm">{{ l.item_name }}</div>
            <div class="unit tabular">{{ money(l.rate) }} · <span :style="l.kot_qty >= l.qty ? 'color:var(--success)' : 'color:var(--warning)'">{{ l.kot_qty >= l.qty ? 'in kitchen' : l.saved_qty >= l.qty ? `${l.qty - l.kot_qty} to send` : 'not saved' }}</span></div>
            <span class="note-tag" @click="editNote(i)">{{ l.note ? `» ${l.note}` : l.kot_qty > 0 || locked ? '' : '+ note' }}</span>
            <div class="stepper"><button :disabled="locked" @click="step(i, -1)">–</button><span class="qty">{{ l.qty }}</span><button :disabled="locked" @click="step(i, 1)">+</button></div>
          </div>
          <div class="amt tabular">{{ money(l.qty * l.rate) }}</div>
        </div>
      </div>

      <div class="cart-totals">
        <div class="trow grand"><span>Total</span><span class="val tabular">{{ money(dirty ? draftTotal : order?.total || 0) }}</span></div>
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
        <div v-if="!takeAway" class="row">
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
        <template v-if="canModify">
          <button class="btn btn-ghost mini" :disabled="locked || dirty || (order?.items.length || 0) < 2" @click="openSplit">Split</button>
          <button class="btn btn-ghost mini" :disabled="locked || dirty" @click="panel = panel === 'merge' ? null : 'merge'">Merge</button>
          <button v-if="!takeAway" class="btn btn-ghost mini" @click="panel = panel === 'transfer' ? null : 'transfer'">Move table</button>
          <button v-if="!takeAway" class="btn btn-ghost mini" @click="newBill">New bill</button>
        </template>
        <button class="btn btn-ghost mini" style="color: var(--danger)" @click="cancel">Cancel</button>
      </div>

      <div v-if="!partPaid" class="row" style="padding: 0 14px 14px">
        <button class="btn btn-primary" style="flex: 2" :disabled="busy || locked || !dirty" @click="save">
          {{ busy ? 'Saving…' : pos.autoKot ? 'Save & send to kitchen' : 'Save order' }}
        </button>
        <button v-if="!pos.autoKot" class="btn btn-ghost" style="flex: 1" :disabled="busy || locked || dirty || !unsent" @click="sendKot">Send to kitchen</button>
        <template v-if="canBill">
          <button v-if="!locked" class="btn btn-ghost" style="flex: 1" :disabled="busy || dirty || !order?.items.length" @click="closeBill">Close bill</button>
          <button v-else class="btn btn-ghost" style="flex: 1" :disabled="busy" @click="reopenBill">Re-open</button>
        </template>
      </div>
      <p v-if="dirty && canBill" class="sub2" style="margin: 0 20px 8px">Save the order first, then close the bill or take payment.</p>

      <button v-if="canBill" class="charge-btn" :disabled="busy || dirty || !order?.items.length" @click="startPay"><span>{{ partPaid ? 'Collect balance' : 'Pay' }}</span><span class="r tabular">{{ money(partPaid ? order?.balance || 0 : order?.total || 0) }}</span></button>
      <p v-else class="sub2" style="margin: 0 20px 14px">Ask a cashier to close the bill and take payment.</p>
    </div>

    <ItemNoteDialog
      v-if="noteFor !== null && draft[noteFor]"
      :item-code="draft[noteFor].item_code"
      :item-name="draft[noteFor].item_name"
      :current="draft[noteFor].note"
      @save="setNote"
      @cancel="noteFor = null"
    />
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
