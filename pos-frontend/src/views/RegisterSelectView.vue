<script setup lang="ts">
// Till sessions pick their branch (when there is more than one) and register. Skipped
// automatically when the PIN or this device is tied to one register. Order-taking and
// kitchen sessions never come here (lib/nav.ts).
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, type POSProfileSummary } from '@/stores/auth'
import { api, errorMessage, ApiError } from '@/lib/api'
import { usePosStore } from '@/stores/pos'
import { landingRoute } from '@/lib/nav'
import { t } from '@/lib/i18n'
import { UiBranchSelector, UiEmptyState, UiErrorState, UiRegisterSelector, UiSkeleton } from '@/ui'

const router = useRouter()
const auth = useAuthStore()
const pos = usePosStore()
const profiles = ref<POSProfileSummary[]>([])
const loading = ref(true)
const failure = ref<{ message: string; ref: string } | null>(null)
const branch = ref<string | null>(null)
const register = ref<string | null>(null)

const branches = computed(() => {
  const seen = new Map<string, { code: string; name: string }>()
  for (const p of profiles.value) if (p.location) seen.set(p.location, { code: p.location, name: p.location_name || p.location })
  return [...seen.values()]
})
const needBranch = computed(() => branches.value.length > 1)
const shown = computed(() => (needBranch.value && branch.value ? profiles.value.filter((p) => p.location === branch.value) : profiles.value))

async function load() {
  loading.value = true
  failure.value = null
  try {
    profiles.value = await api.call<POSProfileSummary[]>('custom_erp.api.pos.list_pos_profiles')
    // A PIN or a device tied to one register skips the picker.
    const fixed = auth.restrictedProfile || auth.session?.device?.register || pos.settings?.session?.device?.register
    const match = fixed ? profiles.value.find((p) => p.name === fixed) : profiles.value.length === 1 ? profiles.value[0] : undefined
    if (match) return select(match.name)
    const deviceBranch = auth.session?.device?.location || pos.settings?.location
    if (deviceBranch && branches.value.some((b) => b.code === deviceBranch)) branch.value = deviceBranch
  } catch (e) {
    failure.value = { message: errorMessage(e), ref: e instanceof ApiError ? e.ref : '' }
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function select(name: string) {
  const profile = profiles.value.find((p) => p.name === name)
  if (!profile) return
  register.value = name
  auth.posProfile = profile
  // Which kinds of POS run here depends on the register's location.
  await pos.load(profile.name)
  router.push(landingRoute({ ...pos.navContext, hasRegister: true }))
}
</script>

<template>
  <main class="regselect">
    <h2>{{ needBranch && !branch ? t('registers.pickBranch') : t('registers.title') }}</h2>
    <p class="sub2">{{ auth.orgName || '' }} — {{ t('registers.subtitle') }}</p>

    <UiSkeleton v-if="loading" :lines="3" height="72px" />
    <UiErrorState v-else-if="failure" :message="failure.message" :reference="failure.ref" retry @retry="load" />
    <UiEmptyState v-else-if="profiles.length === 0" :title="t('registers.noneTitle')" :message="t('registers.noneMessage')" icon="🧾" />
    <template v-else>
      <UiBranchSelector v-if="needBranch && !branch" v-model="branch" :branches="branches" />
      <template v-else>
        <button v-if="needBranch" type="button" class="link" @click="branch = null">← {{ t('registers.otherBranch') }}</button>
        <UiRegisterSelector :model-value="register" :registers="shown" @update:model-value="select" />
      </template>
    </template>
  </main>
</template>

<style scoped>
.link { border: 0; background: none; color: var(--x-primary-text); font: inherit; font-weight: 600; cursor: pointer; margin-block-end: var(--x-space-3); min-height: 40px; }
</style>
