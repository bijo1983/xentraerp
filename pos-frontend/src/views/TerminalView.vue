<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePrinterStore } from '@/stores/printer'
import { api } from '@/lib/api'
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
const profile = computed(() => auth.posProfile!)

const items = ref<Item[]>([])
const loadingItems = ref(true)
const loadError = ref<string | null>(null)
const search = ref('')
const activeGroup = ref('all')

const cart = ref<Record<string, CartLine>>({})
const selectedPayment = ref('')
const charging = ref(false)
const chargeError = ref<string | null>(null)
const lastInvoice = ref<string | null>(null)
const lastReceipt = ref<ReceiptData | null>(null)
const printerSettingsOpen = ref(false)

const printer = usePrinterStore()

onMounted(async () => {
  selectedPayment.value = profile.value.payment_methods[0] || ''
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
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Could not load items'
  } finally {
    loadingItems.value = false
  }
})

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
      rate: it.standard_rate || 0,
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

// Frappe's REST create doesn't submit, and — more importantly — doesn't
// know the final grand_total until the server actually computes taxes
// against whatever the POS Profile's tax template configures. Sending a
// client-guessed payment amount up front risks mismatching that and
// tripping ERPNext's own payment-reconciliation check. So: create the
// Draft with just line items, read back the server's own grand_total,
// attach a payment for exactly that amount, then submit. Not yet tested
// against a real tenant's tax/payment configuration — the first real
// charge should be watched closely.
async function charge() {
  if (!cartLines.value.length || !selectedPayment.value) return
  chargeError.value = null
  charging.value = true
  try {
    const draft = await api.createDoc<{ name: string; grand_total: number }>('POS Invoice', {
      company: profile.value.company,
      pos_profile: profile.value.name,
      currency: profile.value.currency,
      customer: profile.value.customer || undefined,
      is_pos: 1,
      items: cartLines.value.map((l) => ({ item_code: l.item_code, qty: l.qty, rate: l.rate })),
    })

    const paid = await api.call<{ name: string }>('frappe.client.set_value', {
      doctype: 'POS Invoice',
      name: draft.name,
      fieldname: 'payments',
      value: [{ mode_of_payment: selectedPayment.value, amount: draft.grand_total }],
    })

    const submitted = await api.call<{ name: string }>('frappe.client.submit', {
      doc: JSON.stringify({ ...paid, doctype: 'POS Invoice', name: draft.name }),
    })

    lastInvoice.value = submitted?.name || draft.name
    lastReceipt.value = {
      orgName: auth.orgName || profile.value.company,
      posProfile: profile.value.name,
      invoiceName: lastInvoice.value,
      cashier: auth.user?.full_name || '',
      timestamp: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
      currency: profile.value.currency,
      lines: cartLines.value.map((l) => ({ name: l.item_name, qty: l.qty, rate: l.rate, amount: l.rate * l.qty })),
      total: draft.grand_total,
      paymentMethod: selectedPayment.value,
    }
    cart.value = {}
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
        <button class="btn btn-ghost" style="padding: 8px 14px; font-size: 12.5px" @click="printerSettingsOpen = !printerSettingsOpen">
          🖨️ Printer
        </button>
        <button class="btn btn-ghost" style="padding: 8px 14px; font-size: 12.5px" @click="switchRegister">
          Switch register
        </button>
        <button class="btn btn-ghost" style="padding: 8px 14px; font-size: 12.5px" @click="signOut">Sign out</button>
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
            {{ printer.connected ? `Connected: ${printer.connected.device.name || 'printer'}` : printer.connecting ? 'Connecting…' : 'Connect printer' }}
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
            <div class="pr tabular">{{ money(it.standard_rate || 0) }}</div>
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

      <div class="pay-methods">
        <button
          v-for="m in profile.payment_methods"
          :key="m"
          :class="{ sel: selectedPayment === m }"
          @click="selectedPayment = m"
        >
          {{ m }}
        </button>
        <p v-if="profile.payment_methods.length === 0" style="grid-column: 1 / -1; font-size: 12px; color: var(--text-faint)">
          No payment methods configured on this register.
        </p>
      </div>

      <p v-if="chargeError" class="error-box" style="margin: 0 20px 12px">{{ chargeError }}</p>
      <p v-if="lastInvoice" style="margin: 0 20px 12px; color: var(--success); font-size: 13px; display: flex; justify-content: space-between; align-items: center; gap: 8px">
        <span>Sale complete — {{ lastInvoice }}</span>
        <button class="btn btn-ghost" style="padding: 5px 10px; font-size: 11.5px" @click="printLastReceipt">Print again</button>
      </p>

      <button
        class="charge-btn"
        :disabled="charging || cartLines.length === 0 || !selectedPayment"
        @click="charge"
      >
        <span>{{ charging ? 'Charging…' : 'Charge' }}</span>
        <span class="r tabular">{{ money(subtotal) }}</span>
      </button>
    </div>
  </div>
</template>
