<script setup lang="ts">
// Public landing page at "/": product story on the left, the real sign-in on the right
// (visible without scrolling on a standard desktop); single column with a sticky
// "Sign in" button on tablets and phones. No heavy animation; the highlight rotation
// stops under prefers-reduced-motion and pauses on hover/focus.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import brandMark from '@/assets/brand-mark.png'
import SignInPanel from '@/components/auth/SignInPanel.vue'
import LocaleSwitch from '@/components/shell/LocaleSwitch.vue'
import { routeAfterSignIn } from '@/composables/useSessionBoot'
import { t } from '@/lib/i18n'

const router = useRouter()
const route = useRoute()
const year = new Date().getFullYear()

const highlights = computed(() => [1, 2, 3, 4, 5].map((n) => ({ title: t(`landing.h${n}.title`), body: t(`landing.h${n}.body`) })))
const current = ref(0)
const paused = ref(false)
let timer: number | undefined
onMounted(() => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!reduce) timer = window.setInterval(() => !paused.value && (current.value = (current.value + 1) % highlights.value.length), 6000)
})
onBeforeUnmount(() => timer && window.clearInterval(timer))

async function signedIn() {
  await routeAfterSignIn(router, typeof route.query.next === 'string' ? route.query.next : null)
}

const sections = computed(() => [
  { id: 'overview', label: t('landing.nav.overview') },
  { id: 'fnb', label: t('landing.nav.fnb') },
  { id: 'retail', label: t('landing.nav.retail') },
  { id: 'features', label: t('landing.nav.features') },
  { id: 'reporting', label: t('landing.nav.reporting') },
  { id: 'security', label: t('landing.nav.security') },
  { id: 'contact', label: t('landing.nav.contact') },
])
const features = computed(() => [1, 2, 3, 4, 5, 6].map((n) => ({ title: t(`landing.f${n}.title`), body: t(`landing.f${n}.body`) })))
</script>

<template>
  <div class="landing">
    <a class="skip" href="#signin">{{ t('landing.skipToSignIn') }}</a>
    <header class="top">
      <div class="brand">
        <img :src="brandMark" alt="" width="34" height="34" />
        <span class="word">Xentra<b>ERP</b> <span class="pos">POS</span></span>
      </div>
      <nav class="topnav" :aria-label="t('landing.nav.label')">
        <a v-for="s in sections" :key="s.id" :href="`#${s.id}`">{{ s.label }}</a>
      </nav>
      <LocaleSwitch />
    </header>

    <main class="hero" id="overview">
      <div class="hero__story">
        <p class="eyebrow">{{ t('landing.eyebrow') }}</p>
        <h1 class="headline">{{ t('landing.headline') }}</h1>
        <p class="lead">{{ t('landing.lead') }}</p>

        <div class="rotator" aria-live="polite" @mouseenter="paused = true" @mouseleave="paused = false" @focusin="paused = true" @focusout="paused = false">
          <div class="rotator__card">
            <b>{{ highlights[current].title }}</b>
            <span>{{ highlights[current].body }}</span>
          </div>
          <div class="rotator__dots" role="tablist" :aria-label="t('landing.highlights')">
            <button v-for="(h, i) in highlights" :key="i" type="button" role="tab" :aria-selected="i === current" :aria-label="h.title" :class="{ on: i === current }" @click="current = i" />
          </div>
        </div>

        <ul class="values">
          <li><span aria-hidden="true">🍽</span>{{ t('landing.value.fnb') }}</li>
          <li><span aria-hidden="true">🛍</span>{{ t('landing.value.retail') }}</li>
          <li><span aria-hidden="true">🔐</span>{{ t('landing.value.security') }}</li>
          <li><span aria-hidden="true">🏬</span>{{ t('landing.value.branches') }}</li>
        </ul>

        <svg class="illustration" viewBox="0 0 420 220" role="img" :aria-label="t('landing.illustration')">
          <rect x="10" y="20" width="250" height="160" rx="16" fill="var(--x-surface)" stroke="var(--x-border)" />
          <rect x="26" y="38" width="120" height="14" rx="7" fill="var(--x-primary-soft)" />
          <g fill="var(--x-surface-3)">
            <rect x="26" y="64" width="64" height="48" rx="10" /><rect x="98" y="64" width="64" height="48" rx="10" /><rect x="170" y="64" width="74" height="48" rx="10" />
            <rect x="26" y="120" width="64" height="48" rx="10" /><rect x="98" y="120" width="64" height="48" rx="10" />
          </g>
          <rect x="170" y="120" width="74" height="48" rx="10" fill="var(--x-primary)" />
          <rect x="280" y="40" width="130" height="160" rx="18" fill="var(--x-brand-navy)" />
          <g fill="#ffffff" opacity="0.9"><circle cx="315" cy="80" r="5" /><circle cx="335" cy="80" r="5" /><circle cx="355" cy="80" r="5" /><circle cx="375" cy="80" r="5" /></g>
          <g fill="#ffffff" opacity="0.18">
            <rect x="298" y="100" width="28" height="22" rx="6" /><rect x="331" y="100" width="28" height="22" rx="6" /><rect x="364" y="100" width="28" height="22" rx="6" />
            <rect x="298" y="128" width="28" height="22" rx="6" /><rect x="331" y="128" width="28" height="22" rx="6" /><rect x="364" y="128" width="28" height="22" rx="6" />
            <rect x="298" y="156" width="28" height="22" rx="6" /><rect x="331" y="156" width="28" height="22" rx="6" /><rect x="364" y="156" width="28" height="22" rx="6" />
          </g>
          <circle cx="250" cy="190" r="14" fill="var(--x-accent)" />
        </svg>
      </div>

      <aside class="hero__panel" id="signin">
        <SignInPanel @signed-in="signedIn" />
      </aside>
    </main>

    <section id="fnb" class="block">
      <h2>{{ t('landing.fnb.title') }}</h2>
      <p>{{ t('landing.fnb.body') }}</p>
    </section>
    <section id="retail" class="block alt">
      <h2>{{ t('landing.retail.title') }}</h2>
      <p>{{ t('landing.retail.body') }}</p>
    </section>
    <section id="features" class="block">
      <h2>{{ t('landing.features.title') }}</h2>
      <ul class="grid">
        <li v-for="f in features" :key="f.title"><b>{{ f.title }}</b><span>{{ f.body }}</span></li>
      </ul>
    </section>
    <section id="reporting" class="block alt">
      <h2>{{ t('landing.reporting.title') }}</h2>
      <p>{{ t('landing.reporting.body') }}</p>
    </section>
    <section id="security" class="block">
      <h2>{{ t('landing.security.title') }}</h2>
      <p>{{ t('landing.security.body') }}</p>
    </section>
    <section id="contact" class="block alt">
      <h2>{{ t('landing.contact.title') }}</h2>
      <p>{{ t('landing.contact.body') }} <a href="https://xentraerp.net">xentraerp.net</a></p>
    </section>

    <footer class="foot">
      <span>© {{ year }} XentraERP</span>
      <span>{{ t('landing.footer.note') }}</span>
    </footer>

    <a class="sticky-signin" href="#signin">{{ t('auth.signIn') }}</a>
  </div>
</template>

<style scoped>
.landing { min-height: 100dvh; background: var(--x-bg); color: var(--x-text); font-family: var(--x-font-sans); }
.skip { position: absolute; inset-inline-start: -9999px; }
.skip:focus { inset-inline-start: 16px; top: 16px; z-index: 10; background: var(--x-surface); padding: 8px 12px; border-radius: 8px; }
.top { display: flex; align-items: center; gap: var(--x-space-6); padding: var(--x-space-4) clamp(16px, 4vw, 48px); }
.brand { display: flex; align-items: center; gap: var(--x-space-2); }
.brand img { border-radius: 9px; }
.word { font-family: var(--x-font-display); font-size: 19px; font-weight: 700; color: var(--x-brand-navy); }
:root[data-theme='dark'] .word { color: var(--x-text); }
.word b { color: var(--x-brand-blue); }
.word .pos { font-weight: 600; color: var(--x-text-muted); }
.topnav { display: flex; gap: var(--x-space-4); flex: 1; overflow-x: auto; }
.topnav a { color: var(--x-text-muted); text-decoration: none; font-size: var(--x-text-sm); font-weight: 500; white-space: nowrap; padding-block: 8px; }
.topnav a:hover { color: var(--x-text); }

.hero { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(380px, 460px); gap: clamp(24px, 4vw, 64px); align-items: start; padding: var(--x-space-4) clamp(16px, 4vw, 48px) var(--x-space-12); max-width: 1400px; margin: 0 auto; }
.hero__story { display: flex; flex-direction: column; gap: var(--x-space-5); padding-block-start: var(--x-space-6); }
.eyebrow { margin: 0; color: var(--x-accent); font-weight: 700; font-size: var(--x-text-sm); letter-spacing: 0.06em; text-transform: uppercase; }
.headline { margin: 0; font-family: var(--x-font-display); font-size: var(--x-text-3xl); line-height: 1.12; letter-spacing: -0.02em; color: var(--x-brand-navy); }
:root[data-theme='dark'] .headline { color: var(--x-text); }
.lead { margin: 0; font-size: var(--x-text-lg); line-height: 1.55; color: var(--x-text-muted); max-width: 60ch; }
.rotator { display: flex; flex-direction: column; gap: var(--x-space-2); }
.rotator__card { display: flex; flex-direction: column; gap: 4px; padding: var(--x-space-4) var(--x-space-5); border-radius: var(--x-radius-lg); background: var(--x-surface); border: 1px solid var(--x-border); border-inline-start: 4px solid var(--x-primary); min-height: 86px; }
.rotator__card span { color: var(--x-text-muted); font-size: var(--x-text-sm); line-height: 1.5; }
.rotator__dots { display: flex; gap: 6px; }
.rotator__dots button { width: 28px; height: 6px; border-radius: 3px; border: 0; background: var(--x-border-strong); cursor: pointer; padding: 0; }
.rotator__dots button.on { background: var(--x-primary); }
.values { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--x-space-2) var(--x-space-4); }
.values li { display: flex; gap: var(--x-space-2); align-items: flex-start; font-size: var(--x-text-sm); color: var(--x-text); line-height: 1.45; }
.illustration { width: 100%; max-width: 460px; height: auto; }

.hero__panel { position: sticky; top: var(--x-space-4); background: var(--x-surface); border: 1px solid var(--x-border); border-radius: var(--x-radius-xl); box-shadow: var(--x-shadow-lg); padding: var(--x-space-6); }

.block { padding: var(--x-space-12) clamp(16px, 4vw, 48px); max-width: 1100px; margin: 0 auto; }
.block.alt { background: var(--x-surface-2); max-width: none; }
.block.alt > * { max-width: 1100px; margin-inline: auto; }
.block h2 { font-family: var(--x-font-display); font-size: var(--x-text-2xl); margin: 0 0 var(--x-space-3); color: var(--x-text); }
.block p { margin: 0; color: var(--x-text-muted); line-height: 1.6; max-width: 70ch; }
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--x-space-4); }
.grid li { background: var(--x-surface); border: 1px solid var(--x-border); border-radius: var(--x-radius-lg); padding: var(--x-space-4); display: flex; flex-direction: column; gap: 6px; }
.grid li span { color: var(--x-text-muted); font-size: var(--x-text-sm); line-height: 1.5; }
.foot { display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--x-space-2); padding: var(--x-space-6) clamp(16px, 4vw, 48px); color: var(--x-text-faint); font-size: var(--x-text-xs); border-block-start: 1px solid var(--x-border); }
.sticky-signin { display: none; }

@media (max-width: 1279px) {
  .hero { grid-template-columns: 1fr; }
  .hero__panel { position: static; order: -1; max-width: 560px; width: 100%; margin-inline: auto; }
  .topnav { display: none; }
  .illustration { display: none; }
  .sticky-signin { display: flex; position: fixed; inset-inline: 16px; inset-block-end: max(16px, env(safe-area-inset-bottom)); z-index: var(--x-z-sticky); justify-content: center; align-items: center; min-height: 52px; border-radius: var(--x-radius-full); background: var(--x-primary); color: #fff; font-weight: 700; text-decoration: none; box-shadow: var(--x-shadow-lg); }
}
@media (max-width: 767px) {
  .values { grid-template-columns: 1fr; }
  .hero__panel { padding: var(--x-space-4); border-radius: var(--x-radius-lg); }
}
</style>
