<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePrinterStore } from '@/stores/printer'
import { api } from '@/lib/api'
import { usePosStore } from '@/stores/pos'
import PayDialog from '@/components/PayDialog.vue'
import type { ReceiptData } from '@/lib/receipt'

interface Item {
  name: string
  item_name: string
  item_group: string
  standard_rate: number
}

interface CartLine {
  item_code: string
  item_name: string
  item_group: string
  rate: number
  qty: number
}

const router = useRouter()
const auth = useAuthStore()
const pos = usePosStore()
const profile = computed(() => auth.posProfile!)

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

onMounted(async () => {
  printer.tryReconnect()
  try {
    items.value = await api.getList<Item>('Item', {
      fields: ['name', 'item_name', 'item_group', 'standard_rate'],
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
  }
})

function rateFor(it: Item): number {
  return priceListRates.value[it.name] ?? it.standard_rate ?? 0
}

const groups = computed(() => {
  const seen = new Set<string>()
  const list: string[] = []
  for (const it of items.value) {
    if (!seen.has(it.item_group)) {
      seen.add(it.item_group)
      list.push(it.item_group)
    }
  }
  return list
})

const visibleItems = computed(() => {
  let list = items.value
  if (activeGroup.value !== 'all') list = list.filter((it) => it.item_group === activeGroup.value)
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter((it) => it.item_name.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
  return list
})

const cartLines = computed(() => Object.values(cart.value).filter((l) => l.qty > 0))
const subtotal = computed(() => cartLines.value.reduce((sum, l) => sum + l.rate * l.qty, 0))

function money(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: profile.value.currency || 'USD' }).format(n)
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
      rate: rateFor(it),
      qty: 1,
    }
  }
}
function inc(code: string) {
  if (cart.value[code]) cart.value[code].qty += 1
}
function dec(code: string) {
  if (cart.value[code]) cart.value[code].qty = Math.max(0, cart.value[code].qty - 1)
}
function clearCart() {
  cart.value = {}
  chargeError.value = null
  lastInvoice.value = null
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
    cart.value = {}
    if (r.partial) partialNote.value = `Part payment taken — ${money(r.balance || 0)} still to collect on ${r.invoice}`
    await printLastReceipt()
  } catch (err) {
    chargeError.value = err instanceof Error ? err.message : 'Could not complete this sale'
  } finally {
    charging.value = false
  }
}

async function printLastReceipt() {
  if (!lastReceipt.value) return
  try {
    await printer.printReceipt(lastReceipt.value)
  } catch (err) {
    chargeError.value = err instanceof Error ? err.message : 'Sale completed, but the receipt failed to print'
  }
}

async function switchRegister() {
  auth.posProfile = null
  router.push('/registers')
}
async function signOut() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="terminal">
    <div class="term-main">
      <div class="term-topbar">
        <div class="brand"><span class="glyph">X</span> {{ profile.name }}</div>
        <span class="reg-pill">● {{ auth.user?.full_name }}</span>
        <div class="term-search">
          <span class="icn">⌕</span>
          <input v-model="search" type="text" placeholder="Search items…" />
        </div>
        <div class="topbar-actions">
          <button
            class="btn-icon"
            :class="{ on: printerSettingsOpen }"
            title="Printer settings"
            aria-label="Printer settings"
            @click="printerSettingsOpen = !printerSettingsOpen"
          >
            🖨️
          </button>
          <button v-if="pos.draftMode" class="btn btn-ghost" @click="openBalances">💳 Pending balances</button>
          <button v-if="pos.isFnb" class="btn btn-ghost" @click="router.push('/floor')">🍽️ Tables</button>
          <button class="btn btn-ghost" @click="router.push('/shift')">⏱️ Shift</button>
          <button v-if="pos.canManage" class="btn btn-ghost" @click="router.push('/admin')">⚙️ Settings</button>
          <button class="btn btn-ghost" @click="switchRegister">⇄ Switch register</button>
          <span class="topbar-divider" />
          <button class="btn-danger-ghost btn" @click="signOut">⏻ Sign out</button>
        </div>
      </div>

      <div v-if="printerSettingsOpen" style="padding: 14px 22px; border-bottom: 1px solid var(--border-soft); background: var(--surface)">
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px">
          <span style="font-size: 12.5px; color: var(--text-muted)">Print via:</span>
          <button
            class="cat-chip"
            :class="{ active: printer.method === 'browser' }"
            @click="printer.setMethod('browser')"
          >
            Browser (network / AirPrint)
          </button>
          <button
            class="cat-chip"
            :class="{ active: printer.method === 'bluetooth' }"
            @click="printer.setMethod('bluetooth')"
          >
            Bluetooth thermal printer
          </button>
          <button
            v-if="printer.method === 'bluetooth'"
            class="btn btn-ghost"
            style="padding: 7px 12px; font-size: 12.5px"
            :disabled="printer.connecting"
            @click="printer.connectBluetoothPrinter()"
          >
            {{ printer.connected ? `Connected: ${printer.connected.name || 'printer'}` : printer.connecting ? 'Connecting…' : 'Connect printer' }}
          </button>
        </div>
        <p v-if="printer.method === 'bluetooth' && !printer.bluetoothSupported" style="margin: 8px 0 0; font-size: 11.5px; color: var(--warning)">
          This browser doesn't support Bluetooth printing — use Chrome or Edge (not Safari).
        </p>
        <p v-if="printer.error" style="margin: 8px 0 0; font-size: 11.5px; color: var(--danger)">{{ printer.error }}</p>
      </div>

      <div class="cat-rail">
        <div class="cat-chip" :class="{ active: activeGroup === 'all' }" @click="activeGroup = 'all'">All Items</div>
        <div v-for="g in groups" :key="g" class="cat-chip" :class="{ active: activeGroup === g }" @click="activeGroup = g">
          {{ g }}
        </div>
      </div>

      <p v-if="loadError" class="error-box" style="margin: 16px 22px">{{ loadError }}</p>
      <p v-else-if="loadingItems" style="padding: 20px 22px; color: var(--text-muted)">Loading items…</p>
      <p v-else-if="items.length === 0" style="padding: 20px 22px; color: var(--text-muted)">
        No sellable items found. Add some Items in the back office (flagged "Allow Sales") to start selling.
      </p>
      <div v-else class="item-grid">
        <button v-for="it in visibleItems" :key="it.name" class="item-tile" @click="addItem(it)">
          <div class="cat-tag">{{ it.item_group }}</div>
          <div>
            <div class="nm">{{ it.item_name }}</div>
            <div class="pr tabular">{{ money(rateFor(it)) }}</div>
          </div>
        </button>
      </div>
    </div>

    <div class="cart">
      <div class="cart-head">
        <div class="row1">
          <h3>Current Order</h3>
          <span class="clear" @click="clearCart">Clear</span>
        </div>
        <div class="customer-pill">👤 <b>{{ profile.customer || 'Walk-in Customer' }}</b></div>
      </div>

      <div class="cart-lines">
        <div v-if="cartLines.length === 0" class="cart-empty">Tap an item to add it to the order</div>
        <div v-for="l in cartLines" :key="l.item_code" class="line">
          <div class="sw" style="background: var(--accent)" />
          <div class="info">
            <div class="nm">{{ l.item_name }}</div>
            <div class="unit tabular">{{ money(l.rate) }} each</div>
            <div class="stepper">
              <button @click="dec(l.item_code)">–</button>
              <span class="qty">{{ l.qty }}</span>
              <button @click="inc(l.item_code)">+</button>
            </div>
          </div>
          <div class="amt tabular">{{ money(l.rate * l.qty) }}</div>
        </div>
      </div>

      <div class="cart-totals">
        <div class="trow grand"><span>Total</span><span class="val tabular">{{ money(subtotal) }}</span></div>
        <p style="font-size: 11px; color: var(--text-faint); margin: 4px 0 0">
          Tax, if any, is applied by the server from this register's price list/tax template on charge.
        </p>
      </div>

      <p v-if="partialNote" style="margin: 0 20px 12px; color: var(--warning); font-size: 13px">{{ partialNote }}</p>
      <p v-if="chargeError" class="error-box" style="margin: 0 20px 12px">{{ chargeError }}</p>
      <p v-if="lastInvoice" style="margin: 0 20px 12px; color: var(--success); font-size: 13px; display: flex; justify-content: space-between; align-items: center; gap: 8px">
        <span>Sale complete — {{ lastInvoice }}</span>
        <button class="btn btn-ghost" style="padding: 5px 10px; font-size: 11.5px" @click="printLastReceipt">Print again</button>
      </p>

      <button
        class="charge-btn"
        :disabled="charging || cartLines.length === 0"
        @click="charge"
      >
        <span>{{ charging ? 'Working…' : 'Charge' }}</span>
        <span class="r tabular">{{ money(subtotal) }}</span>
      </button>
    </div>
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
        <h3 style="margin: 0 0 10px">Pending balances</h3>
        <p v-if="!balances.length" style="color: var(--text-muted)">Nothing waiting — every invoice is fully paid.</p>
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
        <div style="margin-top: 12px"><button class="btn btn-ghost" @click="balancesOpen = false">Close</button></div>
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
