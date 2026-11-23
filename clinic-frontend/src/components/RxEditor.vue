<script setup lang="ts">
// Prescription editor: search the generic-name catalogue (plus brands the clinic has used),
// then set strength, dose, frequency, duration and an optional brand per line. Quantity is
// worked out from dose x frequency x days for tablets/capsules. Anything not in the catalogue
// can be typed as-is. Warns on a possible allergy match or the same medicine twice.
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Pill, Plus, Trash2 } from 'lucide-vue-next'
import { flow } from '@/lib/api'
import { allergyHit, dispenseQty } from '@/lib/flow'
import type { Medicine, RxItem } from '@/lib/types'

type Line = RxItem & { _brands?: string[]; _strengths?: string[] }

const props = defineProps<{ modelValue: Line[]; allergies?: string; disabled?: boolean; frequencies: { code: string; label: string; per_day: number | null }[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Line[]): void; (e: 'change'): void }>()

const q = ref('')
const hits = ref<Medicine[]>([])
const searching = ref(false)
const hi = ref(0)
let timer: number | undefined

const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Cream', 'Ointment', 'Gel', 'Drops', 'Inhaler', 'Sachet', 'Spray', 'Suppository', 'Lozenge', 'Patch', 'Other']
const ROUTES = ['Oral', 'Topical', 'Sublingual', 'Inhaled', 'Nasal', 'Ophthalmic', 'Otic', 'IM', 'IV', 'SC', 'Rectal', 'Vaginal']
const DURATIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '1 month']
const INSTRUCTIONS = ['After food', 'Before food', 'With food', 'At bedtime', 'If needed for pain', 'Complete the course']

watch(q, (v) => {
  window.clearTimeout(timer)
  hi.value = 0
  if (v.trim().length < 2) {
    hits.value = []
    return
  }
  timer = window.setTimeout(async () => {
    searching.value = true
    hits.value = await flow<Medicine[]>('search_medicines', { query: v, limit: 12 }).catch(() => [])
    searching.value = false
  }, 200)
})

const lines = computed(() => props.modelValue)
function perDay(code?: string) {
  return props.frequencies.find((f) => f.code === code)?.per_day ?? null
}
function update(next: Line[]) {
  emit('update:modelValue', next)
  emit('change')
}
function recalc(l: Line) {
  const auto = dispenseQty(l.dose, perDay(l.frequency), l.duration, l.dosage_form)
  if (auto) l.quantity = auto
}
function pick(m: Medicine) {
  const l: Line = {
    medicine: m.generic, dosage_form: m.form, strength: m.strengths[0] || '', route: m.route || 'Oral', dose: m.dose || '1',
    frequency: m.frequency || 'TDS', duration: '5 days', quantity: '', brand: '', instructions: '', _brands: m.brands, _strengths: m.strengths,
  }
  recalc(l)
  update([...lines.value, l])
  q.value = ''
  hits.value = []
}
function addTyped() {
  const name = q.value.trim()
  if (!name) return
  const l: Line = { medicine: name, dosage_form: 'Tablet', strength: '', route: 'Oral', dose: '1', frequency: 'TDS', duration: '5 days', quantity: '', brand: '', instructions: '' }
  recalc(l)
  update([...lines.value, l])
  q.value = ''
  hits.value = []
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    hi.value = Math.min(hi.value + 1, hits.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    hi.value = Math.max(hi.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (hits.value[hi.value]) pick(hits.value[hi.value])
    else addTyped()
  } else if (e.key === 'Escape') hits.value = []
}
function set(i: number, key: keyof Line, v: string) {
  const next = lines.value.map((x) => ({ ...x }))
  ;(next[i] as Record<string, unknown>)[key] = v
  if (['dose', 'frequency', 'duration', 'dosage_form'].includes(key as string)) recalc(next[i])
  update(next)
}
function addInstruction(i: number, text: string) {
  const cur = lines.value[i].instructions || ''
  if (cur.includes(text)) return
  set(i, 'instructions', cur ? `${cur}; ${text}` : text)
}
function remove(i: number) {
  update(lines.value.filter((_, j) => j !== i))
}
function warnings(l: Line, i: number): string[] {
  const out: string[] = []
  const a = allergyHit(props.allergies, l.medicine)
  if (a) out.push(`Patient allergy: ${a}`)
  if (lines.value.some((x, j) => j !== i && x.medicine.trim().toLowerCase() === l.medicine.trim().toLowerCase())) out.push('Prescribed twice')
  return out
}
</script>

<template>
  <div class="rx">
    <div v-if="!disabled" class="rx__search">
      <Pill :size="16" class="rx__icon" aria-hidden="true" />
      <input
        v-model="q"
        class="ctl"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="!!hits.length"
        aria-label="Add a medicine by generic or brand name"
        placeholder="Add medicine — type a generic or brand name (e.g. amoxicillin, paracetamol)…"
        @keydown="onKey"
      />
      <ul v-if="hits.length || (q.trim().length >= 2 && !searching)" class="hits" role="listbox">
        <li v-for="(m, i) in hits" :key="m.generic + m.form">
          <button type="button" role="option" :aria-selected="i === hi" :class="{ on: i === hi }" @mouseenter="hi = i" @click="pick(m)">
            <strong>{{ m.generic }}</strong> <span class="muted">{{ m.form }} · {{ m.strengths.join(', ') }}</span>
            <span v-if="m.brands.length" class="small faint"> — {{ m.brands.slice(0, 3).join(', ') }}</span>
            <span v-if="allergyHit(allergies, m.generic)" class="warn-tag">allergy</span>
          </button>
        </li>
        <li><button type="button" class="typed" @click="addTyped"><Plus :size="14" /> Add “{{ q.trim() }}” as typed</button></li>
      </ul>
    </div>

    <p v-if="!lines.length" class="muted small empty">No medicines yet. Search by generic name; the brand is optional.</p>
    <ol v-else class="lines">
      <li v-for="(l, i) in lines" :key="i" class="line" :class="{ warn: warnings(l, i).length }">
        <div class="line__top">
          <span class="num tabular">{{ i + 1 }}</span>
          <input class="gen" :value="l.medicine" :disabled="disabled" aria-label="Generic name" @input="set(i, 'medicine', ($event.target as HTMLInputElement).value)" />
          <input class="str" :value="l.strength" :disabled="disabled" :list="`str-${i}`" placeholder="Strength" aria-label="Strength" @input="set(i, 'strength', ($event.target as HTMLInputElement).value)" />
          <datalist :id="`str-${i}`"><option v-for="s in l._strengths || []" :key="s" :value="s" /></datalist>
          <select :value="l.dosage_form" :disabled="disabled" aria-label="Form" @change="set(i, 'dosage_form', ($event.target as HTMLSelectElement).value)"><option v-for="f in FORMS" :key="f">{{ f }}</option></select>
          <button v-if="!disabled" type="button" class="icon-btn" :aria-label="`Remove ${l.medicine}`" @click="remove(i)"><Trash2 :size="15" /></button>
        </div>
        <div class="line__grid">
          <label><span>Dose</span><input :value="l.dose" :disabled="disabled" placeholder="1 tab / 5 ml" @input="set(i, 'dose', ($event.target as HTMLInputElement).value)" /></label>
          <label><span>Frequency</span>
            <select :value="l.frequency" :disabled="disabled" @change="set(i, 'frequency', ($event.target as HTMLSelectElement).value)">
              <option v-if="l.frequency && !frequencies.some((f) => f.code === l.frequency)" :value="l.frequency">{{ l.frequency }}</option>
              <option v-for="f in frequencies" :key="f.code" :value="f.code">{{ f.code }} — {{ f.label }}</option>
            </select>
          </label>
          <label><span>Duration</span><input :value="l.duration" :disabled="disabled" list="rx-dur" placeholder="5 days" @input="set(i, 'duration', ($event.target as HTMLInputElement).value)" /></label>
          <label><span>Route</span><select :value="l.route" :disabled="disabled" @change="set(i, 'route', ($event.target as HTMLSelectElement).value)"><option v-for="r in ROUTES" :key="r">{{ r }}</option></select></label>
          <label><span>Qty</span><input :value="l.quantity" :disabled="disabled" class="tabular" @input="set(i, 'quantity', ($event.target as HTMLInputElement).value)" /></label>
          <label class="brand"><span>Brand <em class="faint">(optional)</em></span><input :value="l.brand" :disabled="disabled" :list="`br-${i}`" placeholder="Generic — any brand" @input="set(i, 'brand', ($event.target as HTMLInputElement).value)" /></label>
          <datalist :id="`br-${i}`"><option v-for="b in l._brands || []" :key="b" :value="b" /></datalist>
        </div>
        <div class="line__ins">
          <input :value="l.instructions" :disabled="disabled" placeholder="Instructions to patient" aria-label="Instructions" @input="set(i, 'instructions', ($event.target as HTMLInputElement).value)" />
          <template v-if="!disabled"><button v-for="t in INSTRUCTIONS" :key="t" type="button" class="mini" @click="addInstruction(i, t)">{{ t }}</button></template>
        </div>
        <div v-for="w in warnings(l, i)" :key="w" class="alert-strip"><AlertTriangle :size="14" /> {{ w }}</div>
      </li>
    </ol>
    <datalist id="rx-dur"><option v-for="d in DURATIONS" :key="d" :value="d" /></datalist>
  </div>
</template>

<style scoped>
.rx { display: flex; flex-direction: column; gap: 12px; }
.rx__search { position: relative; }
.rx__search .ctl { padding-inline-start: 36px; }
.rx__icon { position: absolute; inset-inline-start: 12px; top: 12px; color: var(--x-text-faint); }
.hits { list-style: none; margin: 4px 0 0; padding: 4px; border: 1px solid var(--x-border); border-radius: var(--x-radius-md); background: var(--x-surface); box-shadow: var(--x-shadow-md); position: absolute; inset-inline: 0; z-index: 6; max-height: 320px; overflow: auto; }
.hits button { width: 100%; text-align: start; border: 0; background: none; font: inherit; color: var(--x-text); padding: 8px 10px; border-radius: 8px; cursor: pointer; }
.hits button.on, .hits button:hover { background: var(--x-primary-soft); }
.hits .typed { color: var(--x-primary-text); display: flex; align-items: center; gap: 6px; font-weight: 600; }
.warn-tag { margin-inline-start: 6px; background: var(--x-danger-soft); color: var(--x-danger-text); border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 700; }
.empty { margin: 0; }
.lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.line { border: 1px solid var(--x-border); border-radius: var(--x-radius-md); padding: 12px; display: flex; flex-direction: column; gap: 10px; background: var(--x-surface); }
.line.warn { border-color: var(--x-danger); }
.line__top { display: flex; align-items: center; gap: 8px; }
.num { width: 24px; height: 24px; border-radius: 50%; background: var(--x-primary-soft); color: var(--x-primary-text); display: grid; place-items: center; font-size: 12px; font-weight: 700; flex: none; }
.line input, .line select { font: inherit; color: var(--x-text); background: var(--x-surface); border: 1px solid var(--x-border); border-radius: 8px; min-height: 36px; padding: 6px 10px; width: 100%; min-width: 0; }
.line input:focus, .line select:focus { outline: none; border-color: var(--x-primary); box-shadow: var(--x-focus-ring); }
.line input:disabled, .line select:disabled { background: var(--x-surface-2); }
.gen { flex: 2; font-weight: 700 !important; }
.str { flex: 1; }
.line__top select { flex: 1; }
.line__grid { display: grid; grid-template-columns: 1fr 1.6fr 1fr 1fr 0.7fr 1.6fr; gap: 8px; }
.line__grid label { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; font-weight: 600; color: var(--x-text-muted); }
.line__grid em { font-style: normal; font-weight: 500; }
.line__ins { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.line__ins input { flex: 1 1 220px; }
.mini { border: 1px dashed var(--x-border-strong); background: none; border-radius: 999px; padding: 3px 9px; font: inherit; font-size: 11.5px; color: var(--x-text-muted); cursor: pointer; }
.mini:hover { color: var(--x-primary-text); border-color: var(--x-primary); }
.icon-btn { border: 0; background: none; color: var(--x-text-muted); cursor: pointer; width: 32px; height: 32px; border-radius: 8px; flex: none; display: grid; place-items: center; }
.icon-btn:hover { background: var(--x-danger-soft); color: var(--x-danger-text); }
@media (max-width: 760px) { .line__grid { grid-template-columns: 1fr 1fr; } .line__top { flex-wrap: wrap; } }
</style>
