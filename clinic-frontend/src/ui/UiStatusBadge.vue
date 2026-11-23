<script setup lang="ts">
// Status = colour + icon + text (never colour alone).
import { computed, type Component } from 'vue'

const props = withDefaults(defineProps<{ tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'; icon?: string | Component | null; size?: 'sm' | 'md' }>(), {
  tone: 'neutral',
  icon: null,
  size: 'md',
})
const DEFAULT_ICON: Record<string, string> = { success: '●', warning: '▲', danger: '■', info: 'i', neutral: '○', primary: '◆' }
const glyph = computed(() => props.icon ?? DEFAULT_ICON[props.tone])
</script>

<template>
  <span class="x-badge" :class="[`x-badge--${tone}`, `x-badge--${size}`]">
    <component :is="glyph" v-if="typeof glyph === 'object' || typeof glyph === 'function'" class="x-badge__svg" :size="13" :stroke-width="2.2" aria-hidden="true" />
    <span v-else class="x-badge__icon" aria-hidden="true">{{ glyph }}</span>
    <slot />
  </span>
</template>

<style scoped>
.x-badge { display: inline-flex; align-items: center; gap: 6px; border-radius: var(--x-radius-full); font-weight: 600; white-space: nowrap; line-height: 1; }
.x-badge--md { padding: 6px 10px; font-size: var(--x-text-xs); }
.x-badge--sm { padding: 4px 8px; font-size: 11px; }
.x-badge__icon { font-size: 9px; }
.x-badge__svg { flex: none; }
.x-badge--success { background: var(--x-success-soft); color: var(--x-success-text); }
.x-badge--warning { background: var(--x-warning-soft); color: var(--x-warning-text); }
.x-badge--danger { background: var(--x-danger-soft); color: var(--x-danger-text); }
.x-badge--info { background: var(--x-info-soft); color: var(--x-info-text); }
.x-badge--primary { background: var(--x-primary-soft); color: var(--x-primary-text); }
.x-badge--neutral { background: var(--x-surface-3); color: var(--x-text-muted); }
</style>
