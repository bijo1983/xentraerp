<script setup lang="ts">
// Hero visual for the landing page: XentraERP POS as one ecosystem around the XentraERP platform.
// One dominant screen — the group analytics dashboard in a laptop — with three secondary devices
// that feed it: the POS terminal (tablet), the manager app (phone) and live inventory (glass
// card). A "XentraERP" hub under the laptop (accounts, stock, purchasing, reports) is where every
// device's data lands; flowing lines connect each device to it. Drawn in HTML/SVG so it stays
// sharp, follows light/dark and needs no image request. Everything is sized in `em` off one base
// size that scales with the container (container query units). Decorative: one label describes it
// for screen readers. The figures are illustrative sample data.
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
  { name: 'Seef Mall', pct: 92, val: '18,420' },
  { name: 'Adliya', pct: 71, val: '14,205' },
  { name: 'Riffa', pct: 54, val: '10,870' },
]
const spark = smooth(([12, 20, 16, 28, 24, 36, 44] as number[]).map((y, i) => [i * 20, 48 - y]) as [number, number][])
const modules = ['Accounts', 'Stock', 'Purchasing', 'Reports']
</script>

<template>
  <figure class="hp" role="img" :aria-label="t('landing.hero.visualLabel')" dir="ltr">
    <div class="hp__stage" aria-hidden="true">
      <!-- data flowing from each device into the XentraERP hub (stage is 100 x 84 units) -->
      <svg class="hp__links" viewBox="0 0 100 84" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hp-flow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="var(--hp-a)" />
            <stop offset="1" stop-color="var(--hp-b)" />
          </linearGradient>
        </defs>
        <path d="M30 70 C 36 76, 40 78, 44 78" />
        <path d="M84 70 C 80 76, 66 78, 60 78" />
        <path d="M95 24 C 99 29, 99 33, 95 38" />
        <path class="flow" d="M30 70 C 36 76, 40 78, 44 78" />
        <path class="flow" d="M84 70 C 80 76, 66 78, 60 78" />
        <path class="flow" d="M95 24 C 99 29, 99 33, 95 38" />
      </svg>

      <!-- main screen: group analytics in a laptop -->
      <div class="laptop">
        <div class="laptop__lid">
          <div class="laptop__screen">
            <aside class="dash__side">
              <span class="dash__logo" />
              <i class="on" /><i /><i /><i /><i />
            </aside>
            <section class="dash">
              <header class="dash__bar">
                <b>Group performance</b>
                <span class="chip chip--muted">All branches</span>
                <span class="chip chip--live"><i />Live</span>
              </header>
              <div class="dash__kpis">
                <div><small>Revenue</small><b>48,230</b><em class="up">▲ 12.4%</em></div>
                <div><small>Orders</small><b>3,184</b><em class="up">▲ 8.1%</em></div>
                <div><small>Gross margin</small><b>64.2%</b><em class="up">▲ 2.3%</em></div>
              </div>
              <div class="dash__body">
                <div class="dash__chart">
                  <svg viewBox="0 0 300 110" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="hp-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="var(--hp-a)" stop-opacity="0.3" />
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
                    <span class="nm">{{ b.name }}</span>
                    <span class="track"><i :style="{ width: `${b.pct}%` }" /></span>
                    <b>{{ b.val }}</b>
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </div>
        <div class="laptop__base" />
      </div>

      <!-- the platform hub every device posts into -->
      <div class="hub">
        <span class="hub__mark">X</span>
        <span class="hub__txt"><b>XentraERP</b><small>Synced · 2s ago</small></span>
        <span class="hub__mods"><i v-for="m in modules" :key="m">{{ m }}</i></span>
      </div>

      <!-- POS terminal (tablet, front left) -->
      <div class="tablet">
        <div class="tablet__screen">
          <header class="pos__bar"><b>Table A4</b><span class="chip chip--muted">4 guests</span></header>
          <div class="pos__grid">
            <span v-for="n in ['Burger', 'Latte', 'Salad', 'Karak', 'Pasta', 'Juice']" :key="n">{{ n }}</span>
          </div>
          <ul class="pos__lines">
            <li><span>Truffle Burger ×2</span><b>9.000</b></li>
            <li><span>Spanish Latte ×2</span><b>3.800</b></li>
          </ul>
          <div class="pos__pay"><span>BHD 15.700</span><span class="btn">Charge</span></div>
        </div>
      </div>

      <!-- manager app (phone, front right) -->
      <div class="phone">
        <div class="phone__screen">
          <span class="phone__notch" />
          <small>Today · all branches</small>
          <b class="phone__big">2,846.750</b>
          <em class="up">▲ 18% vs yesterday</em>
          <svg viewBox="0 0 120 48" class="phone__spark"><path :d="spark" /></svg>
          <ul>
            <li><span>Registers live</span><b>10</b></li>
            <li><span>Shifts open</span><b>3</b></li>
          </ul>
        </div>
      </div>

      <!-- live inventory (glass, top right) -->
      <section class="inv">
        <header><b>Inventory</b><span class="chip chip--rose">3 to reorder</span></header>
        <ul>
          <li><span>Coffee beans</span><span class="track track--rose"><i style="width: 18%" /></span></li>
          <li><span>Burger buns</span><span class="track track--amber"><i style="width: 38%" /></span></li>
          <li><span>Oat milk</span><span class="track track--ok"><i style="width: 76%" /></span></li>
        </ul>
      </section>
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
  --hp-device: #0b1120;
  position: relative; aspect-ratio: 100 / 84; font-size: 1.62cqw; color: var(--hp-text); font-family: var(--x-font-sans);
}
/* one soft halo behind the main screen */
.hp__stage::before { content: ''; position: absolute; inset: 0 6% 12%; z-index: 0; border-radius: 50%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--hp-a) 26%, transparent), transparent),
              radial-gradient(45% 45% at 85% 85%, color-mix(in srgb, var(--hp-b) 22%, transparent), transparent);
  filter: blur(2.5em); }

.hp__links { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; overflow: visible; }
.hp__links path { fill: none; stroke: color-mix(in srgb, var(--hp-a) 30%, transparent); stroke-width: 2px; vector-effect: non-scaling-stroke; }
.hp__links .flow { stroke: url(#hp-flow); stroke-dasharray: 6 14; stroke-linecap: round; }

b { font-weight: 700; }
small { color: var(--hp-muted); font-size: 0.82em; }
.chip { display: inline-flex; align-items: center; gap: 0.35em; padding: 0.2em 0.6em; border-radius: 999px; font-size: 0.78em; font-weight: 700; white-space: nowrap; }
.chip--muted { background: var(--hp-soft); color: var(--hp-muted); }
.chip--live { background: var(--x-success-soft); color: var(--x-success-text); }
.chip--live i { width: 0.5em; height: 0.5em; border-radius: 50%; background: currentColor; }
.chip--rose { background: var(--x-danger-soft); color: var(--x-danger-text); }
.btn { display: inline-flex; align-items: center; justify-content: center; padding: 0.5em 1.2em; border-radius: 0.6em; background: var(--hp-a); color: #fff; font-weight: 700; font-size: 0.9em; }
.up { color: var(--x-success-text); font-style: normal; font-weight: 700; font-size: 0.78em; }
.down { color: var(--x-danger-text); font-style: normal; font-weight: 700; font-size: 0.78em; }
.track { position: relative; display: block; height: 0.5em; border-radius: 999px; background: var(--hp-soft); overflow: hidden; }
.track i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: linear-gradient(90deg, var(--hp-a), var(--hp-b)); }
.track--rose i { background: var(--x-danger); }
.track--amber i { background: var(--x-warning); }
.track--ok i { background: var(--x-success); }

/* laptop: the dominant screen */
.laptop { position: absolute; z-index: 2; left: 2%; top: 4%; width: 80%; }
.laptop__lid { padding: 1.1% 1.1% 1.4%; border-radius: 1.3em 1.3em 0.4em 0.4em; background: var(--hp-device);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.25), 0 3em 5em -2em rgba(15, 23, 42, 0.45); }
.laptop__screen { display: flex; aspect-ratio: 16 / 10; border-radius: 0.6em; overflow: hidden; background: var(--x-bg); }
.laptop__base { position: relative; height: 1.3em; margin-inline: -6%; border-radius: 0 0 1.4em 1.4em;
  background: linear-gradient(#cbd5e1, #94a3b8); box-shadow: 0 1.2em 2em -1em rgba(15, 23, 42, 0.5); }
.laptop__base::before { content: ''; position: absolute; left: 50%; top: 0; translate: -50% 0; width: 16%; height: 0.45em; border-radius: 0 0 0.6em 0.6em; background: #64748b; }
:root[data-theme='dark'] .laptop__base { background: linear-gradient(#475569, #1e293b); }

.dash__side { flex: none; width: 3.4em; display: flex; flex-direction: column; align-items: center; gap: 0.9em; padding-top: 1em; background: var(--x-brand-navy, #0f172a); }
.dash__side i { width: 1.3em; height: 1.3em; border-radius: 0.4em; background: rgba(255, 255, 255, 0.1); }
.dash__side i.on { background: var(--hp-a); }
.dash__logo { width: 1.7em; height: 1.7em; border-radius: 0.5em; margin-bottom: 0.6em; background: var(--x-brand-gradient); }
.dash { flex: 1; min-width: 0; padding: 1.1em 1.3em; display: flex; flex-direction: column; gap: 0.9em; }
.dash__bar { display: flex; align-items: center; gap: 0.6em; font-size: 1.05em; }
.dash__bar b { margin-inline-end: auto; }
.dash__kpis { display: grid; grid-template-columns: repeat(3, 1fr); margin-inline-end: 22%; gap: 0.6em; }
.dash__kpis div { display: flex; flex-direction: column; gap: 0.15em; padding: 0.6em 0.7em; border-radius: 0.7em; background: var(--hp-card); border: 1px solid var(--hp-line); }
.dash__kpis b { font-family: var(--x-font-display); font-size: 1.3em; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.dash__body { flex: 1; display: grid; grid-template-columns: 1.6fr 1fr; gap: 0.8em; min-height: 0; }
.dash__chart { position: relative; padding: 1.6em 0.8em 0.6em; border-radius: 0.8em; background: var(--hp-card); border: 1px solid var(--hp-line); }
.dash__chart svg { width: 100%; height: 100%; overflow: visible; display: block; }
.dash__chart .grid { stroke: var(--hp-line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.dash__chart .line { fill: none; stroke: var(--hp-a); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.dash__chart .prev { fill: none; stroke: var(--hp-muted); stroke-opacity: 0.45; stroke-width: 1.5; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; }
.dash__chart .dot { fill: var(--hp-card); stroke: var(--hp-a); stroke-width: 3; vector-effect: non-scaling-stroke; }
.dash__tip { position: absolute; right: 0.6em; top: 0.5em; padding: 0.25em 0.6em; border-radius: 0.5em; background: var(--x-brand-navy, #0f172a); color: #fff; font-size: 0.75em; font-weight: 700; }
.dash__tip small { color: rgba(255, 255, 255, 0.7); font-weight: 500; }
.dash__branches { list-style: none; margin: 0; padding: 0.9em; display: flex; flex-direction: column; justify-content: space-around; border-radius: 0.8em; background: var(--hp-card); border: 1px solid var(--hp-line); }
.dash__branches li { display: grid; grid-template-columns: 1fr auto; gap: 0.3em 0.6em; font-size: 0.8em; }
.dash__branches .nm { color: var(--hp-muted); }
.dash__branches .track { grid-column: 1 / -1; grid-row: 2; }
:root[data-theme='dark'] .dash__tip { background: #fff; color: #0f172a; }
:root[data-theme='dark'] .dash__tip small { color: #475569; }

/* hub */
.hub { position: absolute; z-index: 3; left: 52%; top: 90%; translate: -50% -50%; display: flex; align-items: center; gap: 0.7em; padding: 0.55em 0.9em 0.55em 0.55em; border-radius: 999px; white-space: nowrap;
  background: color-mix(in srgb, var(--hp-card) 80%, transparent); backdrop-filter: blur(1em) saturate(1.5); -webkit-backdrop-filter: blur(1em) saturate(1.5);
  border: 1px solid color-mix(in srgb, var(--hp-a) 30%, var(--hp-line)); box-shadow: 0 0 0 0.5em color-mix(in srgb, var(--hp-a) 8%, transparent), 0 1.4em 2.8em -1.2em rgba(15, 23, 42, 0.45); }
.hub__mark { display: grid; place-items: center; width: 2.2em; height: 2.2em; border-radius: 50%; background: var(--x-brand-gradient); color: #fff; font-family: var(--x-font-display); font-weight: 800; }
.hub__txt { display: flex; flex-direction: column; line-height: 1.2; }
.hub__mods { display: flex; gap: 0.3em; }
.hub__mods i { font-style: normal; font-size: 0.72em; font-weight: 700; padding: 0.25em 0.6em; border-radius: 999px; background: var(--hp-soft); color: var(--hp-muted); }

/* tablet POS terminal */
.tablet { position: absolute; z-index: 4; left: 0; top: 50%; width: 34%; padding: 0.55em; border-radius: 1.4em; background: var(--hp-device);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.25), 0 2.4em 4em -1.6em rgba(15, 23, 42, 0.55); }
.tablet__screen { display: flex; flex-direction: column; gap: 0.6em; padding: 0.8em; border-radius: 0.9em; background: var(--hp-card); font-size: 0.85em; }
.pos__bar { display: flex; align-items: center; justify-content: space-between; }
.pos__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35em; }
.pos__grid span { padding: 0.55em 0.3em; border-radius: 0.5em; text-align: center; font-size: 0.82em; font-weight: 600; background: var(--hp-soft); }
.pos__grid span:first-child { background: color-mix(in srgb, var(--hp-a) 16%, transparent); color: var(--x-primary-text); }
.pos__lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35em; font-variant-numeric: tabular-nums; }
.pos__lines li { display: flex; justify-content: space-between; padding-bottom: 0.35em; border-bottom: 1px dashed var(--hp-line); }
.pos__pay { display: flex; align-items: center; justify-content: space-between; font-family: var(--x-font-display); font-weight: 800; }

/* phone manager app */
.phone { position: absolute; z-index: 4; right: 0; top: 44%; width: 19%; padding: 0.4em; border-radius: 1.8em; background: var(--hp-device);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.25), 0 2.4em 4em -1.6em rgba(15, 23, 42, 0.55); }
.phone__screen { position: relative; display: flex; flex-direction: column; gap: 0.25em; padding: 1.7em 0.8em 0.9em; border-radius: 1.45em; color: #e2e8f0;
  background: radial-gradient(90% 60% at 80% 0%, color-mix(in srgb, var(--hp-a) 55%, transparent), transparent), #0f172a; }
.phone__notch { position: absolute; top: 0.5em; left: 50%; translate: -50% 0; width: 32%; height: 0.5em; border-radius: 999px; background: #020617; }
.phone small { color: #94a3b8; font-size: 0.72em; }
.phone__big { font-family: var(--x-font-display); font-size: 1.3em; color: #fff; font-variant-numeric: tabular-nums; }
.phone .up { color: #4ade80; font-size: 0.7em; }
.phone__spark { width: 100%; height: 2.4em; margin: 0.2em 0; overflow: visible; }
.phone__spark path { fill: none; stroke: #5eead4; stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.phone ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3em; }
.phone li { display: flex; justify-content: space-between; padding: 0.4em 0.55em; border-radius: 0.55em; background: rgba(255, 255, 255, 0.07); font-size: 0.72em; }
.phone li b { color: #fff; }

/* inventory glass card */
.inv { position: absolute; z-index: 4; right: 0; top: 10%; width: 27%; padding: 0.85em 0.95em; border-radius: 1em;
  background: color-mix(in srgb, var(--hp-card) 90%, transparent); backdrop-filter: blur(1.2em) saturate(1.5); -webkit-backdrop-filter: blur(1.2em) saturate(1.5);
  border: 1px solid color-mix(in srgb, #fff 50%, var(--hp-line)); box-shadow: 0 1.8em 3.2em -1.4em rgba(15, 23, 42, 0.4); }
:root[data-theme='dark'] .inv { border-color: rgba(255, 255, 255, 0.12); }
.inv header { display: flex; align-items: center; justify-content: space-between; gap: 0.5em; margin-bottom: 0.6em; }
.inv ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5em; }
.inv li { display: grid; grid-template-columns: 6em 1fr; align-items: center; gap: 0.6em; font-size: 0.8em; color: var(--hp-muted); }

/* data flowing toward the hub; still for reduced motion */
@media (prefers-reduced-motion: no-preference) {
  .hp__links .flow { animation: hp-flow 2.4s linear infinite; }
}
@keyframes hp-flow { to { stroke-dashoffset: -40; } }

/* phones: the laptop full width, terminal and app beneath it, hub between */
@container (max-width: 520px) {
  .hp__stage { font-size: 2.3cqw; aspect-ratio: 100 / 112; }
  .laptop { left: 4%; width: 92%; }
  .dash__kpis { margin-inline-end: 0; }
  .inv, .hub__mods, .hp__links { display: none; }
  .tablet { top: 46%; width: 52%; }
  .phone { top: 42%; width: 30%; right: 4%; }
  .hub { top: auto; bottom: 0; translate: -50% 0; }
}
</style>
