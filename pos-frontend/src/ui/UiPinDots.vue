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
.x-pin { display: flex; justify-content: center; gap: var(--x-space-3); min-height: 24px; }
.x-pin i { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--x-border-strong); transition: background var(--x-duration); }
.x-pin i.filled { background: var(--x-primary); border-color: var(--x-primary); }
.x-pin.is-error i { border-color: var(--x-danger); }
.x-pin.is-error i.filled { background: var(--x-danger); }
</style>
