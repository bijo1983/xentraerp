<script setup lang="ts">
// Product preview on the landing page: a browser-framed dashboard built from real components
// (not a screenshot) so it stays sharp, themed and translated. All figures are SAMPLE data and
// the frame says so — nothing here claims real customer numbers.
import { computed } from 'vue'
import { Activity, Building2, ChartColumn, LayoutGrid, Receipt, Settings, Store, UtensilsCrossed, Users } from 'lucide-vue-next'
import { t } from '@/lib/i18n'
import CountUp from './CountUp.vue'
import UiItemArt from '@/ui/UiItemArt.vue'

const kpis = computed(() => [
  { label: t('landing.kpi.sales'), to: 1284.5, decimals: 3, prefix: 'BHD ', delta: '+12.4%', spark: [8, 12, 10, 16, 14, 20, 24] },
  { label: t('landing.kpi.orders'), to: 342, decimals: 0, prefix: '', delta: '+8.1%', spark: [10, 9, 14, 13, 18, 17, 22] },
  { label: t('landing.kpi.ticket'), to: 3.756, decimals: 3, prefix: 'BHD ', delta: '+3.9%', spark: [12, 14, 13, 15, 14, 17, 18] },
  { label: t('landing.kpi.covers'), to: 518, decimals: 0, prefix: '', delta: '+5.2%', spark: [6, 10, 12, 11, 16, 19, 21] },
])
const hours = [18, 26, 44, 72, 58, 34, 30, 48, 86, 100, 74, 40]
const hourLabels = ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21']
const branches = computed(() => [
  { name: t('landing.sample.branch1'), sales: 'BHD 612.250', status: 'open', load: 82 },
  { name: t('landing.sample.branch2'), sales: 'BHD 418.000', status: 'open', load: 64 },
  { name: t('landing.sample.branch3'), sales: 'BHD 254.250', status: 'closing', load: 38 },
])
const top = computed(() => [
  { name: t('landing.sample.item1'), group: 'Tea', qty: 128 },
  { name: t('landing.sample.item2'), group: 'Sandwich', qty: 96 },
  { name: t('landing.sample.item3'), group: 'Sandwich', qty: 71 },
  { name: t('landing.sample.item4'), group: 'Juice', qty: 64 },
])
function sparkPath(v: number[]) {
  const max = Math.max(...v)
  return v.map((y, i) => `${i === 0 ? 'M' : 'L'}${(i / (v.length - 1)) * 100},${30 - (y / max) * 26}`).join(' ')
}
</script>

<template>
  <figure class="dp" role="img" :aria-label="t('landing.preview.label')">
    <div class="dp__chrome" aria-hidden="true">
      <span class="dp__dots"><i /><i /><i /></span>
      <span class="dp__url">pos.xentraerp.net/dashboard</span>
      <span class="dp__note">{{ t('landing.preview.note') }}</span>
    </div>
    <div class="dp__app" aria-hidden="true">
      <aside class="dp__side">
        <span class="dp__logo">X</span>
        <span class="on"><LayoutGrid :size="18" /></span>
        <span><UtensilsCrossed :size="18" /></span>
        <span><Store :size="18" /></span>
        <span><ChartColumn :size="18" /></span>
        <span><Users :size="18" /></span>
        <span class="dp__side-end"><Settings :size="18" /></span>
      </aside>
      <div class="dp__main">
        <header class="dp__head">
          <b>{{ t('landing.preview.today') }}</b>
          <span class="dp__live"><i />{{ t('landing.preview.live') }}</span>
        </header>
        <div class="dp__kpis">
          <div v-for="k in kpis" :key="k.label" class="dp__kpi">
            <span class="dp__kpi-l">{{ k.label }}</span>
            <b class="dp__kpi-v"><CountUp :to="k.to" :decimals="k.decimals" :prefix="k.prefix" /></b>
            <span class="dp__kpi-row">
              <span class="dp__delta">{{ k.delta }}</span>
              <svg viewBox="0 0 100 32" preserveAspectRatio="none" class="dp__spark"><path :d="sparkPath(k.spark)" /></svg>
            </span>
          </div>
        </div>
        <div class="dp__grid">
          <section class="dp__card dp__chart">
            <h4><Activity :size="15" /> {{ t('landing.preview.byHour') }}</h4>
            <div class="dp__bars">
              <span v-for="(h, i) in hours" :key="i" class="dp__bar" :class="{ hi: h === 100 }" :style="{ '--h': h + '%', '--d': i * 40 + 'ms' }"><small>{{ hourLabels[i] }}</small></span>
            </div>
          </section>
          <section class="dp__card dp__mix">
            <h4><Receipt :size="15" /> {{ t('landing.preview.payments') }}</h4>
            <div class="dp__donut-wrap">
              <svg viewBox="0 0 42 42" class="dp__donut">
                <circle cx="21" cy="21" r="15.9" class="trk" />
                <circle cx="21" cy="21" r="15.9" class="seg s1" stroke-dasharray="51 49" stroke-dashoffset="-1.5" />
                <circle cx="21" cy="21" r="15.9" class="seg s2" stroke-dasharray="31 69" stroke-dashoffset="-55.5" />
                <circle cx="21" cy="21" r="15.9" class="seg s3" stroke-dasharray="9 91" stroke-dashoffset="-89.5" />
              </svg>
              <ul>
                <li><i class="s1" />{{ t('landing.preview.card') }} <b>54%</b></li>
                <li><i class="s2" />{{ t('landing.preview.cash') }} <b>34%</b></li>
                <li><i class="s3" />{{ t('landing.preview.other') }} <b>12%</b></li>
              </ul>
            </div>
          </section>
          <section class="dp__card">
            <h4><Building2 :size="15" /> {{ t('landing.preview.branches') }}</h4>
            <ul class="dp__branches">
              <li v-for="b in branches" :key="b.name">
                <span class="dp__bname"><i :class="b.status" />{{ b.name }}</span>
                <span class="dp__bmeter"><span :style="{ width: b.load + '%' }" /></span>
                <b class="x-tabular">{{ b.sales }}</b>
              </li>
            </ul>
          </section>
          <section class="dp__card">
            <h4><ChartColumn :size="15" /> {{ t('landing.preview.topItems') }}</h4>
            <ul class="dp__top">
              <li v-for="it in top" :key="it.name">
                <span class="dp__art"><UiItemArt :name="it.name" :group="it.group" :size="16" rounded="8px" /></span>
                <span class="dp__tname">{{ it.name }}</span>
                <b class="x-tabular">{{ it.qty }}</b>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.dp { margin: 0; border-radius: var(--x-radius-xl); background: var(--x-surface); border: 1px solid var(--x-border); box-shadow: var(--x-shadow-lg), 0 0 0 8px color-mix(in srgb, var(--x-surface) 55%, transparent); overflow: hidden; }
.dp__chrome { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--x-surface-2); border-block-end: 1px solid var(--x-border); font-size: 12px; color: var(--x-text-muted); }
.dp__dots { display: flex; gap: 6px; } .dp__dots i { width: 10px; height: 10px; border-radius: 50%; background: #f87171; } .dp__dots i:nth-child(2) { background: #fbbf24; } .dp__dots i:nth-child(3) { background: #34d399; }
.dp__url { flex: 1; max-width: 320px; margin-inline: auto; text-align: center; padding: 4px 12px; border-radius: 8px; background: var(--x-surface); border: 1px solid var(--x-border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: ltr; }
.dp__note { font-weight: 600; color: var(--x-text-faint); white-space: nowrap; }
.dp__app { display: flex; min-height: 420px; }
.dp__side { width: 60px; flex: none; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 0; background: var(--x-brand-navy); color: rgba(255, 255, 255, 0.55); }
.dp__side > span { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; }
.dp__side > span.on { background: rgba(255, 255, 255, 0.12); color: #fff; }
.dp__side-end { margin-top: auto; }
.dp__logo { background: var(--x-brand-gradient); color: #fff; font-weight: 800; font-family: var(--x-font-display); margin-bottom: 8px; }
.dp__main { flex: 1; min-width: 0; padding: 18px; display: flex; flex-direction: column; gap: 14px; background: var(--x-bg); }
.dp__head { display: flex; align-items: center; justify-content: space-between; font-family: var(--x-font-display); font-size: 18px; }
.dp__live { display: inline-flex; align-items: center; gap: 6px; font-family: var(--x-font-sans); font-size: 12px; font-weight: 700; color: var(--x-success-text); background: var(--x-success-soft); padding: 4px 10px; border-radius: 999px; }
.dp__live i { width: 7px; height: 7px; border-radius: 50%; background: var(--x-success); animation: dp-pulse 1.8s ease-in-out infinite; }
@keyframes dp-pulse { 50% { box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.18); } }
.dp__kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.dp__kpi { background: var(--x-surface); border: 1px solid var(--x-border); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; box-shadow: var(--x-shadow-xs); min-width: 0; }
.dp__kpi-l { font-size: 12px; color: var(--x-text-muted); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp__kpi-v { font-family: var(--x-font-display); font-size: clamp(15px, 1.5vw, 20px); letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp__kpi-row { display: flex; align-items: center; gap: 8px; }
.dp__delta { font-size: 11.5px; font-weight: 700; color: var(--x-success-text); }
.dp__spark { flex: 1; height: 22px; } .dp__spark path { fill: none; stroke: var(--x-primary); stroke-width: 2.4; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
.dp__grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; }
.dp__card { background: var(--x-surface); border: 1px solid var(--x-border); border-radius: 14px; padding: 14px; box-shadow: var(--x-shadow-xs); min-width: 0; }
.dp__card h4 { margin: 0 0 12px; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--x-text); }
.dp__card h4 svg { color: var(--x-text-faint); }
.dp__bars { display: flex; align-items: flex-end; gap: 6px; height: 120px; padding-bottom: 16px; }
.dp__bar { position: relative; flex: 1; height: var(--h); border-radius: 6px 6px 3px 3px; background: linear-gradient(180deg, #93c5fd, #bfdbfe); transform-origin: bottom; animation: dp-grow 900ms var(--x-ease) both; animation-delay: var(--d); }
.dp__bar.hi { background: linear-gradient(180deg, #2563eb, #60a5fa); }
.dp__bar small { position: absolute; inset-block-end: -17px; inset-inline: 0; text-align: center; font-size: 10px; color: var(--x-text-faint); }
@keyframes dp-grow { from { transform: scaleY(0.05); } }
.dp__donut-wrap { display: flex; align-items: center; gap: 14px; }
.dp__donut { width: 96px; height: 96px; flex: none; transform: rotate(-90deg); }
.dp__donut circle { fill: none; stroke-width: 6; } .dp__donut .trk { stroke: var(--x-surface-3); }
.dp__donut .seg { stroke-linecap: round; } .s1 { stroke: #2563eb; background: #2563eb; } .s2 { stroke: #14b8a6; background: #14b8a6; } .s3 { stroke: #f59e0b; background: #f59e0b; }
.dp__donut-wrap ul, .dp__branches, .dp__top { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; font-size: 12.5px; flex: 1; min-width: 0; }
.dp__donut-wrap li { display: flex; align-items: center; gap: 8px; color: var(--x-text-muted); } .dp__donut-wrap li b { margin-inline-start: auto; color: var(--x-text); }
.dp__donut-wrap li i { width: 9px; height: 9px; border-radius: 3px; }
.dp__branches li { display: grid; grid-template-columns: minmax(0, 1fr) 60px auto; align-items: center; gap: 10px; }
.dp__bname { display: flex; align-items: center; gap: 8px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp__bname i { width: 8px; height: 8px; border-radius: 50%; background: var(--x-success); flex: none; } .dp__bname i.closing { background: var(--x-warning); }
.dp__bmeter { height: 6px; border-radius: 3px; background: var(--x-surface-3); overflow: hidden; } .dp__bmeter span { display: block; height: 100%; border-radius: 3px; background: var(--x-accent); }
.dp__top li { display: flex; align-items: center; gap: 10px; }
.dp__art { width: 28px; height: 28px; flex: none; }
.dp__tname { flex: 1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 767px) {
  .dp__side, .dp__note { display: none; }
  .dp__kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dp__grid { grid-template-columns: 1fr; }
  .dp__main { padding: 12px; }
}
</style>
