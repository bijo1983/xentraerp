<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import UiButton from '@/ui/UiButton.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const info = computed(() => {
  if (route.name === 'not-found') return { title: 'Page not found', message: "That page doesn't exist." }
  const r = String(route.query.reason || '')
  if (r === 'CLINIC_NOT_ENTITLED') return { title: 'Clinic management is not in your plan', message: 'Ask your administrator to add the Clinic Management (CLINZA) module to your subscription.' }
  if (r === 'PERMISSION_DENIED') return { title: 'No clinic role yet', message: 'Your account has no clinic role. Ask the clinic manager to add you as staff.' }
  if (r === 'API_UNAVAILABLE') return { title: "Can't reach the clinic server", message: 'Check your connection and try again in a minute.' }
  return { title: 'CLINZA is unavailable', message: 'Something went wrong loading your clinic. Please try again.' }
})
async function back() {
  await auth.signOut().catch(() => undefined)
  router.replace({ name: 'signin' })
}
</script>

<template>
  <div style="min-height: 100dvh; display: grid; place-items: center">
    <UiEmptyState :title="info.title" :message="info.message">
      <UiButton variant="secondary" @click="back">Back to sign in</UiButton>
    </UiEmptyState>
  </div>
</template>
