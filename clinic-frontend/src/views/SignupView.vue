<script setup lang="ts">
// CLINZA self-signup. Passwordless: prove the email with Google (ID token checked on the server)
// or a 6-digit code, then describe the clinic. Registering creates a XentraERP Tenant on the
// control plane (custom_erp.api.signup.register_clinic) with the chosen clinic type; once it's
// approved, the clinic's own site is provisioned with that specialty's charting and services.
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue'
import {
  Activity, ArrowLeft, ArrowRight, Baby, BadgeCheck, Building2, CalendarCheck2, Check, Ear, Eye, Flower2,
  HeartPulse, LoaderCircle, Lock, Mail, Receipt, ShieldCheck, Smile, Sparkles, Stethoscope,
} from 'lucide-vue-next'
import { controlPlane, errorMessage, ApiError } from '@/lib/api'
import AuroraBg from '@/components/AuroraBg.vue'
import ClinzaMark from '@/components/ClinzaMark.vue'

interface ClinicTypeOption { code: string; label: string; templates: string[]; appointment_types: { name: string; minutes: number }[] }
interface Options { clinic_types: ClinicTypeOption[]; countries: { name: string; isd: string }[]; google_client_id: string }
type Step = 'email' | 'code' | 'clinic' | 'done'

const ICONS: Record<string, Component> = {
  general: Stethoscope, dental: Smile, dermatology: Sparkles, ophthalmology: Eye, physiotherapy: Activity,
  pediatrics: Baby, obgyn: Flower2, ent: Ear, cardiology: HeartPulse, multispecialty: Building2,
}
const TZ_COUNTRY: Record<string, string> = {
  'Asia/Riyadh': 'Saudi Arabia', 'Asia/Dubai': 'United Arab Emirates', 'Asia/Bahrain': 'Bahrain', 'Asia/Muscat': 'Oman',
  'Asia/Qatar': 'Qatar', 'Asia/Kuwait': 'Kuwait', 'Asia/Kolkata': 'India', 'Asia/Calcutta': 'India',
}

const step = ref<Step>('email')
const options = ref<Options | null>(null)
const loadError = ref('')
const busy = ref(false)
const error = ref('')

const email = ref('')
const code = ref('')
const devCode = ref('')
const resendIn = ref(0)
const via = ref<'google' | 'code' | ''>('')
const googleBox = ref<HTMLElement | null>(null)
const codeInput = ref<HTMLInputElement | null>(null)

const clinicType = ref('')
const clinicName = ref('')
const adminName = ref('')
const country = ref('')
const mobile = ref('')
const agree = ref(false)
const timeZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return ''
  }
})()
const result = ref<{ tenant_code: string; status: string } | null>(null)

const isd = computed(() => options.value?.countries.find((c) => c.name === country.value)?.isd || '')
const selectedType = computed(() => options.value?.clinic_types.find((c) => c.code === clinicType.value))
const emailOk = computed(() => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim()))
const clinicOk = computed(() => clinicType.value && clinicName.value.trim() && adminName.value.trim() && country.value && mobile.value.replace(/\D/g, '').length >= 6 && agree.value)
const stepNo = computed(() => ({ email: 1, code: 1, clinic: 2, done: 3 })[step.value])

onMounted(async () => {
  try {
    options.value = await controlPlane<Options>('custom_erp.api.signup.clinza_signup_options')
    country.value = TZ_COUNTRY[timeZone] && options.value.countries.some((c) => c.name === TZ_COUNTRY[timeZone]) ? TZ_COUNTRY[timeZone] : ''
    if (options.value.google_client_id) {
      await nextTick()
      mountGoogle(options.value.google_client_id)
    }
  } catch (e) {
    loadError.value = errorMessage(e, 'Sign-up is not available right now. Please try again in a few minutes.')
  }
})

// ---- Google Identity Services (only when the site has a client id configured) ----
interface GoogleId { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } }
function mountGoogle(clientId: string) {
  const render = () => {
    const g = (window as unknown as { google?: GoogleId }).google
    if (!g || !googleBox.value) return
    g.accounts.id.initialize({ client_id: clientId, callback: onGoogle, ux_mode: 'popup', context: 'signup' })
    g.accounts.id.renderButton(googleBox.value, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 360 })
  }
  if ((window as unknown as { google?: GoogleId }).google) return render()
  const s = document.createElement('script')
  s.src = 'https://accounts.google.com/gsi/client'
  s.async = true
  s.onload = render
  document.head.appendChild(s)
}
// The button lives inside the email step, so draw it again whenever that step comes back.
watch(step, async (s) => {
  if (s === 'email' && options.value?.google_client_id) {
    await nextTick()
    mountGoogle(options.value.google_client_id)
  }
})
async function onGoogle(resp: { credential: string }) {
  error.value = ''
  busy.value = true
  try {
    const who = await controlPlane<{ email: string; name: string }>('custom_erp.api.signup.verify_google_identity', { credential: resp.credential })
    email.value = who.email
    if (!adminName.value) adminName.value = who.name
    via.value = 'google'
    step.value = 'clinic'
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

// ---- Email code ----
let timer: ReturnType<typeof setInterval> | undefined
function startCooldown() {
  resendIn.value = 30
  clearInterval(timer)
  timer = setInterval(() => {
    resendIn.value -= 1
    if (resendIn.value <= 0) clearInterval(timer)
  }, 1000)
}
async function sendCode() {
  if (!emailOk.value || busy.value) return
  error.value = ''
  busy.value = true
  try {
    const r = await controlPlane<{ dev_otp?: string }>('custom_erp.api.signup.request_otp', { identifier: email.value.trim(), channel: 'email', purpose: 'signup', brand: 'clinza' })
    devCode.value = r?.dev_otp || ''
    code.value = ''
    step.value = 'code'
    startCooldown()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
  // after busy clears: the code box is disabled while a request is running
  await nextTick()
  codeInput.value?.focus()
}
async function verifyCode() {
  if (code.value.length !== 6 || busy.value) return
  error.value = ''
  busy.value = true
  try {
    await controlPlane('custom_erp.api.signup.verify_otp', { identifier: email.value.trim(), channel: 'email', otp: code.value, purpose: 'signup' })
    via.value = 'code'
    step.value = 'clinic'
  } catch (e) {
    error.value = errorMessage(e)
    code.value = ''
  } finally {
    busy.value = false
  }
  await nextTick()
  codeInput.value?.focus()
}
watch(code, (v) => {
  const digits = v.replace(/\D/g, '').slice(0, 6)
  if (digits !== v) code.value = digits
  else if (digits.length === 6) verifyCode()
})

// ---- Register ----
async function register() {
  if (!clinicOk.value || busy.value) return
  error.value = ''
  busy.value = true
  try {
    const local = mobile.value.replace(/[^\d]/g, '').replace(/^0+/, '')
    result.value = await controlPlane<{ tenant_code: string; status: string }>('custom_erp.api.signup.register_clinic', {
      clinic_name: clinicName.value.trim(),
      admin_name: adminName.value.trim(),
      email: email.value.trim(),
      mobile: `${isd.value}${local}`,
      country: country.value,
      clinic_type: clinicType.value,
      time_zone: timeZone,
    })
    step.value = 'done'
  } catch (e) {
    error.value = errorMessage(e)
    if (e instanceof ApiError && e.code === 'NOT_VERIFIED') step.value = 'email'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="su">
    <aside class="su__art">
      <AuroraBg />
      <div class="su__art-in">
        <RouterLink to="/" class="su__brand"><ClinzaMark :size="30" /><span>CLINZA</span></RouterLink>
        <div>
          <h1>Open your clinic's workspace in <span class="grad">two minutes</span>.</h1>
          <ul class="su__list">
            <li><CalendarCheck2 :size="18" /> Calendar, check-in and the waiting list</li>
            <li><Smile :size="18" /> Charting made for your specialty</li>
            <li><Receipt :size="18" /> Tax-ready invoices posted to your accounts</li>
            <li><ShieldCheck :size="18" /> Insurance shares and claims done for you</li>
          </ul>
        </div>
        <p class="su__fine"><Lock :size="14" /> Passwordless and encrypted. Your clinic gets its own private database.</p>
      </div>
    </aside>

    <main class="su__main">
      <div class="su__top">
        <RouterLink to="/" class="su__brand sm"><ClinzaMark :size="26" /><span>CLINZA</span></RouterLink>
        <span class="su__have">Have an account? <RouterLink to="/sign-in">Sign in</RouterLink></span>
      </div>

      <div class="su__card">
        <ol v-if="step !== 'done'" class="su__steps" aria-label="Progress">
          <li :class="{ on: stepNo >= 1, done: stepNo > 1 }"><span>{{ stepNo > 1 ? '' : '1' }}<Check v-if="stepNo > 1" :size="13" /></span> Your email</li>
          <li :class="{ on: stepNo >= 2 }"><span>2</span> Your clinic</li>
        </ol>

        <p v-if="loadError" class="su__err" role="alert">{{ loadError }}</p>

        <!-- 1. Email -->
        <section v-else-if="step === 'email'" class="su__step">
          <h2>Create your clinic account</h2>
          <p class="muted">Free for one month, with every feature and unlimited staff.</p>
          <div v-if="options?.google_client_id" class="su__google">
            <div ref="googleBox" />
          </div>
          <div v-if="options?.google_client_id" class="su__or"><span>or use your email</span></div>
          <form class="su__form" @submit.prevent="sendCode">
            <label class="f"><span>Work email</span>
              <div class="su__field"><Mail :size="18" /><input v-model="email" type="email" autocomplete="email" inputmode="email" placeholder="you@yourclinic.com" required /></div>
            </label>
            <button class="su__btn" type="submit" :disabled="!emailOk || busy"><LoaderCircle v-if="busy" :size="18" class="spin" /> Email me a code <ArrowRight v-if="!busy" :size="18" /></button>
          </form>
          <p class="su__fine2">We'll send a 6-digit code. No password needed.</p>
        </section>

        <!-- 1b. Code -->
        <section v-else-if="step === 'code'" class="su__step">
          <button class="su__back" type="button" @click="step = 'email'"><ArrowLeft :size="16" /> Change email</button>
          <h2>Check your inbox</h2>
          <p class="muted">Enter the 6-digit code we sent to <strong>{{ email }}</strong>.</p>
          <label class="su__otp">
            <input ref="codeInput" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="6-digit code" :disabled="busy" />
            <span v-for="i in 6" :key="i" class="su__box" :class="{ fill: code.length >= i, cur: code.length === i - 1 && !busy }">{{ code[i - 1] || '' }}</span>
          </label>
          <p v-if="devCode" class="su__dev">Test site: your code is <strong>{{ devCode }}</strong></p>
          <button class="su__btn" type="button" :disabled="code.length !== 6 || busy" @click="verifyCode"><LoaderCircle v-if="busy" :size="18" class="spin" /> Verify email</button>
          <p class="su__fine2">
            Didn't get it? Check spam, or
            <button type="button" class="su__link" :disabled="resendIn > 0 || busy" @click="sendCode">{{ resendIn > 0 ? `resend in ${resendIn}s` : 'send a new code' }}</button>
          </p>
        </section>

        <!-- 2. Clinic -->
        <section v-else-if="step === 'clinic'" class="su__step">
          <p class="su__verified"><BadgeCheck :size="16" /> {{ email }} verified{{ via === 'google' ? ' with Google' : '' }}</p>
          <h2>Tell us about your clinic</h2>
          <p class="muted">Your specialty decides the charts, visit types and services we set up. You can change them later.</p>
          <div class="su__types" role="radiogroup" aria-label="Clinic type">
            <button v-for="c in options?.clinic_types || []" :key="c.code" type="button" role="radio" :aria-checked="clinicType === c.code" class="su__type" :class="{ on: clinicType === c.code }" @click="clinicType = c.code">
              <component :is="ICONS[c.code] || Stethoscope" :size="20" />
              <span>{{ c.label }}</span>
              <Check v-if="clinicType === c.code" :size="16" class="su__tick" />
            </button>
          </div>
          <p v-if="selectedType" class="su__hint">You'll get {{ selectedType.appointment_types.map((a) => a.name).join(', ') }} as visit types.</p>
          <form class="su__form" @submit.prevent="register">
            <label class="f"><span>Clinic name</span><input v-model="clinicName" autocomplete="organization" placeholder="e.g. Al Noor Dental Center" /></label>
            <label class="f"><span>Your full name</span><input v-model="adminName" autocomplete="name" placeholder="e.g. Dr. Sara Ahmed" /></label>
            <div class="su__two">
              <label class="f"><span>Country</span>
                <select v-model="country" autocomplete="country-name">
                  <option value="" disabled>Select country</option>
                  <option v-for="c in options?.countries || []" :key="c.name" :value="c.name">{{ c.name }}</option>
                </select>
              </label>
              <label class="f"><span>Mobile</span>
                <div class="su__phone"><span>{{ isd || '+' }}</span><input v-model="mobile" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="5X XXX XXXX" /></div>
              </label>
            </div>
            <label class="su__agree"><input v-model="agree" type="checkbox" /> I agree to the terms of service and privacy policy, and confirm I'm authorised to register this clinic.</label>
            <button class="su__btn" type="submit" :disabled="!clinicOk || busy"><LoaderCircle v-if="busy" :size="18" class="spin" /> Create my clinic <ArrowRight v-if="!busy" :size="18" /></button>
          </form>
        </section>

        <!-- 3. Done -->
        <section v-else class="su__step su__done">
          <div class="su__ok"><Check :size="30" /></div>
          <h2>You're on the list</h2>
          <p class="muted">We're setting up <strong>{{ clinicName }}</strong> as a {{ selectedType?.label.toLowerCase() }} clinic. We'll email <strong>{{ email }}</strong> as soon as it's ready to use.</p>
          <div class="su__code"><span>Your clinic code</span><strong>{{ result?.tenant_code }}</strong><em>You'll enter it when you sign in.</em></div>
          <ol class="su__next">
            <li>Our team approves new clinics, usually within one business day.</li>
            <li>Your clinic gets its own site with your specialty's charts, services and tax.</li>
            <li>Sign in with your clinic code and invite your team.</li>
          </ol>
          <RouterLink to="/" class="su__btn ghost">Back to home</RouterLink>
        </section>

        <p v-if="error" class="su__err" role="alert">{{ error }}</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.su { min-height: 100vh; display: grid; grid-template-columns: minmax(360px, 0.9fr) 1.1fr; background: #fff; color: #0f172a; font-family: var(--x-font-sans); }
.su__art { position: relative; overflow: hidden; }
.su__art-in { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; padding: 32px 44px; }
.su__brand { display: inline-flex; align-items: center; gap: 10px; font-family: var(--x-font-display); font-weight: 800; letter-spacing: 0.04em; color: #0f172a; text-decoration: none; font-size: 18px; }
.su__brand.sm { font-size: 16px; display: none; }
h1 { font-family: var(--x-font-display); font-size: clamp(30px, 3.2vw, 44px); line-height: 1.08; letter-spacing: -0.03em; margin: 0 0 24px; font-weight: 800; }
.grad { background: linear-gradient(100deg, #2563eb, #4f46e5 55%, #06b6d4); -webkit-background-clip: text; background-clip: text; color: transparent; }
.su__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.su__list li { display: flex; align-items: center; gap: 12px; font-size: 15.5px; color: #334155; padding: 12px 14px; border-radius: 14px; background: rgba(255, 255, 255, 0.62); border: 1px solid rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); }
.su__list svg { color: #2563eb; flex: none; }
.su__fine { display: flex; align-items: center; gap: 7px; font-size: 13px; color: #475569; margin: 0; }
.su__main { display: flex; flex-direction: column; padding: 24px 32px 40px; }
.su__top { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.su__have { font-size: 14px; color: #64748b; }
.su__have a, .su__link { color: #2563eb; font-weight: 600; text-decoration: none; background: none; border: 0; padding: 0; font: inherit; cursor: pointer; }
.su__link:disabled { color: #94a3b8; cursor: default; }
.su__card { width: 100%; max-width: 520px; margin: auto; padding: 8px 0; }
.su__steps { list-style: none; padding: 0; margin: 0 0 26px; display: flex; gap: 22px; font-size: 13.5px; color: #94a3b8; font-weight: 600; }
.su__steps li { display: flex; align-items: center; gap: 8px; }
.su__steps span { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; border: 1.5px solid #cbd5e1; }
.su__steps li.on { color: #0f172a; }
.su__steps li.on span { border-color: #2563eb; color: #2563eb; }
.su__steps li.done span { background: #2563eb; color: #fff; border-color: #2563eb; }
h2 { font-family: var(--x-font-display); font-size: 28px; letter-spacing: -0.025em; margin: 0 0 6px; font-weight: 800; }
.muted { color: #64748b; margin: 0 0 22px; line-height: 1.5; }
.su__step { display: flex; flex-direction: column; }
.su__google { display: flex; justify-content: center; min-height: 44px; }
.su__or { display: flex; align-items: center; gap: 12px; color: #94a3b8; font-size: 13px; margin: 18px 0; }
.su__or::before, .su__or::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }
.su__form { display: flex; flex-direction: column; gap: 14px; }
.f { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; font-weight: 600; color: #334155; }
.f input, .f select { height: 48px; border-radius: 12px; border: 1px solid #dbe1ea; padding: 0 14px; font: inherit; font-weight: 500; font-size: 15px; background: #fff; color: #0f172a; }
.f input:focus, .f select:focus, .su__field:focus-within, .su__phone:focus-within { outline: none; border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.14); }
.su__field, .su__phone { display: flex; align-items: center; gap: 10px; height: 48px; border-radius: 12px; border: 1px solid #dbe1ea; padding: 0 14px; background: #fff; }
.su__field svg { color: #94a3b8; flex: none; }
.su__field input, .su__phone input { border: 0; height: 100%; padding: 0; flex: 1; min-width: 0; box-shadow: none !important; }
.su__phone span { font-weight: 600; color: #475569; border-inline-end: 1px solid #e2e8f0; padding-inline-end: 10px; }
.su__btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 50px; border-radius: 14px; border: 0; font: inherit; font-weight: 700; font-size: 15.5px; color: #fff; cursor: pointer; text-decoration: none; background: linear-gradient(135deg, #2563eb, #4f46e5); box-shadow: 0 14px 28px -14px rgba(37, 99, 235, 0.8); margin-top: 6px; }
.su__btn:disabled { opacity: 0.5; cursor: default; box-shadow: none; }
.su__btn.ghost { background: #f1f5f9; color: #0f172a; box-shadow: none; }
.su__fine2 { text-align: center; color: #64748b; font-size: 13.5px; margin: 16px 0 0; }
.su__back { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; color: #64748b; font: inherit; font-size: 13.5px; cursor: pointer; padding: 0; margin-bottom: 14px; }
.su__otp { position: relative; display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 14px; }
.su__otp input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; font-size: 16px; cursor: text; }
.su__box { height: 60px; border-radius: 14px; border: 1.5px solid #dbe1ea; display: grid; place-items: center; font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; background: #fff; }
.su__box.fill { border-color: #94a3b8; }
.su__otp:focus-within .su__box.cur { border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.14); }
.su__dev { font-size: 13px; color: #b45309; background: #fffbeb; padding: 8px 12px; border-radius: 10px; margin: 0 0 6px; }
.su__verified { display: inline-flex; align-self: flex-start; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #047857; background: #ecfdf5; padding: 5px 10px; border-radius: 99px; margin: 0 0 14px; }
.su__types { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; }
.su__type { position: relative; display: flex; align-items: center; gap: 10px; text-align: start; padding: 12px; border-radius: 14px; border: 1.5px solid #e2e8f0; background: #fff; font: inherit; font-size: 14px; font-weight: 600; color: #0f172a; cursor: pointer; transition: border-color 0.12s, background 0.12s; }
.su__type svg { color: #2563eb; flex: none; }
.su__type:hover { border-color: #93c5fd; }
.su__type.on { border-color: #2563eb; background: #eff6ff; }
.su__tick { position: absolute; top: 8px; right: 8px; }
.su__hint { font-size: 13px; color: #64748b; margin: 0 0 16px; }
.su__two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.su__agree { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: #475569; line-height: 1.45; }
.su__agree input { margin-top: 2px; width: 16px; height: 16px; accent-color: #2563eb; }
.su__err { margin: 16px 0 0; padding: 10px 14px; border-radius: 12px; background: #fef2f2; color: #b91c1c; font-size: 14px; }
.su__done { text-align: center; align-items: center; }
.su__ok { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 14px 30px -12px rgba(16, 185, 129, 0.7); margin-bottom: 16px; }
.su__code { display: flex; flex-direction: column; gap: 2px; padding: 16px 28px; border-radius: 16px; background: #f8fafc; border: 1px dashed #cbd5e1; margin-bottom: 18px; }
.su__code span { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 700; }
.su__code strong { font-size: 32px; letter-spacing: 0.12em; font-variant-numeric: tabular-nums; }
.su__code em { font-style: normal; font-size: 12.5px; color: #64748b; }
.su__next { text-align: start; color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px; padding-inline-start: 20px; }
.su__done .su__btn { width: 100%; }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) {
  .su { grid-template-columns: 1fr; }
  .su__art { display: none; }
  .su__brand.sm { display: inline-flex; margin-inline-end: auto; }
  .su__top { justify-content: space-between; }
  .su__main { padding: 16px 16px 32px; }
  .su__card { margin-top: 24px; }
}
@media (max-width: 420px) {
  .su__types { grid-template-columns: 1fr; }
  .su__two { grid-template-columns: 1fr; }
  .su__have { font-size: 13px; }
}
</style>
