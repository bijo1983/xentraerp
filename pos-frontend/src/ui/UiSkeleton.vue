<script setup lang="ts">
withDefaults(defineProps<{ lines?: number; height?: string; width?: string; rounded?: boolean }>(), { lines: 1, height: '14px', width: '100%', rounded: false })
</script>

<template>
  <div class="x-skel" aria-hidden="true">
    <span v-for="i in lines" :key="i" class="x-skel__bar" :style="{ height, width: i === lines && lines > 1 ? '60%' : width, borderRadius: rounded ? '999px' : undefined }" />
  </div>
</template>

<style scoped>
.x-skel { display: flex; flex-direction: column; gap: var(--x-space-2); }
.x-skel__bar { display: block; border-radius: var(--x-radius-sm); background: linear-gradient(90deg, var(--x-surface-3), var(--x-surface-2), var(--x-surface-3)); background-size: 200% 100%; animation: x-shimmer 1.4s ease-in-out infinite; }
@keyframes x-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>
