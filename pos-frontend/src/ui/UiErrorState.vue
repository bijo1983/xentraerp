<script setup lang="ts">
// Error / system state with a support reference. Never shows a stack trace.
import { computed } from 'vue'
import { t } from '@/lib/i18n'
import UiButton from './UiButton.vue'

const props = withDefaults(
  defineProps<{ kind?: 'error' | 'permission' | 'offline' | 'expired' | 'unavailable' | 'notfound'; title?: string; message?: string; reference?: string | null; retry?: boolean }>(),
  { kind: 'error', reference: null, retry: false },
)
const emit = defineEmits<{ (e: 'retry'): void }>()
const ICON: Record<string, string> = { error: '!', permission: '🔒', offline: '⚡', expired: '⏱', unavailable: '☁', notfound: '?' }
const heading = computed(() => props.title || t(`state.${props.kind}.title`))
const body = computed(() => props.message || t(`state.${props.kind}.message`))
</script>

<template>
  <div class="x-error" :class="`x-error--${kind}`" role="alert">
    <div class="x-error__icon" aria-hidden="true">{{ ICON[kind] }}</div>
    <h2 class="x-error__title">{{ heading }}</h2>
    <p class="x-error__msg">{{ body }}</p>
    <p v-if="reference" class="x-error__ref">{{ t('ui.reference') }}: <span class="x-tabular">{{ reference }}</span></p>
    <div class="x-error__actions">
      <UiButton v-if="retry" variant="secondary" @click="emit('retry')">{{ t('ui.retry') }}</UiButton>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.x-error { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--x-space-2); padding: var(--x-space-10) var(--x-space-4); }
.x-error__icon { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; font-weight: 700; background: var(--x-danger-soft); color: var(--x-danger-text); }
.x-error--permission .x-error__icon, .x-error--expired .x-error__icon { background: var(--x-warning-soft); color: var(--x-warning-text); }
.x-error--offline .x-error__icon, .x-error--unavailable .x-error__icon, .x-error--notfound .x-error__icon { background: var(--x-surface-3); color: var(--x-text-muted); }
.x-error__title { margin: 0; font-family: var(--x-font-display); font-size: var(--x-text-xl); color: var(--x-text); }
.x-error__msg { margin: 0; max-width: 52ch; color: var(--x-text-muted); line-height: var(--x-leading); }
.x-error__ref { margin: 0; font-size: var(--x-text-xs); color: var(--x-text-faint); }
.x-error__actions { margin-block-start: var(--x-space-3); display: flex; gap: var(--x-space-2); flex-wrap: wrap; justify-content: center; }
</style>
