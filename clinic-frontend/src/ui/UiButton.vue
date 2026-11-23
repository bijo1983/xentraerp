<script setup lang="ts">
// Buttons: one primary action per area; 44px minimum touch target (56px for size xl).
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
    size?: 'sm' | 'md' | 'lg' | 'xl'
    type?: 'button' | 'submit' | 'reset'
    block?: boolean
    loading?: boolean
    disabled?: boolean
  }>(),
  { variant: 'primary', size: 'md', type: 'button', block: false, loading: false, disabled: false },
)
defineEmits<{ (e: 'click', ev: MouseEvent): void }>()
</script>

<template>
  <button
    :type="type"
    class="x-btn"
    :class="[`x-btn--${variant}`, `x-btn--${size}`, { 'x-btn--block': block, 'is-loading': loading }]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="x-btn__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.x-btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: var(--x-radius-md);
  font: inherit;
  font-weight: var(--x-weight-semibold);
  min-height: var(--x-touch);
  padding: 0 var(--x-space-4);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--x-space-2);
  cursor: pointer;
  letter-spacing: -0.005em;
  transition: background var(--x-duration) var(--x-ease), border-color var(--x-duration) var(--x-ease), box-shadow var(--x-duration) var(--x-ease), transform 90ms var(--x-ease);
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.x-btn:active:not(:disabled) { transform: scale(0.97); }
.x-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.x-btn--sm { min-height: 36px; padding: 0 var(--x-space-3); font-size: var(--x-text-sm); }
.x-btn--md { font-size: var(--x-text-md); }
.x-btn--lg { min-height: 52px; border-radius: var(--x-radius-md); padding: 0 var(--x-space-6); font-size: var(--x-text-md); }
.x-btn--xl { min-height: var(--x-touch-lg); border-radius: var(--x-radius-lg); padding: 0 var(--x-space-8); font-size: var(--x-text-lg); }
.x-btn--block { width: 100%; }
.x-btn--primary { background: var(--x-primary); color: var(--x-text-on-primary); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 1px 2px rgba(15, 23, 42, 0.12), 0 6px 16px -8px rgba(37, 99, 235, 0.7); }
.x-btn--primary:hover:not(:disabled) { background: var(--x-primary-hover); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), var(--x-shadow-brand); }
.x-btn--secondary { background: var(--x-surface); color: var(--x-text); border-color: var(--x-border); box-shadow: var(--x-shadow-xs); }
.x-btn--secondary:hover:not(:disabled) { background: var(--x-surface-2); border-color: var(--x-border-strong); }
.x-btn--ghost { background: transparent; color: var(--x-primary-text); }
.x-btn--ghost:hover:not(:disabled) { background: var(--x-primary-soft); }
.x-btn--subtle { background: var(--x-surface-3); color: var(--x-text); }
.x-btn--subtle:hover:not(:disabled) { background: var(--x-border); }
.x-btn--danger { background: var(--x-danger); color: #fff; box-shadow: 0 6px 16px -8px rgba(239, 68, 68, 0.7); }
.x-btn--danger:hover:not(:disabled) { background: #dc2626; }
.x-btn__spinner {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid currentColor; border-inline-end-color: transparent;
  animation: x-spin 0.8s linear infinite;
}
@keyframes x-spin { to { transform: rotate(360deg); } }
</style>
