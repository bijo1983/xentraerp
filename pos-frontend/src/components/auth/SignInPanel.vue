<script setup lang="ts">
// The real sign-in (right side of the landing page):
//   organization code -> [register this device] -> who are you (name tile / staff no.)
//   -> PIN (large keypad, masked dots)
// plus a separate Management tab: email + password + authenticator code.
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore, type StaffTile } from '@/stores/auth'
import { ApiError, errorMessage } from '@/lib/api'
import { t } from '@/lib/i18n'
import { ArrowLeft, Building2, Check, Fingerprint, KeyRound, LockKeyhole, MonitorSmartphone, ScrollText, ShieldAlert, ShieldCheck, Timer, UserRound } from 'lucide-vue-next'
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
const steps = computed(() => [t('auth.stepOrg'), t('auth.stepWho'), t('auth.stepPin')])
const orgInitials = computed(() => (auth.orgName || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'X')
const deviceTrusted = computed(() => !!ctx.value?.device?.registered)
// A stable, friendly colour per person on the staff tiles.
const AVATAR_TONES = ['blue', 'teal', 'violet', 'amber', 'rose', 'emerald', 'sky', 'orange']
function toneOf(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]
}

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
  <section class="sp" :aria-label="t('auth.panelLabel')">
    <!-- header: before the organization is known, a welcome; after, the organization card -->
    <header v-if="step === 'org'" class="signin__head">
      <span class="signin__mark" aria-hidden="true"><LockKeyhole :size="22" :stroke-width="2" /></span>
      <div>
        <h2 class="signin__title">{{ t('auth.title') }}</h2>
        <p class="signin__sub">{{ t('auth.subtitle') }}</p>
      </div>
    </header>
    <header v-else class="org">
      <span class="org__av" aria-hidden="true">{{ orgInitials }}</span>
      <div class="org__tx">
        <h2 class="org__name">{{ auth.orgName }}</h2>
        <span class="org__device" :class="deviceTrusted ? 'is-trusted' : 'is-new'">
          <component :is="deviceTrusted ? ShieldCheck : ShieldAlert" :size="14" :stroke-width="2.2" aria-hidden="true" />
          {{ deviceTrusted ? t('auth.onDevice', { device: ctx?.device?.label || '' }) : t('auth.thisDevice') }}
          <small>· {{ deviceTrusted ? t('auth.trustedDevice') : t('auth.untrustedDevice') }}</small>
        </span>
      </div>
      <button type="button" class="org__change" @click="changeOrg">{{ t('auth.changeOrg') }}</button>
    </header>

    <ol class="steps" :aria-label="t('auth.steps')">
      <li v-for="(label, i) in steps" :key="label" :class="{ on: stepIndex === i, done: stepIndex > i }" :aria-current="stepIndex === i ? 'step' : undefined">
        <span class="steps__dot" aria-hidden="true"><Check v-if="stepIndex > i" :size="13" :stroke-width="3" /><template v-else>{{ i + 1 }}</template></span>
        <span class="steps__label">{{ label }}</span>
      </li>
    </ol>

    <div v-if="step !== 'org'" class="tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="tab === 'staff'" :class="{ on: tab === 'staff' }" @click="tab = 'staff'"><UserRound :size="16" aria-hidden="true" />{{ t('auth.staffTab') }}</button>
      <button type="button" role="tab" :aria-selected="tab === 'management'" :class="{ on: tab === 'management' }" @click="tab = 'management'"><KeyRound :size="16" aria-hidden="true" />{{ t('auth.managementTab') }}</button>
    </div>

    <UiBanner v-if="auth.expiredNotice && !error" tone="warning">{{ t('auth.sessionEnded') }}</UiBanner>
    <UiBanner v-if="error" tone="danger">
      {{ error }}
      <template v-if="errorRef"> · {{ t('ui.reference') }} {{ errorRef }}</template>
    </UiBanner>

    <!-- 1. organization -->
    <form v-if="step === 'org'" class="stack x-enter" @submit.prevent="submitOrg">
      <UiInput v-model="orgCode" :label="t('auth.orgCode')" :placeholder="t('auth.orgCodeHint')" autocomplete="organization" inputmode="text" size="lg" required autofocus>
        <template #prefix><Building2 :size="20" /></template>
      </UiInput>
      <label class="check">
        <input v-model="remember" type="checkbox" />
        <span class="check__box" aria-hidden="true"><Check :size="14" :stroke-width="3" /></span>
        <span class="check__tx"><b>{{ t('auth.remember') }}</b><small>{{ t('auth.rememberHint') }}</small></span>
      </label>
      <UiButton type="submit" size="lg" block :loading="busy">{{ t('auth.continue') }}</UiButton>
    </form>

    <!-- staff tab -->
    <template v-else-if="tab === 'staff'">
      <!-- 2a. device registration -->
      <form v-if="step === 'device'" class="stack x-enter" @submit.prevent="submitDevice">
        <div class="device">
          <span class="device__ic" aria-hidden="true"><MonitorSmartphone :size="24" /></span>
          <div><b>{{ t('auth.deviceTitle') }}</b><p>{{ t('auth.deviceIntro') }}</p></div>
        </div>
        <UiInput v-model="approval" :label="t('auth.approvalCode')" placeholder="ABCD-EFGH" autocomplete="one-time-code" size="lg" required autofocus>
          <template #prefix><KeyRound :size="20" /></template>
        </UiInput>
        <UiButton type="submit" size="lg" block :loading="busy">{{ t('auth.registerDevice') }}</UiButton>
        <p class="fine">{{ t('auth.deviceAdminHint') }}</p>
      </form>

      <!-- 2b. who are you -->
      <div v-else-if="step === 'staff'" class="stack x-enter">
        <template v-if="!manualStaff">
          <p class="lbl">{{ t('auth.whoTitle') }}</p>
          <UiSearchField v-if="(ctx?.staff || []).length > 8" v-model="staffQuery" :placeholder="t('auth.findName')" />
          <div class="tiles" role="list">
            <button v-for="s in staffList" :key="s.staff" type="button" class="tile" role="listitem" @click="pickStaff(s)">
              <span class="tile__av x-art" :class="`x-art--${toneOf(s.staff)}`" aria-hidden="true">{{ s.initials }}</span>
              <span class="tile__name">{{ s.name }}</span>
            </button>
          </div>
          <button type="button" class="link" @click="manualStaff = true"><Fingerprint :size="16" aria-hidden="true" />{{ t('auth.useStaffNumber') }}</button>
        </template>
        <form v-else class="stack" @submit.prevent="submitStaffNumber">
          <UiInput v-model="staffCode" :label="t('auth.staffNumber')" inputmode="numeric" autocomplete="username" size="lg" required autofocus :maxlength="12">
            <template #prefix><UserRound :size="20" /></template>
          </UiInput>
          <UiButton type="submit" size="lg" block>{{ t('auth.continue') }}</UiButton>
          <button v-if="(ctx?.staff || []).length" type="button" class="link" @click="manualStaff = false"><UserRound :size="16" aria-hidden="true" />{{ t('auth.pickName') }}</button>
        </form>
      </div>

      <!-- 3. PIN -->
      <div v-else class="stack pin x-enter">
        <div class="who">
          <button type="button" class="who__back" :aria-label="t('auth.notYou')" @click="step = 'staff'"><ArrowLeft :size="18" /></button>
          <span class="who__av x-art" :class="`x-art--${toneOf(staffCode)}`" aria-hidden="true">{{ chosen?.initials }}</span>
          <div class="who__tx">
            <b>{{ chosen?.name }}</b>
            <button type="button" class="link" @click="step = 'staff'">{{ t('auth.notYou') }}</button>
          </div>
        </div>
        <p class="pin__prompt">{{ t('auth.enterPin') }}</p>
        <UiPinDots :length="pin.length" :min="pinMin" :max="pinMax" :error="!!error" />
        <UiNumericKeypad :disabled="busy" capture-keyboard @digit="digit" @backspace="backspace" @submit="submitPin" />
        <UiButton size="xl" block :loading="busy" :disabled="pin.length < pinMin" @click="submitPin">{{ t('auth.signIn') }}</UiButton>
      </div>
    </template>

    <!-- management tab -->
    <form v-else class="stack x-enter" @submit.prevent="submitManagement">
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

    <!-- session security, always visible -->
    <ul class="secure" :aria-label="t('auth.secure.label')">
      <li><LockKeyhole :size="14" aria-hidden="true" />{{ t('auth.secure.tls') }}</li>
      <li><Timer :size="14" aria-hidden="true" />{{ t('auth.secure.idle') }}</li>
      <li><ScrollText :size="14" aria-hidden="true" />{{ t('auth.secure.audit') }}</li>
    </ul>
  </section>
</template>

<style scoped>
.sp { display: flex; flex-direction: column; gap: 18px; text-align: start; }
.signin__head { display: flex; gap: 14px; align-items: center; }
.signin__mark { width: 48px; height: 48px; flex: none; border-radius: 15px; display: grid; place-items: center; color: #fff; background: var(--x-brand-gradient); box-shadow: var(--x-shadow-brand); }
.signin__title { margin: 0; font-family: var(--x-font-display); font-size: 24px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
.signin__sub { margin: 2px 0 0; color: var(--x-text-muted); font-size: 15px; }
.org { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--x-radius-lg); background: var(--x-surface); border: 1px solid var(--x-border); box-shadow: var(--x-shadow-xs); }
.org__av { width: 46px; height: 46px; flex: none; border-radius: 14px; display: grid; place-items: center; background: var(--x-brand-navy); color: #fff; font-family: var(--x-font-display); font-weight: 800; font-size: 16px; }
.org__tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.org__name { margin: 0; font-family: var(--x-font-display); font-size: 18px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.org__device { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; flex-wrap: wrap; }
.org__device small { font-weight: 500; color: var(--x-text-muted); font-size: 12.5px; }
.org__device.is-trusted { color: var(--x-success-text); }
.org__device.is-new { color: var(--x-warning-text); }
.org__change { border: 0; background: var(--x-surface-3); color: var(--x-text); font: inherit; font-size: 13px; font-weight: 600; padding: 0 12px; min-height: 36px; border-radius: 10px; cursor: pointer; white-space: nowrap; }
.org__change:hover { background: var(--x-border); }
.stack { display: flex; flex-direction: column; gap: 14px; }
.steps { display: flex; align-items: center; gap: 8px; margin: 0; padding: 0; list-style: none; }
.steps li { flex: none; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--x-text-faint); min-width: 0; }
.steps li:not(:last-child) { flex: 1; }
.steps li:not(:last-child)::after { content: ''; flex: 1; height: 2px; border-radius: 1px; background: var(--x-border); min-width: 12px; }
.steps li.done:not(:last-child)::after { background: var(--x-primary); }
.steps__dot { width: 26px; height: 26px; border-radius: 50%; flex: none; display: grid; place-items: center; font-size: 12.5px; font-weight: 700; background: var(--x-surface-3); color: var(--x-text-muted); transition: background var(--x-duration), color var(--x-duration), box-shadow var(--x-duration); }
.steps li.on { color: var(--x-text); } .steps li.on .steps__dot { background: var(--x-primary); color: #fff; box-shadow: 0 0 0 4px color-mix(in srgb, var(--x-primary) 18%, transparent); }
.steps li.done .steps__dot { background: var(--x-success); color: #fff; }
.steps__label { white-space: nowrap; }
.tabs { display: flex; background: var(--x-surface-3); border-radius: var(--x-radius-md); padding: 4px; gap: 4px; }
.tabs button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; background: transparent; color: var(--x-text-muted); min-height: 42px; border-radius: 10px; font: inherit; font-weight: 600; font-size: 14.5px; cursor: pointer; transition: background var(--x-duration), color var(--x-duration), box-shadow var(--x-duration); }
.tabs button.on { background: var(--x-surface); color: var(--x-text); box-shadow: var(--x-shadow-sm); }
.check { position: relative; display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border); background: var(--x-surface-2); cursor: pointer; transition: border-color var(--x-duration), background var(--x-duration); }
.check:hover { border-color: var(--x-border-strong); }
.check input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.check__box { width: 22px; height: 22px; flex: none; border-radius: 7px; border: 1.5px solid var(--x-border-strong); background: var(--x-surface); display: grid; place-items: center; color: transparent; transition: background var(--x-duration), border-color var(--x-duration), color var(--x-duration); margin-top: 1px; }
.check input:checked + .check__box { background: var(--x-primary); border-color: var(--x-primary); color: #fff; }
.check input:focus-visible + .check__box { box-shadow: var(--x-focus-ring); }
.check__tx { display: flex; flex-direction: column; gap: 2px; }
.check__tx b { font-size: 14px; font-weight: 600; }
.check__tx small { font-size: 12.5px; color: var(--x-text-muted); line-height: 1.45; }
.device { display: flex; gap: 14px; padding: 14px; border-radius: var(--x-radius-lg); background: var(--x-primary-soft); border: 1px solid color-mix(in srgb, var(--x-primary) 18%, transparent); }
.device__ic { width: 44px; height: 44px; flex: none; border-radius: 13px; display: grid; place-items: center; background: var(--x-surface); color: var(--x-primary-text); box-shadow: var(--x-shadow-xs); }
.device b { font-size: 15px; } .device p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--x-text-muted); }
.lbl { margin: 0; font-size: 14px; font-weight: 600; }
.fine { margin: 0; font-size: 13px; color: var(--x-text-muted); line-height: 1.5; }
.center { text-align: center; }
.link { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; border: 0; background: none; color: var(--x-primary-text); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; padding: 6px 0; min-height: 32px; }
.link:hover { text-decoration: underline; text-underline-offset: 3px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 10px; max-height: 330px; overflow: auto; padding: 2px; margin: -2px; }
.tile { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px 14px; border: 1px solid var(--x-border); border-radius: var(--x-radius-lg); background: var(--x-surface); color: var(--x-text); font: inherit; cursor: pointer; min-height: 112px; box-shadow: var(--x-shadow-xs); transition: transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration), border-color var(--x-duration); }
.tile:hover { transform: translateY(-2px); box-shadow: var(--x-shadow-md); border-color: color-mix(in srgb, var(--x-primary) 40%, var(--x-border)); }
.tile:active { transform: scale(0.97); }
.tile__av { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 16px; flex: none; font-family: var(--x-font-display); }
.tile__name { font-size: 13.5px; font-weight: 600; text-align: center; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.who { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: var(--x-radius-lg); background: var(--x-surface-2); border: 1px solid var(--x-border); }
.who__back { width: 36px; height: 36px; flex: none; border-radius: 10px; border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); display: grid; place-items: center; cursor: pointer; }
[dir='rtl'] .who__back svg { transform: scaleX(-1); }
.who__av { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-family: var(--x-font-display); flex: none; }
.who__tx { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.who__tx b { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.who__tx .link { padding: 0; min-height: 24px; font-size: 13px; }
.pin__prompt { margin: 4px 0 0; text-align: center; font-size: 15px; font-weight: 600; color: var(--x-text-muted); }
.qr { align-self: center; background: #fff; border-radius: var(--x-radius-md); padding: 6px; }
code { background: var(--x-surface-3); padding: 2px 6px; border-radius: 6px; word-break: break-all; }
.secure { list-style: none; margin: 0; padding: 14px 0 0; border-top: 1px solid var(--x-border); display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 16px; }
.secure li { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--x-text-muted); font-weight: 500; white-space: nowrap; }
.secure li svg { color: var(--x-success); }
@media (max-width: 420px) { .steps__label { display: none; } .steps li.on .steps__label { display: inline; } }
</style>
