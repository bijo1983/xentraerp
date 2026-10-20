<script setup lang="ts">
// Full-screen lock after inactivity (or "Lock" in the user menu). The same person unlocks
// with their PIN (administrators: password); anyone else uses "Switch user".
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/lib/api'
import { t } from '@/lib/i18n'
import { UiBanner, UiButton, UiNumericKeypad, UiPasswordInput, UiPinDots } from '@/ui'

const auth = useAuthStore()
const router = useRouter()
const pin = ref('')
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const name = computed(() => auth.user?.full_name || auth.user?.name || '')

async function unlock() {
  const secret = auth.isManagement ? password.value : pin.value
  if (!secret || busy.value) return
  busy.value = true
  error.value = null
  try {
    await auth.unlock(secret)
    pin.value = ''
    password.value = ''
  } catch (e) {
    error.value = errorMessage(e)
    pin.value = ''
  } finally {
    busy.value = false
  }
}
async function switchUser() {
  await auth.switchUser()
  router.push('/')
}
</script>

<template>
  <div class="lock" role="dialog" aria-modal="true" :aria-label="t('lock.title')">
    <div class="lock__card">
      <p class="lock__eyebrow">{{ t('lock.title') }}</p>
      <h2 class="lock__name">{{ name }}</h2>
      <p class="lock__hint">{{ auth.isManagement ? t('lock.passwordHint') : t('lock.pinHint') }}</p>
      <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
      <template v-if="auth.isManagement">
        <UiPasswordInput v-model="password" :label="t('auth.password')" autofocus @enter="unlock" />
        <UiButton size="lg" block :loading="busy" @click="unlock">{{ t('lock.unlock') }}</UiButton>
      </template>
      <template v-else>
        <UiPinDots :length="pin.length" :error="!!error" />
        <UiNumericKeypad capture-keyboard :disabled="busy" @digit="(d) => pin.length < 8 && (pin += d)" @backspace="pin = pin.slice(0, -1)" @submit="unlock" />
        <UiButton size="xl" block :loading="busy" :disabled="pin.length < 6" @click="unlock">{{ t('lock.unlock') }}</UiButton>
      </template>
      <UiButton variant="ghost" block @click="switchUser">{{ t('lock.switchUser') }}</UiButton>
    </div>
  </div>
</template>

<style scoped>
.lock { position: fixed; inset: 0; z-index: var(--x-z-lock); background: var(--x-brand-slate); display: grid; place-items: center; padding: var(--x-space-4); overflow: auto; }
.lock__card { width: min(380px, 100%); background: var(--x-surface); color: var(--x-text); border-radius: var(--x-radius-xl); padding: var(--x-space-6); display: flex; flex-direction: column; gap: var(--x-space-3); box-shadow: var(--x-shadow-lg); }
.lock__eyebrow { margin: 0; text-transform: uppercase; letter-spacing: 0.06em; font-size: var(--x-text-xs); color: var(--x-text-muted); font-weight: 700; }
.lock__name { margin: 0; font-family: var(--x-font-display); font-size: var(--x-text-xl); }
.lock__hint { margin: 0; color: var(--x-text-muted); font-size: var(--x-text-sm); }
</style>
