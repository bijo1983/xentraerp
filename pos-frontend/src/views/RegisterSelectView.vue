<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, type POSProfileSummary } from '@/stores/auth'
import { api } from '@/lib/api'
import { usePosStore } from '@/stores/pos'

const router = useRouter()
const auth = useAuthStore()
const pos = usePosStore()
const profiles = ref<POSProfileSummary[]>([])
const loadingProfiles = ref(true)

onMounted(async () => {
  try {
    profiles.value = await api.call<POSProfileSummary[]>('custom_erp.api.pos.list_pos_profiles')
    // A cashier whose PIN is restricted to one register skips the picker
    // entirely — go straight to the terminal if that profile still exists
    // and is enabled.
    if (auth.restrictedProfile) {
      const match = profiles.value.find((p) => p.name === auth.restrictedProfile)
      if (match) {
        select(match)
        return
      }
    }
  } catch {
    profiles.value = []
  } finally {
    loadingProfiles.value = false
  }
})

function select(profile: POSProfileSummary) {
  auth.posProfile = profile
  // The route guard sends the cashier to open a shift first if one is required.
  router.push(pos.settings?.level === 'kitchen' ? '/kitchen' : pos.isFnb ? '/floor' : '/terminal')
}

async function signOut() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="regselect">
    <div class="topline">
      <div class="whoami">
        <div class="avatar">{{ (auth.user?.full_name || '?').slice(0, 2).toUpperCase() }}</div>
        <div>
          <div class="lbl">Signed in as</div>
          <div class="name">{{ auth.user?.full_name }}</div>
        </div>
      </div>
      <div class="row">
        <span class="pill" :class="pos.isFnb ? 'ok' : ''">{{ pos.mode }} mode</span>
        <span class="pill">{{ pos.roleLabel }}</span>
        <button v-if="pos.canManage" class="btn btn-ghost" style="padding: 9px 16px" @click="router.push('/admin')">Settings &amp; reports</button>
        <button class="btn btn-ghost" style="padding: 9px 16px" @click="signOut">Sign Out</button>
      </div>
    </div>

    <h2>Select a register</h2>
    <p class="sub2">{{ auth.orgName || 'Your organization' }} — choose which register you're working today</p>

    <p v-if="loadingProfiles" style="color: var(--text-muted)">Loading registers…</p>
    <p v-else-if="profiles.length === 0" style="color: var(--text-muted)">
      No POS Profiles are set up yet. Ask an administrator to create one in the back office
      (ERPNext: Selling &gt; POS Profile).
    </p>
    <div v-else class="reg-grid">
      <button v-for="p in profiles" :key="p.name" class="reg-card" @click="select(p)">
        <div class="icon">🧾</div>
        <div class="name">{{ p.name }}</div>
        <div class="meta">{{ p.location_name || p.location ? `${p.location_name || p.location} · ` : '' }}{{ p.company }} · {{ p.currency }}</div>
      </button>
    </div>
  </div>
</template>
