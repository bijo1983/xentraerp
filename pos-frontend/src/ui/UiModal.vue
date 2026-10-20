<script setup lang="ts">
// Dialog: role="dialog" + aria-modal, labelled by its title, focus trapped, Escape and
// backdrop close (unless `persistent`), focus returned to the opener on close.
import { computed, ref, toRef, useId } from 'vue'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { t } from '@/lib/i18n'

const props = withDefaults(defineProps<{ open: boolean; title?: string; size?: 'sm' | 'md' | 'lg'; persistent?: boolean; role?: 'dialog' | 'alertdialog'; hideClose?: boolean }>(), {
  size: 'md',
  persistent: false,
  role: 'dialog',
  hideClose: false,
})
const emit = defineEmits<{ (e: 'close'): void }>()
const panel = ref<HTMLElement | null>(null)
const id = useId()
const open = toRef(props, 'open')
const labelId = computed(() => (props.title ? `${id}-title` : undefined))
function close() {
  if (!props.persistent) emit('close')
}
useFocusTrap(panel, open, close)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="x-modal" @mousedown.self="close">
      <div ref="panel" class="x-modal__panel" :class="`x-modal__panel--${size}`" :role="role" aria-modal="true" :aria-labelledby="labelId" tabindex="-1">
        <header v-if="title || !hideClose" class="x-modal__head">
          <h2 v-if="title" :id="labelId" class="x-modal__title">{{ title }}</h2>
          <button v-if="!hideClose && !persistent" type="button" class="x-modal__close" :aria-label="t('ui.close')" @click="emit('close')">✕</button>
        </header>
        <div class="x-modal__body"><slot /></div>
        <footer v-if="$slots.footer" class="x-modal__foot"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.x-modal { position: fixed; inset: 0; z-index: var(--x-z-modal); background: rgba(8, 15, 30, 0.55); display: grid; place-items: center; padding: var(--x-space-4); }
.x-modal__panel { background: var(--x-surface); color: var(--x-text); border-radius: var(--x-radius-xl); box-shadow: var(--x-shadow-lg); width: 100%; max-height: calc(100dvh - 32px); display: flex; flex-direction: column; outline: none; }
.x-modal__panel--sm { max-width: 400px; }
.x-modal__panel--md { max-width: 560px; }
.x-modal__panel--lg { max-width: 860px; }
.x-modal__head { display: flex; align-items: center; justify-content: space-between; gap: var(--x-space-3); padding: var(--x-space-5) var(--x-space-5) 0; }
.x-modal__title { margin: 0; font-family: var(--x-font-display); font-size: var(--x-text-lg); }
.x-modal__close { border: 0; background: var(--x-surface-3); color: var(--x-text-muted); width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 16px; }
.x-modal__body { padding: var(--x-space-5); overflow: auto; }
.x-modal__foot { padding: 0 var(--x-space-5) var(--x-space-5); display: flex; justify-content: flex-end; gap: var(--x-space-2); flex-wrap: wrap; }
</style>
