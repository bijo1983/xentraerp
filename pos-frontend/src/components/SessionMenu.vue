<script setup lang="ts">
// The signed-in person, on every screen: tap the chip and get big, obvious choices —
// close (or open) the shift, switch user, switch register, settings, sign out.
// Leaving with a shift still open asks first, so the drawer is never forgotten.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePosStore } from '@/stores/pos'
import ConfirmSheet from '@/components/ConfirmSheet.vue'

const router = useRouter()
const auth = useAuthStore()
const pos = usePosStore()

const open = ref(false)
const leaving = ref<null | 'switch' | 'signout'>(null)
const busy = ref(false)

const name = computed(() => auth.user?.full_name || auth.user?.name || 'Signed in')
const initials = computed(() => name.value.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?')
const register = computed(() => auth.posProfile?.name || '')
const shift = computed(() => pos.shift)
const canShift = computed(() => pos.can('shift'))
const since = computed(() => {
  const t = shift.value?.opened_at
  if (!t) return ''
  const d = new Date(String(t).replace(' ', 'T'))
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})
const shiftLine = computed(() => {
  const s = shift.value
  if (!s) return 'Start your shift with the opening cash'
  const bills = `${s.invoice_count} bill${s.invoice_count === 1 ? '' : 's'}`
  return `Open${since.value ? ` since ${since.value}` : ''} · ${bills} · ${Number(s.total_sales || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}`
})

function go(path: string) {
  open.value = false
  router.push(path)
}
async function switchRegister() {
  open.value = false
  auth.posProfile = null
  try {
    await pos.load(null)
  } catch {
    /* the registers screen reloads what it needs */
  }
  router.push('/registers')
}
function leave(kind: 'switch' | 'signout') {
  open.value = false
  if (shift.value && canShift.value) {
    leaving.value = kind
    return
  }
  finish(kind)
}
async function finish(kind: 'switch' | 'signout') {
  busy.value = true
  try {
    if (kind === 'switch') await auth.switchUser()
    else await auth.logout()
    router.push('/login')
  } finally {
    busy.value = false
    leaving.value = null
  }
}
function closeShiftFirst() {
  leaving.value = null
  router.push('/shift')
}
</script>

<template>
  <button class="session-chip" aria-label="Account menu" @click="open = true">
    <span class="avatar">{{ initials }}</span>
    <span class="who">
      <b>{{ name }}</b>
      <small>{{ pos.settings?.role || 'POS' }}<template v-if="register"> · {{ register }}</template></small>
    </span>
    <span v-if="canShift" class="shift-dot" :class="shift ? 'on' : 'off'" :title="shift ? 'Shift open' : 'No shift open'" />
    <span class="caret">▾</span>
  </button>

  <div v-if="open" class="modal-back menu-back" @click.self="open = false">
    <div class="menu-sheet" role="dialog" aria-modal="true" aria-label="Account menu">
      <div class="menu-head">
        <span class="avatar big">{{ initials }}</span>
        <div class="who">
          <b>{{ name }}</b>
          <small>{{ pos.settings?.role }}<template v-if="register"> · {{ register }}</template><template v-if="pos.settings?.location"> · {{ pos.settings.location }}</template></small>
        </div>
        <button class="menu-x" aria-label="Close menu" @click="open = false">✕</button>
      </div>

      <button v-if="canShift" class="menu-tile" :class="shift ? 'primary' : ''" @click="go('/shift')">
        <span class="ic">{{ shift ? '■' : '▶' }}</span>
        <span class="tx"><b>{{ shift ? 'Close shift' : 'Open shift' }}</b><small>{{ shiftLine }}</small></span>
      </button>
      <button class="menu-tile" @click="leave('switch')">
        <span class="ic">⇄</span>
        <span class="tx"><b>Switch user</b><small>The next person signs in with their PIN</small></span>
      </button>
      <button class="menu-tile" @click="switchRegister">
        <span class="ic">▤</span>
        <span class="tx"><b>Switch register</b><small>Pick a different till</small></span>
      </button>
      <button v-if="pos.canManage" class="menu-tile" @click="go('/admin')">
        <span class="ic">⚙</span>
        <span class="tx"><b>Settings &amp; reports</b><small>Tables, menu, day-end report</small></span>
      </button>
      <button class="menu-tile danger" @click="leave('signout')">
        <span class="ic">⏻</span>
        <span class="tx"><b>Sign out</b><small>Back to the organization sign-in</small></span>
      </button>
    </div>
  </div>

  <ConfirmSheet
    v-if="leaving"
    title="You still have a shift open"
    confirm-label="Close shift first"
    :secondary-label="leaving === 'switch' ? 'Switch user anyway' : 'Sign out anyway'"
    cancel-label="Stay signed in"
    :busy="busy"
    @confirm="closeShiftFirst"
    @secondary="finish(leaving!)"
    @cancel="leaving = null"
  >
    <p>{{ shiftLine }}</p>
    <p>Close it now so the drawer is counted and the next person can open their own shift on this register.</p>
  </ConfirmSheet>
</template>
