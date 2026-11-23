<script setup lang="ts">
// A notes field the doctor can type in or dictate into (mic button, or Ctrl/⌘ + M while focused).
import { computed, onBeforeUnmount, useId } from 'vue'
import { Mic, MicOff } from 'lucide-vue-next'
import { appendText, useDictation } from '@/composables/useDictation'

const props = withDefaults(defineProps<{ modelValue?: string | null; label: string; rows?: number; placeholder?: string; disabled?: boolean; hint?: string }>(), {
  modelValue: '',
  rows: 3,
  placeholder: '',
  disabled: false,
  hint: '',
})
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
const id = useId()
const d = useDictation()
const listening = computed(() => d.active.value === id)

function toggle() {
  if (props.disabled) return
  d.toggle(id, (text) => emit('update:modelValue', appendText(props.modelValue || '', text)))
}
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
    e.preventDefault()
    toggle()
  }
}
onBeforeUnmount(() => listening.value && d.stop())
</script>

<template>
  <div class="dict" :class="{ on: listening }">
    <div class="dict__head">
      <label :for="id" class="dict__label">{{ label }}</label>
      <span v-if="hint" class="small faint">{{ hint }}</span>
      <button
        v-if="d.supported && !disabled"
        type="button"
        class="mic"
        :class="{ on: listening }"
        :aria-pressed="listening"
        :aria-label="listening ? `Stop dictating ${label}` : `Dictate ${label}`"
        :title="listening ? 'Stop dictation (Ctrl+M)' : 'Dictate (Ctrl+M)'"
        @click="toggle"
      >
        <component :is="listening ? MicOff : Mic" :size="15" />
        <span>{{ listening ? 'Listening…' : 'Dictate' }}</span>
      </button>
    </div>
    <textarea
      :id="id"
      class="ctl dict__ta"
      :rows="rows"
      :value="modelValue || ''"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @keydown="onKey"
    />
    <div v-if="listening" class="dict__live" aria-live="polite"><span class="pulse" aria-hidden="true" />{{ d.interim.value || 'Speak now — say “full stop”, “comma” or “new line” for punctuation.' }}</div>
  </div>
</template>

<style scoped>
.dict { display: flex; flex-direction: column; gap: 6px; }
.dict__head { display: flex; align-items: center; gap: 10px; }
.dict__label { font-size: var(--x-text-sm); font-weight: var(--x-weight-semibold); }
.mic { margin-inline-start: auto; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text-muted); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.mic:hover { color: var(--x-primary-text); border-color: var(--x-primary); }
.mic.on { background: var(--x-danger-soft); border-color: var(--x-danger); color: var(--x-danger-text); }
.dict__ta { min-height: 0; resize: vertical; line-height: 1.5; }
.dict.on .dict__ta { border-color: var(--x-danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--x-danger) 18%, transparent); }
.dict__live { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--x-text-muted); font-style: italic; }
.pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--x-danger); animation: p 1.2s infinite; flex: none; }
@keyframes p { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.8); } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
</style>
