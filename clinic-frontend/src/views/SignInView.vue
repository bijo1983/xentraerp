<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarCheck2, FileText, ShieldCheck, Stethoscope } from 'lucide-vue-next'
import { errorMessage } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useClinicStore } from '@/stores/clinic'
import UiButton from '@/ui/UiButton.vue'
import UiInput from '@/ui/UiInput.vue'
import UiBanner from '@/ui/UiBanner.vue'
import ClinzaMark from '@/components/ClinzaMark.vue'

const auth = useAuthStore()
const store = useClinicStore()
const router = useRouter()
const route = useRoute()
const code = ref(auth.org?.code || '')
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const SIGNUP = 'https://xentraerp.net/signup?product=clinza'

async function findClinic() {
  error.value = ''
  busy.value = true
  try {
    await auth.lookup(code.value)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function signIn() {
  error.value = ''
  busy.value = true
  try {
    await auth.signIn(email.value, password.value)
    await store.load()
    const next = typeof route.query.next === 'string' ? route.query.next : null
    router.replace(next || (store.ctx?.configured ? '/today' : store.can('setup') ? '/setup' : '/today'))
  } catch (e) {
    error.value = errorMessage(e, "Couldn't sign you in. Check your email and password.")
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="signin">
    <section class="hero">
      <div class="hero__brand"><ClinzaMark :size="44" /><span>CLINZA</span></div>
      <h1 class="hero__title">The calm, connected clinic.</h1>
      <p class="hero__lead">Appointments, specialty charting, prescriptions, VAT &amp; GST billing and insurance claims — posted straight to your XentraERP accounts.</p>
      <ul class="hero__list">
        <li><CalendarCheck2 :size="20" /> Day view by practitioner, with double-booking checks</li>
        <li><Stethoscope :size="20" /> Charting templates for your clinic type — dental, eye, skin, physio and more</li>
        <li><FileText :size="20" /> GCC tax invoices (with ZATCA QR), India GST and EU invoices</li>
        <li><ShieldCheck :size="20" /> Insurance policies, co-pay split and claims tracking</li>
      </ul>
    </section>
    <section class="panel">
      <div class="card">
        <h2>Sign in</h2>
        <p class="muted">{{ auth.org ? auth.org.name : 'Enter the clinic code you received when your clinic was approved.' }}</p>
        <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
        <form v-if="!auth.org" class="stack" @submit.prevent="findClinic">
          <UiInput v-model="code" label="Clinic code" inputmode="numeric" autocomplete="organization" size="lg" required autofocus />
          <UiButton type="submit" size="lg" block :loading="busy">Continue</UiButton>
        </form>
        <form v-else class="stack" @submit.prevent="signIn">
          <UiInput v-model="email" label="Email" type="email" autocomplete="username" required autofocus />
          <UiInput v-model="password" label="Password" type="password" autocomplete="current-password" required />
          <UiButton type="submit" size="lg" block :loading="busy">Sign in</UiButton>
          <button type="button" class="link" @click="auth.forgetOrg()">Use a different clinic code</button>
        </form>
        <p class="small muted signup">New clinic? <a :href="SIGNUP">Start your free trial</a> — choose your clinic type and we set up the rest.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.signin { min-height: 100dvh; display: grid; grid-template-columns: 1.1fr 1fr; }
.hero { background: var(--x-brand-gradient); color: #fff; padding: clamp(32px, 6vw, 80px); display: flex; flex-direction: column; justify-content: center; gap: var(--x-space-5); }
.hero__brand { display: flex; align-items: center; gap: 12px; font-family: var(--x-font-display); font-weight: 800; letter-spacing: 0.1em; font-size: 20px; }
.hero__brand :deep(rect) { fill: rgba(255, 255, 255, 0.18); }
.hero__title { font-size: var(--x-text-hero); line-height: var(--x-leading-tight); max-width: 14ch; }
.hero__lead { font-size: var(--x-text-body); max-width: 46ch; opacity: 0.92; margin: 0; line-height: var(--x-leading); }
.hero__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; font-weight: 500; }
.hero__list li { display: flex; gap: 12px; align-items: center; }
.panel { display: grid; place-items: center; padding: var(--x-space-6); }
.card { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: var(--x-space-4); }
.card h2 { font-size: var(--x-text-2xl); }
.card p { margin: 0; }
.link { border: 0; background: none; color: var(--x-primary-text); font: inherit; font-weight: 600; cursor: pointer; padding: 6px; }
.signup { text-align: center; }
@media (max-width: 900px) { .signin { grid-template-columns: 1fr; } .hero { padding: 32px 20px; } .hero__list { display: none; } }
</style>
