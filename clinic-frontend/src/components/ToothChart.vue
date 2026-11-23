<script setup lang="ts">
// Odontogram drawn as real teeth (crown + roots, buccal view) with a five-surface occlusal map under each tooth.
// Value: { "16": "Crown", "26:MO"... } — a plain tooth number holds a whole-tooth condition, "<tooth>:<surface>" a
// surface condition (M, D, B, L, O / I). The whole drawing is one SVG with a viewBox, so it scales with the screen.
import { computed, ref } from 'vue'
import { Minus, Plus, Maximize2 } from 'lucide-vue-next'
import { CONDITION_TONE, PERMANENT_LOWER, PERMANENT_UPPER, PRIMARY_LOWER, PRIMARY_UPPER } from '@/lib/fdi'
import { H, NECK, SURFACE_NAME, crownPath, roots, surfaces, toothInfo, toothWidth } from '@/lib/toothShape'

const props = defineProps<{ modelValue: Record<string, string> | undefined; conditions: string[]; readonly?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, string>): void }>()

/** Conditions that can sit on a single surface; every other condition applies to the whole tooth. */
const SURFACE_CONDITIONS = ['Caries', 'Filled', 'Fractured']
const ZOOMS = [1, 1.5, 2, 3]
const GAP = 4
const MID = 14
const PAD = 14
const Y_UP = 18
const Y_OCC_UP = 126
const Y_MIDLINE = 164
const Y_OCC_LO = 174
const Y_LO = 212

const dentition = ref<'permanent' | 'primary'>('permanent')
const brush = ref(props.conditions[1] || 'Caries')
const zoom = ref(0)
const value = computed(() => props.modelValue || {})

function rowWidth(row: number[]) {
  return row.reduce((a, t) => a + toothWidth(t), 0) + GAP * (row.length - 1) + MID
}

const rows = computed(() => (dentition.value === 'permanent' ? [PERMANENT_UPPER, PERMANENT_LOWER] : [PRIMARY_UPPER, PRIMARY_LOWER]))
const width = computed(() => Math.max(...rows.value.map(rowWidth)) + PAD * 2)
const height = Y_LO + H + 26

const teeth = computed(() =>
  rows.value.flatMap((row, ri) => {
    let x = (width.value - rowWidth(row)) / 2
    return row.map((t, i) => {
      const w = toothWidth(t)
      const info = toothInfo(t)
      const s = Math.max(16, Math.min(28, w * 0.8))
      const sx = x + (w - s) / 2
      const sy = ri === 0 ? Y_OCC_UP : Y_OCC_LO
      const item = {
        t,
        x,
        w,
        info,
        upper: ri === 0,
        crown: crownPath(t),
        roots: roots(t),
        cond: value.value[String(t)] || '',
        surfaces: surfaces(t, sx, sy, s).map((sf) => ({ ...sf, cond: value.value[`${t}:${sf.code}`] || '' })),
        transform: ri === 0 ? `translate(${x} ${Y_UP})` : `translate(${x} ${Y_LO + H}) scale(1 -1)`,
        labelY: ri === 0 ? 11 : Y_LO + H + 18,
      }
      x += w + GAP + (i === row.length / 2 - 1 ? MID : 0)
      return item
    })
  }),
)

const summary = computed(() => {
  const by: Record<string, { whole?: string; surf: Record<string, string[]> }> = {}
  for (const [k, c] of Object.entries(value.value)) {
    if (!c || c === 'Sound') continue
    const [t, s] = k.split(':')
    by[t] ||= { surf: {} }
    if (s) (by[t].surf[c] ||= []).push(s)
    else by[t].whole = c
  }
  return Object.entries(by)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([t, v]) => {
      const parts = Object.entries(v.surf).map(([c, ss]) => `${c} ${order(ss).join('')}`)
      if (v.whole) parts.unshift(v.whole)
      return `${t} ${parts.join(', ')}`
    })
})

function order(ss: string[]) {
  return [...ss].sort((a, b) => 'MODIBL'.indexOf(a) - 'MODIBL'.indexOf(b))
}

function tone(c: string) {
  return c ? CONDITION_TONE[c] || 'info' : 'sound'
}

function paint(tooth: number) {
  if (props.readonly) return
  const next = { ...value.value }
  const k = String(tooth)
  if (next[k] === brush.value || brush.value === 'Sound') {
    delete next[k]
    if (brush.value === 'Sound') for (const key of Object.keys(next)) if (key.startsWith(`${tooth}:`)) delete next[key]
  } else next[k] = brush.value
  emit('update:modelValue', next)
}

function paintSurface(tooth: number, code: string) {
  if (props.readonly) return
  if (brush.value !== 'Sound' && !SURFACE_CONDITIONS.includes(brush.value)) return paint(tooth)
  const next = { ...value.value }
  const k = `${tooth}:${code}`
  if (next[k] === brush.value || brush.value === 'Sound') delete next[k]
  else next[k] = brush.value
  emit('update:modelValue', next)
}

function label(t: number, cond: string) {
  const surf = Object.entries(value.value)
    .filter(([k, c]) => k.startsWith(`${t}:`) && c)
    .map(([k, c]) => `${c} ${SURFACE_NAME[k.split(':')[1]]}`)
  return [`Tooth ${t}`, cond, ...surf].filter(Boolean).join(', ')
}

const svgStyle = computed(() => (zoom.value ? { width: `${ZOOMS[zoom.value] * 100}%` } : { width: '100%' }))
</script>

<template>
  <div class="tc">
    <div class="row tc__bar">
      <button type="button" class="chip" :class="{ on: dentition === 'permanent' }" @click="dentition = 'permanent'">Permanent</button>
      <button type="button" class="chip" :class="{ on: dentition === 'primary' }" @click="dentition = 'primary'">Primary (deciduous)</button>
      <span class="tc__zoom">
        <button type="button" class="icon" aria-label="Zoom out" :disabled="zoom === 0" @click="zoom--"><Minus :size="15" /></button>
        <button type="button" class="icon" aria-label="Fit to screen" :disabled="zoom === 0" @click="zoom = 0"><Maximize2 :size="14" /></button>
        <button type="button" class="icon" aria-label="Zoom in" :disabled="zoom === ZOOMS.length - 1" @click="zoom++"><Plus :size="15" /></button>
      </span>
    </div>
    <div v-if="!readonly" class="row tc__palette" role="radiogroup" aria-label="Condition to mark">
      <button v-for="c in conditions" :key="c" type="button" role="radio" :aria-checked="brush === c" class="chip" :class="[{ on: brush === c }, `tone-${CONDITION_TONE[c] || 'info'}`]" @click="brush = c">
        {{ c }}<span v-if="SURFACE_CONDITIONS.includes(c)" class="faint"> · surface</span>
      </button>
    </div>
    <div class="tc__mouth">
      <svg :viewBox="`0 0 ${width} ${height}`" :style="svgStyle" class="tc__svg" role="group" aria-label="Odontogram">
        <line :x1="PAD" :x2="width - PAD" :y1="Y_MIDLINE" :y2="Y_MIDLINE" class="midline" />
        <line :x1="width / 2" :x2="width / 2" :y1="4" :y2="height - 4" class="midline" />
        <text :x="PAD" :y="Y_MIDLINE - 4" class="side">R</text>
        <text :x="width - PAD" :y="Y_MIDLINE - 4" class="side" text-anchor="end">L</text>
        <g v-for="tt in teeth" :key="tt.t" class="tooth" :class="[`c-${tone(tt.cond)}`, { readonly }]">
          <text :x="tt.x + tt.w / 2" :y="tt.labelY" class="num" text-anchor="middle">{{ tt.t }}</text>
          <g
            :transform="tt.transform"
            role="button"
            :tabindex="readonly ? -1 : 0"
            :aria-label="label(tt.t, tt.cond)"
            class="fig"
            :class="{ missing: tt.cond === 'Missing', impacted: tt.cond === 'Impacted' }"
            @click="paint(tt.t)"
            @keydown.enter.prevent="paint(tt.t)"
            @keydown.space.prevent="paint(tt.t)"
          >
            <title>{{ label(tt.t, tt.cond) }}</title>
            <g :transform="tt.cond === 'Impacted' ? `rotate(${tt.upper ? 18 : -18} ${tt.w / 2} 70)` : undefined">
              <rect x="-2" y="0" :width="tt.w + 4" :height="H" fill="transparent" />
              <template v-if="tt.cond === 'Implant'">
                <rect :x="tt.w / 2 - 5" y="12" width="10" :height="NECK - 10" rx="3" class="implant" />
                <line v-for="k in 6" :key="k" :x1="tt.w / 2 - 6" :x2="tt.w / 2 + 6" :y1="14 + k * 6.5" :y2="17 + k * 6.5" class="thread" />
              </template>
              <template v-else>
                <path v-for="(r, i) in tt.roots" :key="i" :d="r.path" class="root" :class="{ back: r.back, rct: tt.cond === 'Root canal' }" />
                <template v-if="tt.cond === 'Root canal'"><path v-for="(r, i) in tt.roots" :key="'c' + i" :d="r.canal" class="canal" /></template>
              </template>
              <path :d="tt.crown" class="crown" />
              <circle v-if="tt.cond === 'Caries'" :cx="tt.w / 2" :cy="84" :r="Math.min(6, tt.w / 5)" class="caries" />
              <rect v-if="tt.cond === 'Filled'" :x="tt.w * 0.25" y="76" :width="tt.w * 0.5" height="14" rx="4" class="filling" />
              <polyline v-if="tt.cond === 'Fractured'" :points="`2,72 ${tt.w * 0.3},80 ${tt.w * 0.5},70 ${tt.w * 0.7},82 ${tt.w - 2},74`" class="fracture" />
              <line v-if="tt.cond === 'Bridge'" :x1="-GAP / 2 - 1" :x2="tt.w + GAP / 2 + 1" y1="74" y2="74" class="bridge" />
              <g v-if="tt.cond === 'Missing'" class="cross"><line x1="2" y1="8" :x2="tt.w - 2" :y2="H - 2" /><line :x1="tt.w - 2" y1="8" x2="2" :y2="H - 2" /></g>
              <line v-if="tt.cond === 'Extraction planned'" :x1="tt.w / 2" y1="2" :x2="tt.w / 2" :y2="H - 2" class="extract" />
            </g>
          </g>
          <g class="occ" :class="{ missing: tt.cond === 'Missing' }">
            <polygon
              v-for="sf in tt.surfaces"
              :key="sf.code"
              :points="sf.points"
              class="surf"
              :class="`c-${sf.cond ? tone(sf.cond) : 'none'}`"
              @click="paintSurface(tt.t, sf.code)"
            >
              <title>{{ `${tt.t} ${SURFACE_NAME[sf.code]}${sf.cond ? ': ' + sf.cond : ''}` }}</title>
            </polygon>
          </g>
        </g>
      </svg>
    </div>
    <div v-if="summary.length" class="small"><strong>Findings:</strong> {{ summary.join(' · ') }}</div>
    <div v-else class="small muted">{{ readonly ? 'No findings.' : 'Choose a condition, then tap a tooth (whole tooth) or one of its surfaces in the small square. Tap again to clear.' }}</div>
  </div>
</template>

<style scoped>
.tc { display: flex; flex-direction: column; gap: 12px; min-width: 0; max-width: 100%; }
.tc__bar { align-items: center; }
.tc__zoom { margin-inline-start: auto; display: inline-flex; gap: 2px; border: 1px solid var(--x-border); border-radius: 10px; padding: 2px; }
.icon { width: 32px; height: 30px; border: 0; background: none; border-radius: 8px; color: var(--x-text-muted); cursor: pointer; display: grid; place-items: center; }
.icon:hover:not(:disabled) { background: var(--x-surface-2); color: var(--x-text); }
.icon:disabled { opacity: 0.35; cursor: default; }
.tc__mouth { padding: 10px; background: var(--x-surface-2); border-radius: var(--x-radius-lg); overflow: auto; }
.tc__svg { display: block; height: auto; min-width: 520px; user-select: none; }
.midline { stroke: var(--x-border-strong); stroke-dasharray: 3 4; stroke-width: 1; }
.side { font-size: 9px; font-weight: 700; fill: var(--x-text-faint); }
.num { font-size: 9.5px; font-weight: 700; fill: var(--x-text-muted); font-variant-numeric: tabular-nums; }
.fig { cursor: pointer; outline: none; }
.readonly .fig, .readonly .surf { cursor: default; }
.crown { fill: #fbf6ea; stroke: #a99c82; stroke-width: 1.1; }
.root { fill: #f0e4c9; stroke: #a99c82; stroke-width: 1; }
.root.back { fill: #e3d5b4; }
.fig:hover .crown, .fig:focus-visible .crown { stroke: var(--x-primary); stroke-width: 2; }
.fig:focus-visible .root { stroke: var(--x-primary); }
.c-danger .crown { fill: #fde3e1; }
.c-info .crown { fill: #e5effd; }
.c-primary .crown { fill: #f0d98c; stroke: #a9852a; }
.c-warning .crown { fill: #fdf0dc; }
.root.rct { fill: #fde7c8; }
.canal { fill: none; stroke: #d97706; stroke-width: 2.6; stroke-linecap: round; }
.caries { fill: #7a2e1f; }
.filling { fill: #3b82f6; stroke: #1d4ed8; stroke-width: 1; }
.fracture { fill: none; stroke: #dc2626; stroke-width: 2; stroke-linejoin: round; }
.bridge { stroke: #a9852a; stroke-width: 4; stroke-linecap: round; }
.implant { fill: #aab3bd; stroke: #69737e; stroke-width: 1; }
.thread { stroke: #69737e; stroke-width: 1.2; }
.cross line { stroke: var(--x-text-muted); stroke-width: 2; stroke-linecap: round; }
.missing .crown, .missing .root { opacity: 0.28; stroke-dasharray: 3 2; }
.missing.occ { opacity: 0.3; }
.impacted .crown, .impacted .root { stroke-dasharray: 3 2; }
.extract { stroke: #dc2626; stroke-width: 3; stroke-linecap: round; }
.surf { fill: var(--x-surface); stroke: #a99c82; stroke-width: 0.8; cursor: pointer; }
.surf:hover { fill: var(--x-primary-soft); }
.surf.c-danger { fill: #dc2626; }
.surf.c-info { fill: #3b82f6; }
.surf.c-primary { fill: #d4a72c; }
.surf.c-warning { fill: #f59e0b; }
.tone-danger { background: var(--x-danger-soft); border-color: var(--x-danger); color: var(--x-danger-text); }
.tone-info { background: var(--x-info-soft); border-color: var(--x-info); color: var(--x-info-text); }
.tone-primary { background: var(--x-primary-soft); border-color: var(--x-primary); color: var(--x-primary-text); }
.tone-warning { background: var(--x-warning-soft); border-color: var(--x-warning); color: var(--x-warning-text); }
.tone-muted { background: var(--x-surface-3); border-style: dashed; color: var(--x-text-faint); }
.chip.on { outline: 2px solid currentColor; outline-offset: 1px; }
</style>
