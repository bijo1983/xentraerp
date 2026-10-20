<script setup lang="ts">
// Product visual for a landing-page capability that has no presentable real screen: a stock
// overview ("inventory") or a branch comparison ("branches"), drawn in HTML in the same style as
// HeroProduct. Illustrative sample data; decorative with one label for screen readers.
defineProps<{ kind: 'inventory' | 'branches'; label: string }>()

const stock = [
  { item: 'Arabica beans 1kg', wh: 'Seef Mall', qty: 4, par: 25, state: 'low' },
  { item: 'Burger buns', wh: 'Adliya', qty: 38, par: 60, state: 'watch' },
  { item: 'Oat milk 1L', wh: 'Seef Mall', qty: 64, par: 40, state: 'ok' },
  { item: 'Basmati rice 5kg', wh: 'Central', qty: 112, par: 50, state: 'ok' },
  { item: 'Takeaway cups 12oz', wh: 'Riffa', qty: 9, par: 40, state: 'low' },
]
const sites = [
  { name: 'Seef Mall', code: 'SEEF', sales: 18420, change: 12.4, share: 92, registers: 4, status: 'Open' },
  { name: 'Adliya', code: 'ADL', sales: 14205, change: 6.1, share: 71, registers: 3, status: 'Open' },
  { name: 'Riffa', code: 'RIF', sales: 10870, change: -2.3, share: 54, registers: 2, status: 'Open' },
  { name: 'Central Kitchen', code: 'CK', sales: 4735, change: 3.8, share: 24, registers: 1, status: 'Closing' },
]
const fmt = (n: number) => n.toLocaleString('en-US')
</script>

<template>
  <figure class="pp" role="img" :aria-label="label" dir="ltr">
    <div class="pp__win" aria-hidden="true">
      <header class="pp__bar">
        <span class="dots"><i /><i /><i /></span>
        <b>{{ kind === 'inventory' ? 'Stock overview' : 'Branches' }}</b>
        <span class="chip">{{ kind === 'inventory' ? 'All warehouses' : 'Today' }}</span>
      </header>

      <template v-if="kind === 'inventory'">
        <div class="pp__kpis">
          <div><small>Stock value</small><b>BHD 86,410</b></div>
          <div><small>Low stock</small><b class="t-rose">12</b></div>
          <div><small>Transfers</small><b>5</b></div>
        </div>
        <table class="pp__tbl">
          <thead><tr><th>Item</th><th>Warehouse</th><th>On hand</th><th /></tr></thead>
          <tbody>
            <tr v-for="s in stock" :key="s.item">
              <td>{{ s.item }}</td>
              <td class="muted">{{ s.wh }}</td>
              <td>
                <span class="meter" :class="`is-${s.state}`"><i :style="{ width: `${Math.min(100, (s.qty / s.par) * 60)}%` }" /></span>
                <b>{{ s.qty }}</b>
              </td>
              <td><span class="pill" :class="`is-${s.state}`">{{ s.state === 'low' ? 'Reorder' : s.state === 'watch' ? 'Watch' : 'OK' }}</span></td>
            </tr>
          </tbody>
        </table>
      </template>

      <template v-else>
        <div class="pp__kpis">
          <div><small>Group sales</small><b>BHD 48,230</b></div>
          <div><small>Branches</small><b>4</b></div>
          <div><small>Registers live</small><b>10</b></div>
        </div>
        <ul class="pp__sites">
          <li v-for="s in sites" :key="s.code">
            <span class="code">{{ s.code }}</span>
            <span class="name"><b>{{ s.name }}</b><small>{{ s.registers }} registers · {{ s.status }}</small></span>
            <span class="bar"><i :style="{ width: `${s.share}%` }" /></span>
            <span class="num"><b>{{ fmt(s.sales) }}</b><small :class="s.change >= 0 ? 't-up' : 't-down'">{{ s.change >= 0 ? '▲' : '▼' }} {{ Math.abs(s.change) }}%</small></span>
          </li>
        </ul>
      </template>
    </div>
  </figure>
</template>

<style scoped>
.pp { margin: 0; container-type: inline-size; min-width: 0; }
.pp__win { font-size: clamp(11px, 2.15cqw, 15px); padding: 1.3em; border-radius: 1.2em; background: var(--x-surface); border: 1px solid var(--x-border); color: var(--x-text);
  box-shadow: 0 0.1em 0.2em rgba(15, 23, 42, 0.05), 0 2em 4em -1.6em rgba(15, 23, 42, 0.3); }
.pp__bar { display: flex; align-items: center; gap: 0.7em; margin-bottom: 1em; }
.pp__bar b { margin-inline-end: auto; font-size: 1.05em; }
.dots { display: inline-flex; gap: 0.3em; }
.dots i { width: 0.6em; height: 0.6em; border-radius: 50%; background: var(--x-surface-3); }
.chip { padding: 0.25em 0.7em; border-radius: 999px; background: var(--x-surface-3); color: var(--x-text-muted); font-size: 0.8em; font-weight: 700; }
small { color: var(--x-text-muted); font-size: 0.8em; }
.muted { color: var(--x-text-muted); }
.pp__kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.7em; margin-bottom: 1em; }
.pp__kpis div { display: flex; flex-direction: column; gap: 0.2em; padding: 0.7em 0.8em; border-radius: 0.7em; background: var(--x-surface-3); }
.pp__kpis b { font-family: var(--x-font-display); font-size: 1.3em; letter-spacing: -0.02em; }
.t-rose, .t-down { color: var(--x-danger-text); }
.t-up { color: var(--x-success-text); }

.pp__tbl { width: 100%; border-collapse: collapse; font-size: 0.9em; }
.pp__tbl th { text-align: start; font-size: 0.82em; font-weight: 600; color: var(--x-text-muted); padding: 0 0 0.5em; border-bottom: 1px solid var(--x-border); }
.pp__tbl td { padding: 0.6em 0; border-bottom: 1px solid var(--x-border); white-space: nowrap; }
.pp__tbl tr:last-child td { border-bottom: 0; }
.pp__tbl td:nth-child(3) { display: flex; align-items: center; gap: 0.5em; }
.meter { display: inline-block; width: 4.5em; height: 0.45em; border-radius: 999px; background: var(--x-surface-3); overflow: hidden; }
.meter i { display: block; height: 100%; border-radius: inherit; background: var(--x-success); }
.meter.is-low i { background: var(--x-danger); }
.meter.is-watch i { background: var(--x-warning); }
.pill { padding: 0.2em 0.6em; border-radius: 999px; font-size: 0.8em; font-weight: 700; background: var(--x-success-soft); color: var(--x-success-text); }
.pill.is-low { background: var(--x-danger-soft); color: var(--x-danger-text); }
.pill.is-watch { background: var(--x-warning-soft); color: var(--x-warning-text); }

.pp__sites { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6em; }
.pp__sites li { display: grid; grid-template-columns: 3.2em minmax(0, 1.4fr) minmax(0, 1fr) auto; align-items: center; gap: 0.8em; padding: 0.7em 0.8em; border-radius: 0.8em; border: 1px solid var(--x-border); }
.code { display: grid; place-items: center; height: 2.4em; border-radius: 0.6em; background: var(--x-primary-soft, var(--x-surface-3)); color: var(--x-primary-text); font-size: 0.78em; font-weight: 800; }
.name { display: flex; flex-direction: column; min-width: 0; }
.name b, .name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { height: 0.5em; border-radius: 999px; background: var(--x-surface-3); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--x-primary), var(--x-brand-teal, #14b8a6)); }
.num { display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; }
</style>
