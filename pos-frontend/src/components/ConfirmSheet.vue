<script setup lang="ts">
// A confirmation that is easy to hit with a finger: big buttons stacked under a short question,
// the safe choice last-but-clear. Used instead of the browser's tiny confirm() box.
withDefaults(
  defineProps<{
    title: string
    confirmLabel: string
    danger?: boolean
    busy?: boolean
    secondaryLabel?: string
    cancelLabel?: string
  }>(),
  { cancelLabel: 'Go back' },
)
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'secondary'): void; (e: 'cancel'): void }>()
</script>

<template>
  <div class="modal-back" @click.self="emit('cancel')">
    <div class="sheet" role="alertdialog" aria-modal="true" :aria-label="title">
      <h3>{{ title }}</h3>
      <div v-if="$slots.default" class="sheet-msg"><slot /></div>
      <div class="sheet-actions">
        <button class="btn sheet-btn" :class="danger ? 'btn-danger' : 'btn-primary'" :disabled="busy" @click="emit('confirm')">
          {{ busy ? 'Working…' : confirmLabel }}
        </button>
        <button v-if="secondaryLabel" class="btn btn-ghost sheet-btn" :disabled="busy" @click="emit('secondary')">{{ secondaryLabel }}</button>
        <button class="btn btn-ghost sheet-btn" :disabled="busy" @click="emit('cancel')">{{ cancelLabel }}</button>
      </div>
    </div>
  </div>
</template>
