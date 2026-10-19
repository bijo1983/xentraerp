<script setup lang="ts">
import UiModal from './UiModal.vue'
import UiButton from './UiButton.vue'
import { t } from '@/lib/i18n'

withDefaults(defineProps<{ open: boolean; title: string; message?: string; confirmLabel?: string; cancelLabel?: string; tone?: 'primary' | 'danger'; busy?: boolean }>(), {
  tone: 'primary',
  busy: false,
})
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()
</script>

<template>
  <UiModal :open="open" :title="title" size="sm" role="alertdialog" :persistent="busy" @close="emit('cancel')">
    <p v-if="message" class="x-confirm__msg">{{ message }}</p>
    <slot />
    <template #footer>
      <UiButton variant="secondary" :disabled="busy" @click="emit('cancel')">{{ cancelLabel || t('ui.cancel') }}</UiButton>
      <UiButton :variant="tone === 'danger' ? 'danger' : 'primary'" :loading="busy" @click="emit('confirm')">{{ confirmLabel || t('ui.confirm') }}</UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.x-confirm__msg { margin: 0; color: var(--x-text-muted); line-height: var(--x-leading); }
</style>
