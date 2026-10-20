<script setup lang="ts">
import { t } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore, NO_PROFILE } from '@/stores/auth'
import { usePrinterStore } from '@/stores/printer'
import { usePosStore } from '@/stores/pos'
import { api } from '@/lib/api'
import PayDialog from '@/components/PayDialog.vue'
import ItemNoteDialog from '@/components/ItemNoteDialog.vue'
import ConfirmSheet from '@/components/ConfirmSheet.vue'
import type { ReceiptData } from '@/lib/receipt'
import type { KotData } from '@/lib/kot'
import {
  ArrowLeft, ChefHat, ChevronUp, CircleCheck, Clock, CreditCard, Merge, MoveRight, Plus, Minus, Printer, Search, Send, ShoppingBag,
  Split, StickyNote, Users, UtensilsCrossed, X, Ban, BellRing, ReceiptText, LockOpen, Lock,
} from 'lucide-vue-next'
import { UiCategoryChips, UiEmptyState, UiProductCard, UiSkeleton } from '@/ui'

interface Line { item_code: string; item_name: string; qty: number; rate: number; amount: number; note: string; kot_qty: number }
// A line being edited: `saved_qty` is what the server already holds (a waiter can't go below it).
interface Draft extends Line { saved_qty: number }
interface Order {
  name: string; table: string | null; order_type: 'Dine In' | 'Take Away'; token: string | null; guest_name: string | null
  merged_tables: string[]; pos_profile: string; status: string; guests: number; total: number; invoice: string | null
  draft_invoice?: string | null; balance?: number; bill_closed: number; bill_requested?: number; items: Line[]
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
const profile = computed(() => auth.posProfile ?? NO_PROFILE)

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

const money = (n: number) => formatMoney(n, profile.value.currency)
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

const menuLoading = ref(true)
// Dish photos: the Item's own image when the menu item has one (best effort — a role that
// can't read Item just gets the illustrations from lib/itemArt.ts).
const images = ref<Record<string, string>>({})
const orderOpen = ref(false)

onMounted(async () => {
  try {
    await Promise.all([loadOrder(), loadFloor()])
    // The register's menu, priced from its price list, minus anything a supervisor has hidden.
    menu.value = await api.call<MenuItem[]>('custom_erp.api.pos_core.list_menu', { pos_profile: profile.value.name })
  } catch (e) {
    fail(e)
  } finally {
    menuLoading.value = false
  }
  api
    .getList<{ name: string; image: string | null }>('Item', { fields: ['name', 'image'], filters: [['image', 'is', 'set'], ['disabled', '=', 0]], limit_page_length: 2000 })
    .then((rows) => (images.value = Object.fromEntries(rows.filter((r) => r.image).map((r) => [r.name, r.image as string]))))
    .catch(() => undefined)
})

const groups = computed(() => [...new Set(menu.value.map((m) => m.item_group))])
const chips = computed(() => [
  { value: 'all', label: t('order.allMenu'), count: menu.value.length },
  ...groups.value.map((g) => ({ value: g, label: g, count: menu.value.filter((m) => m.item_group === g).length })),
])
const qtyByCode = computed(() => {
  const out: Record<string, number> = {}
  for (const l of draft.value) out[l.item_code] = (out[l.item_code] || 0) + l.qty
  return out
})
const draftCount = computed(() => draft.value.reduce((n, l) => n + l.qty, 0))
function lineState(l: Draft): 'kitchen' | 'tosend' | 'unsaved' {
  return l.kot_qty >= l.qty ? 'kitchen' : l.saved_qty >= l.qty ? 'tosend' : 'unsaved'
}
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

// Order takers (no `bill` cap) ask the cashier for the bill; the table shows "bill requested".
const requestBill = (cancel = false) =>
  run(async () => {
    order.value = await api.call<Order>(FNB + 'request_bill', { order: orderId.value, cancel: cancel ? 1 : 0 })
    syncFromOrder()
    notice.value = cancel ? null : t('fnb.billRequested')
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
// ---- closing an order that shouldn't go ahead
// Mirrors what the server allows: anyone may close an order with nothing on it; one whose items never
// reached the kitchen needs a cashier; once food was sent only a supervisor or administrator can void it.
const savedItems = computed(() => order.value?.items.length || 0)
const sentToKitchen = computed(() => (order.value?.items || []).some((l) => l.kot_qty > 0))
const closeKind = computed<'empty' | 'unsent' | 'sent'>(() => (!savedItems.value ? 'empty' : sentToKitchen.value ? 'sent' : 'unsent'))
const canClose = computed(() => !partPaid.value && (closeKind.value === 'empty' || (closeKind.value === 'unsent' ? pos.can('modify') : pos.can('supervise'))))
const closeLabel = computed(() => (closeKind.value === 'sent' ? 'Void order' : 'Close order'))
const closeHint = computed(() => (closeKind.value === 'sent' ? 'Food was sent to the kitchen — ask a supervisor to void this order.' : 'Ask a cashier to close this order.'))
const closing = ref(false)
const closeOrder = () => {
  closing.value = false
  return run(async () => {
    await api.call(FNB + 'cancel_order', { order: orderId.value })
    router.push('/floor')
  })
}
</script>

<template>
  <div class="ov">
    <!-- menu -->
    <section class="ov-main" :aria-label="t('order.menu')">
      <header class="ov-head">
        <button type="button" class="ov-back" @click="router.push('/floor')"><ArrowLeft :size="18" aria-hidden="true" /><span>{{ t('order.tables') }}</span></button>
        <div class="ov-title">
          <span class="ov-title__ic" :class="takeAway ? 'is-ta' : 'is-dine'" aria-hidden="true"><component :is="takeAway ? ShoppingBag : UtensilsCrossed" :size="20" /></span>
          <div class="ov-title__tx">
            <h1>{{ takeAway ? t('order.takeAwayN', { n: order?.token ?? '' }) : t('order.tableN', { n: order?.table ?? '' }) }}</h1>
            <span class="ov-meta">
              <span v-if="!takeAway" class="ov-chip"><Users :size="13" aria-hidden="true" />{{ t('order.guests', { n: order?.guests ?? 0 }) }}</span>
              <span v-if="takeAway && order?.guest_name" class="ov-chip">{{ order.guest_name }}</span>
              <span v-for="mt in order?.merged_tables || []" :key="mt" class="ov-chip ov-chip--merge">+ {{ mt }}<button v-if="canModify" type="button" :aria-label="t('order.unmerge', { t: mt })" @click="unmerge(mt)"><X :size="12" /></button></span>
            </span>
          </div>
        </div>
        <label class="ov-switch" :title="t('order.kotPrinterHint')">
          <input type="checkbox" :checked="printer.autoKotTerminal" @change="printer.setAutoKot('terminal', ($event.target as HTMLInputElement).checked)" />
          <span class="ov-switch__track" aria-hidden="true"><span /></span>
          <Printer :size="16" aria-hidden="true" /><span class="ov-switch__lbl">{{ t('order.kotPrinter') }}</span>
        </label>
        <div class="ov-search">
          <Search :size="18" aria-hidden="true" />
          <input v-model="search" type="search" :placeholder="t('order.searchMenu')" :aria-label="t('order.searchMenu')" />
        </div>
      </header>

      <div v-if="menu.length" class="ov-chipbar"><UiCategoryChips v-model="group" :options="chips" :label="t('sale.categories')" /></div>

      <div class="ov-scroll">
        <div v-if="menuLoading" class="ov-grid" aria-busy="true">
          <div v-for="n in 12" :key="n" class="ov-skel"><UiSkeleton width="40%" height="10px" /><UiSkeleton :lines="2" /><UiSkeleton width="50%" height="18px" /></div>
        </div>
        <div v-else-if="!menu.length" class="ov-state"><UiEmptyState :icon="ChefHat" :title="t('order.noMenuTitle')" :message="t('order.noMenuBody')" /></div>
        <div v-else-if="!visible.length" class="ov-state">
          <UiEmptyState :icon="Search" :title="t('sale.noMatchTitle')" :message="t('sale.noMatchBody', { q: search })" tone="neutral">
            <button type="button" class="ov-btn" @click="search = ''; group = 'all'">{{ t('sale.showAll') }}</button>
          </UiEmptyState>
        </div>
        <div v-else class="ov-grid" :class="{ 'is-locked': locked }">
          <UiProductCard
            v-for="m in visible"
            :key="m.item_code"
            :name="m.item_name"
            :group="m.item_group"
            :image="images[m.item_code] || null"
            :price="m.rate"
            :currency="profile.currency"
            :qty-in-cart="qtyByCode[m.item_code] || 0"
            :disabled="locked"
            @select="add(m)"
          />
        </div>
        <p v-if="locked" class="ov-locked"><Lock :size="15" aria-hidden="true" />{{ partPaid ? t('order.lockedPartPaid') : t('order.lockedClosed') }}</p>
      </div>
    </section>

    <!-- phone: order summary bar -->
    <button v-if="!orderOpen" type="button" class="ov-orderbar" @click="orderOpen = true">
      <span class="ov-orderbar__n x-tabular">{{ draftCount }}</span>
      <span>{{ t('order.viewOrder') }}<small v-if="dirty"> · {{ t('order.unsaved') }}</small></span>
      <b class="x-tabular">{{ money(dirty ? draftTotal : order?.total || 0) }}</b>
      <ChevronUp :size="18" aria-hidden="true" />
    </button>
    <div v-if="orderOpen" class="ov-scrim" @click="orderOpen = false" />

    <!-- order panel -->
    <aside class="ov-panel" :class="{ 'is-open': orderOpen }" :aria-label="t('order.thisOrder')">
      <header class="ov-panel__head">
        <div class="ov-panel__title">
          <h2>{{ t('order.thisOrder') }}</h2>
          <span class="ov-panel__id x-tabular">{{ order?.name }}</span>
        </div>
        <span v-if="partPaid" class="ov-pill is-warn"><CreditCard :size="13" />{{ t('order.partPaid') }}</span>
        <span v-else-if="locked" class="ov-pill is-warn"><Lock :size="13" />{{ t('order.billClosed') }}</span>
        <span v-else-if="dirty" class="ov-pill is-info"><Clock :size="13" />{{ t('order.unsaved') }}</span>
        <span v-else-if="order?.bill_requested" class="ov-pill is-info"><BellRing :size="13" />{{ t('fnb.billRequested') }}</span>
        <button type="button" class="ov-icon-btn ov-panel__close" :aria-label="t('ui.close')" @click="orderOpen = false"><X :size="18" /></button>
      </header>
      <div v-if="tableBills.length" class="ov-bills">
        <span>{{ t('order.otherBills') }}</span>
        <button v-for="b in tableBills" :key="b.name" type="button" class="ov-chip ov-chip--link" @click="router.push(`/order/${b.name}`)">{{ b.name.slice(-5) }} · <b class="x-tabular">{{ money(b.total) }}</b></button>
      </div>

      <div class="ov-lines">
        <div v-if="!draft.length" class="ov-empty"><UiEmptyState :icon="UtensilsCrossed" :title="t('order.emptyTitle')" :message="t('order.emptyBody')" /></div>
        <TransitionGroup v-else name="ov-line" tag="ul" class="ov-list">
          <li v-for="(l, i) in draft" :key="l.item_code + '|' + l.note + '|' + l.saved_qty" class="ov-line">
            <span v-if="images[l.item_code]" class="ov-line__art"><img :src="images[l.item_code]" alt="" loading="lazy" /></span>
            <div class="ov-line__info">
              <b class="ov-line__name">{{ l.item_name }}</b>
              <span class="ov-line__sub">
                <span class="x-tabular">{{ money(l.rate) }}</span>
                <span class="ov-state-tag" :class="`is-${lineState(l)}`">
                  <ChefHat v-if="lineState(l) === 'kitchen'" :size="12" /><Send v-else-if="lineState(l) === 'tosend'" :size="12" /><Clock v-else :size="12" />
                  {{ lineState(l) === 'kitchen' ? t('order.inKitchen') : lineState(l) === 'tosend' ? t('order.toSend', { n: l.qty - l.kot_qty }) : t('order.notSaved') }}
                </span>
              </span>
              <button v-if="l.note" type="button" class="ov-note" @click="editNote(i)"><StickyNote :size="13" aria-hidden="true" />{{ l.note }}</button>
              <button v-else-if="!(l.kot_qty > 0 || locked)" type="button" class="ov-note ov-note--add" @click="editNote(i)"><Plus :size="13" aria-hidden="true" />{{ t('order.addNote') }}</button>
            </div>
            <div class="ov-line__end">
              <b class="x-tabular">{{ money(l.qty * l.rate) }}</b>
              <div class="ov-step" role="group" :aria-label="t('sale.quantityOf', { name: l.item_name })">
                <button type="button" :disabled="locked" :aria-label="t('sale.less')" @click="step(i, -1)"><Minus :size="15" /></button>
                <span class="x-tabular">{{ l.qty }}</span>
                <button type="button" :disabled="locked" :aria-label="t('sale.more')" @click="step(i, 1)"><Plus :size="15" /></button>
              </div>
            </div>
          </li>
        </TransitionGroup>
      </div>

      <footer class="ov-foot">
        <div class="ov-sum">
          <div class="ov-sum__total"><span>{{ t('sale.total') }}</span><b class="x-tabular">{{ money(dirty ? draftTotal : order?.total || 0) }}</b></div>
          <div v-if="totals && locked && !partPaid" class="ov-sum__row"><span>{{ t('order.dueInclTax') }}</span><b class="x-tabular">{{ money(totals.due) }}</b></div>
          <div v-if="partPaid" class="ov-sum__row is-warn"><span>{{ t('order.balanceToCollect') }}</span><b class="x-tabular">{{ money(order?.balance || 0) }}</b></div>
        </div>

        <p v-if="error" class="ov-msg is-err" role="alert">{{ error }}</p>
        <p v-if="notice" class="ov-msg is-ok" role="status"><CircleCheck :size="15" aria-hidden="true" />{{ notice }}</p>

        <div v-if="panel === 'split'" class="ov-sub x-enter">
          <h4><Split :size="15" />{{ t('order.splitTitle') }}</h4>
          <div v-for="l in order?.items" :key="l.item_code + l.note" class="sel-line">
            <span style="flex: 1">{{ l.item_name }} <small class="sub2">({{ l.qty }})</small></span>
            <input v-model="splitQty[`${l.item_code}|${l.note}`]" class="fld tabular" type="number" min="0" :max="l.qty" step="any" placeholder="0" />
          </div>
          <button type="button" class="ov-btn ov-btn--primary" :disabled="busy" @click="doSplit">{{ t('order.createBill') }}</button>
        </div>
        <div v-if="panel === 'merge'" class="ov-sub x-enter">
          <h4><Merge :size="15" />{{ t('order.mergeTitle') }}</h4>
          <div class="row">
            <select v-model="mergeBillTarget" class="fld" style="flex: 1"><option value="">{{ t('order.mergeBillPick') }}</option><option v-for="b in mergeableBills" :key="b.name" :value="b.name">{{ b.label }}</option></select>
            <button type="button" class="ov-btn ov-btn--primary" :disabled="!mergeBillTarget || busy" @click="doMergeBill">{{ t('order.mergeBill') }}</button>
          </div>
          <div v-if="!takeAway" class="row">
            <select v-model="mergeTableTarget" class="fld" style="flex: 1"><option value="">{{ t('order.joinTablePick') }}</option><option v-for="ft in floor.filter((x) => x.status !== 'Disabled' && x.name !== order?.table && !(order?.merged_tables || []).includes(x.name))" :key="ft.name" :value="ft.name">{{ ft.name }} ({{ ft.status }})</option></select>
            <button type="button" class="ov-btn ov-btn--primary" :disabled="!mergeTableTarget || busy" @click="doMergeTable">{{ t('order.joinTable') }}</button>
          </div>
        </div>
        <div v-if="panel === 'transfer'" class="ov-sub x-enter">
          <h4><MoveRight :size="15" />{{ t('order.moveTitle') }}</h4>
          <div class="row">
            <select v-model="transferTarget" class="fld" style="flex: 1"><option value="">{{ t('order.moveTablePick') }}</option><option v-for="ft in freeTables" :key="ft.name" :value="ft.name">{{ ft.name }}</option></select>
            <button type="button" class="ov-btn ov-btn--primary" :disabled="!transferTarget || busy" @click="doTransfer">{{ t('order.move') }}</button>
          </div>
        </div>

        <div v-if="!partPaid && canModify" class="ov-tools">
          <button type="button" class="ov-tool" :class="{ on: panel === 'split' }" :disabled="locked || dirty || (order?.items.length || 0) < 2" @click="openSplit"><Split :size="18" /><span>{{ t('order.split') }}</span></button>
          <button type="button" class="ov-tool" :class="{ on: panel === 'merge' }" :disabled="locked || dirty" @click="panel = panel === 'merge' ? null : 'merge'"><Merge :size="18" /><span>{{ t('order.merge') }}</span></button>
          <button v-if="!takeAway" type="button" class="ov-tool" :class="{ on: panel === 'transfer' }" @click="panel = panel === 'transfer' ? null : 'transfer'"><MoveRight :size="18" /><span>{{ t('order.moveTable') }}</span></button>
          <button v-if="!takeAway" type="button" class="ov-tool" @click="newBill"><ReceiptText :size="18" /><span>{{ t('order.newBill') }}</span></button>
        </div>

        <div v-if="!partPaid" class="ov-row">
          <button type="button" class="ov-btn ov-btn--dark ov-grow" :disabled="busy || locked || !dirty" @click="save">
            <ChefHat :size="18" aria-hidden="true" />{{ busy ? t('order.saving') : pos.autoKot ? t('order.saveSend') : t('order.save') }}
          </button>
          <button v-if="!pos.autoKot" type="button" class="ov-btn" :disabled="busy || locked || dirty || !unsent" @click="sendKot"><Send :size="16" aria-hidden="true" />{{ t('order.sendKitchen') }}</button>
          <template v-if="canBill">
            <button v-if="!locked" type="button" class="ov-btn" :disabled="busy || dirty || !order?.items.length" @click="closeBill"><Lock :size="16" aria-hidden="true" />{{ t('order.closeBill') }}</button>
            <button v-else type="button" class="ov-btn" :disabled="busy" @click="reopenBill"><LockOpen :size="16" aria-hidden="true" />{{ t('order.reopen') }}</button>
          </template>
        </div>
        <p v-if="dirty && canBill" class="ov-hint">{{ t('order.saveFirst') }}</p>

        <button v-if="canBill" type="button" class="ov-pay" :disabled="busy || dirty || !order?.items.length" @click="startPay">
          <span class="ov-pay__l"><CreditCard :size="20" aria-hidden="true" />{{ partPaid ? t('order.collectBalance') : t('order.pay') }}</span>
          <span class="x-tabular">{{ money(partPaid ? order?.balance || 0 : order?.total || 0) }}</span>
        </button>
        <template v-else>
          <button v-if="!order?.bill_requested" type="button" class="ov-pay" :disabled="busy || dirty || !order?.items.length" @click="requestBill(false)">
            <span class="ov-pay__l"><BellRing :size="20" aria-hidden="true" />{{ t('fnb.requestBill') }}</span>
          </button>
          <button v-else type="button" class="ov-btn ov-grow" :disabled="busy" @click="requestBill(true)"><CircleCheck :size="16" aria-hidden="true" />{{ t('fnb.billRequested') }} · {{ t('fnb.cancelBillRequest') }}</button>
          <p class="ov-hint">{{ t('order.askCashier') }}</p>
        </template>

        <template v-if="!partPaid">
          <button v-if="canClose" type="button" class="ov-void" :disabled="busy" @click="closing = true">
            <Ban :size="16" aria-hidden="true" />{{ closeLabel }}<small v-if="closeKind === 'empty'"> · {{ t('order.nothingOrdered') }}</small><small v-else-if="closeKind === 'unsent'"> · {{ t('order.notSent') }}</small>
          </button>
          <p v-else class="ov-hint">{{ closeHint }}</p>
        </template>
      </footer>
    </aside>

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
    <ConfirmSheet
      v-if="closing"
      :title="`${closeLabel}?`"
      :confirm-label="closeLabel"
      danger
      :busy="busy"
      cancel-label="Keep the order"
      @confirm="closeOrder"
      @cancel="closing = false"
    >
      <p v-if="closeKind === 'empty'">Nothing was ordered. This frees {{ takeAway ? 'the take-away token' : `table ${order?.table}` }}.</p>
      <p v-else-if="closeKind === 'unsent'">{{ savedItems }} item{{ savedItems === 1 ? '' : 's' }} ({{ money(order?.total || 0) }}) were never sent to the kitchen. They will be discarded and {{ takeAway ? 'the order closed' : 'the table freed' }}.</p>
      <p v-else>Food was already sent to the kitchen. Voiding cancels the kitchen tickets too.</p>
    </ConfirmSheet>
  </div>
</template>

<style scoped>
.ov { display: grid; grid-template-columns: minmax(0, 1fr) 420px; height: calc(100dvh - var(--shell-h)); background: var(--x-bg); }
.ov-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.ov-head { display: flex; align-items: center; gap: 14px; padding: 16px 24px 12px; flex-wrap: wrap; }
.ov-back { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px 0 10px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; font-weight: 600; font-size: 14.5px; cursor: pointer; box-shadow: var(--x-shadow-xs); }
.ov-back:hover { background: var(--x-surface-2); }
[dir='rtl'] .ov-back svg { transform: scaleX(-1); }
.ov-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ov-title__ic { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; flex: none; }
.ov-title__ic.is-dine { background: #fff7ed; color: #c2410c; }
.ov-title__ic.is-ta { background: var(--x-primary-soft); color: var(--x-primary-text); }
:root[data-theme='dark'] .ov-title__ic.is-dine { background: #3a1d10; color: #fdba74; }
.ov-title__tx { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ov-title h1 { margin: 0; font-family: var(--x-font-display); font-size: 22px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; white-space: nowrap; }
.ov-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.ov-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600; background: var(--x-surface-3); color: var(--x-text-muted); border: 0; font-family: inherit; white-space: nowrap; }
.ov-chip--merge { background: var(--x-accent-soft); color: var(--x-accent-text); }
.ov-chip--merge button { border: 0; background: transparent; color: inherit; padding: 0; display: grid; place-items: center; cursor: pointer; }
.ov-chip--link { cursor: pointer; } .ov-chip--link:hover { background: var(--x-primary-soft); color: var(--x-primary-text); }
.ov-switch { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border); background: var(--x-surface); font-size: 14px; font-weight: 600; color: var(--x-text-muted); cursor: pointer; margin-inline-start: auto; box-shadow: var(--x-shadow-xs); }
.ov-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.ov-switch__track { width: 36px; height: 22px; border-radius: 11px; background: var(--x-border-strong); position: relative; transition: background var(--x-duration); flex: none; }
.ov-switch__track span { position: absolute; top: 3px; inset-inline-start: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: var(--x-shadow-sm); transition: transform var(--x-duration) var(--x-ease); }
.ov-switch input:checked + .ov-switch__track { background: var(--x-success); }
.ov-switch input:checked + .ov-switch__track span { transform: translateX(14px); }
[dir='rtl'] .ov-switch input:checked + .ov-switch__track span { transform: translateX(-14px); }
.ov-switch input:focus-visible + .ov-switch__track { box-shadow: var(--x-focus-ring); }
.ov-search { flex: 1 1 260px; max-width: 420px; display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 14px; border-radius: var(--x-radius-md); background: var(--x-surface); border: 1px solid var(--x-border); color: var(--x-text-faint); box-shadow: var(--x-shadow-xs); }
.ov-search:focus-within { border-color: var(--x-primary); box-shadow: var(--x-focus-ring); }
.ov-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--x-text); font: inherit; font-size: 15.5px; }
.ov-chipbar { padding: 0 24px 6px; min-width: 0; }
.ov-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 24px 28px; }
.ov-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 14px; align-content: start; }
.ov-grid.is-locked { opacity: 0.5; filter: grayscale(0.4); }
.ov-skel { display: flex; flex-direction: column; gap: 12px; min-height: 128px; padding: 14px; border-radius: var(--x-radius-lg); background: var(--x-surface); border: 1px solid var(--x-border); overflow: hidden; }
.ov-state { display: grid; place-items: center; min-height: 50%; }
.ov-locked { display: flex; align-items: center; gap: 8px; justify-content: center; margin: 18px 0 0; color: var(--x-warning-text); font-weight: 600; font-size: 14px; }

.ov-panel { display: flex; flex-direction: column; min-height: 0; background: var(--x-surface); border-inline-start: 1px solid var(--x-border); box-shadow: -12px 0 32px -24px rgba(15, 23, 42, 0.25); }
.ov-panel__head { display: flex; align-items: center; gap: 10px; padding: 18px 20px 10px; }
.ov-panel__title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ov-panel__title h2 { margin: 0; font-family: var(--x-font-display); font-size: 20px; font-weight: 800; letter-spacing: -0.015em; }
.ov-panel__id { font-size: 12.5px; color: var(--x-text-faint); font-weight: 600; }
.ov-panel .ov-panel__close { display: none; }
.ov-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.ov-pill.is-warn { background: var(--x-warning-soft); color: var(--x-warning-text); }
.ov-pill.is-info { background: var(--x-primary-soft); color: var(--x-primary-text); }
.ov-icon-btn { width: 40px; height: 40px; border-radius: 11px; border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text-muted); display: grid; place-items: center; cursor: pointer; }
.ov-bills { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 0 20px 10px; font-size: 13px; color: var(--x-text-muted); }
.ov-lines { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px; border-top: 1px solid var(--x-border); }
.ov-empty { height: 100%; display: grid; place-items: center; }
.ov-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ov-line { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; padding: 12px 8px; border-bottom: 1px solid var(--x-surface-3); }
.ov-line:last-child { border-bottom: 0; }
.ov-line__art { width: 44px; height: 44px; }
.ov-line__art img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; display: block; }
.ov-line__info { display: flex; flex-direction: column; gap: 4px; min-width: 0; align-items: flex-start; }
.ov-line__name { font-size: 14.5px; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.ov-line__sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--x-text-muted); }
.ov-state-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.ov-state-tag.is-kitchen { background: var(--x-success-soft); color: var(--x-success-text); }
.ov-state-tag.is-tosend { background: var(--x-primary-soft); color: var(--x-primary-text); }
.ov-state-tag.is-unsaved { background: var(--x-warning-soft); color: var(--x-warning-text); }
.ov-note { display: inline-flex; align-items: center; gap: 5px; border: 0; padding: 3px 8px; border-radius: 8px; background: #fffbeb; color: #b45309; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; text-align: start; max-width: 100%; }
:root[data-theme='dark'] .ov-note { background: var(--x-warning-soft); color: var(--x-warning-text); }
.ov-note--add { background: transparent; color: var(--x-text-faint); padding-inline: 0; }
.ov-note--add:hover { color: var(--x-primary-text); }
.ov-line__end { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.ov-line__end b { font-size: 15px; white-space: nowrap; }
.ov-step { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 12px; background: var(--x-surface-3); }
.ov-step button { width: 34px; height: 34px; border-radius: 9px; border: 0; background: var(--x-surface); color: var(--x-text); display: grid; place-items: center; cursor: pointer; box-shadow: var(--x-shadow-xs); touch-action: manipulation; transition: transform 90ms; }
.ov-step button:active:not(:disabled) { transform: scale(0.92); }
.ov-step button:disabled { opacity: 0.4; cursor: not-allowed; }
.ov-step span { min-width: 28px; text-align: center; font-weight: 700; }
.ov-line-enter-active, .ov-line-leave-active { transition: opacity 200ms var(--x-ease), transform 200ms var(--x-ease); }
.ov-line-enter-from { opacity: 0; transform: translateX(12px); }
.ov-line-leave-to { opacity: 0; }

.ov-foot { padding: 12px 20px 18px; border-top: 1px solid var(--x-border); display: flex; flex-direction: column; gap: 10px; background: linear-gradient(180deg, var(--x-surface), var(--x-surface-2)); max-height: 62%; overflow-y: auto; }
.ov-sum { display: flex; flex-direction: column; gap: 6px; }
.ov-sum__total { display: flex; justify-content: space-between; align-items: baseline; font-weight: 700; }
.ov-sum__total b { font-family: var(--x-font-display); font-size: 28px; letter-spacing: -0.02em; }
.ov-sum__row { display: flex; justify-content: space-between; font-size: 14px; color: var(--x-text-muted); }
.ov-sum__row.is-warn { color: var(--x-warning-text); }
.ov-msg { margin: 0; display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: var(--x-radius-md); font-size: 13.5px; line-height: 1.45; }
.ov-msg.is-err { background: var(--x-danger-soft); color: var(--x-danger-text); }
.ov-msg.is-ok { background: var(--x-success-soft); color: var(--x-success-text); animation: x-fade-up 240ms var(--x-ease) both; }
.ov-msg svg { flex: none; margin-top: 1px; }
.ov-sub { padding: 12px; border-radius: var(--x-radius-md); background: var(--x-surface); border: 1px solid var(--x-border); display: flex; flex-direction: column; gap: 8px; }
.ov-sub h4 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 14px; }
.ov-tools { display: grid; grid-template-columns: repeat(auto-fit, minmax(76px, 1fr)); gap: 8px; }
.ov-tool { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; min-height: 58px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: background var(--x-duration), border-color var(--x-duration); }
.ov-tool svg { color: var(--x-text-muted); }
.ov-tool:hover:not(:disabled) { border-color: var(--x-border-strong); background: var(--x-surface-2); }
.ov-tool.on { border-color: var(--x-primary); background: var(--x-primary-soft); color: var(--x-primary-text); }
.ov-tool.on svg { color: var(--x-primary-text); }
.ov-tool:disabled { opacity: 0.45; cursor: not-allowed; }
.ov-row { display: flex; gap: 8px; flex-wrap: wrap; }
.ov-grow { flex: 2 1 160px; }
.ov-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 50px; padding: 0 16px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer; flex: 1 1 auto; white-space: nowrap; transition: background var(--x-duration), transform 90ms, border-color var(--x-duration); }
.ov-btn:hover:not(:disabled) { background: var(--x-surface-2); border-color: var(--x-border-strong); }
.ov-btn:active:not(:disabled) { transform: scale(0.98); }
.ov-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ov-btn--primary { background: var(--x-primary); border-color: transparent; color: #fff; min-height: 44px; flex: none; }
.ov-btn--primary:hover:not(:disabled) { background: var(--x-primary-hover); }
.ov-btn--dark { background: var(--x-brand-navy); border-color: transparent; color: #fff; }
.ov-btn--dark:hover:not(:disabled) { background: #1e293b; }
:root[data-theme='dark'] .ov-btn--dark { background: var(--x-surface-3); }
.ov-hint { margin: 0; font-size: 12.5px; color: var(--x-text-muted); text-align: center; }
.ov-pay { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 62px; padding: 0 22px; border: 0; border-radius: var(--x-radius-lg); background: var(--x-primary); color: #fff; font: inherit; font-family: var(--x-font-display); font-size: 19px; font-weight: 700; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), var(--x-shadow-brand); transition: background var(--x-duration), transform 90ms; }
.ov-pay:hover:not(:disabled) { background: var(--x-primary-hover); }
.ov-pay:active:not(:disabled) { transform: scale(0.985); }
.ov-pay:disabled { background: var(--x-surface-3); color: var(--x-text-faint); box-shadow: none; cursor: not-allowed; }
.ov-pay__l { display: inline-flex; align-items: center; gap: 10px; }
.ov-void { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; border-radius: var(--x-radius-md); border: 1px dashed color-mix(in srgb, var(--x-danger) 50%, var(--x-border)); background: transparent; color: var(--x-danger-text); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.ov-void:hover:not(:disabled) { background: var(--x-danger-soft); border-style: solid; }
.ov-void small { font-weight: 500; opacity: 0.8; }
.ov-orderbar, .ov-scrim { display: none; }

@media (max-width: 1279px) { .ov { grid-template-columns: minmax(0, 1fr) 380px; } .ov-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } .ov-switch__lbl { display: none; } }
@media (max-width: 900px) {
  .ov { grid-template-columns: 1fr; }
  .ov-head { padding: 12px 16px 8px; gap: 10px; }
  .ov-back span { display: none; }
  .ov-search { flex-basis: 100%; max-width: none; order: 5; }
  .ov-chipbar { padding: 0 16px 4px; }
  .ov-scroll { padding: 8px 16px 96px; }
  .ov-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .ov-panel { position: fixed; inset-inline: 0; inset-block-end: 0; z-index: var(--x-z-drawer); max-height: 90dvh; border-radius: var(--x-radius-2xl) var(--x-radius-2xl) 0 0; border: 0; box-shadow: 0 -24px 48px -12px rgba(15, 23, 42, 0.35); transform: translateY(105%); transition: transform var(--x-duration-slow) var(--x-ease); padding-bottom: env(safe-area-inset-bottom); }
  .ov-panel.is-open { transform: none; }
  .ov-panel .ov-panel__close { display: grid; }
  .ov-foot { max-height: none; }
  .ov-scrim { display: block; position: fixed; inset: 0; z-index: calc(var(--x-z-drawer) - 1); background: rgba(15, 23, 42, 0.45); }
  .ov-orderbar { display: flex; position: fixed; inset-inline: 12px; inset-block-end: max(12px, env(safe-area-inset-bottom)); z-index: var(--x-z-sticky); align-items: center; gap: 12px; min-height: 60px; padding: 0 18px 0 10px; border: 0; border-radius: var(--x-radius-lg); background: var(--x-brand-navy); color: #fff; font: inherit; font-weight: 600; font-size: 15px; box-shadow: 0 16px 32px -12px rgba(15, 23, 42, 0.6); cursor: pointer; }
  .ov-orderbar small { color: #fcd34d; }
  .ov-orderbar b { margin-inline-start: auto; font-family: var(--x-font-display); font-size: 17px; }
  .ov-orderbar__n { min-width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: var(--x-primary); font-weight: 800; }
}
</style>
