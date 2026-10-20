<script setup lang="ts">
// Hero visual for the landing page: the XentraERP POS product family as floating, connected
// panels — analytics dashboard (centre), POS terminal, mobile manager app, kitchen display,
// inventory and a finance widget — drawn in HTML/SVG, so it stays sharp at any size, follows the
// light/dark theme and needs no image request. Everything is sized in `em` off one base size
// that scales with the container (container query units), so the composition keeps its
// proportions from a phone to a wide desktop. Decorative: one label describes it for screen
// readers. The figures are illustrative sample data.
import { t } from '@/lib/i18n'

// Revenue chart: this week vs last week, 0..100 scale, drawn into a 300x110 box.
const thisWeek = [38, 46, 41, 58, 54, 72, 68, 84, 79, 92]
const lastWeek = [30, 34, 36, 40, 38, 48, 46, 52, 55, 60]
const pts = (v: number[]) => v.map((y, i) => [(i / (v.length - 1)) * 300, 104 - y]) as [number, number][]
function smooth(p: [number, number][]) {
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]
    const [x1, y1] = p[i]
    const cx = (x0 + x1) / 2
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`
  }
  return d
}
const linePath = smooth(pts(thisWeek))
const areaPath = `${linePath} L300,110 L0,110 Z`
const prevPath = smooth(pts(lastWeek))
const branches = [
  { name: 'Seef Mall', pct: 92 },
  { name: 'Adliya', pct: 71 },
  { name: 'Riffa', pct: 54 },
]
const spark = smooth(([12, 20, 16, 28, 24, 36, 44] as number[]).map((y, i) => [i * 20, 48 - y]) as [number, number][])
</script>

<template>
  <figure class="hp" role="img" :aria-label="t('landing.hero.visualLabel')" dir="ltr">
    <div class="hp__stage" aria-hidden="true">
      <!-- connections between the products, behind the panels -->
      <svg class="hp__links" viewBox="0 0 100 90" preserveAspectRatio="none">
        <path d="M20 54 C 22 46, 24 42, 26 38" />
        <path d="M90 34 C 90 30, 88 26, 86 22" />
        <path d="M58 76 C 62 70, 66 66, 74 64" />
        <path d="M14 12 C 18 14, 20 16, 22 18" />
        <path d="M74 70 C 80 72, 84 74, 88 78" />
      </svg>

      <!-- analytics dashboard (centre, back) -->
      <section class="p p--dash">
        <header class="p__bar">
          <span class="dots"><i /><i /><i /></span>
          <b>Sales overview</b>
          <span class="chip chip--muted">All branches</span>
          <span class="chip chip--live"><i />Live</span>
        </header>
        <div class="dash__kpis">
          <div><small>Revenue</small><b>48,230</b><em class="up">▲ 12.4%</em></div>
          <div><small>Orders</small><b>3,184</b><em class="up">▲ 8.1%</em></div>
          <div><small>Avg ticket</small><b>15.15</b><em class="down">▼ 1.2%</em></div>
        </div>
        <div class="dash__chart">
          <svg viewBox="0 0 300 110" preserveAspectRatio="none">
            <defs>
              <linearGradient id="hp-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="var(--hp-a)" stop-opacity="0.28" />
                <stop offset="1" stop-color="var(--hp-a)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path v-for="y in [26, 52, 78]" :key="y" :d="`M0 ${y} H300`" class="grid" />
            <path :d="areaPath" fill="url(#hp-area)" />
            <path :d="prevPath" class="prev" />
            <path :d="linePath" class="line" />
            <circle cx="300" :cy="104 - thisWeek[thisWeek.length - 1]" r="4" class="dot" />
          </svg>
          <span class="dash__tip">BHD 9,412 <small>today</small></span>
        </div>
        <ul class="dash__branches">
          <li v-for="b in branches" :key="b.name">
            <span>{{ b.name }}</span>
            <span class="track"><i :style="{ width: `${b.pct}%` }" /></span>
          </li>
        </ul>
      </section>

      <!-- finance widget (top left) -->
      <section class="p p--glass p--fin">
        <small class="p__label">Gross margin</small>
        <div class="fin">
          <svg viewBox="0 0 36 36" class="donut">
            <circle cx="18" cy="18" r="14" class="donut__bg" />
            <circle cx="18" cy="18" r="14" class="donut__fg" stroke-dasharray="56.3 88" />
          </svg>
          <div><b>64%</b><small>VAT 10% · filed</small></div>
        </div>
      </section>

      <!-- kitchen display (top right) -->
      <section class="p p--kds">
        <header class="kds__head"><b>Table A4</b><span class="chip chip--amber">Preparing</span><span class="kds__time">4:12</span></header>
        <ul class="kds__items">
          <li><b>2×</b> Truffle Burger <small>No onion</small></li>
          <li><b>1×</b> Caesar Salad</li>
          <li><b>3×</b> Karak Tea</li>
        </ul>
        <span class="btn btn--sm">Mark ready</span>
      </section>

      <!-- POS terminal (front left) -->
      <section class="p p--pos">
        <header class="p__bar">
          <b>Order · Table A4</b>
          <span class="chip chip--muted">4 guests</span>
        </header>
        <ul class="pos__lines">
          <li><span>Truffle Burger <small>× 2</small></span><b>9.000</b></li>
          <li><span>Caesar Salad</span><b>2.900</b></li>
          <li><span>Spanish Latte <small>× 2</small></span><b>3.800</b></li>
        </ul>
        <div class="pos__total"><span>Total</span><b>BHD 15.700</b></div>
        <div class="pos__pay">
          <span class="chip chip--muted">Card</span>
          <span class="chip chip--muted">Cash</span>
          <span class="btn">Charge</span>
        </div>
      </section>

      <!-- mobile manager app (right) -->
      <section class="p p--phone">
        <div class="phone">
          <span class="phone__notch" />
          <small>Today</small>
          <b class="phone__big">2,846.750</b>
          <em class="up">▲ 18% vs yesterday</em>
          <svg viewBox="0 0 120 48" class="phone__spark"><path :d="spark" /></svg>
          <ul>
            <li><span>Shifts open</span><b>3</b></li>
            <li><span>Covers</span><b>186</b></li>
            <li><span>To collect</span><b>12.5</b></li>
          </ul>
        </div>
      </section>

      <!-- inventory (bottom right) -->
      <section class="p p--glass p--inv">
        <header class="inv__head"><b>Stock alerts</b><span class="chip chip--rose">3 low</span></header>
        <ul>
          <li><span>Coffee beans</span><span class="track track--rose"><i style="width: 18%" /></span></li>
          <li><span>Burger buns</span><span class="track track--amber"><i style="width: 34%" /></span></li>
          <li><span>Oat milk</span><span class="track track--ok"><i style="width: 72%" /></span></li>
        </ul>
      </section>

      <!-- cloud sync badge -->
      <span class="hp__sync"><i />Synced to XentraERP · 2s ago</span>
    </div>
  </figure>
</template>

<style scoped>
.hp { margin: 0; container-type: inline-size; min-width: 0; }
.hp__stage {
  --hp-a: var(--x-primary);
  --hp-b: var(--x-brand-teal, #14b8a6);
  --hp-card: var(--x-surface);
  --hp-line: var(--x-border);
  --hp-text: var(--x-text);
  --hp-muted: var(--x-text-muted);
  --hp-soft: var(--x-surface-3);
  position: relative; aspect-ratio: 20 / 17; font-size: 1.95cqw; color: var(--hp-text); font-family: var(--x-font-sans);
}
/* soft halo behind the composition */
.hp__stage::before { content: ''; position: absolute; inset: 8% 4% 4%; border-radius: 50%; z-index: 0;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--hp-a) 22%, transparent), transparent),
              radial-gradient(40% 40% at 80% 80%, color-mix(in srgb, var(--hp-b) 18%, transparent), transparent);
  filter: blur(2em); }

.hp__links { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; overflow: visible; }
.hp__links path { fill: none; stroke: color-mix(in srgb, var(--hp-a) 45%, transparent); stroke-width: 0.35; stroke-dasharray: 1 1.2; vector-effect: non-scaling-stroke; stroke-width: 1.5px; }

/* panels */
.p { position: absolute; z-index: 2; background: var(--hp-card); border: 1px solid var(--hp-line); border-radius: 1.1em; padding: 1em;
  box-shadow: 0 0.1em 0.2em rgba(15, 23, 42, 0.05), 0 1.6em 3.2em -1.2em rgba(15, 23, 42, 0.28); }
.p--glass { background: color-mix(in srgb, var(--hp-card) 72%, transparent); backdrop-filter: blur(1em) saturate(1.4); -webkit-backdrop-filter: blur(1em) saturate(1.4); }
.p b { font-weight: 700; }
.p small { color: var(--hp-muted); font-size: 0.82em; }
.p__bar { display: flex; align-items: center; gap: 0.6em; margin-bottom: 0.9em; font-size: 1.05em; }
.p__bar b { margin-inline-end: auto; }
.p__label { display: block; font-weight: 600; margin-bottom: 0.5em; }
.dots { display: inline-flex; gap: 0.3em; }
.dots i { width: 0.55em; height: 0.55em; border-radius: 50%; background: var(--hp-soft); }
.chip { display: inline-flex; align-items: center; gap: 0.35em; padding: 0.2em 0.6em; border-radius: 999px; font-size: 0.78em; font-weight: 700; white-space: nowrap; }
.chip--muted { background: var(--hp-soft); color: var(--hp-muted); }
.chip--live { background: var(--x-success-soft); color: var(--x-success-text); }
.chip--live i { width: 0.5em; height: 0.5em; border-radius: 50%; background: currentColor; }
.chip--amber { background: var(--x-warning-soft); color: var(--x-warning-text); }
.chip--rose { background: var(--x-danger-soft); color: var(--x-danger-text); }
.btn { display: inline-flex; align-items: center; justify-content: center; padding: 0.55em 1.1em; border-radius: 0.6em; background: var(--hp-a); color: #fff; font-weight: 700; font-size: 0.9em; }
.btn--sm { padding: 0.4em 0.9em; font-size: 0.82em; }
.up { color: var(--x-success-text); font-style: normal; font-weight: 700; font-size: 0.78em; }
.down { color: var(--x-danger-text); font-style: normal; font-weight: 700; font-size: 0.78em; }
.track { position: relative; display: block; height: 0.5em; border-radius: 999px; background: var(--hp-soft); overflow: hidden; }
.track i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: linear-gradient(90deg, var(--hp-a), var(--hp-b)); }
.track--rose i { background: var(--x-danger); }
.track--amber i { background: var(--x-warning); }
.track--ok i { background: var(--x-success); }

/* dashboard */
.p--dash { left: 19%; top: 13%; width: 57%; padding: 1.2em 1.3em; }
.dash__kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.7em; margin-bottom: 0.9em; }
.dash__kpis div { display: flex; flex-direction: column; gap: 0.15em; padding: 0.65em 0.75em; border-radius: 0.7em; background: var(--hp-soft); }
.dash__kpis b { font-family: var(--x-font-display); font-size: 1.45em; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.dash__chart { position: relative; height: 9.5em; }
.dash__chart svg { width: 100%; height: 100%; overflow: visible; }
.dash__chart .grid { stroke: var(--hp-line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.dash__chart .line { fill: none; stroke: var(--hp-a); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.dash__chart .prev { fill: none; stroke: var(--hp-muted); stroke-opacity: 0.45; stroke-width: 1.5; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; }
.dash__chart .dot { fill: var(--hp-card); stroke: var(--hp-a); stroke-width: 3; vector-effect: non-scaling-stroke; }
.dash__tip { position: absolute; right: 0; top: -0.4em; padding: 0.3em 0.6em; border-radius: 0.5em; background: var(--x-brand-navy, #0f172a); color: #fff; font-size: 0.8em; font-weight: 700; }
.dash__tip small { color: rgba(255, 255, 255, 0.7); font-weight: 500; }
.dash__branches { list-style: none; margin: 0.9em 0 0; padding: 0; display: none; gap: 0.5em; }
.dash__branches li { display: grid; grid-template-columns: 6.5em 1fr; align-items: center; gap: 0.8em; font-size: 0.85em; color: var(--hp-muted); }

/* finance */
.p--fin { left: 0; top: 0; width: 24%; }
.fin { display: flex; align-items: center; gap: 0.7em; }
.fin b { display: block; font-family: var(--x-font-display); font-size: 1.5em; }
.donut { width: 3.4em; height: 3.4em; transform: rotate(-90deg); flex: none; }
.donut circle { fill: none; stroke-width: 5; }
.donut__bg { stroke: var(--hp-soft); }
.donut__fg { stroke: var(--hp-b); stroke-linecap: round; }

/* kitchen display */
.p--kds { right: 0; top: 2%; width: 27%; padding: 0.9em; border-top: 0.3em solid var(--x-warning); }
.kds__head { display: flex; align-items: center; gap: 0.5em; margin-bottom: 0.6em; }
.kds__head b { margin-inline-end: auto; }
.kds__time { font-size: 0.8em; font-weight: 700; color: var(--hp-muted); font-variant-numeric: tabular-nums; }
.kds__items { list-style: none; margin: 0 0 0.7em; padding: 0; display: grid; gap: 0.35em; font-size: 0.88em; }
.kds__items small { display: block; color: var(--x-warning-text); padding-inline-start: 1.7em; }
.p--kds .btn { width: 100%; }

/* POS terminal */
.p--pos { left: 1%; top: 52%; width: 41%; padding: 1.1em; }
.pos__lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.55em; font-size: 0.92em; }
.pos__lines li { display: flex; justify-content: space-between; gap: 1em; padding-bottom: 0.55em; border-bottom: 1px dashed var(--hp-line); font-variant-numeric: tabular-nums; }
.pos__total { display: flex; justify-content: space-between; align-items: baseline; margin: 0.8em 0; }
.pos__total b { font-family: var(--x-font-display); font-size: 1.35em; }
.pos__pay { display: flex; align-items: center; gap: 0.45em; }
.pos__pay .btn { margin-inline-start: auto; padding-inline: 1.6em; }

/* mobile app */
.p--phone { right: 2%; top: 36%; width: 21%; padding: 0.45em; border-radius: 1.8em; background: #0b1120; border-color: #1e293b; }
.phone { position: relative; display: flex; flex-direction: column; gap: 0.25em; padding: 1.8em 0.9em 1em; border-radius: 1.4em; color: #e2e8f0;
  background: radial-gradient(90% 60% at 80% 0%, color-mix(in srgb, var(--hp-a) 55%, transparent), transparent), #0f172a; }
.phone__notch { position: absolute; top: 0.55em; left: 50%; translate: -50% 0; width: 32%; height: 0.55em; border-radius: 999px; background: #020617; }
.phone small { color: #94a3b8; }
.phone__big { font-family: var(--x-font-display); font-size: 1.45em; color: #fff; font-variant-numeric: tabular-nums; }
.phone .up { color: #4ade80; }
.phone__spark { width: 100%; height: 2.6em; margin: 0.3em 0; overflow: visible; }
.phone__spark path { fill: none; stroke: #5eead4; stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.phone ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35em; }
.phone li { display: flex; justify-content: space-between; padding: 0.45em 0.6em; border-radius: 0.6em; background: rgba(255, 255, 255, 0.06); font-size: 0.82em; }
.phone li b { color: #fff; }

/* inventory */
.p--inv { right: 25%; bottom: 0; width: 33%; padding: 0.9em 1em; }
.inv__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6em; }
.p--inv ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5em; }
.p--inv li { display: grid; grid-template-columns: 6.5em 1fr; align-items: center; gap: 0.7em; font-size: 0.85em; color: var(--hp-muted); }

.hp__sync { position: absolute; z-index: 3; left: 88%; bottom: 6%; translate: -50% 0; display: inline-flex; align-items: center; gap: 0.5em; padding: 0.45em 0.9em; border-radius: 999px;
  background: var(--hp-card); border: 1px solid var(--hp-line); box-shadow: 0 0.8em 1.6em -0.8em rgba(15, 23, 42, 0.3); font-size: 0.8em; font-weight: 600; color: var(--hp-muted); white-space: nowrap; }
.hp__sync i { width: 0.6em; height: 0.6em; border-radius: 50%; background: var(--x-success); box-shadow: 0 0 0 0.25em color-mix(in srgb, var(--x-success) 25%, transparent); }

/* gentle float, staggered; off for reduced motion */
@media (prefers-reduced-motion: no-preference) {
  .p--fin, .p--kds, .p--phone, .p--inv, .p--pos { animation: hp-float 7s ease-in-out infinite; }
  .p--kds { animation-delay: -1.5s; }
  .p--phone { animation-delay: -3s; }
  .p--inv { animation-delay: -4.5s; }
  .p--pos { animation-delay: -6s; animation-duration: 8s; }
}
@keyframes hp-float { 50% { transform: translateY(-0.5em); } }

/* phones: keep the dashboard, terminal and app, larger */
@container (max-width: 520px) {
  .hp__stage { font-size: 2.7cqw; aspect-ratio: 10 / 10; }
  .p--fin, .p--inv, .p--kds, .hp__links { display: none; }
  .p--dash { left: 0; top: 0; width: 84%; }
  .p--inv { display: none; }
  .dash__branches { display: none; }
  .p--pos { top: 50%; width: 60%; }
  .p--phone { right: 0; top: 30%; width: 34%; }
  .hp__sync { left: 80%; bottom: 4%; }
}
</style>
