<script setup lang="ts">
// Tenant-admin screen: which kind of POS this organization runs (Retail or
// F&B), operating-hours behaviour, exchange rates for foreign-currency
// checkout, the dining tables, and the end-of-day report.
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePosStore, type PosMode } from '@/stores/pos'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'

interface Table {
  name: string
  zone: string
  location?: string
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
  outstanding_balance?: number
  location?: string | null
  by_location?: { location: string; invoices: number; received: number }[]
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
const auth = useAuthStore()

const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)
type Tab = 'mode' | 'hours' | 'staff' | 'menu' | 'locations' | 'rates' | 'tables' | 'eod'
const tab = ref<Tab>('mode')
// Each tab needs a capability of the signed-in role (the server enforces the same rules).
const tabOk = computed<Record<Tab, boolean>>(() => ({
  mode: pos.can('settings'), hours: pos.can('settings'), locations: pos.can('settings'), rates: pos.can('settings'),
  staff: pos.can('staff'), menu: pos.can('menu'), tables: pos.can('tables') && pos.isFnb, eod: pos.can('reports'),
}))

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
  const first = (Object.keys(tabOk.value) as Tab[]).find((t) => tabOk.value[t])
  if (first && !tabOk.value[tab.value]) openTab(first)
  if (pos.can('tables')) loadTables()
  if (pos.can('settings')) loadLocations()
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
const nt = ref({ name: '', zone: '', seats: '4', location: '' })
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
    await api.call(FNB + 'save_table', { table_name: nt.value.name, zone: nt.value.zone, seats: Number(nt.value.seats) || 4, location: nt.value.location || undefined })
    nt.value = { name: '', zone: nt.value.zone, seats: nt.value.seats, location: nt.value.location }
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

function openTab(t: Tab) {
  tab.value = t
  if (t === 'staff') loadStaff()
  else if (t === 'locations') loadLocations()
  else if (t === 'tables') loadTables()
  else if (t === 'menu') loadMenu()
}

// --- checkout document
const setCheckout = (v: 'POS Invoice' | 'Draft Invoice + Receipt') => run(() => pos.saveSettings({ checkout_document: v }), 'Saved')

// --- staff & PINs
interface Staff { user: string; full_name: string; has_pin: boolean; active: boolean; pos_profile: string | null; pos_role: string | null; level: string | null; role_label: string; is_cashier_role: boolean; is_admin: boolean }
interface Register { name: string; location?: string | null; location_name?: string | null }
const PIN = 'custom_erp.api.pos.'
const staff = ref<Staff[]>([])
const registers = ref<Register[]>([])
const ROLES = [{ v: 'POS Waiter', l: 'Waiter — orders only' }, { v: 'POS Cashier', l: 'Cashier — modify, bill, close' }, { v: 'POS Supervisor', l: 'Supervisor — tables, menu, void, reports' }, { v: 'POS Kitchen', l: 'Kitchen — board only' }]
// A supervisor manages waiters, cashiers and kitchen staff; only an administrator creates supervisors.
const assignable = computed(() => (pos.settings?.level === 'admin' ? ROLES : ROLES.filter((r) => r.v !== 'POS Supervisor')))
const ns = ref({ email: '', name: '', pin: '', profile: '', role: 'POS Waiter' })
const pinFor = ref<Record<string, string>>({})
async function loadStaff() {
  try {
    ;[staff.value, registers.value] = await Promise.all([api.call<Staff[]>(PIN + 'list_pos_users'), api.call<Register[]>(PIN + 'list_pos_profiles')])
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
const addStaff = () =>
  run(async () => {
    await api.call(PIN + 'create_pos_user', { email: ns.value.email, full_name: ns.value.name, pin: ns.value.pin, pos_profile: ns.value.profile || undefined, pos_role: ns.value.role })
    ns.value = { email: '', name: '', pin: '', profile: ns.value.profile, role: ns.value.role }
    await loadStaff()
  }, 'Staff member added — they can sign in to the POS with their PIN')
const savePin = (u: Staff) =>
  run(async () => {
    await api.call(PIN + 'set_pin', { user: u.user, pin: pinFor.value[u.user], pos_profile: u.pos_profile || undefined })
    pinFor.value[u.user] = ''
    await loadStaff()
  }, `PIN saved for ${u.full_name}`)
const changeRole = (u: Staff, role: string) => run(async () => { await api.call(PIN + 'set_pos_role', { user: u.user, pos_role: role }); await loadStaff() }, `${u.full_name} is now ${role.replace('POS ', '')}`)
const canEditStaff = (u: Staff) => pos.settings?.level === 'admin' || !['admin', 'supervisor'].includes(u.level || '')
const togglePin = (u: Staff) => run(async () => { await api.call(PIN + 'set_pin_active', { user: u.user, active: u.active ? 0 : 1 }); await loadStaff() })

// --- menu
interface MenuRow { item_code: string; item_name: string; item_group: string; rate: number; hidden: boolean; is_stock_item: number }
const menuRows = ref<MenuRow[]>([])
const itemGroups = ref<string[]>([])
const menuSearch = ref('')
const nm = ref({ name: '', group: '', price: '' })
const priceEdit = ref<Record<string, string>>({})
const notesFor = ref<MenuRow | null>(null)
const notesText = ref('')
const notesSource = ref('')
const menuShown = computed(() => menuRows.value.filter((m) => !menuSearch.value || m.item_name.toLowerCase().includes(menuSearch.value.toLowerCase())))
async function loadMenu() {
  try {
    ;[menuRows.value, itemGroups.value] = await Promise.all([
      api.call<MenuRow[]>(CORE + 'list_menu', { pos_profile: auth.posProfile?.name, include_hidden: 1 }),
      api.call<string[]>(CORE + 'list_item_groups'),
    ])
    if (!nm.value.group && itemGroups.value.length) nm.value.group = itemGroups.value[0]
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
const toggleHidden = (m: MenuRow) => run(async () => { await api.call(CORE + 'set_item_hidden', { item_code: m.item_code, hidden: m.hidden ? 0 : 1 }); await loadMenu() }, m.hidden ? `${m.item_name} is back on the menu` : `${m.item_name} is hidden from the POS`)
const addMenuItem = () =>
  run(async () => {
    await api.call(CORE + 'save_menu_item', { item_name: nm.value.name, item_group: nm.value.group, rate: Number(nm.value.price) || 0, pos_profile: auth.posProfile?.name })
    nm.value = { name: '', group: nm.value.group, price: '' }
    await loadMenu()
  }, 'Dish added to the menu')
const savePrice = (m: MenuRow) =>
  run(async () => {
    await api.call(CORE + 'save_menu_item', { item_name: m.item_name, item_group: m.item_group, rate: Number(priceEdit.value[m.item_code]), pos_profile: auth.posProfile?.name, item_code: m.item_code })
    priceEdit.value[m.item_code] = ''
    await loadMenu()
  }, `Price updated for ${m.item_name}`)
async function openNotes(m: MenuRow, refresh = false) {
  notesFor.value = m
  await run(async () => {
    const r = await api.call<{ notes: string[]; source: string }>(CORE + 'get_item_notes', { item_code: m.item_code, refresh: refresh ? 1 : 0 })
    notesText.value = r.notes.join('\n')
    notesSource.value = r.source
  })
}
const saveNotes = () => run(async () => { if (notesFor.value) { await api.call(CORE + 'set_item_notes', { item_code: notesFor.value.item_code, notes: JSON.stringify(notesText.value.split('\n')) }); notesSource.value = 'Manual' } }, 'Notes saved')

// --- locations
interface Loc { code: string; name: string; cost_center: string | null; warehouse: string | null; disabled: number; profiles: string[] }
const locs = ref<Loc[]>([])
const costCenters = ref<string[]>([])
const warehouses = ref<string[]>([])
const nl = ref({ code: '', name: '', cost_center: '', warehouse: '', profiles: [] as string[] })
async function loadLocations() {
  try {
    ;[locs.value, registers.value] = await Promise.all([api.call<Loc[]>(CORE + 'list_locations'), api.call<Register[]>(PIN + 'list_pos_profiles')])
    costCenters.value = (await api.getList<{ name: string }>('Cost Center', { fields: ['name'], filters: [['is_group', '=', 0]], limit_page_length: 200 })).map((c) => c.name)
    warehouses.value = (await api.getList<{ name: string }>('Warehouse', { fields: ['name'], filters: [['is_group', '=', 0]], limit_page_length: 200 })).map((w) => w.name)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
const saveLoc = (l: { code: string; name: string; cost_center: string | null; warehouse: string | null; profiles: string[]; disabled?: number }) =>
  run(async () => {
    await api.call(CORE + 'save_location', {
      location_code: l.code, location_name: l.name, cost_center: l.cost_center || undefined, warehouse: l.warehouse || undefined,
      profiles: JSON.stringify(l.profiles), disabled: l.disabled || 0,
    })
    nl.value = { code: '', name: '', cost_center: '', warehouse: '', profiles: [] }
    await loadLocations()
  }, 'Location saved — its bills are numbered with its code')
const delLoc = (l: Loc) => run(async () => { if (!window.confirm(`Delete location ${l.code}?`)) return; await api.call(CORE + 'delete_location', { location_code: l.code }); await loadLocations() })
const toggleProfile = (l: { profiles: string[] }, p: string) => { l.profiles = l.profiles.includes(p) ? l.profiles.filter((x) => x !== p) : [...l.profiles, p] }

// --- end of day
const eodLocation = ref('')
const eodDate = ref(pos.settings?.business_date || new Date().toISOString().slice(0, 10))
const eod = ref<Eod | null>(null)
const runEod = () => run(async () => (eod.value = await api.call<Eod>(CORE + 'end_of_day_report', { date: eodDate.value, location: eodLocation.value || undefined })))
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
      <button v-if="tabOk.mode" :class="{ on: tab === 'mode' }" @click="openTab('mode')">Mode</button>
      <button v-if="tabOk.hours" :class="{ on: tab === 'hours' }" @click="openTab('hours')">Hours &amp; kitchen</button>
      <button v-if="tabOk.staff" :class="{ on: tab === 'staff' }" @click="openTab('staff')">Staff &amp; PINs</button>
      <button v-if="tabOk.menu" :class="{ on: tab === 'menu' }" @click="openTab('menu')">Menu</button>
      <button v-if="tabOk.tables" :class="{ on: tab === 'tables' }" @click="openTab('tables')">Tables</button>
      <button v-if="tabOk.locations" :class="{ on: tab === 'locations' }" @click="openTab('locations')">Locations</button>
      <button v-if="tabOk.rates" :class="{ on: tab === 'rates' }" @click="openTab('rates')">Currencies</button>
      <button v-if="tabOk.eod" :class="{ on: tab === 'eod' }" @click="openTab('eod')">End of day</button>
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
      <h4>What a checkout produces</h4>
      <div class="seg" style="margin-bottom: 8px">
        <button :class="{ on: s?.checkout_document !== 'Draft Invoice + Receipt' }" :disabled="busy" @click="setCheckout('POS Invoice')">POS Invoice</button>
        <button :class="{ on: s?.checkout_document === 'Draft Invoice + Receipt' }" :disabled="busy" @click="setCheckout('Draft Invoice + Receipt')">Draft Invoice + Receipt</button>
      </div>
      <p style="color: var(--text-muted); margin-top: 0">
        <b>POS Invoice</b> — one submitted POS Invoice with the payments inside it; must be paid in full.<br />
        <b>Draft Invoice + Receipt</b> — checkout makes a Draft Sales Invoice; when payment is finalized it is submitted and a receipt (Payment Entry) is created against it for each payment. A <b>partial payment</b> is allowed: the invoice becomes <b>Partly Paid</b> and the cashier finishes billing later from <i>Pending balances</i> (retail) or the table (F&amp;B).
      </p>
    </div>
    <div v-if="tab === 'hours'" class="card">
      <h4>Kitchen &amp; order notes</h4>
      <label class="row"><input type="checkbox" :checked="!!s?.auto_kot" @change="run(() => pos.saveSettings({ auto_kot: s?.auto_kot ? 0 : 1 }), 'Saved')" /> Saving an order sends it to the kitchen automatically (no separate Send to kitchen step)</label>
      <label class="row" style="margin-top: 8px"><input type="checkbox" :checked="!!s?.item_notes_prompt" @change="run(() => pos.saveSettings({ item_notes_prompt: s?.item_notes_prompt ? 0 : 1 }), 'Saved')" /> Ask for a note when an item is added — suggestions like <i>well done, crunchy, deep fried</i> plus free text</label>
      <p style="color: var(--text-muted)">The kitchen board shows each ticket the moment the order is saved. To also print it, tick <b>Auto-print new tickets here</b> on the kitchen screen of the device next to the printer, or <b>KOT printer</b> on the ordering terminal. Note suggestions come from Claude when the server has an Anthropic API key (site config <code>anthropic_api_key</code>); otherwise a built-in list for the kind of dish is used.</p>
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

    <div v-if="tab === 'staff'">
      <div class="card">
        <h4>Add a team member</h4>
        <p style="color: var(--text-muted); margin-top: 0">They sign in to the POS with the organization code and a PIN (6-8 digits) — no password. Their <b>role</b> decides what they can do:
          <b>Waiter</b> takes orders (adds items, sends to the kitchen) but can't reduce items, close bills or take payment · <b>Cashier</b> also modifies orders, closes the bill and takes payment · <b>Supervisor</b> also manages tables and the menu, voids and sees reports · <b>Kitchen</b> only sees the kitchen board.</p>
        <div class="row">
          <input v-model="ns.email" class="fld" placeholder="Email" type="email" />
          <input v-model="ns.name" class="fld" placeholder="Full name" />
          <input v-model="ns.pin" class="fld tabular" placeholder="PIN" inputmode="numeric" maxlength="8" style="width: 100px" />
          <select v-model="ns.role" class="fld"><option v-for="r in assignable" :key="r.v" :value="r.v">{{ r.l }}</option></select>
          <select v-model="ns.profile" class="fld"><option value="">Any register</option><option v-for="r in registers" :key="r.name" :value="r.name">{{ r.name }}{{ r.location_name ? ` · ${r.location_name}` : '' }}</option></select>
          <button class="btn btn-primary mini" :disabled="busy || !ns.email || !ns.name || ns.pin.length < 6" @click="addStaff">Add</button>
        </div>
      </div>
      <div class="card">
        <h4>Team</h4>
        <table class="simple-table">
          <thead><tr><th>Person</th><th>Role</th><th>PIN</th><th>Register</th><th>Set / reset PIN</th><th /></tr></thead>
          <tbody>
            <tr v-for="u in staff" :key="u.user">
              <td>{{ u.full_name }}<div class="sub2">{{ u.user }}</div></td>
              <td>
                <span v-if="u.is_admin" class="pill ok">Administrator</span>
                <select v-else-if="canEditStaff(u)" class="fld" :value="u.pos_role || ''" @change="changeRole(u, ($event.target as HTMLSelectElement).value)">
                  <option v-if="!u.pos_role" value="" disabled>{{ u.has_pin ? 'Waiter (default)' : '—' }}</option>
                  <option v-for="r in assignable" :key="r.v" :value="r.v">{{ r.l.split(' — ')[0] }}</option>
                </select>
                <span v-else class="pill">{{ u.role_label }}</span>
              </td>
              <td><span class="pill" :class="!u.has_pin ? '' : u.active ? 'ok' : 'bad'">{{ !u.has_pin ? 'none' : u.active ? 'active' : 'off' }}</span></td>
              <td>{{ u.pos_profile || (u.has_pin ? 'any' : '—') }}</td>
              <td><div v-if="canEditStaff(u)" class="row"><input v-model="pinFor[u.user]" class="fld tabular" placeholder="new PIN" inputmode="numeric" maxlength="8" style="width: 100px" /><button class="btn btn-primary mini" :disabled="busy || (pinFor[u.user] || '').length < 6" @click="savePin(u)">Save</button></div></td>
              <td class="num"><button v-if="u.has_pin && canEditStaff(u)" class="btn btn-ghost mini" @click="togglePin(u)">{{ u.active ? 'Switch off' : 'Switch on' }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="tab === 'menu'">
      <div class="card">
        <h4>Add a dish</h4>
        <div class="row">
          <input v-model="nm.name" class="fld" placeholder="Name (Grilled Chicken)" />
          <select v-model="nm.group" class="fld"><option v-for="g in itemGroups" :key="g" :value="g">{{ g }}</option></select>
          <input v-model="nm.price" class="fld tabular" style="width: 110px" type="number" min="0" step="any" placeholder="Price" />
          <button class="btn btn-primary mini" :disabled="busy || !nm.name || !nm.group" @click="addMenuItem">Add to menu</button>
        </div>
      </div>
      <div class="card">
        <h4>Menu</h4>
        <p style="color: var(--text-muted); margin-top: 0">Hiding a dish removes it from every POS screen only — it stays in the back office. New dishes are non-stock items priced on this register's selling price list.</p>
        <input v-model="menuSearch" class="fld" style="width: 100%; margin-bottom: 10px" placeholder="Search the menu" />
        <table class="simple-table">
          <thead><tr><th>Dish</th><th>Group</th><th class="num">Price</th><th>Change price</th><th /></tr></thead>
          <tbody>
            <tr v-for="m in menuShown" :key="m.item_code" :style="m.hidden ? 'opacity:.5' : ''">
              <td>{{ m.item_name }} <span v-if="m.hidden" class="pill bad">hidden</span></td><td>{{ m.item_group }}</td><td class="num tabular">{{ m.rate.toFixed(3) }}</td>
              <td><div class="row"><input v-model="priceEdit[m.item_code]" class="fld tabular" style="width: 90px" type="number" min="0" step="any" placeholder="new" /><button class="btn btn-ghost mini" :disabled="busy || !priceEdit[m.item_code]" @click="savePrice(m)">Set</button></div></td>
              <td class="num"><button class="btn btn-ghost mini" @click="openNotes(m)">Notes</button><button class="btn btn-ghost mini" @click="toggleHidden(m)">{{ m.hidden ? 'Show' : 'Hide' }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="notesFor" class="modal-back" @click.self="notesFor = null">
        <div class="modal" style="width: 460px">
          <h3 style="margin: 0 0 4px">Notes for {{ notesFor.item_name }}</h3>
          <p class="sub2" style="margin: 0 0 8px">Suggested when the dish is ordered — one per line. Source: <b>{{ notesSource }}</b></p>
          <textarea v-model="notesText" class="fld" style="width: 100%; height: 170px; resize: vertical" />
          <div class="row" style="margin-top: 12px">
            <button class="btn btn-ghost" :disabled="busy" @click="openNotes(notesFor, true)">✨ Regenerate with AI</button>
            <button class="btn btn-primary" style="margin-left: auto" :disabled="busy" @click="saveNotes">Save</button>
            <button class="btn btn-ghost" @click="notesFor = null">Close</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="tab === 'locations'">
      <div class="card">
        <h4>Add a location</h4>
        <p style="color: var(--text-muted); margin-top: 0">A location is a site (branch, outlet, floor). Its <b>code</b> becomes part of every bill number — e.g. <code>MAIN-INV-2026-00001</code> — and its cost center and warehouse are applied to the invoice. Give each location its own registers; tables and the kitchen follow.</p>
        <div class="row" style="margin-bottom: 8px">
          <input v-model="nl.code" class="fld" placeholder="Code (MAIN)" maxlength="8" style="width: 110px; text-transform: uppercase" />
          <input v-model="nl.name" class="fld" placeholder="Name (Main Restaurant)" />
          <select v-model="nl.cost_center" class="fld"><option value="">Cost center…</option><option v-for="c in costCenters" :key="c" :value="c">{{ c }}</option></select>
          <select v-model="nl.warehouse" class="fld"><option value="">Warehouse…</option><option v-for="w in warehouses" :key="w" :value="w">{{ w }}</option></select>
        </div>
        <div class="row" style="margin-bottom: 8px"><span class="sub2">Registers:</span>
          <label v-for="r in registers" :key="r.name" class="pill" style="cursor: pointer"><input type="checkbox" :checked="nl.profiles.includes(r.name)" @change="toggleProfile(nl, r.name)" /> {{ r.name }}</label>
        </div>
        <button class="btn btn-primary mini" :disabled="busy || !nl.code || !nl.name" @click="saveLoc({ code: nl.code, name: nl.name, cost_center: nl.cost_center, warehouse: nl.warehouse, profiles: nl.profiles })">Save location</button>
      </div>
      <div v-for="l in locs" :key="l.code" class="card">
        <div class="row">
          <b style="flex: 1">{{ l.code }} · {{ l.name }}</b>
          <span class="pill">{{ l.cost_center || 'no cost center' }}</span><span class="pill">{{ l.warehouse || 'no warehouse' }}</span>
          <span v-if="l.disabled" class="pill bad">disabled</span>
        </div>
        <div class="row" style="margin: 8px 0"><span class="sub2">Registers:</span>
          <label v-for="r in registers" :key="r.name" class="pill" style="cursor: pointer"><input type="checkbox" :checked="l.profiles.includes(r.name)" @change="toggleProfile(l, r.name)" /> {{ r.name }}</label>
        </div>
        <div class="row">
          <button class="btn btn-primary mini" :disabled="busy" @click="saveLoc(l)">Save registers</button>
          <button class="btn btn-ghost mini" :disabled="busy" @click="saveLoc({ ...l, disabled: l.disabled ? 0 : 1 })">{{ l.disabled ? 'Enable' : 'Disable' }}</button>
          <button class="btn btn-ghost mini" style="color: var(--danger)" @click="delLoc(l)">Delete</button>
        </div>
      </div>
      <p v-if="!locs.length" style="color: var(--text-muted)">No locations yet — bills keep the standard numbering until you add one.</p>
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
        <select v-model="nt.location" class="fld"><option value="">Any location</option><option v-for="l in locs" :key="l.code" :value="l.code">{{ l.code }}</option></select>
        <button class="btn btn-primary mini" :disabled="busy || !nt.name" @click="addTable">Add table</button>
      </div>
      <table class="simple-table">
        <thead><tr><th>Table</th><th>Zone</th><th>Location</th><th class="num">Seats</th><th>Status</th><th /></tr></thead>
        <tbody>
          <tr v-for="t in tables" :key="t.name">
            <td>{{ t.name }}</td><td>{{ t.zone }}</td><td>{{ t.location || '—' }}</td><td class="num">{{ t.seats }}</td>
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
          <select v-model="eodLocation" class="fld"><option value="">All locations</option><option v-for="l in locs" :key="l.code" :value="l.code">{{ l.code }} · {{ l.name }}</option></select>
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
            <div v-if="eod.outstanding_balance" class="stat"><div class="v tabular" style="color: var(--warning)">{{ fmt(eod.outstanding_balance) }}</div><div class="l">Part-paid — still to collect</div></div>
            <div v-if="pos.isFnb" class="stat"><div class="v tabular">{{ eod.fnb.covers }}</div><div class="l">Covers · {{ fmt(eod.fnb.average_per_cover) }} each</div></div>
            <div class="stat"><div class="v tabular">{{ eod.returns.count }}</div><div class="l">Returns · {{ fmt(eod.returns.total) }}</div></div>
          </div>
        </div>
        <div v-if="(eod.by_location?.length ?? 0) > 1 || (!!eod.by_location?.[0]?.location && !eod.location)" class="card">
          <h4>By location</h4>
          <table class="simple-table"><tbody><tr v-for="l in eod.by_location" :key="l.location"><td>{{ l.location || '(no location)' }}</td><td class="num">{{ l.invoices }} bills</td><td class="num tabular">{{ l.received.toFixed(3) }}</td></tr></tbody></table>
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
