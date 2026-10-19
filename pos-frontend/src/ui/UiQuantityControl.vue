<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber, t } from '@/lib/i18n'

const props = withDefaults(defineProps<{ modelValue: number; min?: number; max?: number; step?: number; disabled?: boolean; label?: string }>(), {
  min: 0,
  max: Number.POSITIVE_INFINITY,
  step: 1,
  disabled: false,
})
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()
const canDec = computed(() => !props.disabled && props.modelValue - props.step >= props.min)
const canInc = computed(() => !props.disabled && props.modelValue + props.step <= props.max)
function change(delta: number) {
  const next = Math.round((props.modelValue + delta) * 1e6) / 1e6
  if (next < props.min || next > props.max) return
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="x-qty" role="group" :aria-label="label || t('ui.quantity')">
    <button type="button" class="x-qty__btn" :disabled="!canDec" :aria-label="t('ui.decrease')" @click="change(-step)">−</button>
    <output class="x-qty__val x-tabular" aria-live="polite">{{ formatNumber(modelValue) }}</output>
    <button type="button" class="x-qty__btn" :disabled="!canInc" :aria-label="t('ui.increase')" @click="change(step)">+</button>
  </div>
</template>

<style scoped>
.x-qty { display: inline-flex; align-items: center; border: 1px solid var(--x-border-strong); border-radius: var(--x-radius-full); background: var(--x-surface); }
.x-qty__btn { width: var(--x-touch); height: var(--x-touch); border: 0; background: transparent; color: var(--x-text); font-size: 20px; cursor: pointer; border-radius: 50%; }
.x-qty__btn:disabled { opacity: 0.35; cursor: not-allowed; }
.x-qty__val { min-width: 36px; text-align: center; font-weight: 700; }
</style>
