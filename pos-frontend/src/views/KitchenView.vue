<script setup lang="ts">
// Kitchen display: every open kitchen order ticket, oldest first, so the pass
// can work through them and mark each New -> Preparing -> Ready -> Served.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

interface Kot {
  name: string
  order: string
  table: string
  status: 'New' | 'Preparing' | 'Ready' | 'Served' | 'Cancelled'
  created: string
  items: { item_name: string; qty: number; note: string }[]
}

const FNB = 'custom_erp.api.pos_fnb.'
const NEXT: Record<string, { to: string; label: string }> = {
  New: { to: 'Preparing', label: 'Start preparing' },
  Preparing: { to: 'Ready', label: 'Mark ready' },
  Ready: { to: 'Served', label: 'Served' },
}

const router = useRouter()
const auth = useAuthStore()
const kots = ref<Kot[]>([])
const error = ref<string | null>(null)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

async function load() {
  try {
    // Each location has its own kitchen: only this register's location's tickets.
    kots.value = await api.call<Kot[]>(FNB + 'list_kots', { pos_profile: auth.posProfile?.name })
    error.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  now.value = Date.now()
}

onMounted(() => {
  load()
  timer = setInterval(load, 6000)
})
onBeforeUnmount(() => clearInterval(timer))

async function advance(k: Kot, to: string) {
  try {
    await api.call(FNB + 'set_kot_status', { kot: k.name, status: to })
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function age(k: Kot) {
  const mins = Math.max(0, Math.round((now.value - new Date(k.created.replace(' ', 'T')).getTime()) / 60000))
  return mins < 1 ? 'just now' : `${mins} min`
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>Kitchen</h2>
      <span class="pill">{{ kots.length }} open</span>
      <button class="btn btn-ghost mini" @click="router.push('/floor')">← Tables</button>
    </div>
    <p v-if="error" class="error-box">{{ error }}</p>
    <p v-if="!kots.length && !error" style="color: var(--text-muted)">No tickets — the kitchen is clear.</p>
    <div class="kot-board">
      <div v-for="k in kots" :key="k.name" class="kot" :class="k.status">
        <div class="kot-head"><span>Table {{ k.table }}</span><span class="tabular">{{ age(k) }}</span></div>
        <div class="sub2" style="margin-bottom: 8px">{{ k.name }} · <span class="pill">{{ k.status }}</span></div>
        <ul style="margin: 0; padding: 0">
          <li v-for="(i, n) in k.items" :key="n">
            <b class="tabular">{{ i.qty }}×</b> {{ i.item_name }}
            <span v-if="i.note" class="kn">↳ {{ i.note }}</span>
          </li>
        </ul>
        <div class="row" style="margin-top: 12px">
          <button v-if="NEXT[k.status]" class="btn btn-primary mini" style="flex: 1" @click="advance(k, NEXT[k.status].to)">{{ NEXT[k.status].label }}</button>
          <button v-if="k.status === 'New' || k.status === 'Preparing'" class="btn btn-ghost mini" style="color: var(--danger)" @click="advance(k, 'Cancelled')">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>
