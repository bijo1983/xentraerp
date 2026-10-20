<script setup lang="ts">
// Large, scannable category chips: a food/retail glyph, the name and how many items it holds.
import { groupArt } from '@/lib/itemArt'

export interface Chip { value: string; label: string; count?: number }
withDefaults(defineProps<{ modelValue: string; options: Chip[]; label?: string; icons?: boolean }>(), { label: undefined, icons: true })
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="x-chips" role="group" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="x-chip"
      :class="{ on: o.value === modelValue }"
      :aria-pressed="o.value === modelValue"
      @click="emit('update:modelValue', o.value)"
    >
      <span v-if="icons" class="x-chip__ic x-art" :class="`x-art--${groupArt(o.value).tone}`" aria-hidden="true">
        <component :is="groupArt(o.value).icon" :size="18" :stroke-width="1.8" />
      </span>
      <span class="x-chip__label">{{ o.label }}</span>
      <span v-if="o.count !== undefined" class="x-chip__count x-tabular">{{ o.count }}</span>
    </button>
  </div>
</template>

<style scoped>
/* Categories wrap onto further rows so every one is visible at once (a hidden sideways
   scroll left tills showing only the first few). Phones cap it at about three rows. */
.x-chips { display: flex; flex-wrap: wrap; gap: 10px; padding: 2px 2px 4px; }
.x-chip {
  flex: none; min-height: 48px; padding: 0 16px 0 6px; border-radius: var(--x-radius-full);
  border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; font-size: var(--x-text-sm);
  font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; box-shadow: var(--x-shadow-xs);
  transition: background var(--x-duration), border-color var(--x-duration), color var(--x-duration), transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration);
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none;
}
.x-chip:hover { transform: translateY(-1px); box-shadow: var(--x-shadow-sm); }
.x-chip:active { transform: scale(0.97); }
.x-chip__ic { width: 36px; height: 36px; border-radius: 50%; flex: none; display: grid; place-items: center; background: var(--art-bg); color: var(--art-fg); }
.x-chip__label { white-space: nowrap; max-width: 22ch; overflow: hidden; text-overflow: ellipsis; }
.x-chip__count { font-size: 12px; font-weight: 700; min-width: 24px; height: 22px; padding: 0 7px; border-radius: 11px; display: grid; place-items: center; background: var(--x-surface-3); color: var(--x-text-muted); }
.x-chip.on { background: var(--x-brand-navy); border-color: var(--x-brand-navy); color: #fff; box-shadow: 0 8px 18px -8px rgba(15, 23, 42, 0.55); }
.x-chip.on .x-chip__count { background: rgba(255, 255, 255, 0.16); color: #fff; }
.x-chip.on .x-chip__ic { box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.25); }
:root[data-theme='dark'] .x-chip.on { background: var(--x-primary); border-color: var(--x-primary); }
@media (max-width: 767px) {
  .x-chips { gap: 8px; max-height: 160px; overflow-y: auto; overscroll-behavior: contain; }
  .x-chip { min-height: 44px; } .x-chip__ic { width: 32px; height: 32px; }
}
</style>
