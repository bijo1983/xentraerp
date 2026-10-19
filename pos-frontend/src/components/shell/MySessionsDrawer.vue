<script setup lang="ts">
// "Sessions & devices" for the signed-in person: where else they are signed in (sign those
// out) and their recent sign-in history.
import { onMounted, ref } from 'vue'
import { api, errorMessage } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useToast } from '@/composables/useToast'
import { UiButton, UiDrawer, UiSkeleton, UiStatusBadge } from '@/ui'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const AUTH = 'custom_erp.api.pos_auth.'
interface Session { name: string; device_label: string | null; login_kind: string; ip_address: string; started_at: string; current: boolean }
interface Attempt { name: string; attempt_at: string; kind: string; result: string; ip_address: string }
const sessions = ref<Session[]>([])
const history = ref<Attempt[]>([])
const loading = ref(true)
const toast = useToast()
const when = (v: string) => new Date(String(v).replace(' ', 'T')).toLocaleString()

async function load() {
  loading.value = true
  try {
    ;[sessions.value, history.value] = await Promise.all([api.call<Session[]>(AUTH + 'list_my_sessions'), api.call<Attempt[]>(AUTH + 'login_history', { limit: 20 })])
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}
async function signOutOthers() {
  try {
    await api.call(AUTH + 'revoke_other_sessions')
    toast.success(t('sessions.othersSignedOut'))
    load()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
onMounted(load)
</script>

<template>
  <UiDrawer :open="open" :title="t('sessions.title')" @close="emit('close')">
    <UiSkeleton v-if="loading" :lines="5" height="32px" />
    <template v-else>
      <h3 class="h">{{ t('sessions.active') }}</h3>
      <ul class="list">
        <li v-for="s in sessions" :key="s.name">
          <b>{{ s.device_label || t('sessions.unknownDevice') }}</b>
          <UiStatusBadge v-if="s.current" size="sm" tone="primary">{{ t('security.thisSession') }}</UiStatusBadge>
          <small>{{ s.login_kind }} · {{ s.ip_address }} · {{ when(s.started_at) }}</small>
        </li>
      </ul>
      <UiButton variant="secondary" block :disabled="sessions.filter((s) => !s.current).length === 0" @click="signOutOthers">{{ t('sessions.signOutOthers') }}</UiButton>
      <h3 class="h">{{ t('sessions.history') }}</h3>
      <ul class="list">
        <li v-for="h in history" :key="h.name">
          <UiStatusBadge size="sm" :tone="h.result === 'Success' ? 'success' : 'danger'">{{ h.result }}</UiStatusBadge>
          <small>{{ h.kind }} · {{ h.ip_address }} · {{ when(h.attempt_at) }}</small>
        </li>
      </ul>
    </template>
  </UiDrawer>
</template>

<style scoped>
.h { font-size: var(--x-text-md); margin: var(--x-space-4) 0 var(--x-space-2); }
.list { list-style: none; margin: 0 0 var(--x-space-3); padding: 0; display: flex; flex-direction: column; gap: var(--x-space-2); }
.list li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px var(--x-space-2); padding: var(--x-space-3); border: 1px solid var(--x-border); border-radius: var(--x-radius-md); }
.list small { width: 100%; color: var(--x-text-muted); }
</style>
