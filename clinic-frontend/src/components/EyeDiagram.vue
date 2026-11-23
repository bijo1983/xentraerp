<script setup lang="ts">
// Both eyes drawn as the examiner sees them: right eye (OD) on the left. Each eye has an anterior-segment view
// (lids, conjunctiva, cornea, iris, pupil, lens) and a fundus view (disc with live cup-to-disc ratio, macula,
// vessels, retina). Tap a part to record a finding; abnormal findings are drawn on the picture and outlined.
// The drawing is an SVG with a viewBox, so it scales with the screen.
import { computed, getCurrentInstance, ref } from 'vue'
import { EYE_LABEL, EYE_REGIONS, REGION, eyeSummary, isAbnormal, type EyeSide, type EyeValue } from '@/lib/eye'

const props = defineProps<{ modelValue: EyeValue | undefined; readonly?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: EyeValue): void }>()
const uid = `eye${getCurrentInstance()?.uid ?? 0}`

const value = computed<EyeValue>(() => props.modelValue || {})
const selected = ref<{ side: EyeSide; region: string } | null>(null)
const custom = ref('')
const SIDES: EyeSide[] = ['od', 'os']
const CX = 120
const AY = 64 // anterior view centre
const FY = 238 // fundus centre
const FR = 88

function f(side: EyeSide, region: string) {
  return value.value[side]?.[region] || ''
}
function ab(side: EyeSide, region: string) {
  return isAbnormal(region, f(side, region))
}
function cd(side: EyeSide) {
  return value.value[`${side}_cd`] || 0.3
}
/** +1 when the nose is to the viewer's right (right eye seen from the front), -1 for the left eye. */
function nasal(side: EyeSide) {
  return side === 'od' ? 1 : -1
}

function pick(side: EyeSide, region: string) {
  selected.value = { side, region }
  const cur = f(side, region)
  custom.value = cur && !REGION[region].findings.includes(cur) ? cur : ''
}
function setFinding(finding: string) {
  if (!selected.value || props.readonly) return
  const { side, region } = selected.value
  const eye = { ...(value.value[side] || {}) }
  if (!finding || eye[region] === finding) delete eye[region]
  else eye[region] = finding
  emit('update:modelValue', { ...value.value, [side]: eye })
}
function setCd(side: EyeSide, v: string) {
  emit('update:modelValue', { ...value.value, [`${side}_cd`]: Math.round(Number(v) * 100) / 100 })
}

const summary = computed(() => eyeSummary(value.value))
const selRegion = computed(() => (selected.value ? REGION[selected.value.region] : null))

function lidPath(side: EyeSide) {
  const ptosis = f(side, 'lids') === 'Ptosis'
  return `M 14 ${AY} Q ${CX} ${ptosis ? AY - 34 : AY - 70} 226 ${AY} Q ${CX} ${AY + 64} 14 ${AY} Z`
}
function upperLid(side: EyeSide) {
  const ptosis = f(side, 'lids') === 'Ptosis'
  return `M 14 ${AY} Q ${CX} ${ptosis ? AY - 34 : AY - 70} 226 ${AY}`
}
function lashes(side: EyeSide) {
  const ptosis = f(side, 'lids') === 'Ptosis'
  const cy = ptosis ? AY - 34 : AY - 70
  const out: string[] = []
  for (let i = 1; i < 12; i++) {
    const t = i / 12
    const x = (1 - t) * (1 - t) * 14 + 2 * (1 - t) * t * CX + t * t * 226
    const y = (1 - t) * (1 - t) * AY + 2 * (1 - t) * t * cy + t * t * AY
    out.push(`M ${x.toFixed(1)} ${y.toFixed(1)} l ${((t - 0.5) * 6).toFixed(1)} -7`)
  }
  return out.join(' ')
}
function pupilR(side: EyeSide) {
  const p = f(side, 'pupil')
  return p === 'Fixed dilated' ? 18 : p === 'Miosed' ? 6 : 11
}
function lensFill(side: EyeSide) {
  const l = f(side, 'lens')
  if (l === 'Mature cataract') return '#ecebe2'
  if (/cataract|sclerosis/i.test(l)) return '#b3a98f'
  return '#111418'
}
function discX(side: EyeSide) {
  return CX + nasal(side) * 40
}
function macX(side: EyeSide) {
  return CX - nasal(side) * 34
}
function vessels(side: EyeSide) {
  const n = nasal(side)
  const dx = discX(side)
  const dy = FY - 6
  return [
    `M ${dx} ${dy} Q ${CX - n * 6} ${FY - 86} ${CX - n * 96} ${FY - 22}`,
    `M ${dx} ${dy + 10} Q ${CX - n * 6} ${FY + 90} ${CX - n * 96} ${FY + 26}`,
    `M ${dx} ${dy} Q ${dx + n * 14} ${FY - 40} ${dx + n * 18} ${FY - 84}`,
    `M ${dx} ${dy + 10} Q ${dx + n * 16} ${FY + 44} ${dx + n * 18} ${FY + 88}`,
    `M ${CX - n * 20} ${FY - 52} Q ${macX(side) - n * 6} ${FY - 22} ${macX(side) - n * 2} ${FY - 16}`,
    `M ${CX - n * 20} ${FY + 56} Q ${macX(side) - n * 6} ${FY + 26} ${macX(side) - n * 2} ${FY + 18}`,
  ]
}
const RETINA_DOTS = [[-50, -48], [52, 40], [-58, 30], [30, -60], [-18, 62], [60, -20]]
</script>

<template>
  <div class="ed">
    <div class="ed__eyes">
      <div v-for="side in SIDES" :key="side" class="ed__eye">
        <div class="ed__title">{{ EYE_LABEL[side] }}</div>
        <svg viewBox="0 0 240 336" class="ed__svg" role="group" :aria-label="EYE_LABEL[side]">
          <defs>
            <clipPath :id="`${uid}-${side}-clip`"><path :d="lidPath(side)" /></clipPath>
            <clipPath :id="`${uid}-${side}-fclip`"><circle :cx="CX" :cy="FY" :r="FR - 1" /></clipPath>
            <radialGradient :id="`${uid}-${side}-iris`"><stop offset="0.3" stop-color="#5b3b22" /><stop offset="1" stop-color="#8a6440" /></radialGradient>
            <radialGradient :id="`${uid}-${side}-fundus`"><stop offset="0" stop-color="#f29a6a" /><stop offset="0.75" stop-color="#d9603a" /><stop offset="1" stop-color="#a9381f" /></radialGradient>
          </defs>
          <!-- anterior segment -->
          <text :x="CX" y="8" text-anchor="middle" class="cap">Anterior segment</text>
          <path :d="lidPath(side)" class="skin" />
          <g :clip-path="`url(#${uid}-${side}-clip)`">
            <path :d="lidPath(side)" class="sclera hit" :class="{ inj: ['Injected', 'Discharge', 'Follicles / papillae'].includes(f(side, 'conjunctiva')), ab: ab(side, 'conjunctiva'), sel: selected?.side === side && selected.region === 'conjunctiva' }" @click="pick(side, 'conjunctiva')" />
            <ellipse v-if="f(side, 'conjunctiva') === 'Subconjunctival haemorrhage'" :cx="CX - nasal(side) * 62" :cy="AY + 6" rx="22" ry="14" class="sch" pointer-events="none" />
            <ellipse v-if="f(side, 'conjunctiva') === 'Pinguecula'" :cx="CX + nasal(side) * 48" :cy="AY" rx="8" ry="5" class="ping" pointer-events="none" />
            <polygon v-if="f(side, 'conjunctiva') === 'Pterygium'" :points="`${CX + nasal(side) * 104},${AY - 10} ${CX + nasal(side) * 104},${AY + 10} ${CX + nasal(side) * 22},${AY}`" class="ptery" pointer-events="none" />
            <ellipse :cx="CX + nasal(side) * 100" :cy="AY" rx="8" ry="6" class="caruncle" pointer-events="none" />
            <circle :cx="CX" :cy="AY" r="36" class="cornea hit" :class="{ ab: ab(side, 'cornea'), sel: selected?.side === side && selected.region === 'cornea' }" @click="pick(side, 'cornea')" />
            <circle :cx="CX" :cy="AY" r="30" :fill="`url(#${uid}-${side}-iris)`" class="iris hit" :class="{ ab: ab(side, 'iris'), sel: selected?.side === side && selected.region === 'iris' }" @click="pick(side, 'iris')" />
            <g class="iris-lines" pointer-events="none"><line v-for="k in 18" :key="k" :x1="CX + Math.cos(k / 2.865) * 13" :y1="AY + Math.sin(k / 2.865) * 13" :x2="CX + Math.cos(k / 2.865) * 28" :y2="AY + Math.sin(k / 2.865) * 28" /></g>
            <circle :cx="CX" :cy="AY" :r="pupilR(side)" :fill="lensFill(side)" class="pupil hit" :class="{ ab: ab(side, 'lens') || ab(side, 'pupil'), sel: selected?.side === side && ['lens', 'pupil'].includes(selected.region) }" @click="pick(side, 'lens')" />
            <g v-if="f(side, 'lens') === 'Pseudophakia (IOL)'" class="iol" pointer-events="none">
              <circle :cx="CX" :cy="AY" r="8" /><path :d="`M ${CX + 8} ${AY} q 10 -4 14 -16 M ${CX - 8} ${AY} q -10 4 -14 16`" />
            </g>
            <ellipse v-if="f(side, 'cornea') === 'Opacity / scar' || f(side, 'cornea') === 'Ulcer'" :cx="CX - 9" :cy="AY - 7" rx="9" ry="7" class="opacity" pointer-events="none" />
            <path v-if="f(side, 'ac') === 'Hypopyon' || f(side, 'ac') === 'Hyphaema'" :d="`M ${CX - 26} ${AY + 18} Q ${CX} ${AY + 40} ${CX + 26} ${AY + 18} Z`" :class="f(side, 'ac') === 'Hypopyon' ? 'hypopyon' : 'hyphaema'" pointer-events="none" />
            <circle :cx="CX - 7" :cy="AY - 8" r="3" class="glint" pointer-events="none" />
          </g>
          <path :d="upperLid(side)" class="lidline" pointer-events="none" />
          <path :d="lashes(side)" class="lash" pointer-events="none" />
          <path :d="`M 14 ${AY} Q ${CX} ${AY + 64} 226 ${AY}`" class="lidline lower" pointer-events="none" />
          <path :d="`${upperLid(side)} M 14 ${AY} Q ${CX} ${AY + 64} 226 ${AY}`" class="lidhit hit" :class="{ ab: ab(side, 'lids'), sel: selected?.side === side && selected.region === 'lids' }" @click="pick(side, 'lids')" />
          <text :x="CX + nasal(side) * 104" :y="AY + 40" text-anchor="middle" class="cap">nasal</text>

          <!-- fundus -->
          <text :x="CX" :y="FY - FR - 14" text-anchor="middle" class="cap">Fundus</text>
          <circle :cx="CX" :cy="FY" :r="FR" :fill="`url(#${uid}-${side}-fundus)`" class="retina hit" :class="{ ab: ab(side, 'retina'), sel: selected?.side === side && selected.region === 'retina' }" @click="pick(side, 'retina')" />
          <g v-if="ab(side, 'retina')" pointer-events="none" :clip-path="`url(#${uid}-${side}-fclip)`">
            <template v-if="f(side, 'retina') === 'Detachment'"><path :d="`M ${CX - 70} ${FY + 40} Q ${CX} ${FY + 20} ${CX + 70} ${FY + 40} A ${FR} ${FR} 0 0 1 ${CX - 70} ${FY + 40} Z`" class="rd" /></template>
            <template v-else-if="f(side, 'retina') === 'Retinal tear'"><path :d="`M ${CX + 40} ${FY - 66} q 8 -10 16 0 q -8 6 -16 0`" class="tear" /></template>
            <template v-else>
              <circle v-for="(p, i) in RETINA_DOTS" :key="i" :cx="CX + p[0]" :cy="FY + p[1]" :r="f(side, 'retina') === 'Cotton-wool spots' ? 5 : 3" :class="f(side, 'retina') === 'Cotton-wool spots' ? 'cws' : f(side, 'retina') === 'Laser scars' || f(side, 'retina') === 'Lattice degeneration' ? 'scar' : 'heme'" />
            </template>
          </g>
          <g class="vessels" pointer-events="none" :clip-path="`url(#${uid}-${side}-fclip)`"><path v-for="(d, i) in vessels(side)" :key="i" :d="d" :class="i % 2 ? 'artery' : 'vein'" :stroke-dasharray="f(side, 'vessels') === 'AV nipping' ? '10 3' : undefined" /></g>
          <g class="hit" :clip-path="`url(#${uid}-${side}-fclip)`" :class="{ ab: ab(side, 'vessels'), sel: selected?.side === side && selected.region === 'vessels' }" @click="pick(side, 'vessels')"><path v-for="(d, i) in vessels(side)" :key="i" :d="d" class="vesselhit" /></g>
          <g class="hit" @click="pick(side, 'macula')">
            <circle :cx="macX(side)" :cy="FY" r="15" class="macula" :class="{ ab: ab(side, 'macula'), sel: selected?.side === side && selected.region === 'macula' }" />
            <circle :cx="macX(side)" :cy="FY" r="2.6" class="fovea" />
            <template v-if="ab(side, 'macula')">
              <circle v-for="k in 6" :key="k" :cx="macX(side) + Math.cos(k) * 9" :cy="FY + Math.sin(k) * 8" r="1.9" :class="['Drusen', 'Hard exudates'].includes(f(side, 'macula')) ? 'drusen' : 'heme'" pointer-events="none" />
            </template>
          </g>
          <g class="hit" @click="pick(side, 'disc')">
            <circle v-if="f(side, 'disc') === 'Swelling'" :cx="discX(side)" :cy="FY - 2" r="20" class="swell" />
            <circle :cx="discX(side)" :cy="FY - 2" r="14" class="disc" :class="{ pale: f(side, 'disc') === 'Pallor', ab: ab(side, 'disc'), sel: selected?.side === side && selected.region === 'disc' }" />
            <circle :cx="discX(side)" :cy="FY - 2" :r="14 * cd(side)" class="cup" />
            <path v-if="f(side, 'disc') === 'Disc haemorrhage'" :d="`M ${discX(side) - 4} ${FY + 12} l -3 9`" class="dh" />
          </g>
        </svg>
        <label class="ed__cd">
          <span>Cup-to-disc ratio <strong class="tabular">{{ cd(side).toFixed(2) }}</strong></span>
          <input type="range" min="0.1" max="0.95" step="0.05" :value="cd(side)" :disabled="readonly" @input="setCd(side, ($event.target as HTMLInputElement).value)" />
        </label>
        <div class="ed__regions">
          <button v-for="r in EYE_REGIONS" :key="r.key" type="button" class="reg" :class="{ ab: ab(side, r.key), on: selected?.side === side && selected.region === r.key }" @click="pick(side, r.key)">
            <span class="reg__l">{{ r.label }}</span><span class="reg__v">{{ f(side, r.key) || '—' }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="selected && selRegion" class="ed__edit" role="group" :aria-label="`${EYE_LABEL[selected.side]} ${selRegion.label}`">
      <div class="ed__edit-h"><strong>{{ EYE_LABEL[selected.side] }} · {{ selRegion.label }}</strong><button type="button" class="chip" @click="selected = null">Done</button></div>
      <div v-if="!readonly" class="row">
        <button v-for="(x, i) in selRegion.findings" :key="x" type="button" class="chip" :class="{ on: f(selected.side, selected.region) === x, warn: i > 0 }" @click="setFinding(x)">{{ x }}</button>
      </div>
      <div v-if="!readonly" class="row">
        <input v-model="custom" type="text" placeholder="Other finding or note" class="ed__other" @keydown.enter.prevent="custom && setFinding(custom)" />
        <button type="button" class="chip" :disabled="!custom" @click="setFinding(custom)">Set</button>
        <button v-if="f(selected.side, selected.region)" type="button" class="chip" @click="setFinding('')">Clear</button>
      </div>
      <div v-else class="small">{{ f(selected.side, selected.region) || 'Not recorded' }}</div>
    </div>
    <div v-if="summary.length" class="small"><strong>Findings:</strong> {{ summary.join(' · ') }}</div>
    <div v-else class="small muted">{{ readonly ? 'No abnormal findings.' : 'Tap a part of either eye to record what you see. Abnormal findings are drawn and outlined on the picture.' }}</div>
  </div>
</template>

<style scoped>
.ed { display: flex; flex-direction: column; gap: 12px; }
.ed__eyes { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
.ed__eye { background: var(--x-surface-2); border-radius: var(--x-radius-lg); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.ed__title { font-weight: 700; font-size: var(--x-text-sm); }
.ed__svg { width: 100%; height: auto; max-width: 420px; align-self: center; display: block; user-select: none; }
.cap { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; fill: var(--x-text-faint); }
.hit { cursor: pointer; }
.skin { fill: #e9c3a5; }
.sclera { fill: #fbfaf6; }
.sclera.inj { fill: #f8d3cc; }
.sch { fill: #c81e1e; opacity: 0.75; }
.ping { fill: #e9dc9b; }
.ptery { fill: #ec9e93; opacity: 0.85; }
.caruncle { fill: #e89a95; }
.cornea { fill: rgba(200, 225, 240, 0.25); stroke: rgba(120, 150, 170, 0.5); stroke-width: 1; }
.iris-lines line { stroke: rgba(40, 24, 10, 0.35); stroke-width: 0.8; }
.iol circle, .iol path { fill: none; stroke: #9fd7ef; stroke-width: 1.6; }
.opacity { fill: #fff; opacity: 0.8; }
.hypopyon { fill: #f4f1e0; opacity: 0.9; }
.hyphaema { fill: #b91c1c; opacity: 0.85; }
.glint { fill: #fff; opacity: 0.85; }
.lidline { fill: none; stroke: #7b5640; stroke-width: 2.4; }
.lidline.lower { stroke-width: 1.6; }
.lash { fill: none; stroke: #3b2a1f; stroke-width: 1.3; stroke-linecap: round; }
.lidhit { fill: none; stroke: transparent; stroke-width: 12; }
.lidhit.ab { stroke: rgba(225, 29, 72, 0.16); }
.lidhit.sel { stroke: rgba(13, 148, 136, 0.3); }
.retina { stroke: #7b2412; stroke-width: 1; }
.rd { fill: #c9c5c0; opacity: 0.75; }
.tear { fill: #7a1a10; stroke: #f2c2a0; stroke-width: 1; }
.heme { fill: #7d0f0a; }
.cws { fill: #fbf6ee; opacity: 0.9; }
.scar { fill: #3a2418; stroke: #f0c49c; stroke-width: 1; }
.vein { fill: none; stroke: #8a1410; stroke-width: 2.6; stroke-linecap: round; }
.artery { fill: none; stroke: #d2402c; stroke-width: 1.7; stroke-linecap: round; }
.vesselhit { fill: none; stroke: transparent; stroke-width: 9; }
.ab .vesselhit { stroke: rgba(225, 29, 72, 0.22); }
.sel .vesselhit { stroke: rgba(13, 148, 136, 0.3); }
.macula { fill: rgba(120, 30, 12, 0.45); }
.fovea { fill: #5a160a; }
.drusen { fill: #f6e27a; }
.disc { fill: #f7d6a0; stroke: #e7b676; stroke-width: 1; }
.disc.pale { fill: #fff6e6; }
.swell { fill: rgba(247, 214, 160, 0.5); stroke: rgba(247, 214, 160, 0.9); stroke-dasharray: 2 2; }
.cup { fill: #fff4dc; pointer-events: none; }
.dh { stroke: #7d0f0a; stroke-width: 2.4; stroke-linecap: round; }
.ab:not(g):not(.lidhit) { stroke: #e11d48; stroke-width: 2.2; stroke-dasharray: 4 2; }
.sel:not(g):not(.lidhit) { stroke: var(--x-accent); stroke-width: 2.6; stroke-dasharray: none; }
.ed__cd { display: flex; flex-direction: column; gap: 4px; font-size: var(--x-text-sm); }
.ed__cd input { accent-color: var(--x-accent); border: 0; background: none; box-shadow: none; padding: 0; min-height: 0; height: 24px; }
.ed__regions { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.reg { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; text-align: start; border: 1px solid var(--x-border); background: var(--x-surface); border-radius: 8px; padding: 5px 8px; font: inherit; cursor: pointer; color: var(--x-text); min-width: 0; }
.reg__l { font-size: 10.5px; color: var(--x-text-muted); font-weight: 600; }
.reg__v { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.reg.ab { border-color: var(--x-danger); background: var(--x-danger-soft); color: var(--x-danger-text); }
.reg.on { outline: 2px solid var(--x-accent); outline-offset: 1px; }
.ed__edit { border: 1px solid var(--x-border); border-radius: var(--x-radius-lg); padding: 12px; display: flex; flex-direction: column; gap: 10px; background: var(--x-surface); }
.ed__edit-h { display: flex; justify-content: space-between; align-items: center; }
.chip.on { outline: 2px solid currentColor; outline-offset: 1px; }
.chip.warn.on { background: var(--x-danger-soft); color: var(--x-danger-text); border-color: var(--x-danger); }
.ed__other { flex: 1; min-width: 160px; }
</style>
