<script setup lang="ts">
// Public landing page at "/". Marketing only: every "Sign in" leads to the separate sign-in page
// (/signin, SignInView). No lifestyle or stock photography: the hero pairs the headline with
// the product family drawn as floating panels (HeroProduct); capabilities alternate copy with
// real XentraERP POS screens (public/img/product, sample data) or drawn product panels
// (ProductPanel); then sample KPIs, the businesses it is made for, features, security and a
// closing call to action. Spacing follows one scale: 24px between components,
// 48px inside sections, 96px between major sections.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ArrowRight, Banknote, Boxes, Building2, ChartColumn, CircleCheck, Fingerprint, Globe, KeyRound, Layers, MonitorSmartphone,
  Coffee, Printer, Receipt, ShieldCheck, ShoppingBag, Sparkles, Store, Timer, Users, UtensilsCrossed, Wallet,
} from 'lucide-vue-next'
import brandMark from '@/assets/brand-mark.png'
import LocaleSwitch from '@/components/shell/LocaleSwitch.vue'
import CountUp from '@/components/landing/CountUp.vue'
import HeroProduct from '@/components/landing/HeroProduct.vue'
import ProductPanel from '@/components/landing/ProductPanel.vue'
import { useReveal } from '@/composables/useReveal'
import { t } from '@/lib/i18n'

const year = new Date().getFullYear()
const root = ref<HTMLElement | null>(null)
useReveal(root)

const scrolled = ref(false)
// The floating "Sign in" button (tablets and phones) appears once the hero's own buttons are scrolled past.
const pastHero = ref(false)
const onScroll = () => {
  scrolled.value = window.scrollY > 8
  pastHero.value = window.scrollY > 480
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

const sections = computed(() => [
  { id: 'restaurant', label: t('landing.nav.fnb') },
  { id: 'retail', label: t('landing.nav.retail') },
  { id: 'analytics', label: t('landing.nav.analytics') },
  { id: 'inventory', label: t('landing.nav.inventory') },
  { id: 'branches', label: t('landing.nav.branches') },
])
const trust = computed(() => [
  { icon: MonitorSmartphone, text: t('landing.trust.devices') },
  { icon: Fingerprint, text: t('landing.trust.pin') },
  { icon: KeyRound, text: t('landing.trust.mfa') },
])

// Capability sections alternate visual right / left: a real screen (shot) or a drawn panel.
type Capability = { id: string; icon: typeof UtensilsCrossed; tone: string; key: string; alt: string; shot?: string; panel?: 'inventory' | 'branches' }
const capabilities = computed<Capability[]>(() => [
  { id: 'restaurant', icon: UtensilsCrossed, tone: 'amber', shot: 'restaurant-order', alt: t('landing.shot.order'), key: 'fnb' },
  { id: 'retail', icon: ShoppingBag, tone: 'sky', shot: 'retail-checkout', alt: t('landing.shot.retail'), key: 'retail' },
  { id: 'analytics', icon: ChartColumn, tone: 'emerald', shot: 'management-dashboard', alt: t('landing.shot.dashboard'), key: 'analytics' },
  { id: 'inventory', icon: Boxes, tone: 'rose', panel: 'inventory', alt: t('landing.shot.inventory'), key: 'inventory' },
  { id: 'branches', icon: Building2, tone: 'violet', panel: 'branches', alt: t('landing.shot.branches'), key: 'branches' },
])

const kpis = computed(() => [
  { icon: Wallet, tone: 'sky', label: t('landing.kpis.sales'), to: 2846.75, decimals: 3, prefix: 'BHD', note: t('landing.kpis.salesNote'), spark: [12, 18, 15, 24, 30, 27, 38, 44] },
  { icon: Receipt, tone: 'emerald', label: t('landing.kpis.tx'), to: 186, decimals: 0, prefix: '', note: t('landing.kpis.txNote'), spark: [8, 14, 11, 20, 26, 22, 30, 34] },
  { icon: Boxes, tone: 'amber', label: t('landing.kpis.inventory'), to: 412, decimals: 0, prefix: '', note: t('landing.kpis.invNote'), spark: [20, 16, 24, 22, 28, 26, 32, 30] },
  { icon: Building2, tone: 'violet', label: t('landing.kpis.branches'), to: 3, decimals: 0, prefix: '', note: t('landing.kpis.branchNote'), spark: [10, 10, 20, 20, 20, 30, 30, 30] },
])
const sparkPath = (pts: number[]) => pts.map((v, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1)) * 100},${40 - v * 0.8}`).join(' ')

const madeFor = computed(() => [
  { id: 'restaurants', icon: UtensilsCrossed, tone: 'amber', label: t('landing.for.restaurants'), body: t('landing.for.restaurantsBody') },
  { id: 'cafes', icon: Coffee, tone: 'rose', label: t('landing.for.cafes'), body: t('landing.for.cafesBody') },
  { id: 'retail', icon: Store, tone: 'sky', label: t('landing.for.retail'), body: t('landing.for.retailBody') },
])
const features = computed(() => [
  { icon: Users, tone: 'sky', title: t('landing.f1.title'), body: t('landing.f1.body') },
  { icon: Wallet, tone: 'emerald', title: t('landing.f2.title'), body: t('landing.f2.body') },
  { icon: Banknote, tone: 'amber', title: t('landing.f3.title'), body: t('landing.f3.body') },
  { icon: Printer, tone: 'violet', title: t('landing.f4.title'), body: t('landing.f4.body') },
  { icon: Globe, tone: 'rose', title: t('landing.f5.title'), body: t('landing.f5.body') },
  { icon: Layers, tone: 'sky', title: t('landing.f6.title'), body: t('landing.f6.body') },
])
const security = computed(() => [
  { icon: MonitorSmartphone, title: t('landing.security.s1.title'), body: t('landing.security.s1.body') },
  { icon: Fingerprint, title: t('landing.security.s2.title'), body: t('landing.security.s2.body') },
  { icon: KeyRound, title: t('landing.security.s3.title'), body: t('landing.security.s3.body') },
  { icon: Timer, title: t('landing.security.s4.title'), body: t('landing.security.s4.body') },
])
</script>

<template>
  <div ref="root" class="lp">
    <a class="lp-skip" href="#top">{{ t('landing.skipToContent') }}</a>

    <!-- top navigation -->
    <header class="lp-nav" :class="{ 'is-scrolled': scrolled }">
      <div class="lp-nav__in">
        <a class="lp-brand" href="#top">
          <img :src="brandMark" alt="" width="36" height="36" />
          <span class="lp-brand__word">Xentra<b>ERP</b></span>
          <span class="lp-brand__tag">POS</span>
        </a>
        <nav class="lp-nav__links" :aria-label="t('landing.nav.label')">
          <a v-for="s in sections" :key="s.id" :href="`#${s.id}`">{{ s.label }}</a>
        </nav>
        <div class="lp-nav__end">
          <LocaleSwitch />
          <RouterLink class="lp-btn lp-btn--dark lp-btn--sm" to="/signin">{{ t('auth.signIn') }}</RouterLink>
        </div>
      </div>
    </header>

    <!-- hero: headline, value proposition and calls to action beside the product family -->
    <main id="top" class="lp-hero">
      <div class="lp-hero__bg" aria-hidden="true" />
      <div class="lp-hero__in lp-wrap">
        <div class="lp-hero__story">
          <p class="lp-badge x-enter"><span><Sparkles :size="14" /></span>{{ t('landing.badge') }}</p>
          <h1 class="lp-hero__title x-enter">{{ t('landing.headline') }}</h1>
          <p class="lp-hero__lead x-enter">{{ t('landing.lead') }}</p>
          <div class="lp-ctas x-enter">
            <RouterLink class="lp-btn lp-btn--primary" to="/signin">{{ t('landing.cta.primary') }} <ArrowRight class="lp-arrow" :size="18" aria-hidden="true" /></RouterLink>
            <a class="lp-btn lp-btn--ghost" href="#restaurant">{{ t('landing.cta.secondary') }}</a>
          </div>
          <ul class="lp-trust x-enter" :aria-label="t('landing.trust.label')">
            <li v-for="x in trust" :key="x.text"><component :is="x.icon" :size="16" aria-hidden="true" />{{ x.text }}</li>
          </ul>
        </div>

        <HeroProduct class="lp-hero__media x-enter" />
      </div>
    </main>

    <!-- capabilities, alternating visual right / left -->
    <section
      v-for="(c, i) in capabilities"
      :id="c.id"
      :key="c.id"
      class="lp-cap"
      :class="{ 'lp-cap--flip': i % 2 === 1, 'lp-cap--tint': i % 2 === 1, 'lp-cap--first': i === 0 }"
      :aria-labelledby="`${c.id}-title`"
    >
      <div class="lp-cap__in lp-wrap">
        <div class="lp-cap__copy" data-reveal>
          <p class="lp-eyebrow"><span class="x-art" :class="`x-art--${c.tone}`" aria-hidden="true"><component :is="c.icon" :size="18" :stroke-width="1.8" /></span>{{ t(`landing.${c.key}.eyebrow`) }}</p>
          <h2 :id="`${c.id}-title`" class="lp-h2">{{ t(`landing.${c.key}.title`) }}</h2>
          <p class="lp-sub">{{ t(`landing.${c.key}.body`) }}</p>
          <ul class="lp-checks">
            <li v-for="b in ['b1', 'b2', 'b3']" :key="b"><CircleCheck :size="20" aria-hidden="true" />{{ t(`landing.${c.key}.${b}`) }}</li>
          </ul>
          <RouterLink class="lp-link" to="/signin">{{ t(`landing.${c.key}.cta`) }} <ArrowRight class="lp-arrow" :size="17" aria-hidden="true" /></RouterLink>
        </div>
        <div class="lp-stage" :class="`lp-stage--${c.tone}`" data-reveal>
          <ProductPanel v-if="c.panel" :kind="c.panel" :label="c.alt" />
          <div v-else class="lp-shot">
            <span class="lp-shot__bar" aria-hidden="true"><i /><i /><i /><span>pos.xentraerp.net</span></span>
            <img
              :src="`/img/product/${c.shot}.webp`"
              :srcset="`/img/product/${c.shot}-sm.webp 800w, /img/product/${c.shot}.webp 1600w`"
              sizes="(max-width: 1023px) 92vw, 680px"
              :alt="c.alt"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- KPIs -->
    <section id="kpis" class="lp-kpis" aria-labelledby="kpis-title">
      <div class="lp-wrap lp-stack">
        <div class="lp-head" data-reveal>
          <p class="lp-eyebrow lp-eyebrow--plain">{{ t('landing.kpis.eyebrow') }}</p>
          <h2 id="kpis-title" class="lp-h2">{{ t('landing.kpis.title') }}</h2>
          <p class="lp-sub">{{ t('landing.kpis.body') }}</p>
        </div>
        <ul class="lp-kpi-grid">
          <li v-for="k in kpis" :key="k.label" class="lp-card lp-kpi" data-reveal>
            <div class="lp-kpi__top">
              <span class="lp-icon x-art" :class="`x-art--${k.tone}`" aria-hidden="true"><component :is="k.icon" :size="20" :stroke-width="1.8" /></span>
              <span class="lp-kpi__label">{{ k.label }}</span>
            </div>
            <b class="lp-kpi__value x-tabular"><small v-if="k.prefix">{{ k.prefix }}</small><CountUp :to="k.to" :decimals="k.decimals" /></b>
            <svg class="lp-kpi__spark" :class="`is-${k.tone}`" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
              <path :d="`${sparkPath(k.spark)} L100,40 L0,40 Z`" class="area" />
              <path :d="sparkPath(k.spark)" class="line" />
            </svg>
            <small class="lp-kpi__note">{{ k.note }}</small>
          </li>
        </ul>
        <p class="lp-note">{{ t('landing.kpis.sample') }}</p>
      </div>
    </section>

    <!-- made for -->
    <section id="made-for" class="lp-for" aria-labelledby="for-title">
      <div class="lp-wrap lp-stack">
        <div class="lp-head" data-reveal>
          <p class="lp-eyebrow lp-eyebrow--plain">{{ t('landing.for.label') }}</p>
          <h2 id="for-title" class="lp-h2">{{ t('landing.for.title') }}</h2>
          <p class="lp-sub">{{ t('landing.for.body') }}</p>
        </div>
        <ul class="lp-for__grid">
          <li v-for="m in madeFor" :key="m.id" class="lp-card lp-for__card" data-reveal>
            <span class="lp-icon lp-icon--lg x-art" :class="`x-art--${m.tone}`" aria-hidden="true"><component :is="m.icon" :size="24" :stroke-width="1.8" /></span>
            <h3>{{ m.label }}</h3>
            <p>{{ m.body }}</p>
          </li>
        </ul>
      </div>
    </section>

    <!-- features -->
    <section id="features" class="lp-features" aria-labelledby="features-title">
      <div class="lp-wrap lp-stack">
        <div class="lp-head" data-reveal>
          <p class="lp-eyebrow lp-eyebrow--plain">{{ t('landing.features.eyebrow') }}</p>
          <h2 id="features-title" class="lp-h2">{{ t('landing.features.title') }}</h2>
          <p class="lp-sub">{{ t('landing.features.body') }}</p>
        </div>
        <ul class="lp-fgrid">
          <li v-for="f in features" :key="f.title" class="lp-card lp-fcard" data-reveal>
            <span class="lp-icon lp-icon--lg x-art" :class="`x-art--${f.tone}`" aria-hidden="true"><component :is="f.icon" :size="22" :stroke-width="1.8" /></span>
            <h3>{{ f.title }}</h3>
            <p>{{ f.body }}</p>
          </li>
        </ul>
      </div>
    </section>

    <!-- security -->
    <section id="security" class="lp-sec" aria-labelledby="security-title">
      <div class="lp-wrap lp-sec__in">
        <div class="lp-sec__copy" data-reveal>
          <p class="lp-eyebrow lp-eyebrow--dark"><span aria-hidden="true"><ShieldCheck :size="18" /></span>{{ t('landing.security.eyebrow') }}</p>
          <h2 id="security-title" class="lp-h2">{{ t('landing.security.title') }}</h2>
          <p class="lp-sub">{{ t('landing.security.body') }}</p>
          <RouterLink class="lp-btn lp-btn--primary" to="/signin">{{ t('landing.security.cta') }} <ArrowRight class="lp-arrow" :size="18" aria-hidden="true" /></RouterLink>
        </div>
        <ul class="lp-sec__grid">
          <li v-for="s in security" :key="s.title" data-reveal>
            <span class="lp-sec__ic" aria-hidden="true"><component :is="s.icon" :size="20" /></span>
            <b>{{ s.title }}</b>
            <span>{{ s.body }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- closing call to action -->
    <section id="contact" class="lp-final" aria-labelledby="final-title">
      <div class="lp-wrap">
        <div class="lp-final__card" data-reveal>
          <h2 id="final-title" class="lp-h2">{{ t('landing.final.title') }}</h2>
          <p class="lp-sub">{{ t('landing.final.body') }}</p>
          <div class="lp-ctas">
            <RouterLink class="lp-btn lp-btn--light" to="/signin">{{ t('landing.final.primary') }} <ArrowRight class="lp-arrow" :size="18" aria-hidden="true" /></RouterLink>
            <a class="lp-btn lp-btn--glass" href="https://xentraerp.net">{{ t('landing.final.secondary') }}</a>
          </div>
          <p class="lp-final__contact">{{ t('landing.contact.body') }} <a href="https://xentraerp.net">xentraerp.net</a></p>
        </div>
      </div>
    </section>

    <footer class="lp-foot">
      <div class="lp-foot__in lp-wrap">
        <span class="lp-brand lp-brand--sm"><img :src="brandMark" alt="" width="24" height="24" /><span class="lp-brand__word">Xentra<b>ERP</b></span></span>
        <span>© {{ year }} XentraERP · {{ t('landing.footer.rights') }}</span>
      </div>
    </footer>

    <RouterLink class="lp-sticky" :class="{ 'is-hidden': !pastHero }" to="/signin" :tabindex="pastHero ? undefined : -1" :aria-hidden="pastHero ? undefined : true">{{ t('auth.signIn') }}</RouterLink>
  </div>
</template>

<style scoped>
/* One scale for the whole page: 24px between components, 48px inside a section, 96px between
   major sections; 24px radius for cards and panels, 12px for controls; three type sizes. */
.lp {
  --s1: 24px; --s2: 48px; --s3: 96px;
  --r: 24px; --r-sm: 12px;
  --h1: clamp(40px, 4.4vw, 60px); --h2: clamp(30px, 3vw, 42px); --h3: 20px;
  --lead: clamp(17px, 1.3vw, 19px); --body: 17px; --small: 14px;
  --measure: 62ch;
  min-height: 100dvh; background: var(--x-bg); color: var(--x-text); font-family: var(--x-font-sans); overflow-x: clip; scroll-behavior: smooth;
}
.lp :is(h1, h2, h3) { text-wrap: balance; overflow-wrap: normal; hyphens: manual; }
.lp p { text-wrap: pretty; }
.lp-wrap { max-width: 1240px; margin-inline: auto; padding-inline: clamp(16px, 4vw, 48px); }
.lp-stack { display: flex; flex-direction: column; gap: var(--s2); }
.lp-skip { position: absolute; inset-inline-start: -9999px; }
.lp-skip:focus { inset-inline-start: 16px; top: 16px; z-index: 300; background: var(--x-surface); padding: 8px 12px; border-radius: 8px; }

/* buttons & links */
.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 24px; border-radius: var(--r-sm); font-weight: 600; font-size: 16px; text-decoration: none; white-space: nowrap; transition: transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration), background var(--x-duration); }
.lp-btn:hover { transform: translateY(-1px); }
.lp-btn:active { transform: scale(0.98); }
.lp-btn--sm { min-height: 40px; padding: 0 16px; font-size: 14px; }
.lp-btn--primary { background: var(--x-primary); color: #fff; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), var(--x-shadow-brand); }
.lp-btn--primary:hover { background: var(--x-primary-hover); }
.lp-btn--dark { background: var(--x-brand-navy); color: #fff; }
:root[data-theme='dark'] .lp-btn--dark { background: #fff; color: #0f172a; }
.lp-btn--ghost { background: var(--x-surface); color: var(--x-text); border: 1px solid var(--x-border); box-shadow: var(--x-shadow-xs); }
.lp-btn--ghost:hover { border-color: var(--x-border-strong); }
.lp-btn--light { background: #fff; color: #0f172a; box-shadow: 0 10px 24px -12px rgba(0, 0, 0, 0.5); }
.lp-btn--glass { background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255, 255, 255, 0.28); }
.lp-link { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 16px; color: var(--x-primary-text); text-decoration: none; }
.lp-link:hover { text-decoration: underline; text-underline-offset: 4px; }
.lp-arrow { transition: transform var(--x-duration) var(--x-ease); flex: none; }
:is(.lp-btn, .lp-link):hover .lp-arrow { transform: translateX(3px); }
[dir='rtl'] .lp-arrow { transform: scaleX(-1); }
[dir='rtl'] :is(.lp-btn, .lp-link):hover .lp-arrow { transform: scaleX(-1) translateX(3px); }
.lp-ctas { display: flex; flex-wrap: wrap; gap: 12px; }

/* nav */
.lp-nav { position: sticky; top: 0; z-index: 200; border-block-end: 1px solid transparent; transition: background var(--x-duration), border-color var(--x-duration); }
.lp-nav.is-scrolled { background: var(--x-surface-glass); backdrop-filter: saturate(1.6) blur(14px); -webkit-backdrop-filter: saturate(1.6) blur(14px); border-color: var(--x-border); }
.lp-nav__in { max-width: 1240px; margin: 0 auto; display: flex; align-items: center; gap: var(--s1); min-height: 72px; padding: 0 clamp(16px, 4vw, 48px); }
.lp-brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: var(--x-text); flex: none; }
.lp-brand img { border-radius: 10px; }
.lp-brand__word { font-family: var(--x-font-display); font-weight: 800; font-size: 20px; letter-spacing: -0.02em; }
.lp-brand__word b { color: var(--x-primary); }
.lp-brand__tag { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; color: var(--x-accent-text); background: var(--x-accent-soft); border-radius: 6px; padding: 3px 7px; }
.lp-brand--sm .lp-brand__word { font-size: 16px; }
.lp-nav__links { display: flex; gap: 4px; flex: 1; justify-content: center; }
.lp-nav__links a { color: var(--x-text-muted); text-decoration: none; font-size: 15px; font-weight: 500; padding: 8px 12px; border-radius: 10px; white-space: nowrap; transition: color var(--x-duration), background var(--x-duration); }
.lp-nav__links a:hover { color: var(--x-text); background: var(--x-surface-3); }
.lp-nav__end { display: flex; align-items: center; gap: 12px; margin-inline-start: auto; }

/* hero */
.lp-hero { position: relative; isolation: isolate; }
.lp-hero__bg { position: absolute; inset: -72px 0 0; z-index: -1; pointer-events: none; overflow: hidden;
  background:
    radial-gradient(48% 60% at 85% 18%, color-mix(in srgb, var(--x-primary) 9%, transparent), transparent 70%),
    radial-gradient(40% 50% at 8% 4%, color-mix(in srgb, var(--x-brand-teal) 7%, transparent), transparent 70%);
}
/* the grid is a faint texture only, fading out well before the content ends */
.lp-hero__bg::before { content: ''; position: absolute; inset: 0; opacity: 0.22;
  background-image: linear-gradient(var(--x-border) 1px, transparent 1px), linear-gradient(90deg, var(--x-border) 1px, transparent 1px);
  background-size: 64px 64px; mask-image: radial-gradient(70% 60% at 40% 0%, #000 20%, transparent 70%); -webkit-mask-image: radial-gradient(70% 60% at 40% 0%, #000 20%, transparent 70%); }
.lp-hero__in { display: grid; grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr); gap: clamp(40px, 5vw, 72px); align-items: center; padding-block: clamp(48px, 7vw, 96px) var(--s3); }
.lp-hero__story { display: flex; flex-direction: column; gap: var(--s1); min-width: 0; }
.lp-badge { align-self: flex-start; display: inline-flex; align-items: center; gap: 10px; margin: 0; padding: 6px 14px 6px 6px; border-radius: 999px; background: var(--x-surface); border: 1px solid var(--x-border); box-shadow: var(--x-shadow-xs); font-size: var(--small); font-weight: 600; }
.lp-badge span { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--x-brand-gradient); color: #fff; }
.lp-hero__title { margin: 0; font-family: var(--x-font-display); font-weight: 800; font-size: var(--h1); line-height: 1.08; letter-spacing: -0.03em; max-width: 22ch; color: var(--x-text); }
.lp-hero__lead { margin: 0; font-size: var(--lead); line-height: 1.6; color: var(--x-text-muted); max-width: 56ch; }
.lp-trust { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 12px 24px; }
.lp-trust li { display: inline-flex; align-items: center; gap: 8px; font-size: var(--small); font-weight: 500; color: var(--x-text-muted); white-space: nowrap; }
.lp-trust li svg { color: var(--x-success); }
.lp-hero__media { position: relative; margin: 0; min-width: 0; }

/* section headings */
.lp-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; max-width: 760px; margin-inline: auto; }
.lp-eyebrow { display: inline-flex; align-items: center; gap: 12px; margin: 0; font-size: 15px; font-weight: 700; color: var(--x-text); }
.lp-eyebrow > span { width: 40px; height: 40px; border-radius: var(--r-sm); flex: none; }
.lp-eyebrow--plain { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--x-primary-text); }
.lp-h2 { margin: 0; font-family: var(--x-font-display); font-weight: 800; font-size: var(--h2); line-height: 1.12; letter-spacing: -0.025em; color: var(--x-text); max-width: 22ch; }
.lp-sub { margin: 0; font-size: var(--lead); line-height: 1.65; color: var(--x-text-muted); max-width: var(--measure); }
.lp-note { margin: 0; text-align: center; font-size: 13px; color: var(--x-text-faint); }
[data-reveal] { opacity: 0; transform: translateY(16px); transition: opacity 600ms var(--x-ease), transform 600ms var(--x-ease); }
[data-reveal].is-in { opacity: 1; transform: none; }

/* capability sections: copy beside a product visual, alternating sides */
.lp-cap { padding-block: var(--s3); }
.lp-cap--first { border-block-start: 1px solid var(--x-border); background: var(--x-surface); }
.lp-cap--tint { background: var(--x-bg); }
.lp-cap:not(.lp-cap--tint):not(.lp-cap--first) { background: var(--x-surface); }
.lp-cap__in { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: clamp(32px, 5vw, 80px); align-items: center; }
.lp-cap--flip .lp-cap__in { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); }
.lp-cap--flip .lp-cap__copy { order: 2; }
.lp-cap__copy { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1); min-width: 0; }
.lp-cap__copy .lp-sub { font-size: var(--body); }
.lp-checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.lp-checks li { display: flex; align-items: flex-start; gap: 12px; font-size: 16px; font-weight: 500; line-height: 1.5; }
.lp-checks svg { color: var(--x-success); flex: none; margin-top: 2px; }
.lp-stage { position: relative; min-width: 0; padding: clamp(12px, 2vw, 28px); border-radius: calc(var(--r) + 8px);
  background: linear-gradient(150deg, var(--stage-a), var(--stage-b)); border: 1px solid color-mix(in srgb, var(--stage-b) 60%, var(--x-border)); }
.lp-stage--amber { --stage-a: #fffbeb; --stage-b: #fde9c4; }
.lp-stage--sky { --stage-a: #f0f9ff; --stage-b: #d6ecfb; }
.lp-stage--emerald { --stage-a: #ecfdf5; --stage-b: #cdf3e2; }
.lp-stage--rose { --stage-a: #fff1f2; --stage-b: #fbd9de; }
.lp-stage--violet { --stage-a: #f5f3ff; --stage-b: #e2dcfd; }
:root[data-theme='dark'] .lp-stage { --stage-a: #111a2e; --stage-b: #17233d; }
/* a real screen in a light browser frame */
.lp-shot { border-radius: 14px; overflow: hidden; background: var(--x-surface); border: 1px solid var(--x-border); box-shadow: 0 2px 4px rgba(15, 23, 42, 0.05), 0 32px 64px -28px rgba(15, 23, 42, 0.4); }
.lp-shot__bar { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; background: var(--x-surface-2, var(--x-bg)); border-bottom: 1px solid var(--x-border); }
.lp-shot__bar i { width: 9px; height: 9px; border-radius: 50%; background: var(--x-surface-3); }
.lp-shot__bar span { margin-inline: auto; padding: 2px 14px; border-radius: 6px; background: var(--x-surface-3); font-size: 11px; color: var(--x-text-muted); }
.lp-shot img { display: block; width: 100%; height: auto; }

/* cards: one treatment for KPI and feature cards */
.lp-card { border-radius: var(--r); background: var(--x-surface); border: 1px solid color-mix(in srgb, var(--x-border) 70%, transparent);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px -16px rgba(15, 23, 42, 0.14);
  transition: transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration), opacity 600ms var(--x-ease); }
.lp-card:hover { transform: translateY(-4px); box-shadow: 0 2px 4px rgba(15, 23, 42, 0.04), 0 24px 48px -20px rgba(15, 23, 42, 0.24); }
.lp-icon { width: 44px; height: 44px; border-radius: var(--r-sm); flex: none; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6); }
.lp-icon--lg { width: 52px; height: 52px; border-radius: 14px; }

/* KPIs */
.lp-kpis { padding-block: var(--s3); background: var(--x-surface); border-block-start: 1px solid var(--x-border); }
.lp-kpi-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s1); }
.lp-kpi { padding: var(--s1); display: flex; flex-direction: column; gap: 16px; background: var(--x-bg); }
.lp-kpi__top { display: flex; align-items: center; gap: 12px; }
.lp-kpi__label { font-size: 15px; font-weight: 600; color: var(--x-text-muted); }
.lp-kpi__value { display: flex; align-items: baseline; gap: 6px; font-family: var(--x-font-display); font-size: clamp(26px, 2.2vw, 32px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; white-space: nowrap; }
.lp-kpi__value small { font-size: 0.5em; font-weight: 700; color: var(--x-text-muted); letter-spacing: 0; }
.lp-kpi__spark { width: 100%; height: 48px; display: block; }
.lp-kpi__spark .line { fill: none; stroke: var(--sp); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.lp-kpi__spark .area { fill: var(--sp); opacity: 0.1; }
.lp-kpi__spark.is-sky { --sp: #0284c7; } .lp-kpi__spark.is-emerald { --sp: #059669; } .lp-kpi__spark.is-amber { --sp: #d97706; } .lp-kpi__spark.is-violet { --sp: #7c3aed; }
.lp-kpi__note { font-size: var(--small); line-height: 1.5; color: var(--x-text-muted); }

/* made for */
.lp-for { padding-block: var(--s3); background: var(--x-bg); }
.lp-for__grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s1); }
.lp-for__card { padding: 32px; display: flex; flex-direction: column; gap: 14px; }
.lp-for__card h3 { margin: 6px 0 0; font-family: var(--x-font-display); font-size: var(--h3); font-weight: 700; }
.lp-for__card p { margin: 0; color: var(--x-text-muted); font-size: 16px; line-height: 1.6; }

/* features */
.lp-features { padding-block: var(--s3); background: var(--x-surface); border-block: 1px solid var(--x-border); }
.lp-fgrid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s1); }
.lp-fcard { padding: 32px; display: flex; flex-direction: column; gap: 16px; background: #fff; }
:root[data-theme='dark'] .lp-fcard { background: var(--x-surface-2); }
.lp-fcard h3 { margin: 8px 0 0; font-family: var(--x-font-display); font-size: var(--h3); font-weight: 700; letter-spacing: -0.01em; line-height: 1.3; }
.lp-fcard p { margin: 0; color: var(--x-text-muted); font-size: 16px; line-height: 1.6; max-width: var(--measure); }

/* security */
.lp-sec { background: radial-gradient(70% 60% at 85% 20%, rgba(37, 99, 235, 0.28), transparent 60%), #0b1120; color: #e2e8f0; }
.lp-sec__in { padding-block: var(--s3); display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: clamp(32px, 5vw, 80px); align-items: center; }
.lp-sec__copy { display: flex; flex-direction: column; gap: var(--s1); align-items: flex-start; }
.lp-sec .lp-h2 { color: #fff; }
.lp-sec .lp-sub { color: #94a3b8; font-size: var(--body); }
.lp-eyebrow--dark { color: #bfdbfe; }
.lp-eyebrow--dark > span { display: grid; place-items: center; background: rgba(147, 197, 253, 0.12); color: #93c5fd; }
.lp-sec__grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: var(--s1); }
.lp-sec__grid li { display: flex; flex-direction: column; gap: 8px; padding: var(--s1); border-radius: var(--r); background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); transition: background var(--x-duration), border-color var(--x-duration), transform var(--x-duration) var(--x-ease), opacity 600ms var(--x-ease); }
.lp-sec__grid li:hover { background: rgba(255, 255, 255, 0.07); border-color: rgba(147, 197, 253, 0.3); transform: translateY(-4px); }
.lp-sec__grid b { color: #fff; font-size: 17px; }
.lp-sec__grid span:last-child { color: #94a3b8; font-size: 15px; line-height: 1.55; }
.lp-sec__ic { width: 44px; height: 44px; border-radius: var(--r-sm); display: grid; place-items: center; background: linear-gradient(135deg, rgba(37, 99, 235, 0.35), rgba(20, 184, 166, 0.3)); color: #bfdbfe; margin-bottom: 8px; }

/* closing call to action */
.lp-final { padding-block: var(--s3); background: var(--x-bg); }
.lp-final__card { padding: clamp(40px, 6vw, 72px) var(--s1); border-radius: var(--r); text-align: center; display: flex; flex-direction: column; align-items: center; gap: var(--s1); color: #fff;
  background: radial-gradient(60% 80% at 100% 0%, rgba(20, 184, 166, 0.35), transparent 60%), linear-gradient(120deg, #0f172a 10%, #1e3a8a 70%, #1d4ed8); box-shadow: 0 32px 64px -32px rgba(30, 58, 138, 0.6); }
.lp-final .lp-h2 { color: #fff; }
.lp-final .lp-sub { color: rgba(226, 232, 240, 0.85); }
.lp-final .lp-ctas { justify-content: center; }
.lp-final__contact { margin: 0; font-size: var(--small); color: rgba(226, 232, 240, 0.7); max-width: var(--measure); }
.lp-final__contact a { color: #fff; font-weight: 600; }

.lp-foot { background: var(--x-surface); border-block-start: 1px solid var(--x-border); }
.lp-foot__in { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px var(--s1); padding-block: var(--s1); font-size: 13.5px; color: var(--x-text-muted); }
.lp-sticky { display: none; }
.lp-sticky { transition: opacity var(--x-duration), transform var(--x-duration) var(--x-ease); }
.lp-sticky.is-hidden { opacity: 0; transform: translateY(16px); pointer-events: none; }

@media (max-width: 1179px) {
  .lp-nav__links { display: none; }
  .lp-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 1023px) {
  .lp { --s3: 72px; }
  .lp-hero__in { grid-template-columns: 1fr; min-height: 0; max-height: none; padding-block: var(--s1) var(--s2); }
  .lp-hero__media { max-width: 640px; width: 100%; margin-inline: auto; }
  .lp-cap__in, .lp-sec__in { grid-template-columns: 1fr; }
  .lp-cap--flip .lp-cap__in { grid-template-columns: 1fr; }
  .lp-cap--flip .lp-cap__copy { order: 0; }
  .lp-fgrid { grid-template-columns: 1fr 1fr; }
  .lp-sticky { display: flex; position: fixed; inset-inline: 16px; inset-block-end: max(16px, env(safe-area-inset-bottom)); z-index: var(--x-z-sticky); justify-content: center; align-items: center; min-height: 54px; border-radius: var(--x-radius-full); background: var(--x-primary); color: #fff; font-weight: 700; text-decoration: none; box-shadow: var(--x-shadow-brand); }
}
@media (max-width: 767px) {
  .lp { --s2: 32px; --s3: 64px; }
  .lp-nav__in { gap: 12px; min-height: 64px; }
  .lp-nav__end .lp-btn { display: none; }
  .lp-brand__word { font-size: 18px; }
  .lp-kpi-grid, .lp-fgrid, .lp-sec__grid, .lp-for__grid { grid-template-columns: 1fr; }
  .lp-ctas .lp-btn { flex: 1 1 100%; }
  .lp-foot__in { justify-content: center; text-align: center; padding-bottom: 96px; }
}
</style>
