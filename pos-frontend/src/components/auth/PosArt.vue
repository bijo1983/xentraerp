<script setup lang="ts">
// Abstract point-of-sale artwork for the sign-in page's left side: a receipt, a payment card, a
// terminal, a floor plan of tables and a sales chart, drawn as flat shapes. Each visit picks a
// palette and nudges the pieces, so the picture is a little different every time. Pure inline
// SVG — no image request, and nothing the Content-Security-Policy has to allow.
import { computed } from 'vue'

const palettes = [
  { bg: ['#0b1120', '#1e3a8a'], a: '#3b82f6', b: '#14b8a6', c: '#f59e0b', ink: '#e2e8f0' },
  { bg: ['#0f172a', '#4c1d95'], a: '#8b5cf6', b: '#ec4899', c: '#22d3ee', ink: '#ede9fe' },
  { bg: ['#052e2b', '#0f766e'], a: '#2dd4bf', b: '#facc15', c: '#fb7185', ink: '#ccfbf1' },
  { bg: ['#1c1917', '#9a3412'], a: '#fb923c', b: '#fde68a', c: '#38bdf8', ink: '#fff7ed' },
]

const rnd = (min: number, max: number) => min + Math.random() * (max - min)
const p = palettes[Math.floor(Math.random() * palettes.length)]

// Each piece gets a small random offset and tilt.
const jitter = () => ({ x: rnd(-18, 18), y: rnd(-18, 18), r: rnd(-6, 6) })
const pos = { receipt: jitter(), card: jitter(), terminal: jitter(), floor: jitter(), chart: jitter() }
const tf = (k: keyof typeof pos, x: number, y: number, rot = 0) => `translate(${x + pos[k].x} ${y + pos[k].y}) rotate(${rot + pos[k].r})`

const bars = Array.from({ length: 6 }, () => rnd(30, 110))
const tables = Array.from({ length: 9 }, (_, i) => ({ cx: (i % 3) * 52, cy: Math.floor(i / 3) * 52, on: Math.random() < 0.45 }))
const dots = Array.from({ length: 26 }, () => ({ cx: rnd(0, 600), cy: rnd(0, 800), r: rnd(1.5, 4), o: rnd(0.15, 0.5) }))
const zigzag = computed(() => {
  let d = 'M0 230'
  for (let x = 0; x < 180; x += 15) d += ` L${x + 7.5} 242 L${x + 15} 230`
  return d + ' L180 0 L0 0 Z'
})
</script>

<template>
  <svg class="art" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="art-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="p.bg[0]" />
        <stop offset="1" :stop-color="p.bg[1]" />
      </linearGradient>
      <radialGradient id="art-glow" cx="0.75" cy="0.2" r="0.6">
        <stop offset="0" :stop-color="p.a" stop-opacity="0.45" />
        <stop offset="1" :stop-color="p.a" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="art-card" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="p.a" />
        <stop offset="1" :stop-color="p.b" />
      </linearGradient>
    </defs>

    <rect width="600" height="800" fill="url(#art-bg)" />
    <rect width="600" height="800" fill="url(#art-glow)" />
    <g :stroke="p.ink" stroke-opacity="0.06">
      <path v-for="i in 12" :key="`v${i}`" :d="`M${i * 50} 0 V800`" />
      <path v-for="i in 16" :key="`h${i}`" :d="`M0 ${i * 50} H600`" />
    </g>
    <circle v-for="(d, i) in dots" :key="i" :cx="d.cx" :cy="d.cy" :r="d.r" :fill="p.ink" :fill-opacity="d.o" />

    <!-- big soft shapes -->
    <circle :cx="470 + pos.card.x * 2" cy="640" r="150" :fill="p.b" fill-opacity="0.12" />
    <circle :cx="90 + pos.floor.x * 2" cy="150" r="110" :fill="p.c" fill-opacity="0.1" />

    <!-- terminal -->
    <g :transform="tf('terminal', 250, 250, -4)">
      <rect width="250" height="180" rx="22" :fill="p.ink" fill-opacity="0.1" :stroke="p.ink" stroke-opacity="0.25" stroke-width="2" />
      <rect x="16" y="16" width="218" height="122" rx="10" :fill="p.bg[0]" fill-opacity="0.7" />
      <rect v-for="i in 6" :key="i" :x="28 + ((i - 1) % 3) * 68" :y="28 + Math.floor((i - 1) / 3) * 54" width="58" height="44" rx="8" :fill="i % 2 ? p.a : p.b" :fill-opacity="0.25 + (i % 3) * 0.15" />
      <path d="M95 180 L80 230 H170 L155 180 Z" :fill="p.ink" fill-opacity="0.12" />
    </g>

    <!-- receipt -->
    <g :transform="tf('receipt', 70, 330, -9)">
      <path :d="zigzag" fill="#fff" fill-opacity="0.94" />
      <rect x="20" y="22" width="80" height="10" rx="5" :fill="p.a" />
      <rect v-for="i in 6" :key="i" x="20" :y="48 + i * 22" :width="i % 2 ? 140 : 110" height="7" rx="3.5" fill="#0f172a" fill-opacity="0.18" />
      <rect x="20" y="196" width="60" height="12" rx="6" fill="#0f172a" fill-opacity="0.55" />
      <rect x="120" y="196" width="40" height="12" rx="6" :fill="p.c" />
    </g>

    <!-- payment card -->
    <g :transform="tf('card', 330, 520, 8)">
      <rect width="210" height="132" rx="16" fill="url(#art-card)" />
      <rect x="20" y="28" width="36" height="28" rx="6" fill="#fff" fill-opacity="0.75" />
      <circle cx="160" cy="104" r="14" fill="#fff" fill-opacity="0.55" />
      <circle cx="178" cy="104" r="14" fill="#fff" fill-opacity="0.3" />
      <rect x="20" y="80" width="100" height="8" rx="4" fill="#fff" fill-opacity="0.6" />
      <rect x="20" y="98" width="60" height="8" rx="4" fill="#fff" fill-opacity="0.4" />
    </g>

    <!-- floor plan -->
    <g :transform="tf('floor', 70, 90, 0)">
      <circle v-for="(tb, i) in tables" :key="i" :cx="tb.cx" :cy="tb.cy" r="17" :fill="tb.on ? p.c : 'none'" :fill-opacity="0.8" :stroke="p.ink" stroke-opacity="0.45" stroke-width="2" />
    </g>

    <!-- sales chart -->
    <g :transform="tf('chart', 90, 640, 0)">
      <rect v-for="(h, i) in bars" :key="i" :x="i * 30" :y="110 - h" width="18" :height="h" rx="5" :fill="i === bars.length - 1 ? p.c : p.ink" :fill-opacity="i === bars.length - 1 ? 1 : 0.28" />
    </g>
  </svg>
</template>

<style scoped>
.art { display: block; width: 100%; height: 100%; }
</style>
