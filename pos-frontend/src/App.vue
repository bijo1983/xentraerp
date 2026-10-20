<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hideNativeSplash } from '@/lib/native'
import { api, onApiError, type ApiError } from '@/lib/api'
import { dir } from '@/lib/i18n'
import { useAuthStore } from '@/stores/auth'
import { useNetworkStore } from '@/stores/network'
import { useIdleLock } from '@/composables/useIdleLock'
import { pushToast } from '@/composables/useToast'
import AppShell from '@/components/shell/AppShell.vue'
import LockScreen from '@/components/shell/LockScreen.vue'
import { UiToastHost } from '@/ui'

const auth = useAuthStore()
const net = useNetworkStore()
const route = useRoute()
const router = useRouter()

const showShell = computed(() => !!auth.user && !route.meta.bare && route.name !== 'not-found')
const idleMinutes = computed(() => auth.session?.idle_lock_minutes ?? 0)
const idleEnabled = computed(() => !!auth.user && !auth.locked && auth.session?.mode !== 'kitchen' && !!auth.session?.pos_session)
useIdleLock(idleMinutes, idleEnabled, () => auth.lock())

let checking = false
async function onError(err: ApiError) {
  if (err.code === 'POS_SESSION_LOCKED') {
    auth.locked = true
    return
  }
  if (err.code === 'OFFLINE_BLOCKED') {
    pushToast(err.message, 'warning')
    return
  }
  if (!auth.user) return
  if (err.code === 'SESSION_EXPIRED' || err.code === 'NOT_AUTHENTICATED' || (err.code === 'PERMISSION_DENIED' && !checking)) {
    // A 403 can mean "your session is gone" (Frappe then treats the caller as Guest):
    // ask once whether we are still signed in before sending the person to sign in again.
    checking = true
    try {
      const who = err.code === 'PERMISSION_DENIED' ? await api.getLoggedUser().catch(() => 'Guest') : 'Guest'
      if (who === 'Guest') {
        auth.sessionEnded()
        router.push('/signin')
      }
    } finally {
      checking = false
    }
  }
}
let off: (() => void) | undefined
onMounted(() => {
  hideNativeSplash()
  net.start()
  off = onApiError(onError)
})
onBeforeUnmount(() => off?.())
</script>

<template>
  <div class="app-root" :dir="dir">
    <AppShell v-if="showShell" />
    <router-view />
    <LockScreen v-if="auth.user && auth.locked" />
    <UiToastHost />
  </div>
</template>
