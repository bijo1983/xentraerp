<script setup lang="ts">
// Product visual for a landing-page capability, drawn in HTML in the same style as HeroProduct
// instead of a screenshot of a real system: restaurant floor and order, retail checkout,
// analytics, stock overview or branch comparison. Deliberately shows no figures (amounts,
// quantities, counts): values are drawn as neutral placeholder bars. `flat` drops the window
// chrome when the panel sits inside a DeviceFrame screen. Decorative, with one label for
// screen readers.
withDefaults(defineProps<{ kind: 'restaurant' | 'retail' | 'analytics' | 'inventory' | 'branches'; label: string; flat?: boolean }>(), { flat: false })

const titles = { restaurant: 'Floor & orders', retail: 'Checkout', analytics: 'Today at a glance', inventory: 'Stock overview', branches: 'Branches' }
const chips = { restaurant: 'Dine-in', retail: 'Counter', analytics: 'All branches', inventory: 'All warehouses', branches: 'Today' }

const tables = ['free', 'seated', 'seated', 'reserved', 'bill', 'free', 'seated', 'free', 'seated']
const tableLabel: Record<string, string> = { free: 'Free', seated: 'Seated', reserved: 'Reserved', bill: 'Bill' }
const order = [{ name: 'Truffle burger', w: 46, note: 'No onion' }, { name: 'Caesar salad', w: 40 }, { name: 'Spanish latte', w: 34, note: 'Oat milk' }, { name: 'Fresh juice', w: 30 }]
const basket = [{ name: 'Linen shirt · M', w: 44 }, { name: 'Leather belt', w: 36 }, { name: 'Canvas tote', w: 30 }]
const kpis = [{ label: 'Sales', w: 72 }, { label: 'Bills', w: 52 }, { label: 'Average bill', w: 60 }]
const methods = [{ name: 'Card', w: 78 }, { name: 'Cash', w: 54 }, { name: 'Wallet', w: 30 }]
const bars = [38, 52, 46, 64, 58, 76, 88]
const stock = [
  { item: 'Arabica beans', wh: 'Downtown', fill: 16, state: 'low' },
  { item: 'Burger buns', wh: 'Riverside', fill: 42, state: 'watch' },
  { item: 'Oat milk', wh: 'Downtown', fill: 78, state: 'ok' },
  { item: 'Basmati rice', wh: 'Central', fill: 90, state: 'ok' },
  { item: 'Takeaway cups', wh: 'Airport', fill: 20, state: 'low' },
]
const sites = [
  { name: 'Downtown', share: 92, up: true, status: 'Open' },
  { name: 'Riverside', share: 71, up: true, status: 'Open' },
  { name: 'Airport', share: 54, up: false, status: 'Open' },
  { name: 'Central Kitchen', share: 24, up: true, status: 'Closing' },
]
</script>

<template>
  <figure class="pp" :class="{ 'pp--flat': flat }" role="img" :aria-label="label" dir="ltr">
    <div class="pp__win" aria-hidden="true">
      <header class="pp__bar">
        <span class="dots"><i /><i /><i /></span>
        <b>{{ titles[kind] }}</b>
        <span class="chip">{{ chips[kind] }}</span>
      </header>

      <!-- restaurant: live floor plan beside the order being taken -->
      <div v-if="kind === 'restaurant'" class="pp__split">
        <ul class="floor">
          <li v-for="(s, i) in tables" :key="i" :class="`is-${s}`"><span class="tbl" /><small>{{ tableLabel[s] }}</small></li>
        </ul>
        <div class="ticket">
          <ul class="lines">
            <li v-for="o in order" :key="o.name">
              <span><b>{{ o.name }}</b><small v-if="o.note">{{ o.note }}</small></span>
              <i class="sk" :style="{ width: `${o.w / 10}em` }" />
            </li>
          </ul>
          <span class="btn">Send to kitchen</span>
        </div>
      </div>

      <!-- retail: scan, basket with promotion and loyalty, split payment -->
      <div v-else-if="kind === 'retail'" class="pp__split">
        <div class="ticket">
          <div class="scan"><span class="barcode" /><span>Scan or search item</span></div>
          <ul class="lines">
            <li v-for="b in basket" :key="b.name"><b>{{ b.name }}</b><i class="sk" :style="{ width: `${b.w / 10}em` }" /></li>
          </ul>
          <span class="tag tag--promo">Promotion applied</span>
          <span class="tag tag--ok">Loyalty points earned</span>
        </div>
        <div class="pay">
          <small>Total</small>
          <i class="sk sk--lg" />
          <span class="pay__m is-on">Card</span>
          <span class="pay__m">Cash</span>
          <span class="pay__m">Split</span>
        </div>
      </div>

      <!-- analytics: KPI tiles, sales trend, payment mix — shapes only -->
      <template v-else-if="kind === 'analytics'">
        <div class="pp__kpis">
          <div v-for="k in kpis" :key="k.label"><small>{{ k.label }}</small><i class="sk sk--lg" :style="{ width: `${k.w}%` }" /><em class="t-up">▲ Up on last week</em></div>
        </div>
        <div class="pp__split pp__split--wide">
          <div class="chart"><i v-for="(h, i) in bars" :key="i" :style="{ height: `${h}%` }" :class="{ on: i === bars.length - 1 }" /></div>
          <ul class="mix">
            <li v-for="m in methods" :key="m.name"><small>{{ m.name }}</small><span class="bar"><i :style="{ width: `${m.w}%` }" /></span></li>
          </ul>
        </div>
      </template>

      <!-- inventory: stock health per item and warehouse -->
      <template v-else-if="kind === 'inventory'">
        <table class="pp__tbl">
          <thead><tr><th>Item</th><th>Warehouse</th><th>Level</th><th /></tr></thead>
          <tbody>
            <tr v-for="s in stock" :key="s.item">
              <td>{{ s.item }}</td>
              <td class="muted">{{ s.wh }}</td>
              <td><span class="meter" :class="`is-${s.state}`"><i :style="{ width: `${s.fill}%` }" /></span></td>
              <td><span class="pill" :class="`is-${s.state}`">{{ s.state === 'low' ? 'Reorder' : s.state === 'watch' ? 'Watch' : 'OK' }}</span></td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- branches: relative performance, no amounts -->
      <ul v-else class="pp__sites">
        <li v-for="s in sites" :key="s.name">
          <span class="code">{{ s.name.slice(0, 2).toUpperCase() }}</span>
          <span class="name"><b>{{ s.name }}</b><small>{{ s.status }}</small></span>
          <span class="bar"><i :style="{ width: `${s.share}%` }" /></span>
          <small :class="s.up ? 't-up' : 't-down'">{{ s.up ? '▲' : '▼' }}</small>
        </li>
      </ul>
    </div>
  </figure>
</template>

<style scoped>
.pp { margin: 0; container-type: inline-size; min-width: 0; }
.pp__win { font-size: clamp(11px, 2.15cqw, 15px); padding: 1.3em; border-radius: 1.2em; background: var(--x-surface); border: 1px solid var(--x-border); color: var(--x-text);
  box-shadow: 0 0.1em 0.2em rgba(15, 23, 42, 0.05), 0 2em 4em -1.6em rgba(15, 23, 42, 0.3); }
.pp--flat .pp__win { border: 0; border-radius: 0; box-shadow: none; }
.pp--flat .dots { display: none; }
.pp__bar { display: flex; align-items: center; gap: 0.7em; margin-bottom: 1em; }
.pp__bar b { margin-inline-end: auto; font-size: 1.05em; }
.dots { display: inline-flex; gap: 0.3em; }
.dots i { width: 0.6em; height: 0.6em; border-radius: 50%; background: var(--x-surface-3); }
.chip { padding: 0.25em 0.7em; border-radius: 999px; background: var(--x-surface-3); color: var(--x-text-muted); font-size: 0.8em; font-weight: 700; }
small { color: var(--x-text-muted); font-size: 0.8em; }
.muted { color: var(--x-text-muted); }
.t-down { color: var(--x-danger-text); }
.t-up { color: var(--x-success-text); }
/* a value, drawn as a neutral bar instead of a figure */
.sk { display: inline-block; flex: none; height: 0.7em; width: 4em; border-radius: 999px; background: color-mix(in srgb, var(--x-text) 14%, transparent); }
.sk--lg { height: 1.1em; width: 70%; margin-block: 0.2em; }
.btn { display: grid; place-items: center; padding: 0.7em; border-radius: 0.7em; background: var(--x-primary); color: #fff; font-weight: 700; font-size: 0.9em; }
.tag { display: inline-flex; align-items: center; gap: 0.4em; align-self: flex-start; padding: 0.3em 0.7em; border-radius: 999px; font-size: 0.78em; font-weight: 700; }
.tag::before { content: ''; width: 0.5em; height: 0.5em; border-radius: 50%; background: currentColor; }
.tag--ok { background: var(--x-success-soft); color: var(--x-success-text); }
.tag--promo { background: var(--x-warning-soft); color: var(--x-warning-text); }

.pp__split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1em; }
.pp__split--wide { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); }
.ticket { display: flex; flex-direction: column; gap: 0.8em; padding: 0.9em; border-radius: 0.9em; border: 1px solid var(--x-border); }
.lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6em; font-size: 0.9em; }
.lines li { display: flex; align-items: center; justify-content: space-between; gap: 0.8em; }
.lines span { display: flex; flex-direction: column; min-width: 0; }
.lines b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.floor { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6em; }
.floor li { display: flex; flex-direction: column; align-items: center; gap: 0.35em; padding: 0.7em 0.3em; border-radius: 0.8em; border: 1px solid var(--x-border); }
.tbl { width: 2.2em; height: 2.2em; border-radius: 50%; background: var(--x-surface-3); }
.floor .is-seated { background: var(--x-primary-soft, var(--x-surface-3)); border-color: color-mix(in srgb, var(--x-primary) 35%, var(--x-border)); }
.floor .is-seated .tbl { background: var(--x-primary); }
.floor .is-reserved .tbl { background: var(--x-warning); }
.floor .is-bill .tbl { background: var(--x-success); }

.scan { display: flex; align-items: center; gap: 0.7em; padding: 0.6em 0.7em; border-radius: 0.7em; background: var(--x-surface-3); color: var(--x-text-muted); font-size: 0.85em; }
.barcode { width: 2.2em; height: 1.3em; flex: none; background: repeating-linear-gradient(90deg, var(--x-text) 0 2px, transparent 2px 4px, var(--x-text) 4px 5px, transparent 5px 8px); opacity: 0.7; }
.pay { display: flex; flex-direction: column; gap: 0.6em; padding: 0.9em; border-radius: 0.9em; background: var(--x-surface-3); }
.pay .sk--lg { width: 80%; }
.pay__m { padding: 0.55em 0.8em; border-radius: 0.6em; border: 1px solid var(--x-border); background: var(--x-surface); font-size: 0.85em; font-weight: 600; }
.pay__m.is-on { border-color: var(--x-primary); color: var(--x-primary-text); }

.pp__kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.7em; margin-bottom: 1em; }
.pp__kpis div { display: flex; flex-direction: column; gap: 0.2em; padding: 0.7em 0.8em; border-radius: 0.7em; background: var(--x-surface-3); }
.pp__kpis em { font-style: normal; font-size: 0.75em; font-weight: 600; }
.chart { display: flex; align-items: flex-end; gap: 0.5em; height: 9em; padding: 0.8em; border-radius: 0.9em; border: 1px solid var(--x-border);
  background: repeating-linear-gradient(to top, transparent 0 2.2em, var(--x-border) 2.2em calc(2.2em + 1px)); }
.chart i { flex: 1; border-radius: 0.4em 0.4em 0.15em 0.15em; background: color-mix(in srgb, var(--x-primary) 30%, transparent); }
.chart i.on { background: linear-gradient(var(--x-primary), var(--x-brand-teal, #14b8a6)); }
.mix { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; justify-content: center; gap: 0.7em; }
.mix li:not(.tag) { display: grid; gap: 0.3em; }

.pp__tbl { width: 100%; border-collapse: collapse; font-size: 0.9em; }
.pp__tbl th { text-align: start; font-size: 0.82em; font-weight: 600; color: var(--x-text-muted); padding: 0 0 0.5em; border-bottom: 1px solid var(--x-border); }
.pp__tbl td { padding: 0.6em 0; border-bottom: 1px solid var(--x-border); white-space: nowrap; }
.pp__tbl tr:last-child td { border-bottom: 0; }
.meter { display: inline-block; width: 6em; height: 0.45em; border-radius: 999px; background: var(--x-surface-3); overflow: hidden; vertical-align: middle; }
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
.bar { display: block; height: 0.5em; border-radius: 999px; background: var(--x-surface-3); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--x-primary), var(--x-brand-teal, #14b8a6)); }
@container (max-width: 420px) {
  .pp__split, .pp__split--wide { grid-template-columns: minmax(0, 1fr); }
}
</style>
