<script setup lang="ts">
// The dining room, drawn: each table a rounded shape sized by its seats with chairs around
// it. Chair colour shows the table's state — Available (outline), Reserved (teal), On Dine
// (orange, one filled chair per guest). Layout flows automatically by zone.
import { computed } from 'vue'

export interface PlanTable {
  name: string
  seats: number
  status: 'Available' | 'Occupied' | 'Reserved' | 'Disabled'
  guests: number
  orders?: { part_paid?: boolean; merged?: boolean }[]
}

const props = defineProps<{ tables: PlanTable[]; selected?: string | null }>()
const emit = defineEmits<{ (e: 'select', t: PlanTable): void }>()

interface Chair { x: number; y: number; w: number; h: number; filled: boolean }

// Small tables (<= 4) get a chair per side; larger ones are wide, chairs along the two long edges.
function layout(t: PlanTable) {
  const seats = Math.max(1, t.seats)
  const wide = seats > 4
  const top = wide ? Math.ceil(seats / 2) : 0
  const bottom = wide ? Math.floor(seats / 2) : 0
  const W = wide ? Math.max(150, top * 38 + 24) : 84
  const H = 76
  const chairs: Chair[] = []
  const fill = t.status === 'Reserved' ? seats : t.status === 'Occupied' ? Math.min(t.guests || 1, seats) : 0
  let n = 0
  const push = (c: Omit<Chair, 'filled'>) => chairs.push({ ...c, filled: n++ < fill })
  if (wide) {
    for (let i = 0; i < top; i++) push({ x: 12 + (i * (W - 24 - 22)) / Math.max(1, top - 1) + (top === 1 ? (W - 46) / 2 : 0), y: -14, w: 22, h: 12 })
    for (let i = 0; i < bottom; i++) push({ x: 12 + (i * (W - 24 - 22)) / Math.max(1, bottom - 1) + (bottom === 1 ? (W - 46) / 2 : 0), y: H + 2, w: 22, h: 12 })
  } else {
    const sides: Omit<Chair, 'filled'>[] = [
      { x: -14, y: H / 2 - 11, w: 12, h: 22 },
      { x: W + 2, y: H / 2 - 11, w: 12, h: 22 },
      { x: W / 2 - 11, y: -14, w: 22, h: 12 },
      { x: W / 2 - 11, y: H + 2, w: 22, h: 12 },
    ]
    sides.slice(0, Math.min(4, seats)).forEach(push)
  }
  return { W, H, chairs }
}

const drawn = computed(() => props.tables.map((t) => ({ t, ...layout(t) })))
</script>

<template>
  <div class="plan">
    <button v-for="d in drawn" :key="d.t.name" class="plan-item" :class="{ sel: selected === d.t.name }" :disabled="d.t.status === 'Disabled'" @click="emit('select', d.t)">
      <div class="plan-box" :style="{ width: d.W + 'px', height: d.H + 'px' }">
        <span v-for="(c, i) in d.chairs" :key="i" class="chair" :class="[d.t.status, { filled: c.filled }]" :style="{ left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' }" />
        <div class="plan-table" :class="d.t.status">
          <div class="pn">{{ d.t.name }}</div>
          <div class="pg">👥 {{ d.t.status === 'Available' ? 0 : d.t.guests }}</div>
        </div>
      </div>
      <div v-if="d.t.orders?.some((o) => o.part_paid)" class="pill warn" style="margin-top: 20px">part paid</div>
    </button>
  </div>
</template>
