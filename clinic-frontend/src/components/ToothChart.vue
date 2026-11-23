<script setup lang="ts">
import { computed, ref } from 'vue'
import { CONDITION_TONE, PERMANENT_LOWER, PERMANENT_UPPER, PRIMARY_LOWER, PRIMARY_UPPER } from '@/lib/fdi'

const props = defineProps<{ modelValue: Record<string, string> | undefined; conditions: string[]; readonly?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, string>): void }>()
const ABBR: Record<string, string> = { Caries: 'C', Filled: 'F', Crown: 'Cr', Missing: 'M', 'Root canal': 'RC', Implant: 'Im', Bridge: 'Br', Fractured: 'Fx', 'Extraction planned': 'Ex', Impacted: 'Ip' }
const dentition = ref<'permanent' | 'primary'>('permanent')
const brush = ref(props.conditions[1] || 'Caries')
const rows = computed(() => (dentition.value === 'permanent' ? [PERMANENT_UPPER, PERMANENT_LOWER] : [PRIMARY_UPPER, PRIMARY_LOWER]))
const value = computed(() => props.modelValue || {})
const summary = computed(() => Object.entries(value.value).filter(([, c]) => c && c !== 'Sound').sort(([a], [b]) => Number(a) - Number(b)))

function paint(tooth: number) {
  if (props.readonly) return
  const next = { ...value.value }
  if (next[tooth] === brush.value || brush.value === 'Sound') delete next[tooth]
  else next[tooth] = brush.value
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="tc">
    <div class="row">
      <button type="button" class="chip" :class="{ on: dentition === 'permanent' }" @click="dentition = 'permanent'">Permanent</button>
      <button type="button" class="chip" :class="{ on: dentition === 'primary' }" @click="dentition = 'primary'">Primary (deciduous)</button>
    </div>
    <div v-if="!readonly" class="row tc__palette" role="radiogroup" aria-label="Condition to mark">
      <button v-for="c in conditions" :key="c" type="button" role="radio" :aria-checked="brush === c" class="chip" :class="[{ on: brush === c }, `tone-${CONDITION_TONE[c] || 'info'}`]" @click="brush = c">{{ c }}</button>
    </div>
    <div class="tc__mouth">
      <div v-for="(row, ri) in rows" :key="ri" class="tc__row">
        <button
          v-for="t in row"
          :key="t"
          type="button"
          class="tooth"
          :class="[`tone-${CONDITION_TONE[value[t]] || 'sound'}`, { mid: row.indexOf(t) === row.length / 2 - 1 }]"
          :title="`${t}${value[t] ? ': ' + value[t] : ''}`"
          :aria-label="`Tooth ${t}${value[t] ? ', ' + value[t] : ''}`"
          @click="paint(t)"
        >
          <span class="tooth__n">{{ t }}</span>
          <span class="tooth__c">{{ value[t] ? ABBR[value[t]] || value[t].slice(0, 2) : '' }}</span>
        </button>
      </div>
    </div>
    <div v-if="summary.length" class="small"><strong>Findings:</strong> {{ summary.map(([t, c]) => `${t} ${c}`).join(' · ') }}</div>
    <div v-else class="small muted">{{ readonly ? 'No findings.' : 'Choose a condition, then tap teeth to mark them. Tap again to clear.' }}</div>
  </div>
</template>

<style scoped>
.tc { display: flex; flex-direction: column; gap: 12px; }
.tc__mouth { display: flex; flex-direction: column; gap: 10px; padding: 14px; background: var(--x-surface-2); border-radius: var(--x-radius-lg); overflow-x: auto; }
.tc__row { display: flex; gap: 4px; justify-content: center; }
.tc__row:first-child { border-bottom: 1px dashed var(--x-border-strong); padding-bottom: 10px; }
.tooth { width: 40px; height: 52px; flex: none; border-radius: 10px 10px 14px 14px; border: 1.5px solid var(--x-border-strong); background: var(--x-surface); font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--x-text); }
.tooth.mid { margin-inline-end: 12px; }
.tooth__n { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
.tooth__c { font-size: 9.5px; font-weight: 600; }
.tone-danger { background: var(--x-danger-soft); border-color: var(--x-danger); color: var(--x-danger-text); }
.tone-info { background: var(--x-info-soft); border-color: var(--x-info); color: var(--x-info-text); }
.tone-primary { background: var(--x-accent-soft); border-color: var(--x-accent); color: var(--x-accent-text); }
.tone-warning { background: var(--x-warning-soft); border-color: var(--x-warning); color: var(--x-warning-text); }
.tone-muted { background: var(--x-surface-3); border-style: dashed; color: var(--x-text-faint); }
.chip.tone-sound.on, .chip.on { outline: 2px solid currentColor; outline-offset: 1px; }
</style>
