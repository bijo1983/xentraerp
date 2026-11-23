<script setup lang="ts">
// Renders one charting template (definitions from custom_erp.api.clinic_catalog.TEMPLATES).
import { computed } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import { bmi } from '@/lib/format'
import type { ChartTemplate, TemplateField } from '@/lib/types'
import ToothChart from '@/components/ToothChart.vue'

const props = defineProps<{ template: ChartTemplate; modelValue: Record<string, unknown> | undefined; readonly?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, unknown>): void }>()
const data = computed(() => props.modelValue || {})
const computedBmi = computed(() => bmi(data.value.weight, data.value.height))

function set(key: string, v: unknown) {
  emit('update:modelValue', { ...data.value, [key]: v })
}
function rows(key: string): Record<string, unknown>[] {
  return Array.isArray(data.value[key]) ? (data.value[key] as Record<string, unknown>[]) : []
}
function addRow(f: TemplateField) {
  set(f.key, [...rows(f.key), Object.fromEntries((f.columns || []).map((c) => [c.key, '']))])
}
function setCell(key: string, i: number, col: string, v: unknown) {
  const r = rows(key).map((x) => ({ ...x }))
  r[i][col] = v
  set(key, r)
}
function removeRow(key: string, i: number) {
  set(key, rows(key).filter((_, j) => j !== i))
}
function num(v: string): number | '' {
  return v === '' ? '' : Number(v)
}
function wide(f: TemplateField) {
  return ['textarea', 'rows', 'tooth_chart', 'scale'].includes(f.type)
}
</script>

<template>
  <div class="cf">
    <section v-for="s in template.sections" :key="s.label" class="cf__section">
      <h3 class="cf__h">{{ s.label }}</h3>
      <div class="cf__grid">
        <template v-for="f in s.fields" :key="f.key">
          <div class="f" :class="{ wide: wide(f) }">
            <span>{{ f.label }}<span v-if="f.unit" class="unit"> ({{ f.unit }})</span></span>
            <template v-if="readonly && !['tooth_chart', 'rows'].includes(f.type)">
              <div class="ro">{{ f.type === 'check' ? (data[f.key] ? 'Yes' : 'No') : data[f.key] ?? '' }}<span v-if="!data[f.key] && data[f.key] !== 0" class="faint">—</span></div>
            </template>
            <textarea v-else-if="f.type === 'textarea'" :value="String(data[f.key] ?? '')" @input="set(f.key, ($event.target as HTMLTextAreaElement).value)" />
            <input
              v-else-if="f.type === 'number'"
              type="number"
              inputmode="decimal"
              :min="f.min"
              :max="f.max"
              :step="f.step || 1"
              :value="data[f.key] ?? ''"
              @input="set(f.key, num(($event.target as HTMLInputElement).value))"
            />
            <input v-else-if="f.type === 'date'" type="date" :value="data[f.key] ?? ''" @input="set(f.key, ($event.target as HTMLInputElement).value)" />
            <select v-else-if="f.type === 'select'" :value="data[f.key] ?? ''" @change="set(f.key, ($event.target as HTMLSelectElement).value)">
              <option v-for="o in f.options || []" :key="o" :value="o">{{ o }}</option>
            </select>
            <label v-else-if="f.type === 'check'" class="check"><input type="checkbox" :checked="!!data[f.key]" @change="set(f.key, ($event.target as HTMLInputElement).checked ? 1 : 0)" /> Yes</label>
            <div v-else-if="f.type === 'scale'" class="scale" role="radiogroup" :aria-label="f.label">
              <button v-for="n in 11" :key="n" type="button" role="radio" :aria-checked="data[f.key] === n - 1" class="scale__b" :class="{ on: data[f.key] === n - 1, hi: n - 1 >= 7, mid: n - 1 >= 4 && n - 1 < 7 }" @click="set(f.key, data[f.key] === n - 1 ? '' : n - 1)">{{ n - 1 }}</button>
            </div>
            <ToothChart v-else-if="f.type === 'tooth_chart'" :model-value="data[f.key] as Record<string, string>" :conditions="f.conditions || []" :readonly="readonly" @update:model-value="set(f.key, $event)" />
            <div v-else-if="f.type === 'rows'" class="tbl-wrap">
              <table class="tbl">
                <thead><tr><th v-for="c in f.columns" :key="c.key">{{ c.label }}</th><th v-if="!readonly" /></tr></thead>
                <tbody>
                  <tr v-for="(r, i) in rows(f.key)" :key="i">
                    <td v-for="c in f.columns" :key="c.key">
                      <span v-if="readonly">{{ r[c.key] }}</span>
                      <select v-else-if="c.type === 'select'" :value="r[c.key] ?? ''" @change="setCell(f.key, i, c.key, ($event.target as HTMLSelectElement).value)"><option v-for="o in c.options || []" :key="o">{{ o }}</option></select>
                      <input v-else :type="c.type === 'number' ? 'number' : 'text'" :value="r[c.key] ?? ''" @input="setCell(f.key, i, c.key, ($event.target as HTMLInputElement).value)" />
                    </td>
                    <td v-if="!readonly" class="right"><button type="button" class="icon-btn" aria-label="Remove row" @click="removeRow(f.key, i)"><Trash2 :size="15" /></button></td>
                  </tr>
                  <tr v-if="!rows(f.key).length"><td :colspan="(f.columns?.length || 0) + 1" class="faint small">None</td></tr>
                </tbody>
              </table>
              <button v-if="!readonly" type="button" class="chip" style="margin: 8px" @click="addRow(f)"><Plus :size="14" /> Add row</button>
            </div>
            <input v-else type="text" :value="String(data[f.key] ?? '')" @input="set(f.key, ($event.target as HTMLInputElement).value)" />
          </div>
          <div v-if="f.key === 'height' && computedBmi" class="f"><span>BMI</span><div class="ro tabular"><strong>{{ computedBmi }}</strong> <span class="faint small">kg/m²</span></div></div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.cf { display: flex; flex-direction: column; gap: var(--x-space-5); }
.cf__h { font-size: var(--x-text-sm); text-transform: uppercase; letter-spacing: 0.05em; color: var(--x-text-muted); margin-bottom: 10px; }
.cf__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px 14px; }
.wide { grid-column: 1 / -1; }
.ro { min-height: 40px; display: flex; align-items: center; gap: 4px; padding: 8px 0; white-space: pre-wrap; }
.scale { display: flex; gap: 4px; flex-wrap: wrap; }
.scale__b { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--x-border); background: var(--x-surface); font: inherit; font-weight: 700; cursor: pointer; color: var(--x-text); }
.scale__b.on { background: var(--x-success); border-color: var(--x-success); color: #fff; }
.scale__b.on.mid { background: var(--x-warning); border-color: var(--x-warning); }
.scale__b.on.hi { background: var(--x-danger); border-color: var(--x-danger); }
.icon-btn { border: 0; background: none; color: var(--x-text-muted); cursor: pointer; width: 32px; height: 32px; border-radius: 8px; }
.icon-btn:hover { background: var(--x-danger-soft); color: var(--x-danger-text); }
</style>
