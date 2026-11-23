<script setup lang="ts">
// "Change password" from the user menu: current password + new one twice. The server
// (custom_erp.api.auth.change_password) checks the current password and signs out the user's
// other sessions; this one stays signed in.
import { ref, watch } from 'vue'
import { errorMessage } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import UiModal from '@/ui/UiModal.vue'
import UiInput from '@/ui/UiInput.vue'
import UiButton from '@/ui/UiButton.vue'
import UiBanner from '@/ui/UiBanner.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const auth = useAuthStore()

const current = ref('')
const next = ref('')
const confirm = ref('')
const busy = ref(false)
const error = ref('')
const done = ref(false)

watch(
  () => props.open,
  (o) => {
    if (o) {
      current.value = next.value = confirm.value = error.value = ''
      done.value = false
    }
  },
)

async function save() {
  error.value = ''
  if (!current.value) return (error.value = 'Enter your current password.')
  if (next.value.length < 8) return (error.value = 'Use at least 8 characters for the new password.')
  if (next.value !== confirm.value) return (error.value = "The two new passwords don't match.")
  if (next.value === current.value) return (error.value = 'Choose a password different from your current one.')
  busy.value = true
  try {
    await auth.changePassword(next.value, current.value)
    done.value = true
    current.value = next.value = confirm.value = ''
  } catch (e) {
    error.value = errorMessage(e, "Couldn't change your password. Check your current password and try again.")
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiModal :open="open" title="Change password" size="sm" @close="emit('close')">
    <div v-if="done" class="stack">
      <UiBanner tone="success">Your password has been changed. You've been signed out on your other devices.</UiBanner>
      <UiButton block @click="emit('close')">Done</UiButton>
    </div>
    <form v-else class="stack" @submit.prevent="save">
      <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
      <UiInput v-model="current" label="Current password" type="password" autocomplete="current-password" required autofocus />
      <UiInput v-model="next" label="New password" type="password" autocomplete="new-password" required />
      <UiInput v-model="confirm" label="Confirm new password" type="password" autocomplete="new-password" required />
      <UiButton type="submit" block :loading="busy">Change password</UiButton>
    </form>
  </UiModal>
</template>
