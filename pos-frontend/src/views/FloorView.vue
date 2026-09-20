<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePosStore } from '@/stores/pos'
import { api } from '@/lib/api'

interface FloorOrder {
  name: string
  guests: number
  total: number
  waiter: string | null
  bill_closed: number
  merged: boolean
  primary_table: string
  kots_pending: number
}
interface FloorTable {
  name: string
  zone: string
  seats: number
  status: 'Available' | 'Occupied' | 'Reserved' | 'Disabled'
  orders: FloorOrder[]
  total: number
  kots_pending: number
}

const FNB = 'custom_erp.api.pos_fnb.'
const router = useRouter()
const auth = useAuthStore()
const pos = usePosStore()
const profile = computed(() => auth.posProfile!)

const tables = ref<FloorTable[]>([])
const error = ref<string | null>(null)
const loading = ref(true)
const seating = ref<FloorTable | null>(null)
const guests = ref('2')
let timer: ReturnType<typeof setInterval> | undefined

async function load() {
  try {
    tables.value = await api.call<FloorTable[]>(FNB + 'list_tables')
    error.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  // The floor changes as other staff work — keep it fresh.
  timer = setInterval(load, 8000)
})
onBeforeUnmount(() => clearInterval(timer))

const zones = computed(() => {
  const by: Record<string, FloorTable[]> = {}
  for (const t of tables.value) (by[t.zone || 'Main'] ||= []).push(t)
  return Object.entries(by)
})

function money(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: profile.value.currency }).format(n)
}

async function tap(t: FloorTable) {
  if (t.status === 'Disabled') return
  if (t.status === 'Occupied') {
    // Several bills (a split table): open the first; the order screen lists the rest.
    router.push(`/order/${t.orders[0].name}`)
    return
  }
  seating.value = t
  guests.value = String(Math.min(2, t.seats || 2))
}

async function seat() {
  if (!seating.value) return
  try {
    const o = await api.call<{ name: string }>(FNB + 'open_order', {
      table: seating.value.name,
      pos_profile: profile.value.name,
      guests: Number(guests.value) || 1,
    })
    seating.value = null
    router.push(`/order/${o.name}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    seating.value = null
    load()
  }
}

async function toggleReserved(t: FloorTable) {
  try {
    await api.call(FNB + 'set_table_reserved', { table: t.name, reserved: t.status === 'Reserved' ? 0 : 1 })
    seating.value = null
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ profile.name }} · Tables</h2>
      <span class="pill ok">F&amp;B</span>
      <button class="btn btn-ghost mini" @click="router.push('/kitchen')">Kitchen (KOT)</button>
      <button class="btn btn-ghost mini" @click="router.push('/terminal')">Quick sale</button>
      <button class="btn btn-ghost mini" @click="router.push('/shift')">Shift</button>
      <button v-if="pos.canAdmin" class="btn btn-ghost mini" @click="router.push('/admin')">Settings</button>
      <button class="btn btn-ghost mini" @click="router.push('/registers')">Registers</button>
    </div>

    <p v-if="error" class="error-box">{{ error }}</p>
    <p v-if="loading" style="color: var(--text-muted)">Loading tables…</p>
    <p v-else-if="tables.length === 0" style="color: var(--text-muted)">
      No tables yet.
      <span v-if="pos.canAdmin">Add them under <a style="color: var(--accent-text); cursor: pointer" @click="router.push('/admin')">Settings &amp; reports</a>.</span>
      <span v-else>Ask an administrator to add the dining tables.</span>
    </p>

    <template v-for="[zone, list] in zones" :key="zone">
      <div class="zone-title">{{ zone }}</div>
      <div class="table-grid">
        <button v-for="t in list" :key="t.name" class="table-card" :class="t.status" @click="tap(t)">
          <div class="tn">{{ t.name }}</div>
          <div class="ts">{{ t.status }} · {{ t.seats }} seats</div>
          <div v-if="t.status === 'Occupied'" class="ts">
            <template v-if="t.orders.length > 1">{{ t.orders.length }} bills · </template>
            <b class="tabular">{{ money(t.total) }}</b>
            <template v-if="t.orders[0]?.merged"> · merged</template>
            <span v-if="t.kots_pending" class="pill warn" style="margin-left: 6px">{{ t.kots_pending }} in kitchen</span>
            <span v-if="t.orders.some((o) => o.bill_closed)" class="pill" style="margin-left: 6px">bill closed</span>
          </div>
        </button>
      </div>
    </template>

    <div v-if="seating" class="modal-back" @click.self="seating = null">
      <div class="modal" style="width: 360px">
        <h3 style="margin: 0 0 12px">Table {{ seating.name }}</h3>
        <label class="sub2">Guests</label>
        <input v-model="guests" class="fld tabular" style="width: 100%; margin: 6px 0 14px" type="number" min="1" inputmode="numeric" />
        <div class="row">
          <button class="btn btn-primary" style="flex: 1" @click="seat">Open table</button>
          <button class="btn btn-ghost" @click="toggleReserved(seating)">{{ seating.status === 'Reserved' ? 'Clear reserved' : 'Reserve' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
