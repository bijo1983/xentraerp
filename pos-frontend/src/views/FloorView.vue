<script setup lang="ts">
// "Manage Tables": a guests panel on the left (bookings and parties on dine, by day) and the
// floor plan on the right (zone tabs, status legend, tables drawn with their chairs).
// Every new order starts with Dine in / Take away.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePosStore } from '@/stores/pos'
import { api } from '@/lib/api'
import FloorPlan, { type PlanTable } from '@/components/FloorPlan.vue'
import NewOrderDialog from '@/components/NewOrderDialog.vue'
import ReservationDialog, { type Booking } from '@/components/ReservationDialog.vue'

interface FloorOrder { name: string; guests: number; total: number; waiter: string | null; bill_closed: number; merged: boolean; part_paid?: boolean; primary_table: string; kots_pending: number }
interface FloorTable extends PlanTable {
  zone: string
  orders: FloorOrder[]
  total: number
  kots_pending: number
  reservation?: { name: string; guest: string; party_size: number; time: string } | null
}

const FNB = 'custom_erp.api.pos_fnb.'
const router = useRouter()
const auth = useAuthStore()
const pos = usePosStore()
const profile = computed(() => auth.posProfile!)

const tables = ref<FloorTable[]>([])
const bookings = ref<Booking[]>([])
interface TakeAwayOrder { name: string; token: string | null; guest_name: string | null; total: number; status: string; guests: number }
const takeaways = ref<TakeAwayOrder[]>([])
const error = ref<string | null>(null)
const dialogError = ref<string | null>(null)
const loading = ref(true)
const busy = ref(false)
const zone = ref('all')
const tab = ref<'all' | 'reservation' | 'dine'>('all')
const search = ref('')
const day = ref(new Date().toISOString().slice(0, 10))
let timer: ReturnType<typeof setInterval> | undefined

const newOrder = ref(false)
const presetTable = ref<string | null>(null)
const bookingOpen = ref(false)
const editing = ref<Booking | null>(null)

async function load() {
  try {
    const [t, b, ta] = await Promise.all([
      api.call<FloorTable[]>(FNB + 'list_tables', { pos_profile: profile.value.name }),
      api.call<Booking[]>(FNB + 'list_reservations', { date: day.value, pos_profile: profile.value.name }),
      api.call<TakeAwayOrder[]>(FNB + 'list_open_orders', { pos_profile: profile.value.name }),
    ])
    tables.value = t
    bookings.value = b
    takeaways.value = ta
    error.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  load()
  timer = setInterval(load, 8000) // the floor changes as others work
})
onBeforeUnmount(() => clearInterval(timer))

const zones = computed(() => [...new Set(tables.value.map((t) => t.zone || 'Main'))])
const visibleTables = computed(() => tables.value.filter((t) => zone.value === 'all' || (t.zone || 'Main') === zone.value))

function shiftDay(delta: number) {
  const d = new Date(day.value)
  d.setDate(d.getDate() + delta)
  day.value = d.toISOString().slice(0, 10)
  load()
}
const dayLabel = computed(() => new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(day.value)))
const isToday = computed(() => day.value === new Date().toISOString().slice(0, 10))

// Parties currently dining: each occupied table's first bill, and any take-away orders are on
// the order screen. Bookings show their state from their order (on dine / part paid).
interface Card { key: string; kind: 'booking' | 'dine'; time: string; chip: string; name: string; tables: number; guests: number; phone: string; meal: string; status: string; statusClass: string; booking?: Booking; order?: string }
const cards = computed<Card[]>(() => {
  const out: Card[] = []
  for (const b of bookings.value) {
    if (b.status === 'Cancelled' || b.status === 'No Show') continue
    const seated = b.status === 'Seated'
    const done = b.status === 'Completed'
    out.push({
      key: b.name, kind: 'booking', time: b.time, chip: seated ? 'On Dine' : done ? 'Paid' : fmt(b.time), name: b.guest,
      tables: b.tables.length, guests: b.party_size, phone: b.phone, meal: b.meal,
      status: done ? 'Paid' : seated ? (b.order_status === 'Part Paid' ? 'Part paid' : 'On Dine') : 'Reserved',
      statusClass: seated ? 'Seated' : done ? 'Free' : 'Booked', booking: b, order: b.order || undefined,
    })
  }
  if (isToday.value) {
    const bookedOrders = new Set(bookings.value.map((b) => b.order).filter(Boolean))
    for (const t of tables.value) {
      const o = t.orders?.find((x) => !x.merged)
      if (t.status === 'Occupied' && o && !bookedOrders.has(o.name)) {
        out.push({ key: o.name, kind: 'dine', time: '', chip: 'On Dine', name: `Table ${t.name}`, tables: 1, guests: o.guests, phone: '', meal: '', status: o.part_paid ? 'Part paid' : 'On Dine', statusClass: 'Open', order: o.name })
      }
    }
    // Take-away orders have no table on the plan, so they are listed here to go back to.
    for (const o of takeaways.value) {
      out.push({
        key: o.name, kind: 'dine', time: '', chip: 'Take away', name: `${o.token ? `#${o.token} · ` : ''}${o.guest_name || 'Take away'}`, tables: 0, guests: 1,
        phone: '', meal: '', status: o.status === 'Part Paid' ? 'Part paid' : 'On Dine', statusClass: 'Open', order: o.name,
      })
    }
  }
  return out
})
function fmt(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return cards.value.filter((c) => (tab.value === 'all' || (tab.value === 'reservation' ? c.kind === 'booking' : c.statusClass !== 'Booked' && c.status !== 'Paid')) && (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q)))
})
const counts = computed(() => ({ all: cards.value.length, reservation: cards.value.filter((c) => c.kind === 'booking').length, dine: cards.value.filter((c) => c.statusClass !== 'Booked' && c.status !== 'Paid').length }))

// ---- starting an order
function tapTable(t: PlanTable) {
  const ft = tables.value.find((x) => x.name === t.name)!
  if (ft.status === 'Occupied') {
    router.push(`/order/${ft.orders[0].name}`) // several bills (a split table): the order screen lists the rest
    return
  }
  presetTable.value = t.name
  dialogError.value = null
  newOrder.value = true
}
function startOrder() {
  presetTable.value = null
  dialogError.value = null
  newOrder.value = true
}
async function openDine(table: string, guests: number) {
  await run(async () => {
    const o = await api.call<{ name: string }>(FNB + 'open_order', { table, pos_profile: profile.value.name, guests, order_type: 'Dine In' })
    newOrder.value = false
    router.push(`/order/${o.name}`)
  })
}
async function openTakeaway(name: string, phone: string) {
  await run(async () => {
    const o = await api.call<{ name: string }>(FNB + 'open_order', { table: null, pos_profile: profile.value.name, order_type: 'Take Away', guest_name: name, guest_phone: phone })
    newOrder.value = false
    router.push(`/order/${o.name}`)
  })
}

// ---- bookings
function openBooking(b: Booking | null) {
  editing.value = b
  dialogError.value = null
  bookingOpen.value = true
}
async function saveBooking(v: { name?: string; guest: string; phone: string; party: number; date: string; time: string; meal: string; tables: string[]; notes: string }) {
  await run(async () => {
    await api.call(FNB + 'save_reservation', {
      guest_name: v.guest, phone: v.phone, party_size: v.party, reservation_date: v.date, reservation_time: v.time, meal: v.meal || undefined,
      tables: JSON.stringify(v.tables), notes: v.notes, name: v.name, pos_profile: profile.value.name,
    })
    bookingOpen.value = false
    day.value = v.date
    await load()
  })
}
async function seat(name: string, held: string[]) {
  await run(async () => {
    const r = await api.call<{ order: { name: string } }>(FNB + 'seat_reservation', { name, pos_profile: profile.value.name, tables: JSON.stringify(held) })
    bookingOpen.value = false
    router.push(`/order/${r.order.name}`)
  })
}
const cancelBooking = (name: string) => run(async () => { await api.call(FNB + 'cancel_reservation', { name }); bookingOpen.value = false; await load() })
const noShow = (name: string) => run(async () => { await api.call(FNB + 'mark_no_show', { name }); bookingOpen.value = false; await load() })

function tapCard(c: Card) {
  if (c.kind === 'booking' && c.booking && !c.order) openBooking(c.booking)
  else if (c.order) router.push(`/order/${c.order}`)
}

async function run(fn: () => Promise<void>) {
  busy.value = true
  dialogError.value = null
  try {
    await fn()
  } catch (e) {
    dialogError.value = e instanceof Error ? e.message : String(e)
    await load()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="floor-shell">
    <aside class="guests-panel">
      <div class="gtabs">
        <button class="gtab" :class="{ on: tab === 'all' }" @click="tab = 'all'">All <span class="n">{{ counts.all }}</span></button>
        <button class="gtab" :class="{ on: tab === 'reservation' }" @click="tab = 'reservation'">Reservation <span class="n">{{ counts.reservation }}</span></button>
        <button class="gtab" :class="{ on: tab === 'dine' }" @click="tab = 'dine'">On Dine <span class="n">{{ counts.dine }}</span></button>
      </div>
      <div class="row" style="justify-content: space-between; margin-bottom: 10px">
        <button class="btn btn-ghost mini" @click="shiftDay(-1)">‹</button>
        <b>{{ dayLabel }}</b>
        <button class="btn btn-ghost mini" @click="shiftDay(1)">›</button>
      </div>
      <input v-model="search" class="fld" style="width: 100%; margin-bottom: 10px" placeholder="Search customers" />
      <button v-if="pos.can('reserve')" class="btn btn-primary mini" style="width: 100%; margin-bottom: 12px" @click="openBooking(null)">+ New reservation</button>

      <p v-if="!filtered.length" style="color: var(--text-muted); font-size: 13px">Nothing here for {{ isToday ? 'today' : 'this day' }}.</p>
      <button v-for="c in filtered" :key="c.key" class="gcard" @click="tapCard(c)">
        <div class="gtime" :class="c.statusClass">{{ c.chip }}</div>
        <div style="flex: 1; min-width: 0">
          <div style="display: flex; justify-content: space-between; gap: 6px">
            <b style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ c.name }}</b>
            <span class="sub2">{{ c.meal }}</span>
          </div>
          <div class="gmeta"><span>🪑 {{ c.tables }}</span><span>👥 {{ c.guests }}</span><span v-if="c.phone">📞 {{ c.phone }}</span></div>
        </div>
        <span class="pill" :class="c.status === 'Paid' ? 'ok' : c.status === 'Part paid' ? 'warn' : ''" style="align-self: flex-start">{{ c.status }}</span>
      </button>
    </aside>

    <main class="plan-wrap">
      <div class="page-head" style="margin-bottom: 4px">
        <h2>Manage Tables</h2>
        <span v-if="profile.location" class="pill">{{ profile.location_name || profile.location }}</span>
        <button class="btn btn-primary mini" @click="startOrder">+ New order</button>
        <button class="btn btn-ghost mini" @click="router.push('/kitchen')">Kitchen (KOT)</button>
        <button v-if="pos.can('bill')" class="btn btn-ghost mini" @click="router.push('/terminal')">Quick sale</button>
        <button v-if="pos.can('shift')" class="btn btn-ghost mini" @click="router.push('/shift')">Shift</button>
        <button v-if="pos.canManage" class="btn btn-ghost mini" @click="router.push('/admin')">Settings</button>
        <button class="btn btn-ghost mini" @click="router.push('/registers')">Registers</button>
      </div>
      <div class="row" style="margin: 8px 0 4px">
        <button class="cat-chip" :class="{ active: zone === 'all' }" @click="zone = 'all'">All areas</button>
        <button v-for="z in zones" :key="z" class="cat-chip" :class="{ active: zone === z }" @click="zone = z">{{ z }}</button>
      </div>
      <div class="legend">
        <span><i style="background: #8b9cff" />Available</span><span><i style="background: #14826e" />Reserved</span><span><i style="background: #e8622a" />On Dine</span>
      </div>
      <p v-if="error" class="error-box">{{ error }}</p>
      <p v-if="loading" style="color: var(--text-muted)">Loading tables…</p>
      <p v-else-if="!tables.length" style="color: var(--text-muted)">
        No tables yet. <span v-if="pos.can('tables')">Add them under <a style="color: var(--accent-text); cursor: pointer" @click="router.push('/admin')">Settings → Tables</a>.</span><span v-else>Ask a supervisor to add the dining tables.</span>
      </p>
      <FloorPlan v-else :tables="visibleTables" @select="tapTable" />
    </main>

    <NewOrderDialog v-if="newOrder" :tables="tables" :preset-table="presetTable" :busy="busy" :error="dialogError" @dine="openDine" @takeaway="openTakeaway" @cancel="newOrder = false" />
    <ReservationDialog v-if="bookingOpen" :booking="editing" :tables="tables" :date="day" :busy="busy" :error="dialogError" @save="saveBooking" @seat="seat" @cancel-booking="cancelBooking" @no-show="noShow" @close="bookingOpen = false" />
  </div>
</template>
