<script setup lang="ts">
// A real XentraERP POS screen in a light browser frame, for the landing page showcase sections.
// Screens live in public/img/product as <name>.webp (1600w) and <name>-sm.webp (800w); they are
// captured from the actual app with sample data.
defineProps<{ name: string; alt: string; eager?: boolean }>()
</script>

<template>
  <figure class="shot">
    <div class="shot__bar" aria-hidden="true"><i /><i /><i /><span>pos.xentraerp.net</span></div>
    <img
      :src="`/img/product/${name}.webp`"
      :srcset="`/img/product/${name}-sm.webp 800w, /img/product/${name}.webp 1600w`"
      sizes="(max-width: 1023px) 92vw, 680px"
      :alt="alt"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
    />
  </figure>
</template>

<style scoped>
.shot { margin: 0; border-radius: 16px; overflow: hidden; background: var(--x-surface); border: 1px solid var(--x-border); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 24px 48px -20px rgba(15, 23, 42, 0.28); }
.shot__bar { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; background: var(--x-surface-2); border-block-end: 1px solid var(--x-border); }
.shot__bar i { width: 9px; height: 9px; border-radius: 50%; background: var(--x-border-strong); }
.shot__bar span { margin-inline-start: 12px; flex: 1; max-width: 220px; height: 18px; border-radius: 6px; background: var(--x-surface); border: 1px solid var(--x-border); font-size: 11px; line-height: 16px; text-align: center; color: var(--x-text-faint); direction: ltr; }
.shot img { display: block; width: 100%; height: auto; }
</style>
