<script setup lang="ts">
withDefaults(defineProps<{ title?: string; padded?: boolean; as?: string }>(), { padded: true, as: 'section' })
</script>

<template>
  <component :is="as" class="x-card" :class="{ 'x-card--padded': padded }">
    <header v-if="title || $slots.actions" class="x-card__head">
      <h3 v-if="title" class="x-card__title">{{ title }}</h3>
      <div class="x-card__actions"><slot name="actions" /></div>
    </header>
    <slot />
  </component>
</template>

<style scoped>
.x-card { background: var(--x-surface); border: 1px solid var(--x-border); border-radius: var(--x-radius-lg); box-shadow: var(--x-shadow-sm); }
.x-card--padded { padding: var(--x-space-5); }
.x-card__head { display: flex; align-items: center; justify-content: space-between; gap: var(--x-space-3); margin-block-end: var(--x-space-3); }
.x-card__title { margin: 0; font-family: var(--x-font-display); font-size: var(--x-text-lg); }
.x-card__actions { display: flex; gap: var(--x-space-2); }
</style>
