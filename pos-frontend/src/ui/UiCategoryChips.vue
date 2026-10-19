<script setup lang="ts">
export interface Chip { value: string; label: string; count?: number }
defineProps<{ modelValue: string; options: Chip[]; label?: string }>()
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
      {{ o.label }}<span v-if="o.count !== undefined" class="x-chip__count">{{ o.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.x-chips { display: flex; gap: var(--x-space-2); overflow-x: auto; scrollbar-width: thin; padding-block: 2px; }
.x-chip { flex: none; min-height: 40px; padding: 0 var(--x-space-4); border-radius: var(--x-radius-full); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; font-size: var(--x-text-sm); font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: var(--x-space-2); }
.x-chip.on { background: var(--x-brand-navy); border-color: var(--x-brand-navy); color: #fff; }
:root[data-theme='dark'] .x-chip.on { background: var(--x-primary); border-color: var(--x-primary); }
.x-chip__count { font-size: 11px; opacity: 0.75; }
</style>
