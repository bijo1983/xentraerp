<script setup lang="ts">
// Device mockup around a landing-page product visual: a laptop (lid + base), a tablet, a
// browser window, or `bare` (the visual brings its own window, e.g. ProductPanel). The content
// goes in the default slot and fills the screen. One glass "insight" card can float over a
// corner (slot `insight`) to call out what the screen is doing.
withDefaults(defineProps<{ kind?: 'laptop' | 'tablet' | 'browser' | 'bare' }>(), { kind: 'laptop' })
</script>

<template>
  <div class="df" :class="`df--${kind}`">
    <div class="df__body">
      <span v-if="kind === 'browser'" class="df__bar" aria-hidden="true"><i /><i /><i /><span>pos.xentraerp.net</span></span>
      <div class="df__screen"><slot /></div>
    </div>
    <div v-if="kind === 'laptop'" class="df__base" aria-hidden="true" />
    <div v-if="$slots.insight" class="df__insight" aria-hidden="true"><slot name="insight" /></div>
  </div>
</template>

<style scoped>
.df { position: relative; min-width: 0; }
.df__screen { overflow: hidden; background: var(--x-surface); }
.df--bare .df__screen { overflow: visible; background: none; }
.df__screen :deep(img) { display: block; width: 100%; height: auto; }

.df--laptop .df__body { padding: 1.2% 1.2% 1.6%; border-radius: 18px 18px 6px 6px; background: #0b1120;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.25), 0 40px 80px -36px rgba(15, 23, 42, 0.55); }
.df--laptop .df__screen { border-radius: 8px; }
.df__base { position: relative; height: 16px; margin-inline: -5%; border-radius: 0 0 18px 18px; background: linear-gradient(#cbd5e1, #94a3b8);
  box-shadow: 0 18px 30px -16px rgba(15, 23, 42, 0.5); }
.df__base::before { content: ''; position: absolute; left: 50%; top: 0; translate: -50% 0; width: 16%; height: 6px; border-radius: 0 0 8px 8px; background: #64748b; }
:root[data-theme='dark'] .df__base { background: linear-gradient(#475569, #1e293b); }

.df--tablet .df__body { padding: 2.2%; border-radius: 26px; background: #0b1120;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.25), 0 40px 80px -36px rgba(15, 23, 42, 0.55); }
.df--tablet .df__screen { border-radius: 14px; }

.df--browser .df__body { border-radius: 16px; overflow: hidden; background: var(--x-surface); border: 1px solid var(--x-border);
  box-shadow: 0 2px 4px rgba(15, 23, 42, 0.05), 0 40px 80px -36px rgba(15, 23, 42, 0.45); }
.df__bar { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; background: var(--x-surface-2, var(--x-bg)); border-bottom: 1px solid var(--x-border); }
.df__bar i { width: 9px; height: 9px; border-radius: 50%; background: var(--x-surface-3); }
.df__bar span { margin-inline: auto; padding: 2px 14px; border-radius: 6px; background: var(--x-surface-3); font-size: 11px; color: var(--x-text-muted); }

/* glass insight card over the bottom outer corner */
.df__insight { position: absolute; inset-inline-end: -4%; bottom: -6%; z-index: 2; max-width: 62%; padding: 14px 16px; border-radius: 16px;
  background: color-mix(in srgb, var(--x-surface) 90%, transparent); backdrop-filter: blur(16px) saturate(1.5); -webkit-backdrop-filter: blur(16px) saturate(1.5);
  border: 1px solid color-mix(in srgb, #fff 55%, var(--x-border)); box-shadow: 0 24px 48px -20px rgba(15, 23, 42, 0.45); }
:root[data-theme='dark'] .df__insight { border-color: rgba(255, 255, 255, 0.12); }
@media (max-width: 767px) {
  .df__insight { inset-inline: 8px; bottom: -40px; max-width: none; padding: 12px 14px; }
}
</style>
