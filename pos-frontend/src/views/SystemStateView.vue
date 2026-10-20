<script setup lang="ts">
// Full-page system states: no access here (e.g. order-taking in Retail), permission
// denied, page not found, POS not available on the plan.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { t } from '@/lib/i18n'
import { UiButton, UiErrorState } from '@/ui'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const kind = computed(() => (route.meta.state as 'unavailable' | 'permission' | 'notfound') || 'unavailable')
const reason = computed(() => (typeof route.query.reason === 'string' ? route.query.reason : ''))
const message = computed(() => (reason.value ? t(`state.reason.${reason.value}`) : undefined))
async function signOut() {
  await auth.logout()
  router.push('/signin')
}
</script>

<template>
  <main class="state-page">
    <UiErrorState :kind="kind" :message="message">
      <UiButton v-if="auth.user" variant="secondary" @click="router.push('/signin')">{{ t('state.home') }}</UiButton>
      <UiButton v-if="auth.user" variant="ghost" @click="signOut">{{ t('menu.signOut') }}</UiButton>
      <UiButton v-else @click="router.push('/signin')">{{ t('auth.signIn') }}</UiButton>
    </UiErrorState>
  </main>
</template>

<style scoped>
.state-page { min-height: calc(100dvh - var(--shell-h)); display: grid; place-items: center; padding: var(--x-space-4); }
</style>
