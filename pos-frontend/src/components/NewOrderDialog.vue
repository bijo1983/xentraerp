<script setup lang="ts">
// Every order starts with one question: dine in or take away?
//   Dine in   -> pick a table (already chosen if you tapped one) and the number of guests.
//   Take away -> no table; the order gets a token number. Name and phone are optional.
import { ref, computed } from 'vue'

interface TableChoice { name: string; seats: number; status: string; zone: string }
const props = defineProps<{ tables: TableChoice[]; presetTable?: string | null; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{
  (e: 'dine', table: string, guests: number): void
  (e: 'takeaway', name: string, phone: string): void
  (e: 'cancel'): void
}>()

const step = ref<'type' | 'dine' | 'take'>('type')
const table = ref<string>(props.presetTable || '')
const guests = ref('2')
const guest = ref('')
const phone = ref('')
const free = computed(() => props.tables.filter((t) => t.status === 'Available' || t.status === 'Reserved'))

function chooseDine() {
  step.value = 'dine'
  const t = props.tables.find((x) => x.name === table.value)
  guests.value = String(Math.min(2, t?.seats || 2))
}
</script>

<template>
  <div class="modal-back" @click.self="emit('cancel')">
    <div class="modal" style="width: 520px">
      <template v-if="step === 'type'">
        <h3 style="margin: 0 0 14px">New order</h3>
        <div class="type-tiles">
          <button class="type-tile" @click="chooseDine"><span class="ic">🍽️</span><b>Dine in</b><span class="sub2">{{ presetTable ? `Table ${presetTable}` : 'Pick a table' }}</span></button>
          <button class="type-tile" @click="step = 'take'"><span class="ic">🥡</span><b>Take away</b><span class="sub2">No table · gets a token</span></button>
        </div>
      </template>

      <template v-else-if="step === 'dine'">
        <h3 style="margin: 0 0 10px">Dine in</h3>
        <p class="sub2" style="margin: 0 0 6px">Table</p>
        <div class="row" style="margin-bottom: 12px">
          <button v-for="t in free" :key="t.name" class="cat-chip" :class="{ active: table === t.name }" @click="table = t.name">{{ t.name }} <small>· {{ t.seats }}</small></button>
          <span v-if="!free.length" style="color: var(--text-muted)">No free tables right now.</span>
        </div>
        <label class="sub2">Guests</label>
        <input v-model="guests" class="fld tabular" style="width: 100%; margin: 6px 0 14px" type="number" min="1" inputmode="numeric" />
        <p v-if="error" class="error-box">{{ error }}</p>
        <div class="row">
          <button class="btn btn-ghost" @click="step = 'type'">Back</button>
          <button class="btn btn-primary" style="flex: 1" :disabled="busy || !table" @click="emit('dine', table, Number(guests) || 1)">Open table</button>
        </div>
      </template>

      <template v-else>
        <h3 style="margin: 0 0 10px">Take away</h3>
        <input v-model="guest" class="fld" style="width: 100%; margin-bottom: 8px" placeholder="Customer name (optional)" />
        <input v-model="phone" class="fld" style="width: 100%; margin-bottom: 14px" placeholder="Phone (optional)" inputmode="tel" />
        <p v-if="error" class="error-box">{{ error }}</p>
        <div class="row">
          <button class="btn btn-ghost" @click="step = 'type'">Back</button>
          <button class="btn btn-primary" style="flex: 1" :disabled="busy" @click="emit('takeaway', guest, phone)">Start take-away order</button>
        </div>
      </template>
    </div>
  </div>
</template>
