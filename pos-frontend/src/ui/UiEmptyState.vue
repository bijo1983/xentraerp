<script setup lang="ts">
defineProps<{ title: string; message?: string; icon?: string }>()
</script>

<template>
  <div class="x-empty" role="status">
    <div class="x-empty__icon" aria-hidden="true">{{ icon || '○' }}</div>
    <h3 class="x-empty__title">{{ title }}</h3>
    <p v-if="message" class="x-empty__msg">{{ message }}</p>
    <div v-if="$slots.default" class="x-empty__actions"><slot /></div>
  </div>
</template>

<style scoped>
.x-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--x-space-2); padding: var(--x-space-10) var(--x-space-4); color: var(--x-text-muted); }
.x-empty__icon { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: var(--x-surface-3); font-size: 24px; }
.x-empty__title { margin: 0; color: var(--x-text); font-family: var(--x-font-display); font-size: var(--x-text-lg); }
.x-empty__msg { margin: 0; max-width: 46ch; line-height: var(--x-leading); }
.x-empty__actions { margin-block-start: var(--x-space-3); display: flex; gap: var(--x-space-2); }
</style>
