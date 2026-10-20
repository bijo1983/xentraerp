<script setup lang="ts">
// The real sign-in (right side of the landing page):
//   organization code -> [register this device] -> who are you (name tile / staff no.)
//   -> PIN (large keypad, masked dots)
// plus a separate Management tab: email + password + authenticator code.
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore, type StaffTile } from '@/stores/auth'
import { ApiError, errorMessage } from '@/lib/api'
import { t } from '@/lib/i18n'
import { UiBanner, UiButton, UiInput, UiNumericKeypad, UiPasswordInput, UiPinDots, UiSearchField } from '@/ui'

const emit = defineEmits<{ (e: 'signed-in'): void }>()
const auth = useAuthStore()

type Step = 'org' | 'device' | 'staff' | 'pin'
type Tab = 'staff' | 'management'
const tab = ref<Tab>('staff')
const step = ref<Step>('org')
const busy = ref(false)
const error = ref<string | null>(null)
const errorRef = ref<string | null>(null)

// org
const orgCode = ref(auth.tenantCode || '')
const remember = ref(auth.rememberOrg)
// device
const approval = ref('')
// staff
const staffQuery = ref('')
const manualStaff = ref(false)
const staffCode = ref('')
const chosen = ref<StaffTile | null>(null)
// pin
const pin = ref('')
// management
const mEmail = ref('')
const mPassword = ref('')
const mOtp = ref('')
const mStage = ref<'password' | 'otp' | 'enroll'>('password')
const enroll = ref<{ token: string; secret: string; qr: string } | null>(null)

const ctx = computed(() => auth.context)
const pinMax = computed(() => ctx.value?.pin_max ?? 8)
const pinMin = computed(() => ctx.value?.pin_min ?? 6)
const staffList = computed(() => {
  const q = staffQuery.value.trim().toLowerCase()
  const all = ctx.value?.staff || []
  return q ? all.filter((s) => s.name.toLowerCase().includes(q) || s.staff.toLowerCase().includes(q)) : all
})
const stepIndex = computed(() => ({ org: 0, device: 1, staff: 1, pin: 2 })[step.value])

function fail(e: unknown) {
  error.value = errorMessage(e)
  errorRef.value = e instanceof ApiError && (e.status >= 500 || e.code === 'API_UNAVAILABLE') ? e.ref : null
}
function clearError() {
  error.value = null
  errorRef.value = null
}

async function afterOrg() {
  await auth.loadContext()
  step.value = auth.context?.can_sign_in ? 'staff' : 'device'
  manualStaff.value = !(auth.context?.staff || []).length
}

onMounted(async () => {
  // A remembered organization (trusted device) or "switch user" goes straight on.
  if (auth.tenantCode && auth.orgName) {
    busy.value = true
    try {
      await afterOrg()
    } catch (e) {
      fail(e)
      step.value = 'org'
    } finally {
      busy.value = false
    }
  }
})

async function submitOrg() {
  clearError()
  if (!orgCode.value.trim()) return
  busy.value = true
  try {
    await auth.lookupOrganization(orgCode.value, remember.value)
    await afterOrg()
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

function changeOrg() {
  auth.forgetOrganization()
  step.value = 'org'
  orgCode.value = ''
  clearError()
}

async function submitDevice() {
  clearError()
  busy.value = true
  try {
    await auth.registerDevice(approval.value)
    approval.value = ''
    step.value = 'staff'
    manualStaff.value = !(auth.context?.staff || []).length
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

function pickStaff(s: StaffTile) {
  chosen.value = s
  staffCode.value = s.staff
  pin.value = ''
  clearError()
  step.value = 'pin'
}
function submitStaffNumber() {
  const code = staffCode.value.trim()
  if (!code) return
  chosen.value = { staff: code, name: t('auth.staffNumberLabel', { n: code }), initials: '#' }
  pin.value = ''
  clearError()
  step.value = 'pin'
}

function digit(d: string) {
  if (busy.value || pin.value.length >= pinMax.value) return
  clearError()
  pin.value += d
}
function backspace() {
  pin.value = pin.value.slice(0, -1)
}

async function submitPin() {
  if (pin.value.length < pinMin.value || busy.value) return
  clearError()
  busy.value = true
  try {
    await auth.pinLogin(staffCode.value, pin.value)
    emit('signed-in')
  } catch (e) {
    fail(e)
    pin.value = ''
  } finally {
    busy.value = false
  }
}

async function submitManagement() {
  clearError()
  busy.value = true
  try {
    const res = await auth.managementLogin(mEmail.value.trim(), mPassword.value, mOtp.value || undefined, enroll.value?.token)
    if (res.status === 'ok') {
      mPassword.value = ''
      emit('signed-in')
    } else if (res.status === 'otp_required') {
      mStage.value = 'otp'
    } else if (res.status === 'enroll') {
      enroll.value = { token: res.enroll_token, secret: res.secret, qr: `data:image/svg+xml;base64,${res.qr_svg_base64}` }
      mStage.value = 'enroll'
    }
    mOtp.value = ''
  } catch (e) {
    fail(e)
    mOtp.value = ''
  } finally {
    busy.value = false
  }
}

watch(tab, () => {
  clearError()
  mStage.value = 'password'
  enroll.value = null
})
</script>

<template>
  <section class="signin" :aria-label="t('auth.panelLabel')">
    <header class="signin__head">
      <h2 class="signin__title">{{ step === 'org' ? t('auth.title') : auth.orgName }}</h2>
      <p class="signin__sub">
        <template v-if="step === 'org'">{{ t('auth.subtitle') }}</template>
        <template v-else>
          {{ ctx?.device?.registered ? t('auth.onDevice', { device: ctx.device.label || '' }) : t('auth.thisDevice') }}
          · <button type="button" class="link" @click="changeOrg">{{ t('auth.changeOrg') }}</button>
        </template>
      </p>
    </header>

    <div v-if="step !== 'org'" class="tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="tab === 'staff'" :class="{ on: tab === 'staff' }" @click="tab = 'staff'">{{ t('auth.staffTab') }}</button>
      <button type="button" role="tab" :aria-selected="tab === 'management'" :class="{ on: tab === 'management' }" @click="tab = 'management'">{{ t('auth.managementTab') }}</button>
    </div>

    <UiBanner v-if="auth.expiredNotice && !error" tone="warning">{{ t('auth.sessionEnded') }}</UiBanner>
    <UiBanner v-if="error" tone="danger">
      {{ error }}
      <template v-if="errorRef"> · {{ t('ui.reference') }} {{ errorRef }}</template>
    </UiBanner>

    <!-- 1. organization -->
    <form v-if="step === 'org'" class="stack" @submit.prevent="submitOrg">
      <ol class="steps" :aria-label="t('auth.steps')">
        <li :class="{ on: stepIndex === 0 }">{{ t('auth.stepOrg') }}</li>
        <li :class="{ on: stepIndex === 1 }">{{ t('auth.stepWho') }}</li>
        <li :class="{ on: stepIndex === 2 }">{{ t('auth.stepPin') }}</li>
      </ol>
      <UiInput v-model="orgCode" :label="t('auth.orgCode')" :placeholder="t('auth.orgCodeHint')" autocomplete="organization" inputmode="text" size="lg" required autofocus />
      <label class="check"><input v-model="remember" type="checkbox" /> {{ t('auth.remember') }}</label>
      <p class="fine">{{ t('auth.rememberHint') }}</p>
      <UiButton type="submit" size="lg" block :loading="busy">{{ t('auth.continue') }}</UiButton>
    </form>

    <!-- staff tab -->
    <template v-else-if="tab === 'staff'">
      <!-- 2a. device registration -->
      <form v-if="step === 'device'" class="stack" @submit.prevent="submitDevice">
        <UiBanner tone="info" :title="t('auth.deviceTitle')">{{ t('auth.deviceIntro') }}</UiBanner>
        <UiInput v-model="approval" :label="t('auth.approvalCode')" placeholder="ABCD-EFGH" autocomplete="one-time-code" size="lg" required autofocus />
        <UiButton type="submit" size="lg" block :loading="busy">{{ t('auth.registerDevice') }}</UiButton>
        <p class="fine">{{ t('auth.deviceAdminHint') }}</p>
      </form>

      <!-- 2b. who are you -->
      <div v-else-if="step === 'staff'" class="stack">
        <template v-if="!manualStaff">
          <UiSearchField v-if="(ctx?.staff || []).length > 8" v-model="staffQuery" :placeholder="t('auth.findName')" />
          <div class="tiles" role="list">
            <button v-for="s in staffList" :key="s.staff" type="button" class="tile" role="listitem" @click="pickStaff(s)">
              <span class="tile__av" aria-hidden="true">{{ s.initials }}</span>
              <span class="tile__name">{{ s.name }}</span>
            </button>
          </div>
          <button type="button" class="link" @click="manualStaff = true">{{ t('auth.useStaffNumber') }}</button>
        </template>
        <form v-else class="stack" @submit.prevent="submitStaffNumber">
          <UiInput v-model="staffCode" :label="t('auth.staffNumber')" inputmode="numeric" autocomplete="username" size="lg" required autofocus :maxlength="12" />
          <UiButton type="submit" size="lg" block>{{ t('auth.continue') }}</UiButton>
          <button v-if="(ctx?.staff || []).length" type="button" class="link" @click="manualStaff = false">{{ t('auth.pickName') }}</button>
        </form>
      </div>

      <!-- 3. PIN -->
      <div v-else class="stack pin">
        <div class="who">
          <span class="tile__av" aria-hidden="true">{{ chosen?.initials }}</span>
          <div>
            <b>{{ chosen?.name }}</b>
            <button type="button" class="link" @click="step = 'staff'">{{ t('auth.notYou') }}</button>
          </div>
        </div>
        <p class="fine center">{{ t('auth.enterPin') }}</p>
        <UiPinDots :length="pin.length" :min="pinMin" :max="pinMax" :error="!!error" />
        <UiNumericKeypad :disabled="busy" capture-keyboard @digit="digit" @backspace="backspace" @submit="submitPin" />
        <UiButton size="xl" block :loading="busy" :disabled="pin.length < pinMin" @click="submitPin">{{ t('auth.signIn') }}</UiButton>
      </div>
    </template>

    <!-- management tab -->
    <form v-else class="stack" @submit.prevent="submitManagement">
      <p class="fine">{{ t('auth.managementIntro') }}</p>
      <template v-if="mStage === 'password'">
        <UiInput v-model="mEmail" type="email" :label="t('auth.email')" autocomplete="username" required autofocus />
        <UiPasswordInput v-model="mPassword" :label="t('auth.password')" required />
      </template>
      <template v-else-if="mStage === 'enroll' && enroll">
        <UiBanner tone="info" :title="t('auth.enrollTitle')">{{ t('auth.enrollIntro') }}</UiBanner>
        <img class="qr" :src="enroll.qr" :alt="t('auth.qrAlt')" width="180" height="180" />
        <p class="fine center">{{ t('auth.enrollManual') }} <code dir="ltr">{{ enroll.secret }}</code></p>
        <UiInput v-model="mOtp" :label="t('auth.otp')" inputmode="numeric" autocomplete="one-time-code" :maxlength="6" required autofocus />
      </template>
      <template v-else>
        <UiInput v-model="mOtp" :label="t('auth.otp')" :hint="t('auth.otpHint')" inputmode="numeric" autocomplete="one-time-code" :maxlength="6" required autofocus />
      </template>
      <UiButton type="submit" size="lg" block :loading="busy">{{ mStage === 'password' ? t('auth.continue') : t('auth.verify') }}</UiButton>
    </form>
  </section>
</template>

<style scoped>
.signin { display: flex; flex-direction: column; gap: var(--x-space-4); }
.signin__title { margin: 0; font-family: var(--x-font-display); font-size: var(--x-text-xl); }
.signin__sub { margin: 4px 0 0; color: var(--x-text-muted); font-size: var(--x-text-sm); }
.stack { display: flex; flex-direction: column; gap: var(--x-space-3); }
.tabs { display: flex; background: var(--x-surface-3); border-radius: var(--x-radius-full); padding: 4px; }
.tabs button { flex: 1; border: 0; background: transparent; color: var(--x-text-muted); min-height: 40px; border-radius: var(--x-radius-full); font: inherit; font-weight: 600; cursor: pointer; }
.tabs button.on { background: var(--x-surface); color: var(--x-text); box-shadow: var(--x-shadow-sm); }
.steps { display: flex; gap: var(--x-space-2); margin: 0; padding: 0; list-style: none; font-size: var(--x-text-xs); color: var(--x-text-faint); counter-reset: s; }
.steps li { flex: 1; border-block-start: 3px solid var(--x-border); padding-block-start: 6px; counter-increment: s; }
.steps li::before { content: counter(s) '. '; }
.steps li.on { border-color: var(--x-primary); color: var(--x-primary-text); font-weight: 600; }
.check { display: flex; align-items: center; gap: var(--x-space-2); font-size: var(--x-text-sm); min-height: var(--x-touch); }
.check input { width: 20px; height: 20px; }
.fine { margin: 0; font-size: var(--x-text-xs); color: var(--x-text-muted); line-height: 1.5; }
.center { text-align: center; }
.link { border: 0; background: none; color: var(--x-primary-text); font: inherit; font-size: var(--x-text-sm); font-weight: 600; cursor: pointer; padding: 6px 0; min-height: 32px; text-align: start; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)); gap: var(--x-space-2); max-height: 320px; overflow: auto; }
.tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: var(--x-space-3) var(--x-space-2); border: 1px solid var(--x-border); border-radius: var(--x-radius-lg); background: var(--x-surface); color: var(--x-text); font: inherit; cursor: pointer; min-height: 96px; }
.tile:hover { border-color: var(--x-primary); }
.tile__av { width: 44px; height: 44px; border-radius: 50%; background: var(--x-brand-navy); color: #fff; display: grid; place-items: center; font-weight: 700; flex: none; }
.tile__name { font-size: var(--x-text-sm); font-weight: 600; text-align: center; }
.who { display: flex; align-items: center; gap: var(--x-space-3); }
.who div { display: flex; flex-direction: column; align-items: flex-start; }
.qr { align-self: center; background: #fff; border-radius: var(--x-radius-md); padding: 6px; }
code { background: var(--x-surface-3); padding: 2px 6px; border-radius: 6px; word-break: break-all; }
</style>
