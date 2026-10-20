<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null
    label?: string
    type?: string
    hint?: string
    error?: string | null
    placeholder?: string
    autocomplete?: string
    inputmode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'search' | 'none'
    required?: boolean
    disabled?: boolean
    autofocus?: boolean
    maxlength?: number
    size?: 'md' | 'lg'
    dirAuto?: boolean
  }>(),
  { modelValue: '', type: 'text', size: 'md' },
)
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'enter'): void }>()
const id = useId()
const describedBy = computed(() => [props.hint ? `${id}-hint` : '', props.error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div class="x-field" :class="{ 'has-error': !!error }">
    <label v-if="label" :for="id" class="x-field__label">{{ label }}<span v-if="required" aria-hidden="true"> *</span></label>
    <div class="x-field__control">
      <slot name="prefix" />
      <input
        :id="id"
        class="x-field__input"
        :class="`x-field__input--${size}`"
        :type="type"
        :value="modelValue ?? ''"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :required="required"
        :disabled="disabled"
        :autofocus="autofocus"
        :data-autofocus="autofocus || undefined"
        :maxlength="maxlength"
        :dir="dirAuto ? 'auto' : undefined"
        :aria-invalid="!!error || undefined"
        :aria-describedby="describedBy"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @keydown.enter="emit('enter')"
      />
      <slot name="suffix" />
    </div>
    <p v-if="hint && !error" :id="`${id}-hint`" class="x-field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-err`" class="x-field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.x-field { display: flex; flex-direction: column; gap: var(--x-space-1); }
.x-field__label { font-size: var(--x-text-sm); font-weight: var(--x-weight-semibold); color: var(--x-text); letter-spacing: -0.005em; }
.x-field__control {
  display: flex; align-items: center; gap: var(--x-space-2);
  background: var(--x-surface); border: 1px solid var(--x-border); border-radius: var(--x-radius-md); box-shadow: var(--x-shadow-xs);
  padding-inline: var(--x-space-3);
  transition: border-color var(--x-duration), box-shadow var(--x-duration);
}
.x-field__control:hover { border-color: var(--x-border-strong); }
.x-field__control:focus-within { border-color: var(--x-primary); box-shadow: var(--x-focus-ring); }
.x-field__control :deep(svg) { color: var(--x-text-faint); flex: none; }
.has-error .x-field__control { border-color: var(--x-danger); }
.x-field__input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--x-text);
  font: inherit; min-height: var(--x-touch);
}
.x-field__input--lg { min-height: 54px; font-size: 17px; font-weight: 500; }
.x-field__input::placeholder { color: var(--x-text-faint); font-weight: 400; }
.x-field__input:focus-visible { outline: none; }
.x-field__hint { margin: 0; font-size: var(--x-text-xs); color: var(--x-text-muted); }
.x-field__error { margin: 0; font-size: var(--x-text-xs); color: var(--x-danger-text); }
</style>
