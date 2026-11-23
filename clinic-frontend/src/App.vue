<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { onApiError, type ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useClinicStore } from '@/stores/clinic'
import AppShell from '@/components/AppShell.vue'
import UiToastHost from '@/ui/UiToastHost.vue'

const auth = useAuthStore()
const store = useClinicStore()
const route = useRoute()
const router = useRouter()
const shell = computed(() => !!auth.user && !route.meta.bare)

let off: (() => void) | undefined
onMounted(() => {
  off = onApiError((err: ApiError) => {
    if (auth.user && (err.code === 'NOT_AUTHENTICATED' || err.code === 'SESSION_EXPIRED')) {
      auth.user = null
      store.reset()
      router.push({ name: 'signin' })
    }
  })
})
onBeforeUnmount(() => off?.())
</script>

<template>
  <AppShell v-if="shell"><router-view /></AppShell>
  <router-view v-else />
  <UiToastHost />
</template>
