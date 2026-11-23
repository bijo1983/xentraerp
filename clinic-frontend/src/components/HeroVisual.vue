<script setup lang="ts">
// Product picture for the landing page, drawn from the app's own pieces (tooth shapes, fundus,
// appointment colours) so it always looks like the real thing and needs no image files.
import { computed } from 'vue'
import { BadgeCheck, CalendarCheck2, QrCode } from 'lucide-vue-next'
import { H, crownPath, roots, toothWidth } from '@/lib/toothShape'

const TEETH = [16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26]
const MARK: Record<number, string> = { 16: 'filled', 14: 'caries', 11: 'crown', 21: 'crown', 25: 'rct' }
const teeth = computed(() => {
  let x = 6
  return TEETH.map((t, i) => {
    const w = toothWidth(t)
    const item = { t, x, w, crown: crownPath(t), roots: roots(t), mark: MARK[t] || '' }
    x += w + 3 + (i === 5 ? 8 : 0)
    return item
  })
})
const width = computed(() => teeth.value.reduce((a, t) => Math.max(a, t.x + t.w), 0) + 6)
const SLOTS = [
  { time: '09:00', name: 'Fatima A.', type: 'Check-up', tone: 'done' },
  { time: '09:30', name: 'Khalid S.', type: 'Filling', tone: 'now' },
  { time: '10:45', name: 'Noura A.', type: 'Eye exam', tone: 'next' },
  { time: '11:30', name: 'Yusuf R.', type: 'Physio', tone: 'next' },
]
</script>

<template>
  <div class="hv" aria-hidden="true">
    <div class="hv__window">
      <div class="hv__bar"><i /><i /><i /><span>clinza.xentraerp.com</span></div>
      <div class="hv__body">
        <div class="hv__side">
          <div class="hv__h"><CalendarCheck2 :size="14" /> Today</div>
          <div v-for="s in SLOTS" :key="s.time" class="hv__slot" :class="s.tone">
            <b>{{ s.time }}</b>
            <span>{{ s.name }}</span>
            <em>{{ s.type }}</em>
          </div>
        </div>
        <div class="hv__main">
          <div class="hv__h">Dental chart · FDI</div>
          <svg :viewBox="`0 0 ${width} ${H + 8}`" class="hv__teeth">
            <g v-for="tt in teeth" :key="tt.t" :transform="`translate(${tt.x} 4)`">
              <path v-for="(r, i) in tt.roots" :key="i" :d="r.path" class="root" :class="{ back: r.back, rct: tt.mark === 'rct' }" />
              <template v-if="tt.mark === 'rct'"><path v-for="(r, i) in tt.roots" :key="'c' + i" :d="r.canal" class="canal" /></template>
              <path :d="tt.crown" class="crown" :class="`m-${tt.mark}`" />
              <circle v-if="tt.mark === 'caries'" :cx="tt.w / 2" cy="84" r="4.5" class="caries" />
              <rect v-if="tt.mark === 'filled'" :x="tt.w * 0.25" y="76" :width="tt.w * 0.5" height="13" rx="4" class="filling" />
            </g>
          </svg>
          <div class="hv__row">
            <svg viewBox="0 0 120 120" class="hv__fundus">
              <defs>
                <radialGradient id="hv-f"><stop offset="0" stop-color="#f29a6a" /><stop offset="0.75" stop-color="#d9603a" /><stop offset="1" stop-color="#a9381f" /></radialGradient>
                <clipPath id="hv-c"><circle cx="60" cy="60" r="56" /></clipPath>
              </defs>
              <circle cx="60" cy="60" r="56" fill="url(#hv-f)" />
              <g clip-path="url(#hv-c)" fill="none" stroke-linecap="round">
                <path d="M80 56 Q58 2 0 44" stroke="#8a1410" stroke-width="2.4" />
                <path d="M80 64 Q58 118 0 76" stroke="#8a1410" stroke-width="2.4" />
                <path d="M80 56 Q90 30 92 6" stroke="#d2402c" stroke-width="1.6" />
                <path d="M80 64 Q92 92 94 118" stroke="#d2402c" stroke-width="1.6" />
              </g>
              <circle cx="80" cy="60" r="9" fill="#f7d6a0" />
              <circle cx="80" cy="60" r="3.6" fill="#fff4dc" />
              <circle cx="40" cy="61" r="9" fill="rgba(120,30,12,.45)" />
              <circle cx="40" cy="61" r="1.8" fill="#5a160a" />
            </svg>
            <div class="hv__bill">
              <div class="hv__h">Tax invoice</div>
              <div class="hv__line"><span>Consultation</span><b>250.00</b></div>
              <div class="hv__line"><span>OCT scan</span><b>400.00</b></div>
              <div class="hv__line"><span>VAT 15%</span><b>97.50</b></div>
              <div class="hv__line total"><span>Total SAR</span><b>747.50</b></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="hv__float f1"><QrCode :size="16" /> ZATCA QR on every invoice</div>
    <div class="hv__float f2"><BadgeCheck :size="16" /> Claim sent · Bupa 80%</div>
  </div>
</template>

<style scoped>
.hv { position: relative; width: 100%; max-width: 620px; margin-inline: auto; }
.hv__window { border-radius: 20px; overflow: hidden; background: rgba(255, 255, 255, 0.82); border: 1px solid rgba(255, 255, 255, 0.9); box-shadow: 0 40px 80px -24px rgba(30, 41, 99, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.04); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); transform: perspective(1600px) rotateY(-6deg) rotateX(3deg); }
.hv__bar { display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-bottom: 1px solid rgba(15, 23, 42, 0.06); }
.hv__bar i { width: 9px; height: 9px; border-radius: 50%; background: #e2e8f0; }
.hv__bar span { margin-inline-start: 10px; font-size: 11px; color: #64748b; background: #f1f5f9; padding: 3px 10px; border-radius: 99px; }
.hv__body { display: grid; grid-template-columns: 150px 1fr; min-height: 300px; }
.hv__side { padding: 12px; border-inline-end: 1px solid rgba(15, 23, 42, 0.06); display: flex; flex-direction: column; gap: 7px; }
.hv__h { font-size: 11px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
.hv__slot { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; padding: 7px 8px; border-radius: 10px; font-size: 11.5px; background: #f8fafc; border-inline-start: 3px solid #94a3b8; }
.hv__slot b { grid-row: span 2; font-variant-numeric: tabular-nums; }
.hv__slot em { font-style: normal; color: #64748b; font-size: 10.5px; }
.hv__slot.done { border-color: #10b981; }
.hv__slot.now { border-color: #2563eb; background: #eff6ff; }
.hv__slot.next { border-color: #6366f1; }
.hv__main { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.hv__teeth { width: 100%; height: auto; }
.crown { fill: #fbf6ea; stroke: #a99c82; stroke-width: 1.1; }
.crown.m-crown { fill: #f0d98c; stroke: #a9852a; }
.crown.m-caries { fill: #fde3e1; }
.root { fill: #f0e4c9; stroke: #a99c82; stroke-width: 1; }
.root.back { fill: #e3d5b4; }
.root.rct { fill: #fde7c8; }
.canal { fill: none; stroke: #d97706; stroke-width: 2.4; stroke-linecap: round; }
.caries { fill: #7a2e1f; }
.filling { fill: #3b82f6; stroke: #1d4ed8; }
.hv__row { display: grid; grid-template-columns: 110px 1fr; gap: 12px; align-items: center; }
.hv__fundus { width: 100%; height: auto; }
.hv__bill { background: #f8fafc; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.hv__line { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; color: #334155; }
.hv__line.total { border-top: 1px dashed #cbd5e1; padding-top: 5px; margin-top: 2px; font-size: 13px; color: #0f172a; }
.hv__float { position: absolute; display: flex; align-items: center; gap: 7px; padding: 9px 13px; border-radius: 14px; font-size: 12.5px; font-weight: 600; color: #0f172a; background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(255, 255, 255, 1); box-shadow: 0 18px 40px -16px rgba(30, 41, 99, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); animation: hv-float 6s ease-in-out infinite; }
.hv__float svg { color: #2563eb; }
.f1 { left: -18px; bottom: 38px; }
.f2 { right: -10px; top: 64px; animation-delay: -3s; }
.f2 svg { color: #10b981; }
@keyframes hv-float { 50% { transform: translateY(-8px); } }
@media (prefers-reduced-motion: reduce) { .hv__float { animation: none; } }
@media (max-width: 640px) {
  .hv__window { transform: none; }
  .hv__body { grid-template-columns: 1fr; }
  .hv__side { display: none; }
  .f1 { left: 6px; bottom: -18px; }
  .f2 { right: 6px; top: -16px; }
}
</style>
