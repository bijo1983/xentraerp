<script setup lang="ts">
import { t } from '@/lib/i18n'

withDefaults(defineProps<{ tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string; dismissible?: boolean }>(), { tone: 'info', dismissible: false })
const emit = defineEmits<{ (e: 'dismiss'): void }>()
</script>

<template>
  <div class="x-banner" :class="`x-banner--${tone}`" :role="tone === 'danger' || tone === 'warning' ? 'alert' : 'status'">
    <div class="x-banner__body">
      <strong v-if="title" class="x-banner__title">{{ title }}</strong>
      <span class="x-banner__msg"><slot /></span>
    </div>
    <div v-if="$slots.action" class="x-banner__action"><slot name="action" /></div>
    <button v-if="dismissible" type="button" class="x-banner__x" :aria-label="t('ui.dismiss')" @click="emit('dismiss')">✕</button>
  </div>
</template>

<style scoped>
.x-banner { display: flex; align-items: center; gap: var(--x-space-3); padding: var(--x-space-3) var(--x-space-4); border-radius: var(--x-radius-md); border: 1px solid transparent; font-size: var(--x-text-sm); }
.x-banner--info { background: var(--x-info-soft); color: var(--x-info-text); }
.x-banner--success { background: var(--x-success-soft); color: var(--x-success-text); }
.x-banner--warning { background: var(--x-warning-soft); color: var(--x-warning-text); }
.x-banner--danger { background: var(--x-danger-soft); color: var(--x-danger-text); }
.x-banner__body { flex: 1; display: flex; flex-wrap: wrap; gap: 4px var(--x-space-2); }
.x-banner__x { border: 0; background: transparent; color: inherit; cursor: pointer; min-width: 32px; min-height: 32px; }
</style>
