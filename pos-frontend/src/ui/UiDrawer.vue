<script setup lang="ts">
// Side panel from the inline-end edge (right in English, left in Arabic).
import { ref, toRef, useId } from 'vue'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { t } from '@/lib/i18n'

const props = withDefaults(defineProps<{ open: boolean; title?: string; width?: string }>(), { width: '420px' })
const emit = defineEmits<{ (e: 'close'): void }>()
const panel = ref<HTMLElement | null>(null)
const id = useId()
useFocusTrap(panel, toRef(props, 'open'), () => emit('close'))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="x-drawer" @mousedown.self="emit('close')">
      <aside ref="panel" class="x-drawer__panel" role="dialog" aria-modal="true" :aria-labelledby="title ? `${id}-t` : undefined" tabindex="-1" :style="{ width: `min(${width}, 100%)` }">
        <header class="x-drawer__head">
          <h2 v-if="title" :id="`${id}-t`" class="x-drawer__title">{{ title }}</h2>
          <button type="button" class="x-drawer__close" :aria-label="t('ui.close')" @click="emit('close')">✕</button>
        </header>
        <div class="x-drawer__body"><slot /></div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.x-drawer { position: fixed; inset: 0; z-index: var(--x-z-drawer); background: rgba(8, 15, 30, 0.45); display: flex; justify-content: flex-end; }
.x-drawer__panel { height: 100%; background: var(--x-surface); color: var(--x-text); box-shadow: var(--x-shadow-lg); display: flex; flex-direction: column; outline: none; border-inline-start: 1px solid var(--x-border); }
.x-drawer__head { display: flex; align-items: center; justify-content: space-between; gap: var(--x-space-3); padding: var(--x-space-4) var(--x-space-5); border-block-end: 1px solid var(--x-border); }
.x-drawer__title { margin: 0; font-family: var(--x-font-display); font-size: var(--x-text-lg); }
.x-drawer__close { border: 0; background: var(--x-surface-3); color: var(--x-text-muted); width: 40px; height: 40px; border-radius: 50%; cursor: pointer; }
.x-drawer__body { padding: var(--x-space-5); overflow: auto; flex: 1; }
</style>
