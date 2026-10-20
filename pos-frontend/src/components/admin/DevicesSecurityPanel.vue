<script setup lang="ts">
// Administrators: register / revoke devices (tills, order-taking handhelds, kitchen
// displays), see and end sessions, read the sign-in log, unlock staff PINs.
import { computed, onMounted, ref } from 'vue'
import { api, errorMessage, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useToast } from '@/composables/useToast'
import { History, MonitorSmartphone, ShieldCheck, Users } from 'lucide-vue-next'
import { UiBanner, UiButton, UiCard, UiCategoryChips, UiConfirmDialog, UiEmptyState, UiInput, UiModal, UiSkeleton, UiStatusBadge } from '@/ui'

const AUTH = 'custom_erp.api.pos_auth.'
type Sub = 'devices' | 'sessions' | 'history' | 'staff'
const sub = ref<Sub>('devices')
const subs = computed(() => [
  { value: 'devices', label: t('security.devices') },
  { value: 'sessions', label: t('security.sessions') },
  { value: 'history', label: t('security.history') },
  { value: 'staff', label: t('security.staff') },
])
const toast = useToast()
const loading = ref(false)

interface Device { name: string; device_label: string; device_type: string; status: string; location: string | null; pos_profile: string | null; registered_at: string | null; last_seen: string | null; last_user: string | null; code_expires: string | null }
interface Session { name: string; user: string; login_kind: string; device_label: string | null; device_type: string | null; session_mode: string; ip_address: string; started_at: string; last_seen: string; status: string; current: boolean }
interface Attempt { name: string; attempt_at: string; kind: string; result: string; reason: string; user: string | null; staff_ref: string | null; device: string | null; ip_address: string }
interface Staff { user: string; full_name: string; staff_code: string | null; active: number; failed_count: number; locked_until: string | null; hard_locked: boolean; is_admin: boolean }
interface Loc { code: string; name: string }
interface Reg { name: string; location?: string | null }

const devices = ref<Device[]>([])
const sessions = ref<Session[]>([])
const history = ref<Attempt[]>([])
const staff = ref<Staff[]>([])
const locations = ref<Loc[]>([])
const registers = ref<Reg[]>([])

const DEVICE_TYPES = ['Till', 'Order Taking', 'Kitchen Display'] as const
const form = ref({ label: '', type: 'Till' as (typeof DEVICE_TYPES)[number], location: '', register: '' })
const newCode = ref<{ code: string; expires: string } | null>(null)
const adding = ref(false)
const confirmRevoke = ref<Device | null>(null)
const busy = ref(false)

async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    toast.error(errorMessage(e), e instanceof ApiError ? e.ref : undefined)
    return undefined
  }
}

async function load(which: Sub = sub.value) {
  loading.value = true
  await guarded(async () => {
    if (which === 'devices') {
      devices.value = await api.call<Device[]>(AUTH + 'list_devices')
      if (!locations.value.length) {
        const [locs, regs] = await Promise.all([
          api.call<{ code: string; name: string; disabled: number }[]>('custom_erp.api.pos_core.list_locations').catch(() => []),
          api.call<Reg[]>('custom_erp.api.pos.list_pos_profiles').catch(() => []),
        ])
        locations.value = (locs || []).filter((l) => !l.disabled).map((l) => ({ code: l.code, name: l.name }))
        registers.value = regs || []
      }
    } else if (which === 'sessions') sessions.value = await api.call<Session[]>(AUTH + 'list_sessions', { active_only: 1 })
    else if (which === 'history') history.value = await api.call<Attempt[]>(AUTH + 'login_history', { limit: 100 })
    else staff.value = await api.call<Staff[]>(AUTH + 'list_staff_security')
  })
  loading.value = false
}
onMounted(() => load('devices'))
function pick(v: string) {
  sub.value = v as Sub
  load(sub.value)
}

const registerOptions = computed(() => registers.value.filter((r) => !form.value.location || r.location === form.value.location))

async function createCode(onThisDevice: boolean) {
  if (!form.value.label.trim()) {
    toast.warning(t('security.nameRequired'))
    return
  }
  busy.value = true
  const args = { device_label: form.value.label.trim(), device_type: form.value.type, location: form.value.location || null, pos_profile: form.value.register || null }
  const res = await guarded(() => api.call<{ code?: string; expires?: string; registered?: boolean }>(AUTH + (onThisDevice ? 'register_this_device' : 'create_device_code'), args))
  busy.value = false
  if (!res) return
  if (onThisDevice) {
    toast.success(t('security.thisDeviceRegistered'))
    adding.value = false
  } else newCode.value = { code: res.code || '', expires: res.expires || '' }
  load('devices')
}

async function revoke() {
  if (!confirmRevoke.value) return
  busy.value = true
  await guarded(() => api.call(AUTH + 'revoke_device', { device: confirmRevoke.value!.name }))
  busy.value = false
  confirmRevoke.value = null
  load('devices')
}
async function endSession(s: Session) {
  await guarded(() => api.call(AUTH + 'revoke_session', { session: s.name }))
  load('sessions')
}
async function unlock(s: Staff) {
  await guarded(() => api.call(AUTH + 'unlock_staff', { user: s.user }))
  toast.success(t('security.unlocked', { name: s.full_name }))
  load('staff')
}
const tone = (status: string) => (status === 'Active' || status === 'Success' ? 'success' : status === 'Pending' ? 'warning' : status === 'Failed' || status === 'Revoked' ? 'danger' : 'neutral')
const when = (v: string | null) => (v ? new Date(String(v).replace(' ', 'T')).toLocaleString() : '—')
const typeLabel = (v: string | null) => (v ? t(`device.${v.replace(/\s+/g, '').toLowerCase()}`) : '—')
</script>

<template>
  <div class="sec">
    <UiCategoryChips :icons="false" :model-value="sub" :options="subs" :label="t('admin.securityTab')" @update:model-value="pick" />

    <UiSkeleton v-if="loading" :lines="4" height="40px" />

    <template v-else-if="sub === 'devices'">
      <UiBanner tone="info">{{ t('security.devicesIntro') }}</UiBanner>
      <div class="row-end"><UiButton @click="(adding = true), (newCode = null)">{{ t('security.addDevice') }}</UiButton></div>
      <UiEmptyState v-if="!devices.length" :title="t('security.noDevices')" :icon="MonitorSmartphone" />
      <UiCard v-else :padded="false">
        <table class="simple-table sec-table">
          <thead><tr><th>{{ t('security.device') }}</th><th>{{ t('security.type') }}</th><th>{{ t('security.where') }}</th><th>{{ t('security.status') }}</th><th>{{ t('security.lastUsed') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="d in devices" :key="d.name">
              <td><b>{{ d.device_label }}</b><br /><small>{{ d.name }}</small></td>
              <td>{{ typeLabel(d.device_type) }}</td>
              <td>{{ [d.location, d.pos_profile].filter(Boolean).join(' · ') || '—' }}</td>
              <td><UiStatusBadge :tone="tone(d.status)">{{ t(`security.st.${d.status.toLowerCase()}`) }}</UiStatusBadge></td>
              <td>{{ when(d.last_seen) }}<br /><small>{{ d.last_user || '' }}</small></td>
              <td><UiButton v-if="d.status !== 'Revoked'" size="sm" variant="secondary" @click="confirmRevoke = d">{{ t('security.revoke') }}</UiButton></td>
            </tr>
          </tbody>
        </table>
      </UiCard>
    </template>

    <template v-else-if="sub === 'sessions'">
      <UiEmptyState v-if="!sessions.length" :title="t('security.noSessions')" :icon="ShieldCheck" />
      <UiCard v-else :padded="false">
        <table class="simple-table sec-table">
          <thead><tr><th>{{ t('security.user') }}</th><th>{{ t('security.signIn') }}</th><th>{{ t('security.device') }}</th><th>{{ t('security.started') }}</th><th>{{ t('security.lastSeen') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="s in sessions" :key="s.name">
              <td>{{ s.user }} <UiStatusBadge v-if="s.current" size="sm" tone="primary">{{ t('security.thisSession') }}</UiStatusBadge></td>
              <td>{{ s.login_kind }} · {{ s.session_mode }}</td>
              <td>{{ s.device_label || '—' }}<br /><small>{{ s.ip_address }}</small></td>
              <td>{{ when(s.started_at) }}</td>
              <td>{{ when(s.last_seen) }}</td>
              <td><UiButton v-if="!s.current" size="sm" variant="secondary" @click="endSession(s)">{{ t('security.signOut') }}</UiButton></td>
            </tr>
          </tbody>
        </table>
      </UiCard>
    </template>

    <template v-else-if="sub === 'history'">
      <UiEmptyState v-if="!history.length" :title="t('security.noHistory')" :icon="History" />
      <UiCard v-else :padded="false">
        <table class="simple-table sec-table">
          <thead><tr><th>{{ t('security.when') }}</th><th>{{ t('security.kind') }}</th><th>{{ t('security.result') }}</th><th>{{ t('security.user') }}</th><th>{{ t('security.device') }}</th><th>IP</th></tr></thead>
          <tbody>
            <tr v-for="h in history" :key="h.name">
              <td>{{ when(h.attempt_at) }}</td>
              <td>{{ h.kind }}</td>
              <td><UiStatusBadge :tone="tone(h.result)" size="sm">{{ h.result }}</UiStatusBadge><br /><small>{{ h.reason }}</small></td>
              <td>{{ h.user || (h.staff_ref ? `#${h.staff_ref}` : '—') }}</td>
              <td>{{ h.device || '—' }}</td>
              <td>{{ h.ip_address }}</td>
            </tr>
          </tbody>
        </table>
      </UiCard>
    </template>

    <template v-else>
      <UiEmptyState v-if="!staff.length" :title="t('security.noStaff')" :icon="Users" />
      <UiCard v-else :padded="false">
        <table class="simple-table sec-table">
          <thead><tr><th>{{ t('security.person') }}</th><th>{{ t('security.staffNo') }}</th><th>{{ t('security.status') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="s in staff" :key="s.user">
              <td>{{ s.full_name }}<br /><small>{{ s.user }}</small></td>
              <td class="x-tabular">{{ s.staff_code || '—' }}</td>
              <td>
                <UiStatusBadge v-if="s.is_admin" tone="warning">{{ t('security.adminNoPin') }}</UiStatusBadge>
                <UiStatusBadge v-else-if="s.hard_locked" tone="danger">{{ t('security.locked') }}</UiStatusBadge>
                <UiStatusBadge v-else-if="s.failed_count" tone="warning">{{ t('security.failures', { n: s.failed_count }) }}</UiStatusBadge>
                <UiStatusBadge v-else-if="s.active" tone="success">{{ t('security.st.active') }}</UiStatusBadge>
                <UiStatusBadge v-else tone="neutral">{{ t('security.off') }}</UiStatusBadge>
              </td>
              <td><UiButton v-if="s.failed_count" size="sm" variant="secondary" @click="unlock(s)">{{ t('security.unlock') }}</UiButton></td>
            </tr>
          </tbody>
        </table>
      </UiCard>
    </template>

    <UiModal :open="adding" :title="t('security.addDevice')" @close="adding = false">
      <div v-if="newCode" class="code-out">
        <p>{{ t('security.codeIntro') }}</p>
        <div class="code x-tabular" dir="ltr">{{ newCode.code }}</div>
        <p class="muted">{{ t('security.codeExpires', { when: when(newCode.expires) }) }}</p>
      </div>
      <div v-else class="form">
        <UiInput v-model="form.label" :label="t('security.deviceName')" :placeholder="t('security.deviceNameHint')" required autofocus />
        <label class="lbl">{{ t('security.type') }}</label>
        <div class="types">
          <button v-for="ty in DEVICE_TYPES" :key="ty" type="button" class="type" :class="{ on: form.type === ty }" :aria-pressed="form.type === ty" @click="form.type = ty">
            <b>{{ typeLabel(ty) }}</b><small>{{ t(`device.${ty.replace(/\s+/g, '').toLowerCase()}Hint`) }}</small>
          </button>
        </div>
        <label class="lbl" for="dev-loc">{{ t('shell.branch') }}</label>
        <select id="dev-loc" v-model="form.location" class="field">
          <option value="">{{ t('security.anyBranch') }}</option>
          <option v-for="l in locations" :key="l.code" :value="l.code">{{ l.name }} ({{ l.code }})</option>
        </select>
        <label class="lbl" for="dev-reg">{{ t('shell.register') }}</label>
        <select id="dev-reg" v-model="form.register" class="field">
          <option value="">{{ t('security.noFixedRegister') }}</option>
          <option v-for="r in registerOptions" :key="r.name" :value="r.name">{{ r.name }}</option>
        </select>
      </div>
      <template #footer>
        <template v-if="!newCode">
          <UiButton variant="secondary" :disabled="busy" @click="createCode(true)">{{ t('security.registerThis') }}</UiButton>
          <UiButton :loading="busy" @click="createCode(false)">{{ t('security.makeCode') }}</UiButton>
        </template>
        <UiButton v-else @click="adding = false">{{ t('ui.done') }}</UiButton>
      </template>
    </UiModal>

    <UiConfirmDialog
      :open="!!confirmRevoke"
      tone="danger"
      :title="t('security.revokeTitle', { name: confirmRevoke?.device_label || '' })"
      :message="t('security.revokeMessage')"
      :confirm-label="t('security.revoke')"
      :busy="busy"
      @confirm="revoke"
      @cancel="confirmRevoke = null"
    />
  </div>
</template>

<style scoped>
.sec { display: flex; flex-direction: column; gap: var(--x-space-4); }
.row-end { display: flex; justify-content: flex-end; }
.sec-table { width: 100%; }
.sec-table small { color: var(--x-text-muted); }
.form { display: flex; flex-direction: column; gap: var(--x-space-3); }
.lbl { font-size: var(--x-text-sm); font-weight: 600; }
.types { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--x-space-2); }
.type { text-align: start; border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); border-radius: var(--x-radius-md); padding: var(--x-space-3); font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.type small { color: var(--x-text-muted); font-size: 12px; }
.type.on { border-color: var(--x-primary); box-shadow: var(--x-focus-ring); }
.code-out { text-align: center; }
.code { font-size: 36px; font-weight: 800; letter-spacing: 0.12em; padding: var(--x-space-4); border-radius: var(--x-radius-lg); background: var(--x-primary-soft); color: var(--x-primary-text); margin: var(--x-space-3) 0; }
.muted { color: var(--x-text-muted); font-size: var(--x-text-sm); }
</style>
