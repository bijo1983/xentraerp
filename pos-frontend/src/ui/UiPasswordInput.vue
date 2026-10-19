<script setup lang="ts">
// Password field with a show/hide toggle (Password/PIN input family).
import { ref } from 'vue'
import UiInput from './UiInput.vue'
import { t } from '@/lib/i18n'

defineProps<{ modelValue?: string; label?: string; error?: string | null; autocomplete?: string; required?: boolean; autofocus?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'enter'): void }>()
const shown = ref(false)
</script>

<template>
  <UiInput
    :model-value="modelValue"
    :label="label"
    :type="shown ? 'text' : 'password'"
    :error="error"
    :autocomplete="autocomplete || 'current-password'"
    :required="required"
    :autofocus="autofocus"
    @update:model-value="emit('update:modelValue', $event)"
    @enter="emit('enter')"
  >
    <template #suffix>
      <button type="button" class="x-pw-toggle" :aria-pressed="shown" :aria-label="shown ? t('ui.hidePassword') : t('ui.showPassword')" @click="shown = !shown">
        {{ shown ? t('ui.hide') : t('ui.show') }}
      </button>
    </template>
  </UiInput>
</template>

<style scoped>
.x-pw-toggle { border: 0; background: transparent; color: var(--x-primary-text); font: inherit; font-size: var(--x-text-sm); font-weight: 600; min-height: 36px; padding: 0 var(--x-space-2); cursor: pointer; }
</style>
