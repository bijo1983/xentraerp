<script setup lang="ts">
// Retail checkout: barcode-first (the scan field keeps focus; Enter adds the exact code, name
// or a barcode/serial/batch looked up through ERPNext), product photos or category
// illustrations, category chips, best sellers on this till, a sticky cart (a bottom drawer on
// phones), and the existing server-side estimate → pay → receipt flow, unchanged.
import { companyCurrency, formatMoney } from '@/lib/money'
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Check, ChevronUp, CircleCheck, Flame, Minus, Plus, Printer, ReceiptText, RotateCcw, ScanBarcode, Search, ShoppingBasket,
  Trash2, UserRound, UtensilsCrossed, Wallet, X,
} from 'lucide-vue-next'
import { useAuthStore, NO_PROFILE } from '@/stores/auth'
import { usePrinterStore } from '@/stores/printer'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { usePosStore } from '@/stores/pos'
import { pushToast } from '@/composables/useToast'
import PayDialog from '@/components/PayDialog.vue'
import type { ReceiptData } from '@/lib/receipt'
import { UiCategoryChips, UiEmptyState, UiProductCard, UiSkeleton } from '@/ui'

interface Item {
  name: string
  item_name: string
  item_group: string
  standard_rate: number
  image?: string | null
}

interface CartLine {
  item_code: string
  item_name: string
  item_group: string
  image?: string | null
  rate: number
  qty: number
}

const router = useRouter()
const auth = useAuthStore()
const pos = usePosStore()
const profile = computed(() => auth.posProfile ?? NO_PROFILE)

const items = ref<Item[]>([])
// item_code -> rate from the POS Profile's actual configured selling price
// list. A tenant that prices differently per price list (common — "Retail"
// vs "Wholesale") would otherwise get standard_rate on every sale
// regardless of which register/price list is in effect. Doesn't cover
// customer-specific pricing or quantity-break Pricing Rules — a documented
// simplification, same as the item-detail auto-populate elsewhere in this
// codebase; the base price list rate is still far more correct than a
// single global standard_rate.
const priceListRates = ref<Record<string, number>>({})
const loadingItems = ref(true)
const loadError = ref<string | null>(null)
const search = ref('')
const activeGroup = ref('all')
const scanField = ref<HTMLInputElement | null>(null)
const scanning = ref(false)
const cartOpen = ref(false)

const cart = ref<Record<string, CartLine>>({})
const paying = ref(false)
const payDue = ref(0)
const partialNote = ref<string | null>(null)

// Part-paid invoices waiting for the rest of their payment (Draft Invoice + Receipt checkout).
interface OpenBalance { invoice: string; customer: string; total: number; paid: number; balance: number; status: string; date: string; table: string | null }
const balancesOpen = ref(false)
const balances = ref<OpenBalance[]>([])
const settling = ref<OpenBalance | null>(null)
const settleError = ref<string | null>(null)

async function openBalances() {
  balancesOpen.value = true
  try {
    balances.value = await api.call<OpenBalance[]>('custom_erp.api.pos_core.list_open_balances', { pos_profile: profile.value.name })
  } catch (err) {
    chargeError.value = err instanceof Error ? err.message : 'Could not load balances'
  }
}
async function settle(payments: { mode_of_payment: string; currency: string; tendered: number }[], partial = false) {
  if (!settling.value) return
  charging.value = true
  settleError.value = null
  try {
    const r = await api.call<{ invoice: string; partial?: boolean; balance?: number }>('custom_erp.api.pos_core.settle_invoice', {
      invoice: settling.value.invoice,
      payments: JSON.stringify(payments),
      allow_partial: partial ? 1 : 0,
    })
    partialNote.value = r.partial ? `Part payment taken — ${money(r.balance || 0)} still to collect on ${r.invoice}` : `${r.invoice} is now fully paid`
    settling.value = null
    await openBalances()
  } catch (err) {
    settleError.value = err instanceof Error ? err.message : 'Could not take this payment'
  } finally {
    charging.value = false
  }
}
const charging = ref(false)
const chargeError = ref<string | null>(null)
const lastInvoice = ref<string | null>(null)
const lastReceipt = ref<ReceiptData | null>(null)
const printerSettingsOpen = ref(false)

const printer = usePrinterStore()

// Best sellers on THIS till: a per-device tally of what was sold here (localStorage), so the
// cashier gets one-tap access to the usual items. Not a report — just a shortcut.
const tallyKey = computed(() => `xpos_best_${profile.value?.name || ''}`)
const tally = ref<Record<string, number>>({})
function loadTally() {
  try {
    tally.value = JSON.parse(localStorage.getItem(tallyKey.value) || '{}') || {}
  } catch {
    tally.value = {}
  }
}
function recordSold(lines: CartLine[]) {
  for (const l of lines) tally.value[l.item_code] = (tally.value[l.item_code] || 0) + l.qty
  try {
    localStorage.setItem(tallyKey.value, JSON.stringify(tally.value))
  } catch {
    /* private mode: shortcut just doesn't persist */
  }
}

onMounted(async () => {
  printer.tryReconnect()
  loadTally()
  try {
    items.value = await api.getList<Item>('Item', {
      fields: ['name', 'item_name', 'item_group', 'standard_rate', 'image'],
      filters: [
        ['disabled', '=', 0],
        ['is_sales_item', '=', 1],
      ],
      limit_page_length: 200,
    })

    if (profile.value.selling_price_list) {
      const prices = await api.getList<{ item_code: string; price_list_rate: number }>('Item Price', {
        fields: ['item_code', 'price_list_rate'],
        filters: [
          ['price_list', '=', profile.value.selling_price_list],
          ['selling', '=', 1],
        ],
        limit_page_length: 500,
      })
      const map: Record<string, number> = {}
      for (const p of prices) map[p.item_code] = p.price_list_rate
      priceListRates.value = map
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Could not load items'
  } finally {
    loadingItems.value = false
    focusScan()
  }
})

function focusScan() {
  // Only on a real keyboard device: on a phone this would pop the on-screen keyboard every time.
  if (window.matchMedia?.('(pointer: fine)').matches) nextTick(() => scanField.value?.focus())
}

function rateFor(it: Item): number {
  return priceListRates.value[it.name] ?? it.standard_rate ?? 0
}

const groups = computed(() => {
  const counts = new Map<string, number>()
  for (const it of items.value) counts.set(it.item_group, (counts.get(it.item_group) || 0) + 1)
  return [...counts.entries()].map(([g, n]) => ({ value: g, label: g, count: n }))
})
const chips = computed(() => [{ value: 'all', label: t('sale.allItems'), count: items.value.length }, ...groups.value])

const visibleItems = computed(() => {
  let list = items.value
  if (activeGroup.value !== 'all') list = list.filter((it) => it.item_group === activeGroup.value)
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter((it) => it.item_name.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
  return list
})
const bestSellers = computed(() =>
  Object.entries(tally.value)
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => items.value.find((i) => i.name === code))
    .filter((i): i is Item => !!i)
    .slice(0, 6),
)
const showBest = computed(() => activeGroup.value === 'all' && !search.value.trim() && bestSellers.value.length > 0)

const cartLines = computed(() => Object.values(cart.value).filter((l) => l.qty > 0))
const subtotal = computed(() => cartLines.value.reduce((sum, l) => sum + l.rate * l.qty, 0))
const itemCount = computed(() => cartLines.value.reduce((n, l) => n + l.qty, 0))
const qtyOf = (code: string) => cart.value[code]?.qty || 0

function money(n: number) {
  return formatMoney(n, profile.value.currency || companyCurrency())
}

function addItem(it: Item) {
  const existing = cart.value[it.name]
  if (existing) {
    existing.qty += 1
  } else {
    cart.value[it.name] = {
      item_code: it.name,
      item_name: it.item_name,
      item_group: it.item_group,
      image: it.image,
      rate: rateFor(it),
      qty: 1,
    }
  }
  lastInvoice.value = null
}
function inc(code: string) {
  if (cart.value[code]) cart.value[code].qty += 1
}
function dec(code: string) {
  if (cart.value[code]) cart.value[code].qty = Math.max(0, cart.value[code].qty - 1)
}
function removeLine(code: string) {
  if (cart.value[code]) cart.value[code].qty = 0
}
function clearCart() {
  cart.value = {}
  chargeError.value = null
  lastInvoice.value = null
}

// Scanner / Enter: exact item code or name first; otherwise ask ERPNext's barcode lookup
// (Item Barcode, then Serial No, then Batch). A scanner "types" the code and presses Enter.
async function onScan() {
  const q = search.value.trim()
  if (!q || scanning.value) return
  const lower = q.toLowerCase()
  let hit = items.value.find((i) => i.name.toLowerCase() === lower || i.item_name.toLowerCase() === lower)
  if (!hit) {
    scanning.value = true
    try {
      const r = await api.call<{ item_code?: string } | null>('xentraerp.erp.selling.page.point_of_sale.point_of_sale.search_for_serial_or_batch_or_barcode_number', { search_value: q })
      if (r?.item_code) hit = items.value.find((i) => i.name === r.item_code)
    } catch {
      /* lookup unavailable: fall through to "not found" */
    } finally {
      scanning.value = false
    }
  }
  if (!hit && visibleItems.value.length === 1) hit = visibleItems.value[0]
  if (hit) {
    addItem(hit)
    search.value = ''
    pushToast(t('sale.added', { name: hit.item_name }), 'success', { timeout: 1600 })
  } else {
    pushToast(t('sale.notFound', { code: q }), 'warning')
  }
  focusScan()
}

// Checkout is one server call: the server prices the lines from the register's
// price list, applies tax and rounding, converts each payment (any currency the
// organization has a rate for), works out change, posts and submits the POS
// Invoice, and rings it against the open shift. Nothing is committed unless the
// whole sale goes through. Step 1 asks the server what the sale comes to, so the
// payment dialog shows the tax-inclusive amount due.
const lineArgs = () => JSON.stringify(cartLines.value.map((l) => ({ item_code: l.item_code, qty: l.qty })))

async function charge() {
  if (!cartLines.value.length) return
  chargeError.value = null
  charging.value = true
  try {
    const t = await api.call<{ due: number }>('custom_erp.api.pos_core.retail_estimate', { pos_profile: profile.value.name, items: lineArgs() })
    payDue.value = t.due
    paying.value = true
  } catch (err) {
    chargeError.value = err instanceof Error ? err.message : 'Could not price this sale'
  } finally {
    charging.value = false
  }
}

async function pay(payments: { mode_of_payment: string; currency: string; tendered: number }[], partial = false) {
  chargeError.value = null
  charging.value = true
  try {
    const r = await api.call<{
      invoice: string
      total: number
      change: number
      partial?: boolean
      balance?: number
      payments: { mode_of_payment: string; currency: string; tendered: number }[]
    }>('custom_erp.api.pos_core.retail_checkout', { pos_profile: profile.value.name, items: lineArgs(), payments: JSON.stringify(payments), allow_partial: partial ? 1 : 0 })
    paying.value = false
    lastInvoice.value = r.invoice
    lastReceipt.value = {
      orgName: auth.orgName || profile.value.company,
      posProfile: profile.value.name,
      invoiceName: r.invoice,
      cashier: auth.user?.full_name || '',
      timestamp: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
      currency: profile.value.currency,
      lines: cartLines.value.map((l) => ({ name: l.item_name, qty: l.qty, rate: l.rate, amount: l.rate * l.qty })),
      total: r.total,
      paymentMethod: r.payments.map((p) => `${p.mode_of_payment} ${p.tendered} ${p.currency}`).join(' + ') + (r.change ? ` (change ${r.change})` : ''),
    }
    lastChange.value = r.change || 0
    recordSold(cartLines.value)
    cart.value = {}
    if (r.partial) partialNote.value = `Part payment taken — ${money(r.balance || 0)} still to collect on ${r.invoice}`
    await printLastReceipt()
  } catch (err) {
    chargeError.value = err instanceof Error ? err.message : 'Could not complete this sale'
  } finally {
    charging.value = false
    focusScan()
  }
}
const lastChange = ref(0)

async function printLastReceipt() {
  if (!lastReceipt.value) return
  try {
    await printer.printReceipt(lastReceipt.value)
  } catch (err) {
    chargeError.value = err instanceof Error ? err.message : 'Sale completed, but the receipt failed to print'
  }
}

// The phone cart drawer closes itself once the sale is done or emptied.
watch(cartLines, (l) => !l.length && !lastInvoice.value && (cartOpen.value = false))
</script>

<template>
  <div class="rt">
    <!-- catalogue -->
    <section class="rt-main" :aria-label="t('sale.catalogue')">
      <div class="rt-bar">
        <form class="rt-scan" role="search" @submit.prevent="onScan">
          <ScanBarcode class="rt-scan__ic" :size="22" aria-hidden="true" />
          <input
            ref="scanField"
            v-model="search"
            type="search"
            :placeholder="t('sale.scanPlaceholder')"
            :aria-label="t('sale.scanPlaceholder')"
            autocomplete="off"
            enterkeyhint="go"
            data-testid="scan"
          />
          <span v-if="scanning" class="rt-scan__spin" aria-hidden="true" />
          <button v-else-if="search" type="button" class="rt-scan__clear" :aria-label="t('ui.clear')" @click="search = ''; focusScan()"><X :size="16" /></button>
          <kbd class="rt-scan__kbd" aria-hidden="true">↵</kbd>
        </form>
        <div class="rt-actions">
          <button v-if="pos.draftMode" type="button" class="rt-act" @click="openBalances"><Wallet :size="18" aria-hidden="true" /><span>{{ t('sale.pendingBalances') }}</span></button>
          <button v-if="pos.isFnb" type="button" class="rt-act" @click="router.push('/floor')"><UtensilsCrossed :size="18" aria-hidden="true" /><span>{{ t('sale.tables') }}</span></button>
          <button type="button" class="rt-act rt-act--icon" :class="{ on: printerSettingsOpen }" :title="t('sale.printer')" :aria-label="t('sale.printer')" :aria-expanded="printerSettingsOpen" @click="printerSettingsOpen = !printerSettingsOpen"><Printer :size="18" /></button>
        </div>
      </div>

      <div v-if="printerSettingsOpen" class="rt-printer x-enter">
        <span class="rt-printer__lbl">{{ t('sale.printVia') }}</span>
        <div class="rt-seg">
          <button type="button" :class="{ on: printer.method === 'browser' }" @click="printer.setMethod('browser')">{{ t('sale.printBrowser') }}</button>
          <button type="button" :class="{ on: printer.method === 'bluetooth' }" @click="printer.setMethod('bluetooth')">{{ t('sale.printBluetooth') }}</button>
        </div>
        <button v-if="printer.method === 'bluetooth'" type="button" class="rt-act" :disabled="printer.connecting" @click="printer.connectBluetoothPrinter()">
          {{ printer.connected ? t('sale.printerConnected', { name: printer.connected.name || 'printer' }) : printer.connecting ? t('sale.connecting') : t('sale.connectPrinter') }}
        </button>
        <p v-if="printer.method === 'bluetooth' && !printer.bluetoothSupported" class="rt-printer__warn">{{ t('sale.noBluetooth') }}</p>
        <p v-if="printer.error" class="rt-printer__err">{{ printer.error }}</p>
      </div>

      <div v-if="items.length" class="rt-chipbar"><UiCategoryChips v-model="activeGroup" :options="chips" :label="t('sale.categories')" /></div>

      <div class="rt-scroll">
        <div v-if="loadError" class="rt-state"><UiEmptyState :title="t('sale.loadErrorTitle')" :message="loadError" tone="neutral" /></div>
        <div v-else-if="loadingItems" class="rt-grid" aria-busy="true">
          <div v-for="n in 12" :key="n" class="rt-skel"><UiSkeleton width="40%" height="10px" /><UiSkeleton :lines="2" /><UiSkeleton width="50%" height="18px" /></div>
        </div>
        <div v-else-if="items.length === 0" class="rt-state">
          <UiEmptyState :icon="ShoppingBasket" :title="t('sale.noItemsTitle')" :message="t('sale.noItemsBody')" />
        </div>
        <template v-else>
          <section v-if="showBest" class="rt-best" :aria-label="t('sale.bestSellers')">
            <h3 class="rt-h"><Flame :size="16" aria-hidden="true" />{{ t('sale.bestSellers') }}</h3>
            <div class="rt-best__row">
              <UiProductCard v-for="it in bestSellers" :key="'b' + it.name" compact :name="it.item_name" :group="it.item_group" :image="it.image" :price="rateFor(it)" :currency="profile.currency" :qty-in-cart="qtyOf(it.name)" @select="addItem(it)" />
            </div>
          </section>
          <h3 v-if="showBest" class="rt-h">{{ t('sale.allItems') }}</h3>
          <div v-if="visibleItems.length" class="rt-grid">
            <UiProductCard v-for="it in visibleItems" :key="it.name" :name="it.item_name" :group="it.item_group" :image="it.image" :price="rateFor(it)" :currency="profile.currency" :qty-in-cart="qtyOf(it.name)" @select="addItem(it)" />
          </div>
          <div v-else class="rt-state">
            <UiEmptyState :icon="Search" :title="t('sale.noMatchTitle')" :message="t('sale.noMatchBody', { q: search })" tone="neutral">
              <button type="button" class="rt-act" @click="search = ''; activeGroup = 'all'">{{ t('sale.showAll') }}</button>
            </UiEmptyState>
          </div>
        </template>
      </div>
    </section>

    <!-- phone: cart summary bar opens the drawer -->
    <button v-if="cartLines.length && !cartOpen" type="button" class="rt-cartbar" @click="cartOpen = true">
      <span class="rt-cartbar__n x-tabular">{{ itemCount }}</span>
      <span>{{ t('sale.viewCart') }}</span>
      <b class="x-tabular">{{ money(subtotal) }}</b>
      <ChevronUp :size="18" aria-hidden="true" />
    </button>
    <div v-if="cartOpen" class="rt-scrim" @click="cartOpen = false" />

    <!-- cart -->
    <aside class="rt-cart" :class="{ 'is-open': cartOpen }" :aria-label="t('sale.currentSale')">
      <header class="rt-cart__head">
        <div class="rt-cart__title">
          <h2>{{ t('sale.currentSale') }}</h2>
          <span v-if="itemCount" class="rt-count x-tabular">{{ t('sale.itemsCount', { n: itemCount }) }}</span>
        </div>
        <div class="rt-cart__tools">
          <button v-if="cartLines.length" type="button" class="rt-icon-btn" :title="t('sale.clear')" :aria-label="t('sale.clear')" @click="clearCart"><Trash2 :size="18" /></button>
          <button type="button" class="rt-icon-btn rt-cart__close" :aria-label="t('ui.close')" @click="cartOpen = false"><X :size="18" /></button>
        </div>
      </header>
      <div class="rt-customer"><span class="rt-customer__av"><UserRound :size="16" /></span><span><small>{{ t('sale.customer') }}</small><b>{{ profile.customer || t('sale.walkIn') }}</b></span></div>

      <div class="rt-lines">
        <div v-if="lastInvoice && !cartLines.length" class="rt-done x-enter" role="status">
          <span class="rt-done__check" aria-hidden="true"><Check :size="34" :stroke-width="3" /></span>
          <h3>{{ t('sale.complete') }}</h3>
          <p class="x-tabular">{{ lastInvoice }}</p>
          <p v-if="lastChange" class="rt-done__change">{{ t('sale.changeDue') }} <b class="x-tabular">{{ money(lastChange) }}</b></p>
          <div class="rt-done__acts">
            <button type="button" class="rt-act" @click="printLastReceipt"><Printer :size="16" aria-hidden="true" />{{ t('sale.printAgain') }}</button>
            <button type="button" class="rt-act" @click="lastInvoice = null; focusScan()"><RotateCcw :size="16" aria-hidden="true" />{{ t('sale.newSale') }}</button>
          </div>
        </div>
        <div v-else-if="!cartLines.length" class="rt-empty">
          <UiEmptyState :icon="ScanBarcode" :title="t('sale.emptyTitle')" :message="t('sale.emptyBody')" />
        </div>
        <TransitionGroup v-else name="rt-line" tag="ul" class="rt-list">
          <li v-for="l in cartLines" :key="l.item_code" class="rt-line">
            <span v-if="l.image" class="rt-line__art"><img :src="l.image" alt="" loading="lazy" /></span>
            <div class="rt-line__info">
              <b class="rt-line__name">{{ l.item_name }}</b>
              <small class="x-tabular">{{ t('sale.each', { price: money(l.rate) }) }}</small>
            </div>
            <div class="rt-step" role="group" :aria-label="t('sale.quantityOf', { name: l.item_name })">
              <button type="button" :aria-label="t('sale.less')" @click="dec(l.item_code)"><Minus :size="16" /></button>
              <span class="x-tabular">{{ l.qty }}</span>
              <button type="button" :aria-label="t('sale.more')" @click="inc(l.item_code)"><Plus :size="16" /></button>
            </div>
            <div class="rt-line__end">
              <b class="x-tabular">{{ money(l.rate * l.qty) }}</b>
              <button type="button" class="rt-line__rm" :aria-label="t('sale.remove', { name: l.item_name })" @click="removeLine(l.item_code)"><X :size="14" /></button>
            </div>
          </li>
        </TransitionGroup>
      </div>

      <footer class="rt-cart__foot">
        <div class="rt-sum">
          <div class="rt-sum__row"><span>{{ t('sale.items') }}</span><span class="x-tabular">{{ itemCount }}</span></div>
          <div class="rt-sum__row"><span>{{ t('sale.subtotal') }}</span><span class="x-tabular">{{ money(subtotal) }}</span></div>
          <div class="rt-sum__total"><span>{{ t('sale.total') }}</span><b class="x-tabular">{{ money(subtotal) }}</b></div>
          <p class="rt-sum__note"><ReceiptText :size="13" aria-hidden="true" />{{ t('sale.taxNote') }}</p>
        </div>
        <p v-if="partialNote" class="rt-note rt-note--warn">{{ partialNote }}</p>
        <p v-if="chargeError" class="rt-note rt-note--err" role="alert">{{ chargeError }}</p>
        <button type="button" class="rt-charge" :disabled="charging || cartLines.length === 0" @click="charge">
          <span class="rt-charge__l"><span v-if="charging" class="rt-spin" aria-hidden="true" /><CircleCheck v-else :size="20" aria-hidden="true" />{{ charging ? t('sale.working') : t('sale.charge') }}</span>
          <span class="x-tabular">{{ money(subtotal) }}</span>
        </button>
      </footer>
    </aside>

    <PayDialog
      v-if="paying"
      :pos-profile="profile.name"
      :currency="profile.currency"
      :due="payDue"
      :methods="profile.payment_methods"
      :busy="charging"
      :error="chargeError"
      :allow-partial="pos.draftMode"
      @pay="pay"
      @cancel="paying = false"
    />
    <div v-if="balancesOpen && !settling" class="modal-back" @click.self="balancesOpen = false">
      <div class="modal">
        <h3 style="margin: 0 0 10px">{{ t('sale.pendingBalances') }}</h3>
        <UiEmptyState v-if="!balances.length" :icon="CircleCheck" :title="t('sale.noBalancesTitle')" :message="t('sale.noBalancesBody')" tone="accent" />
        <table v-else class="simple-table">
          <thead><tr><th>Invoice</th><th>Table</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th /></tr></thead>
          <tbody>
            <tr v-for="b in balances" :key="b.invoice">
              <td>{{ b.invoice }}<div class="sub2">{{ b.status }} · {{ b.date }}</div></td>
              <td>{{ b.table || '—' }}</td>
              <td class="num tabular">{{ money(b.total) }}</td>
              <td class="num tabular">{{ money(b.paid) }}</td>
              <td class="num tabular"><b>{{ money(b.balance) }}</b></td>
              <td class="num"><button class="btn btn-primary mini" @click="settling = b; settleError = null">Collect</button></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top: 12px"><button class="btn btn-ghost" @click="balancesOpen = false">{{ t('ui.close') }}</button></div>
      </div>
    </div>
    <PayDialog
      v-if="settling"
      :pos-profile="profile.name"
      :currency="profile.currency"
      :due="settling.balance"
      :balance-of="settling.paid"
      :methods="profile.payment_methods"
      :busy="charging"
      :error="settleError"
      :allow-partial="true"
      @pay="settle"
      @cancel="settling = null"
    />
  </div>
</template>

<style scoped>
.rt { display: grid; grid-template-columns: minmax(0, 1fr) 400px; height: calc(100dvh - var(--shell-h)); background: var(--x-bg); }
.rt-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.rt-bar { display: flex; align-items: center; gap: 12px; padding: 18px 24px 12px; flex-wrap: wrap; }
.rt-scan { position: relative; flex: 1 1 360px; display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 12px 0 16px; border-radius: var(--x-radius-lg); background: var(--x-surface); border: 1.5px solid var(--x-border); box-shadow: var(--x-shadow-sm); transition: border-color var(--x-duration), box-shadow var(--x-duration); }
.rt-scan:focus-within { border-color: var(--x-primary); box-shadow: var(--x-focus-ring), var(--x-shadow-sm); }
.rt-scan__ic { color: var(--x-primary); flex: none; }
.rt-scan input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--x-text); font: inherit; font-size: 17px; font-weight: 500; min-height: 52px; }
.rt-scan input::placeholder { color: var(--x-text-faint); font-weight: 400; }
.rt-scan input::-webkit-search-cancel-button { display: none; }
.rt-scan__clear { width: 30px; height: 30px; border-radius: 9px; border: 0; background: var(--x-surface-3); color: var(--x-text-muted); display: grid; place-items: center; cursor: pointer; }
.rt-scan__kbd { font: inherit; font-size: 12px; font-weight: 700; color: var(--x-text-faint); border: 1px solid var(--x-border); border-bottom-width: 2px; border-radius: 6px; padding: 2px 7px; }
.rt-scan__spin, .rt-spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid currentColor; border-inline-end-color: transparent; animation: x-spin 0.8s linear infinite; color: var(--x-primary); }
.rt-spin { color: #fff; }
@keyframes x-spin { to { transform: rotate(360deg); } }
.rt-actions { display: flex; gap: 8px; }
.rt-act { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 16px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer; white-space: nowrap; box-shadow: var(--x-shadow-xs); transition: background var(--x-duration), border-color var(--x-duration), transform 90ms; }
.rt-act:hover:not(:disabled) { border-color: var(--x-border-strong); background: var(--x-surface-2); }
.rt-act:active:not(:disabled) { transform: scale(0.97); }
.rt-act.on { border-color: var(--x-primary); color: var(--x-primary-text); background: var(--x-primary-soft); }
.rt-act--icon { width: 48px; padding: 0; justify-content: center; }
.rt-act:disabled { opacity: 0.55; }
.rt-printer { margin: 0 24px 12px; padding: 14px 16px; border-radius: var(--x-radius-lg); background: var(--x-surface); border: 1px solid var(--x-border); display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.rt-printer__lbl { font-size: 13.5px; font-weight: 600; color: var(--x-text-muted); }
.rt-printer__warn, .rt-printer__err { flex-basis: 100%; margin: 0; font-size: 13px; color: var(--x-warning-text); }
.rt-printer__err { color: var(--x-danger-text); }
.rt-seg { display: inline-flex; padding: 3px; border-radius: var(--x-radius-md); background: var(--x-surface-3); gap: 3px; }
.rt-seg button { border: 0; background: transparent; padding: 0 14px; min-height: 40px; border-radius: 9px; font: inherit; font-size: 14px; font-weight: 600; color: var(--x-text-muted); cursor: pointer; }
.rt-seg button.on { background: var(--x-surface); color: var(--x-text); box-shadow: var(--x-shadow-sm); }
.rt-chipbar { padding: 0 24px 6px; min-width: 0; }
.rt-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 24px 28px; }
.rt-h { display: flex; align-items: center; gap: 8px; margin: 6px 0 12px; font-family: var(--x-font-display); font-size: 16px; font-weight: 700; letter-spacing: 0; word-spacing: 0.08em; color: var(--x-text); }
.rt-h svg { color: #f97316; }
.rt-best { margin-bottom: 18px; }
.rt-best__row { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.rt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 14px; align-content: start; }
.rt-skel { display: flex; flex-direction: column; gap: 12px; min-height: 128px; padding: 14px; border-radius: var(--x-radius-lg); background: var(--x-surface); border: 1px solid var(--x-border); overflow: hidden; }
.rt-state { display: grid; place-items: center; min-height: 50%; }

.rt-cart { display: flex; flex-direction: column; min-height: 0; background: var(--x-surface); border-inline-start: 1px solid var(--x-border); box-shadow: -12px 0 32px -24px rgba(15, 23, 42, 0.25); }
.rt-cart__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 20px 12px; }
.rt-cart__title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.rt-cart__title h2 { margin: 0; font-family: var(--x-font-display); font-size: 20px; font-weight: 800; letter-spacing: -0.015em; white-space: nowrap; }
.rt-count { font-size: 12.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: var(--x-primary-soft); color: var(--x-primary-text); white-space: nowrap; }
.rt-cart__tools { display: flex; gap: 6px; }
.rt-icon-btn { width: 40px; height: 40px; border-radius: 11px; border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text-muted); display: grid; place-items: center; cursor: pointer; transition: color var(--x-duration), border-color var(--x-duration), background var(--x-duration); }
.rt-icon-btn:hover { color: var(--x-danger); border-color: color-mix(in srgb, var(--x-danger) 40%, var(--x-border)); background: var(--x-danger-soft); }
.rt-cart .rt-cart__close { display: none; }
.rt-customer { margin: 0 20px 8px; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--x-radius-md); background: var(--x-surface-2); border: 1px solid var(--x-border); }
.rt-customer__av { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--x-surface); color: var(--x-text-muted); border: 1px solid var(--x-border); }
.rt-customer > span:last-child { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.rt-customer small { font-size: 11.5px; color: var(--x-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.rt-customer b { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rt-lines { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px; }
.rt-empty { height: 100%; display: grid; place-items: center; }
.rt-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.rt-line { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: 'art info end' 'art step end'; align-items: center; column-gap: 12px; row-gap: 6px; padding: 10px 8px; border-radius: var(--x-radius-md); transition: background var(--x-duration); }
.rt-line:hover { background: var(--x-surface-2); }
.rt-line__art { grid-area: art; width: 44px; height: 44px; align-self: start; }
.rt-line__art img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; display: block; }
.rt-line__info { grid-area: info; display: flex; flex-direction: column; min-width: 0; }
.rt-line__name { font-size: 14.5px; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.rt-line__info small { font-size: 12.5px; color: var(--x-text-muted); }
.rt-step { grid-area: step; justify-self: start; display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 12px; background: var(--x-surface-3); }
.rt-step button { width: 34px; height: 34px; border-radius: 9px; border: 0; background: var(--x-surface); color: var(--x-text); display: grid; place-items: center; cursor: pointer; box-shadow: var(--x-shadow-xs); transition: transform 90ms; touch-action: manipulation; }
.rt-step button:active { transform: scale(0.92); }
.rt-step span { min-width: 30px; text-align: center; font-weight: 700; font-size: 15px; }
.rt-line__end { grid-area: end; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; align-self: stretch; justify-content: space-between; }
.rt-line__end b { font-size: 15px; white-space: nowrap; }
.rt-line__rm { width: 26px; height: 26px; border-radius: 8px; border: 0; background: transparent; color: var(--x-text-faint); display: grid; place-items: center; cursor: pointer; }
.rt-line__rm:hover { background: var(--x-danger-soft); color: var(--x-danger); }
.rt-line-enter-active, .rt-line-leave-active { transition: opacity 200ms var(--x-ease), transform 200ms var(--x-ease); }
.rt-line-enter-from { opacity: 0; transform: translateX(12px); }
.rt-line-leave-to { opacity: 0; transform: translateX(-12px); }
.rt-done { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 6px; padding: 24px; }
.rt-done__check { width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center; background: var(--x-success); color: #fff; box-shadow: 0 0 0 10px var(--x-success-soft), 0 16px 32px -12px rgba(16, 185, 129, 0.6); animation: x-pop 420ms var(--x-ease-spring) both; margin-bottom: 14px; }
.rt-done h3 { margin: 0; font-family: var(--x-font-display); font-size: 22px; }
.rt-done p { margin: 0; color: var(--x-text-muted); }
.rt-done__change { font-size: 15px; } .rt-done__change b { color: var(--x-text); font-size: 18px; }
.rt-done__acts { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; justify-content: center; }
.rt-cart__foot { padding: 12px 20px 20px; border-top: 1px solid var(--x-border); display: flex; flex-direction: column; gap: 12px; background: linear-gradient(180deg, var(--x-surface), var(--x-surface-2)); }
.rt-sum { display: flex; flex-direction: column; gap: 6px; }
.rt-sum__row { display: flex; justify-content: space-between; font-size: 14px; color: var(--x-text-muted); }
.rt-sum__total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; padding-top: 10px; border-top: 1px dashed var(--x-border-strong); font-weight: 700; font-size: 16px; }
.rt-sum__total b { font-family: var(--x-font-display); font-size: 28px; letter-spacing: -0.02em; }
.rt-sum__note { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--x-text-faint); }
.rt-note { margin: 0; padding: 10px 12px; border-radius: var(--x-radius-md); font-size: 13.5px; line-height: 1.45; }
.rt-note--warn { background: var(--x-warning-soft); color: var(--x-warning-text); }
.rt-note--err { background: var(--x-danger-soft); color: var(--x-danger-text); }
.rt-charge { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 64px; padding: 0 22px; border: 0; border-radius: var(--x-radius-lg); background: var(--x-primary); color: #fff; font: inherit; font-family: var(--x-font-display); font-size: 19px; font-weight: 700; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), var(--x-shadow-brand); transition: background var(--x-duration), transform 90ms, box-shadow var(--x-duration); }
.rt-charge:hover:not(:disabled) { background: var(--x-primary-hover); }
.rt-charge:active:not(:disabled) { transform: scale(0.985); }
.rt-charge:disabled { background: var(--x-surface-3); color: var(--x-text-faint); box-shadow: none; cursor: not-allowed; }
.rt-charge__l { display: inline-flex; align-items: center; gap: 10px; }
.rt-cartbar, .rt-scrim { display: none; }

@media (max-width: 1279px) { .rt { grid-template-columns: minmax(0, 1fr) 360px; } .rt-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } }
@media (max-width: 900px) {
  .rt { grid-template-columns: 1fr; }
  .rt-bar { padding: 12px 16px 8px; flex-wrap: nowrap; gap: 8px; }
  .rt-scan { flex: 1 1 0; min-width: 0; min-height: 52px; }
  .rt-scan__kbd { display: none; }
  .rt-chipbar { padding: 0 16px 4px; }
  .rt-scroll { padding: 8px 16px 96px; }
  .rt-printer { margin: 0 16px 8px; }
  .rt-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .rt-act span { display: none; }
  .rt-act { width: 48px; padding: 0; justify-content: center; }
  .rt-cart { position: fixed; inset-inline: 0; inset-block-end: 0; z-index: var(--x-z-drawer); max-height: 86dvh; border-radius: var(--x-radius-2xl) var(--x-radius-2xl) 0 0; border: 0; box-shadow: 0 -24px 48px -12px rgba(15, 23, 42, 0.35); transform: translateY(105%); transition: transform var(--x-duration-slow) var(--x-ease); padding-bottom: env(safe-area-inset-bottom); }
  .rt-cart.is-open { transform: none; }
  .rt-cart .rt-cart__close { display: grid; }
  .rt-scrim { display: block; position: fixed; inset: 0; z-index: calc(var(--x-z-drawer) - 1); background: rgba(15, 23, 42, 0.45); animation: x-fade-up 200ms both; }
  .rt-cartbar { display: flex; position: fixed; inset-inline: 12px; inset-block-end: max(12px, env(safe-area-inset-bottom)); z-index: var(--x-z-sticky); align-items: center; gap: 12px; min-height: 60px; padding: 0 18px 0 10px; border: 0; border-radius: var(--x-radius-lg); background: var(--x-brand-navy); color: #fff; font: inherit; font-weight: 600; font-size: 15px; box-shadow: 0 16px 32px -12px rgba(15, 23, 42, 0.6); cursor: pointer; animation: x-fade-up 240ms var(--x-ease) both; }
  .rt-cartbar b { margin-inline-start: auto; font-family: var(--x-font-display); font-size: 17px; }
  .rt-cartbar__n { min-width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: var(--x-primary); font-weight: 800; }
}
</style>
