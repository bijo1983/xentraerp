<script setup lang="ts">
// Masked PIN display: one dot per digit entered (never the digits themselves).
import { computed } from 'vue'
import { t } from '@/lib/i18n'

const props = withDefaults(defineProps<{ length: number; max?: number; min?: number; error?: boolean }>(), { max: 8, min: 6, error: false })
const slots = computed(() => Array.from({ length: Math.max(props.min, Math.min(props.max, Math.max(props.length, props.min))) }, (_, i) => i < props.length))
</script>

<template>
  <div class="x-pin" :class="{ 'is-error': error }" role="status" :aria-label="t('auth.pinDigits', { n: length })">
    <i v-for="(filled, i) in slots" :key="i" :class="{ filled }" aria-hidden="true" />
  </div>
</template>

<style scoped>
.x-pin { display: flex; justify-content: center; gap: 14px; min-height: 28px; align-items: center; }
.x-pin i { width: 14px; height: 14px; border-radius: 50%; background: var(--x-surface-3); box-shadow: inset 0 0 0 1.5px var(--x-border-strong); transition: background var(--x-duration), box-shadow var(--x-duration), transform var(--x-duration) var(--x-ease-spring); }
.x-pin i.filled { background: var(--x-primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--x-primary) 16%, transparent); transform: scale(1.15); }
.x-pin.is-error { animation: x-shake 360ms var(--x-ease); }
.x-pin.is-error i { box-shadow: inset 0 0 0 1.5px var(--x-danger); }
.x-pin.is-error i.filled { background: var(--x-danger); box-shadow: 0 0 0 4px var(--x-danger-soft); }
</style>
