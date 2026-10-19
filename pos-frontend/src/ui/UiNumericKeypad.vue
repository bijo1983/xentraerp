<script setup lang="ts">
// Large touch keypad (PIN, quantities, cash). Optional hardware keyboard capture.
import { onBeforeUnmount, onMounted } from 'vue'
import { t } from '@/lib/i18n'

const props = withDefaults(defineProps<{ disabled?: boolean; captureKeyboard?: boolean; leftLabel?: string; decimal?: boolean }>(), {
  disabled: false,
  captureKeyboard: false,
  decimal: false,
})
const emit = defineEmits<{ (e: 'digit', d: string): void; (e: 'backspace'): void; (e: 'left'): void; (e: 'submit'): void }>()
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

function onKey(e: KeyboardEvent) {
  if (props.disabled) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
  if (/^[0-9]$/.test(e.key)) emit('digit', e.key)
  else if (e.key === 'Backspace') emit('backspace')
  else if (e.key === 'Enter') emit('submit')
  else if (props.decimal && (e.key === '.' || e.key === ',')) emit('digit', '.')
  else return
  e.preventDefault()
}
onMounted(() => props.captureKeyboard && window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="x-keypad" role="group" :aria-label="t('ui.keypad')" dir="ltr">
    <button v-for="d in keys" :key="d" type="button" class="x-key" :disabled="disabled" @click="emit('digit', d)">{{ d }}</button>
    <button v-if="decimal" type="button" class="x-key" :disabled="disabled" @click="emit('digit', '.')">.</button>
    <button v-else-if="leftLabel" type="button" class="x-key x-key--aux" :disabled="disabled" @click="emit('left')">{{ leftLabel }}</button>
    <span v-else aria-hidden="true" />
    <button type="button" class="x-key" :disabled="disabled" @click="emit('digit', '0')">0</button>
    <button type="button" class="x-key x-key--aux" :disabled="disabled" :aria-label="t('ui.backspace')" @click="emit('backspace')">⌫</button>
  </div>
</template>

<style scoped>
.x-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--x-space-2); }
.x-key {
  min-height: 60px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border);
  background: var(--x-surface); color: var(--x-text); font: inherit; font-size: 24px; font-weight: 600;
  cursor: pointer; font-variant-numeric: tabular-nums; transition: background var(--x-duration);
}
.x-key:hover:not(:disabled) { background: var(--x-surface-2); }
.x-key:active:not(:disabled) { background: var(--x-primary-soft); }
.x-key:disabled { opacity: 0.5; }
.x-key--aux { font-size: var(--x-text-md); color: var(--x-text-muted); }
@media (pointer: coarse) { .x-key { min-height: 68px; } }
</style>
