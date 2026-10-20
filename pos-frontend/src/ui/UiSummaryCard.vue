<script setup lang="ts">
// KPI tile: a label, a big value and an optional hint/trend.
withDefaults(defineProps<{ label: string; value: string; hint?: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary' }>(), { tone: 'neutral' })
</script>

<template>
  <div class="x-summary" :class="`x-summary--${tone}`">
    <div class="x-summary__label">{{ label }}</div>
    <div class="x-summary__value x-tabular">{{ value }}</div>
    <div v-if="hint" class="x-summary__hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.x-summary { background: var(--x-surface); border: 1px solid var(--x-border); border-radius: var(--x-radius-lg); padding: var(--x-space-4); display: flex; flex-direction: column; gap: var(--x-space-1); border-inline-start-width: 4px; }
.x-summary--primary { border-inline-start-color: var(--x-primary); }
.x-summary--success { border-inline-start-color: var(--x-success); }
.x-summary--warning { border-inline-start-color: var(--x-warning); }
.x-summary--danger { border-inline-start-color: var(--x-danger); }
.x-summary__label { font-size: var(--x-text-xs); color: var(--x-text-muted); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
.x-summary__value { font-family: var(--x-font-display); font-size: var(--x-text-xl); font-weight: 700; }
.x-summary__hint { font-size: var(--x-text-xs); color: var(--x-text-muted); }
</style>
