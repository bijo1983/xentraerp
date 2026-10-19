<script setup lang="ts">
import { dismissToast, toasts } from '@/composables/useToast'
import { t } from '@/lib/i18n'
</script>

<template>
  <div class="x-toasts" aria-live="polite" aria-atomic="false">
    <div v-for="toast in toasts" :key="toast.id" class="x-toast" :class="`x-toast--${toast.tone}`" :role="toast.tone === 'danger' ? 'alert' : 'status'">
      <div class="x-toast__msg">
        {{ toast.message }}
        <small v-if="toast.reference" class="x-toast__ref">{{ t('ui.reference') }}: <span class="x-tabular">{{ toast.reference }}</span></small>
      </div>
      <button type="button" class="x-toast__x" :aria-label="t('ui.dismiss')" @click="dismissToast(toast.id)">✕</button>
    </div>
  </div>
</template>

<style scoped>
.x-toasts { position: fixed; inset-block-end: var(--x-space-4); inset-inline-end: var(--x-space-4); z-index: var(--x-z-toast); display: flex; flex-direction: column; gap: var(--x-space-2); max-width: min(420px, calc(100vw - 32px)); }
.x-toast { display: flex; align-items: flex-start; gap: var(--x-space-3); padding: var(--x-space-3) var(--x-space-4); border-radius: var(--x-radius-md); background: var(--x-brand-slate); color: #fff; box-shadow: var(--x-shadow-lg); border-inline-start: 4px solid var(--x-info); }
.x-toast--success { border-inline-start-color: var(--x-success); }
.x-toast--warning { border-inline-start-color: var(--x-warning); }
.x-toast--danger { border-inline-start-color: var(--x-danger); }
.x-toast__msg { flex: 1; font-size: var(--x-text-sm); line-height: 1.4; }
.x-toast__ref { display: block; opacity: 0.75; margin-block-start: 2px; }
.x-toast__x { border: 0; background: transparent; color: inherit; opacity: 0.7; cursor: pointer; min-width: 32px; min-height: 32px; }
</style>
