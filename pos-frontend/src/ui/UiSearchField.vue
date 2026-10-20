<script setup lang="ts">
import { t } from '@/lib/i18n'
import { Search } from 'lucide-vue-next'

defineProps<{ modelValue: string; placeholder?: string; label?: string; autofocus?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'search', v: string): void }>()
</script>

<template>
  <div class="x-search" role="search">
    <Search class="x-search__icon" :size="18" aria-hidden="true" />
    <input
      type="search"
      class="x-search__input"
      :value="modelValue"
      :placeholder="placeholder || t('ui.search')"
      :aria-label="label || placeholder || t('ui.search')"
      :autofocus="autofocus"
      dir="auto"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown.enter="emit('search', modelValue)"
    />
    <button v-if="modelValue" type="button" class="x-search__clear" :aria-label="t('ui.clear')" @click="emit('update:modelValue', '')">✕</button>
  </div>
</template>

<style scoped>
.x-search { display: flex; align-items: center; gap: var(--x-space-2); background: var(--x-surface); border: 1px solid var(--x-border-strong); border-radius: var(--x-radius-full); padding-inline: var(--x-space-4) var(--x-space-2); }
.x-search:focus-within { border-color: var(--x-primary); box-shadow: var(--x-focus-ring); }
.x-search__icon { color: var(--x-text-faint); }
.x-search__input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--x-text); font: inherit; min-height: var(--x-touch); }
.x-search__input::-webkit-search-cancel-button { display: none; }
.x-search__clear { border: 0; background: var(--x-surface-3); color: var(--x-text-muted); width: 32px; height: 32px; border-radius: 50%; cursor: pointer; }
</style>
