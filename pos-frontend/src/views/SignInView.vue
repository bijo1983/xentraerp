<script setup lang="ts">
// Sign-in page at "/signin": abstract point-of-sale artwork on the left (a different palette
// and arrangement on every visit, see PosArt), the sign-in card alone on the right. The landing
// page at "/" only links here — it has no sign-in of its own.
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Fingerprint, KeyRound, MonitorSmartphone } from 'lucide-vue-next'
import brandMark from '@/assets/brand-mark.png'
import PosArt from '@/components/auth/PosArt.vue'
import SignInPanel from '@/components/auth/SignInPanel.vue'
import LocaleSwitch from '@/components/shell/LocaleSwitch.vue'
import { routeAfterSignIn } from '@/composables/useSessionBoot'
import { t } from '@/lib/i18n'

const router = useRouter()
const route = useRoute()
const year = new Date().getFullYear()

async function signedIn() {
  await routeAfterSignIn(router, typeof route.query.next === 'string' ? route.query.next : null)
}
</script>

<template>
  <div class="si">
    <aside class="si__art">
      <PosArt />
      <div class="si__art-copy">
        <RouterLink to="/" class="si__brand">
          <img :src="brandMark" alt="" width="36" height="36" />
          <span>Xentra<b>ERP</b></span>
          <small>POS</small>
        </RouterLink>
        <div class="si__pitch">
          <h1>{{ t('signin.title') }}</h1>
          <p>{{ t('signin.body') }}</p>
          <ul>
            <li><MonitorSmartphone :size="16" aria-hidden="true" />{{ t('landing.trust.devices') }}</li>
            <li><Fingerprint :size="16" aria-hidden="true" />{{ t('landing.trust.pin') }}</li>
            <li><KeyRound :size="16" aria-hidden="true" />{{ t('landing.trust.mfa') }}</li>
          </ul>
        </div>
        <small class="si__copy">© {{ year }} XentraERP</small>
      </div>
    </aside>

    <main class="si__main">
      <header class="si__top">
        <RouterLink to="/" class="si__back"><ArrowLeft class="si__arrow" :size="16" aria-hidden="true" />{{ t('signin.back') }}</RouterLink>
        <LocaleSwitch />
      </header>
      <div class="si__card">
        <SignInPanel @signed-in="signedIn" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.si { min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); background: var(--x-bg); color: var(--x-text); font-family: var(--x-font-sans); }

.si__art { position: sticky; top: 0; height: 100dvh; overflow: hidden; isolation: isolate; color: #fff; }
.si__art > :deep(svg) { position: absolute; inset: 0; z-index: -1; }
.si__art-copy { height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; padding: clamp(28px, 4vw, 56px);
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.35), transparent 30%, transparent 55%, rgba(2, 6, 23, 0.6)); }
.si__brand { display: inline-flex; align-items: center; gap: 10px; color: #fff; text-decoration: none; font-family: var(--x-font-display); font-weight: 800; font-size: 20px; letter-spacing: -0.02em; }
.si__brand img { border-radius: 10px; }
.si__brand b { color: #93c5fd; }
.si__brand small { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; background: rgba(255, 255, 255, 0.16); border-radius: 6px; padding: 3px 7px; }
/* the artwork changes every visit, so the copy sits on its own frosted panel to stay readable */
.si__pitch { display: flex; flex-direction: column; gap: 16px; max-width: 30rem; padding: 28px; border-radius: 24px;
  background: rgba(2, 6, 23, 0.55); border: 1px solid rgba(255, 255, 255, 0.12); backdrop-filter: blur(18px) saturate(1.2); -webkit-backdrop-filter: blur(18px) saturate(1.2); box-shadow: 0 24px 48px -24px rgba(0, 0, 0, 0.6); }
.si__pitch h1 { margin: 0; font-family: var(--x-font-display); font-weight: 800; font-size: clamp(28px, 2.8vw, 40px); line-height: 1.12; letter-spacing: -0.025em; text-wrap: balance; }
.si__pitch p { margin: 0; font-size: 17px; line-height: 1.6; color: rgba(255, 255, 255, 0.82); text-wrap: pretty; }
.si__pitch ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.si__pitch li { display: inline-flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500; color: rgba(255, 255, 255, 0.9); }
.si__copy { font-size: 13px; color: rgba(255, 255, 255, 0.6); }

.si__main { min-width: 0; display: flex; flex-direction: column; padding: 20px clamp(16px, 4vw, 56px) 40px; }
.si__top { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 48px; }
.si__back { display: inline-flex; align-items: center; gap: 8px; color: var(--x-text-muted); text-decoration: none; font-weight: 600; font-size: 15px; padding: 8px 10px; margin-inline-start: -10px; border-radius: 10px; }
.si__back:hover { color: var(--x-text); background: var(--x-surface-3); }
[dir='rtl'] .si__arrow { transform: scaleX(-1); }
.si__card { width: 100%; max-width: 480px; margin: auto; padding: 32px; border-radius: 24px; background: var(--x-surface); border: 1px solid var(--x-border);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 32px 64px -24px rgba(15, 23, 42, 0.22); }

@media (max-width: 1023px) {
  .si { grid-template-columns: 1fr; }
  .si__art { position: relative; height: 200px; }
  .si__art-copy { justify-content: flex-start; padding: 24px; }
  .si__pitch p, .si__pitch ul, .si__copy { display: none; }
  .si__pitch { padding: 14px 18px; border-radius: 16px; }
  .si__pitch h1 { font-size: 20px; }
  .si__main { padding-top: 12px; }
  .si__card { margin: 16px auto 0; }
}
@media (max-width: 767px) {
  .si__art { height: 168px; }
  .si__card { padding: 20px; border-radius: 20px; }
}
</style>
