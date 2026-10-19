<script setup lang="ts">
// Big tappable radio list (base of BranchSelector / RegisterSelector).
export interface Choice { value: string; label: string; hint?: string; icon?: string; disabled?: boolean }
defineProps<{ modelValue: string | null; options: Choice[]; label: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="x-choices" role="radiogroup" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      class="x-choice"
      :class="{ on: o.value === modelValue }"
      :aria-checked="o.value === modelValue"
      :disabled="o.disabled"
      @click="emit('update:modelValue', o.value)"
    >
      <span class="x-choice__icon" aria-hidden="true">{{ o.icon || '▤' }}</span>
      <span class="x-choice__text"><b>{{ o.label }}</b><small v-if="o.hint">{{ o.hint }}</small></span>
      <span class="x-choice__check" aria-hidden="true">{{ o.value === modelValue ? '✓' : '' }}</span>
    </button>
  </div>
</template>

<style scoped>
.x-choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--x-space-3); }
.x-choice { display: flex; align-items: center; gap: var(--x-space-3); text-align: start; padding: var(--x-space-4); border-radius: var(--x-radius-lg); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; cursor: pointer; min-height: 72px; }
.x-choice:hover:not(:disabled) { border-color: var(--x-primary); }
.x-choice.on { border-color: var(--x-primary); box-shadow: var(--x-focus-ring); }
.x-choice__icon { width: 40px; height: 40px; border-radius: var(--x-radius-md); background: var(--x-primary-soft); color: var(--x-primary-text); display: grid; place-items: center; flex: none; }
.x-choice__text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.x-choice__text small { color: var(--x-text-muted); font-size: var(--x-text-xs); }
.x-choice__check { color: var(--x-primary); font-weight: 700; }
</style>
