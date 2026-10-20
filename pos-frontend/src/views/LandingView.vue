<script setup lang="ts">
// Public landing page at "/" (pos.xentraerp.net — the POS front of the XentraERP platform).
// Marketing only: every "Sign in" leads to the separate sign-in page (/signin, SignInView).
// Order: hero (headline, calls to action, credibility cards, the product ecosystem around the
// XentraERP hub — HeroProduct), who chooses it, a product story (five sections alternating
// visual left / right, each a real screen in a device mockup or a drawn panel, with a glass
// "insight" card), the XentraERP platform the POS belongs to, the operating pillars (scale,
// control, visibility, automation, security, analytics), security and a closing call to action.
// No stock photography. Spacing follows one scale: 24px between components, 48px inside
// sections, 96px between major sections.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Activity, ArrowRight, Boxes, Building2, ChartColumn, ChartLine, ChefHat, CircleCheck, Cloud, Coffee, Eye, Factory,
  Fingerprint, FolderKanban, Gauge, Handshake, KeyRound, Landmark, Layers, MonitorSmartphone, Network, Receipt,
  ShieldCheck, ShoppingBag, ShoppingCart, Soup, Sparkles, Store, Timer, Truck, Users, UtensilsCrossed, Workflow,
} from 'lucide-vue-next'
import brandMark from '@/assets/brand-mark.png'
import LocaleSwitch from '@/components/shell/LocaleSwitch.vue'
import DeviceFrame from '@/components/landing/DeviceFrame.vue'
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
  { id: 'platform', label: t('landing.nav.platform') },
])

// credibility cards under the hero buttons
const metrics = computed(() =>
  [
    { id: 'tx', icon: Receipt },
    { id: 'registers', icon: MonitorSmartphone },
    { id: 'branches', icon: Building2 },
    { id: 'inventory', icon: Boxes },
    { id: 'cloud', icon: Cloud },
    { id: 'security', icon: ShieldCheck },
  ].map((m) => ({ ...m, value: t(`landing.metrics.${m.id}.value`), label: t(`landing.metrics.${m.id}.label`) })),
)

const why = computed(() =>
  [
    { id: 'restaurants', icon: UtensilsCrossed, tone: 'amber' },
    { id: 'retail', icon: Store, tone: 'sky' },
    { id: 'groups', icon: Network, tone: 'violet' },
    { id: 'franchises', icon: Handshake, tone: 'emerald' },
    { id: 'cafes', icon: Coffee, tone: 'rose' },
    { id: 'foodcourts', icon: Soup, tone: 'orange' },
  ].map((w) => ({ ...w, title: t(`landing.why.${w.id}.title`), body: t(`landing.why.${w.id}.body`) })),
)

// Product story, visual left first, then alternating. Each visual is a real screen (shot) in a
// device frame or a drawn panel, with one glass insight card (illustrative sample data).
type Story = {
  id: string; key: string; icon: typeof UtensilsCrossed; tone: string; alt: string
  frame: 'laptop' | 'tablet' | 'browser' | 'bare'; shot?: string; panel?: 'inventory' | 'branches'
  insight: { icon: typeof UtensilsCrossed; title: string; sub: string }
}
const stories = computed<Story[]>(() => [
  { id: 'restaurant', key: 'fnb', icon: UtensilsCrossed, tone: 'amber', frame: 'tablet', shot: 'restaurant-order', alt: t('landing.shot.order'),
    insight: { icon: ChefHat, title: 'Kitchen ticket sent', sub: 'Table A4 · 3 dishes · 12s ago' } },
  { id: 'retail', key: 'retail', icon: ShoppingBag, tone: 'sky', frame: 'browser', shot: 'retail-checkout', alt: t('landing.shot.retail'),
    insight: { icon: CircleCheck, title: 'Paid · BHD 15.700', sub: 'Card 10.000 + Cash 5.700' } },
  { id: 'analytics', key: 'analytics', icon: ChartColumn, tone: 'emerald', frame: 'laptop', shot: 'management-dashboard', alt: t('landing.shot.dashboard'),
    insight: { icon: Gauge, title: 'Shift closed · variance 0.000', sub: 'Expected = counted, per currency' } },
  { id: 'inventory', key: 'inventory', icon: Boxes, tone: 'rose', frame: 'bare', panel: 'inventory', alt: t('landing.shot.inventory'),
    insight: { icon: Truck, title: 'Reorder suggested', sub: '3 items below reorder level' } },
  { id: 'branches', key: 'branches', icon: Building2, tone: 'violet', frame: 'bare', panel: 'branches', alt: t('landing.shot.branches'),
    insight: { icon: Activity, title: '10 registers live', sub: '4 locations · one group report' } },
])

// the XentraERP modules the POS posts into, around it
const modules = computed(() => [
  { icon: Landmark, label: t('landing.platform.m.accounting') },
  { icon: Boxes, label: t('landing.platform.m.inventory') },
  { icon: ShoppingCart, label: t('landing.platform.m.buying') },
  { icon: Handshake, label: t('landing.platform.m.selling') },
  { icon: Users, label: t('landing.platform.m.hr') },
  { icon: Factory, label: t('landing.platform.m.manufacturing') },
  { icon: FolderKanban, label: t('landing.platform.m.projects') },
  { icon: ChartLine, label: t('landing.platform.m.reports') },
])

const pillars = computed(() =>
  [
    { id: 'scale', icon: Layers, tone: 'sky' },
    { id: 'control', icon: Users, tone: 'violet' },
    { id: 'visibility', icon: Eye, tone: 'emerald' },
    { id: 'automation', icon: Workflow, tone: 'amber' },
    { id: 'security', icon: ShieldCheck, tone: 'rose' },
    { id: 'analytics', icon: ChartColumn, tone: 'teal' },
  ].map((p) => ({ ...p, title: t(`landing.pillars.${p.id}.title`), body: t(`landing.pillars.${p.id}.body`) })),
)
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

    <!-- hero: headline, calls to action and credibility cards beside the product ecosystem -->
    <main id="top" class="lp-hero">
      <div class="lp-hero__bg" aria-hidden="true" />
      <div class="lp-hero__in lp-wrap">
        <div class="lp-hero__story">
          <p class="lp-badge x-enter"><span><Sparkles :size="14" /></span>{{ t('landing.badge') }}</p>
          <h1 class="lp-hero__title x-enter">{{ t('landing.headline') }}</h1>
          <p class="lp-hero__lead x-enter">{{ t('landing.lead') }}</p>
          <div class="lp-ctas x-enter">
            <RouterLink class="lp-btn lp-btn--primary" to="/signin">{{ t('landing.cta.primary') }} <ArrowRight class="lp-arrow" :size="18" aria-hidden="true" /></RouterLink>
            <a class="lp-btn lp-btn--ghost" href="#platform">{{ t('landing.cta.secondary') }}</a>
          </div>
        </div>
        <HeroProduct class="lp-hero__media x-enter" />
      </div>

      <div class="lp-wrap">
        <ul class="lp-metrics x-enter" :aria-label="t('landing.metrics.label')">
          <li v-for="m in metrics" :key="m.id" class="lp-metric">
            <span class="lp-metric__ic" aria-hidden="true"><component :is="m.icon" :size="18" :stroke-width="2" /></span>
            <b>{{ m.value }}</b>
            <span>{{ m.label }}</span>
          </li>
        </ul>
      </div>
    </main>

    <!-- who chooses it -->
    <section id="why" class="lp-why" aria-labelledby="why-title">
      <div class="lp-wrap lp-stack">
        <div class="lp-head" data-reveal>
          <p class="lp-eyebrow lp-eyebrow--plain">{{ t('landing.why.eyebrow') }}</p>
          <h2 id="why-title" class="lp-h2">{{ t('landing.why.title') }}</h2>
          <p class="lp-sub">{{ t('landing.why.body') }}</p>
        </div>
        <ul class="lp-why__grid">
          <li v-for="w in why" :key="w.id" class="lp-card lp-why__card" data-reveal>
            <span class="lp-icon lp-icon--lg x-art" :class="`x-art--${w.tone}`" aria-hidden="true"><component :is="w.icon" :size="24" :stroke-width="1.8" /></span>
            <div>
              <h3>{{ w.title }}</h3>
              <p>{{ w.body }}</p>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <!-- product story, visual left first, alternating -->
    <section
      v-for="(s, i) in stories"
      :id="s.id"
      :key="s.id"
      class="lp-story"
      :class="{ 'lp-story--flip': i % 2 === 1, 'lp-story--tint': i % 2 === 1 }"
      :aria-labelledby="`${s.id}-title`"
    >
      <div class="lp-story__in lp-wrap">
        <div class="lp-stage" :class="`lp-stage--${s.tone}`" data-reveal>
          <DeviceFrame :kind="s.frame">
            <ProductPanel v-if="s.panel" :kind="s.panel" :label="s.alt" />
            <img
              v-else
              :src="`/img/product/${s.shot}.webp`"
              :srcset="`/img/product/${s.shot}-sm.webp 800w, /img/product/${s.shot}.webp 1600w`"
              sizes="(max-width: 1023px) 92vw, 680px"
              :alt="s.alt"
              width="1600"
              height="1000"
              loading="lazy"
              decoding="async"
            />
            <template #insight>
              <span class="lp-insight">
                <span class="lp-insight__ic x-art" :class="`x-art--${s.tone}`"><component :is="s.insight.icon" :size="18" :stroke-width="2" /></span>
                <span><b>{{ s.insight.title }}</b><small>{{ s.insight.sub }}</small></span>
              </span>
            </template>
          </DeviceFrame>
        </div>
        <div class="lp-story__copy" data-reveal>
          <p class="lp-eyebrow"><span class="x-art" :class="`x-art--${s.tone}`" aria-hidden="true"><component :is="s.icon" :size="18" :stroke-width="1.8" /></span>{{ t(`landing.${s.key}.eyebrow`) }}<em class="lp-pillar">{{ t(`landing.${s.key}.pillar`) }}</em></p>
          <h2 :id="`${s.id}-title`" class="lp-h2">{{ t(`landing.${s.key}.title`) }}</h2>
          <p class="lp-sub">{{ t(`landing.${s.key}.body`) }}</p>
          <ul class="lp-checks">
            <li v-for="b in ['b1', 'b2', 'b3']" :key="b"><CircleCheck :size="20" aria-hidden="true" />{{ t(`landing.${s.key}.${b}`) }}</li>
          </ul>
          <RouterLink class="lp-link" to="/signin">{{ t(`landing.${s.key}.cta`) }} <ArrowRight class="lp-arrow" :size="17" aria-hidden="true" /></RouterLink>
        </div>
      </div>
    </section>

    <!-- the XentraERP platform the POS belongs to -->
    <section id="platform" class="lp-platform" aria-labelledby="platform-title">
      <div class="lp-wrap lp-platform__in">
        <div class="lp-platform__copy" data-reveal>
          <p class="lp-eyebrow lp-eyebrow--dark"><span aria-hidden="true"><Layers :size="18" /></span>{{ t('landing.platform.eyebrow') }}</p>
          <h2 id="platform-title" class="lp-h2">{{ t('landing.platform.title') }}</h2>
          <p class="lp-sub">{{ t('landing.platform.body') }}</p>
          <ul class="lp-checks lp-checks--dark">
            <li v-for="b in ['b1', 'b2', 'b3']" :key="b"><CircleCheck :size="20" aria-hidden="true" />{{ t(`landing.platform.${b}`) }}</li>
          </ul>
          <a class="lp-btn lp-btn--light" href="https://xentraerp.net">{{ t('landing.platform.cta') }} <ArrowRight class="lp-arrow" :size="18" aria-hidden="true" /></a>
        </div>
        <div class="lp-eco" data-reveal>
          <div class="lp-eco__core">
            <img :src="brandMark" alt="" width="44" height="44" />
            <b>XentraERP</b>
            <span>POS</span>
          </div>
          <ul class="lp-eco__mods" :aria-label="t('landing.platform.modulesLabel')">
            <li v-for="m in modules" :key="m.label"><component :is="m.icon" :size="18" aria-hidden="true" />{{ m.label }}</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- operating pillars -->
    <section id="pillars" class="lp-pillars" aria-labelledby="pillars-title">
      <div class="lp-wrap lp-stack">
        <div class="lp-head" data-reveal>
          <p class="lp-eyebrow lp-eyebrow--plain">{{ t('landing.pillars.eyebrow') }}</p>
          <h2 id="pillars-title" class="lp-h2">{{ t('landing.pillars.title') }}</h2>
          <p class="lp-sub">{{ t('landing.pillars.body') }}</p>
        </div>
        <ul class="lp-pgrid">
          <li v-for="p in pillars" :key="p.id" class="lp-pcard" data-reveal>
            <span class="lp-icon lp-icon--lg x-art" :class="`x-art--${p.tone}`" aria-hidden="true"><component :is="p.icon" :size="22" :stroke-width="1.8" /></span>
            <h3>{{ p.title }}</h3>
            <p>{{ p.body }}</p>
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
        <span>{{ t('landing.footer.platform') }} <a href="https://xentraerp.net">xentraerp.net</a></span>
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
  --s1: 24px; --s2: 48px; --s3: 112px;
  --r: 24px; --r-sm: 12px;
  --h1: clamp(40px, 4.4vw, 60px); --h2: clamp(30px, 3vw, 44px); --h3: 19px;
  --lead: clamp(17px, 1.3vw, 19px); --body: 17px; --small: 14px;
  --measure: 62ch;
  --lift: 0 1px 2px rgba(15, 23, 42, 0.04), 0 16px 40px -20px rgba(15, 23, 42, 0.18);
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
.lp-hero { position: relative; isolation: isolate; padding-block-end: var(--s2); }
.lp-hero__bg { position: absolute; inset: -72px 0 0; z-index: -1; pointer-events: none; overflow: hidden;
  background:
    radial-gradient(50% 60% at 78% 22%, color-mix(in srgb, var(--x-primary) 12%, transparent), transparent 70%),
    radial-gradient(40% 50% at 6% 2%, color-mix(in srgb, var(--x-brand-teal) 9%, transparent), transparent 70%),
    linear-gradient(to bottom, transparent 70%, var(--x-surface));
}
/* the grid is a faint texture only, fading out well before the content ends */
.lp-hero__bg::before { content: ''; position: absolute; inset: 0; opacity: 0.22;
  background-image: linear-gradient(var(--x-border) 1px, transparent 1px), linear-gradient(90deg, var(--x-border) 1px, transparent 1px);
  background-size: 64px 64px; mask-image: radial-gradient(70% 60% at 40% 0%, #000 20%, transparent 70%); -webkit-mask-image: radial-gradient(70% 60% at 40% 0%, #000 20%, transparent 70%); }
.lp-hero__in { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: clamp(32px, 4vw, 64px); align-items: center; padding-block: clamp(40px, 6vw, 80px) var(--s2); }
.lp-hero__story { display: flex; flex-direction: column; gap: var(--s1); min-width: 0; }
.lp-badge { align-self: flex-start; display: inline-flex; align-items: center; gap: 10px; margin: 0; padding: 6px 14px 6px 6px; border-radius: 999px; background: var(--x-surface); border: 1px solid var(--x-border); box-shadow: var(--x-shadow-xs); font-size: var(--small); font-weight: 600; }
.lp-badge span { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--x-brand-gradient); color: #fff; }
.lp-hero__title { margin: 0; font-family: var(--x-font-display); font-weight: 800; font-size: var(--h1); line-height: 1.06; letter-spacing: -0.035em; max-width: 20ch; color: var(--x-text); }
.lp-hero__lead { margin: 0; font-size: var(--lead); line-height: 1.6; color: var(--x-text-muted); max-width: 54ch; }
.lp-hero__media { position: relative; margin: 0; min-width: 0; }

/* credibility cards: one glass strip of six KPIs */
.lp-metrics { list-style: none; margin: 0; padding: 8px; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; border-radius: calc(var(--r) + 4px);
  background: color-mix(in srgb, var(--x-surface) 70%, transparent); backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid var(--x-border); box-shadow: var(--lift); }
.lp-metric { display: flex; flex-direction: column; gap: 4px; padding: 18px 20px; min-width: 0; }
.lp-metric + .lp-metric { border-inline-start: 1px solid var(--x-border); }
.lp-metric__ic { display: grid; place-items: center; width: 34px; height: 34px; margin-bottom: 8px; border-radius: 10px; color: #fff; background: var(--x-brand-gradient); box-shadow: 0 8px 16px -8px color-mix(in srgb, var(--x-primary) 70%, transparent); }
.lp-metric b { font-family: var(--x-font-display); font-size: clamp(19px, 1.6vw, 22px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; }
.lp-metric > span:last-child { font-size: 13.5px; font-weight: 500; color: var(--x-text-muted); line-height: 1.35; }

/* section headings */
.lp-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; max-width: 780px; margin-inline: auto; }
.lp-eyebrow { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 0; font-size: 15px; font-weight: 700; color: var(--x-text); }
.lp-eyebrow > span { width: 40px; height: 40px; border-radius: var(--r-sm); flex: none; }
.lp-eyebrow--plain { font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--x-primary-text); }
.lp-pillar { font-style: normal; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; color: var(--x-primary-text); background: color-mix(in srgb, var(--x-primary) 10%, transparent); border: 1px solid color-mix(in srgb, var(--x-primary) 20%, transparent); }
.lp-h2 { margin: 0; font-family: var(--x-font-display); font-weight: 800; font-size: var(--h2); line-height: 1.1; letter-spacing: -0.03em; color: var(--x-text); max-width: 22ch; }
.lp-sub { margin: 0; font-size: var(--lead); line-height: 1.65; color: var(--x-text-muted); max-width: var(--measure); }
[data-reveal] { opacity: 0; transform: translateY(16px); transition: opacity 600ms var(--x-ease), transform 600ms var(--x-ease); }
[data-reveal].is-in { opacity: 1; transform: none; }

/* cards */
.lp-card { border-radius: var(--r); background: var(--x-surface); border: 1px solid color-mix(in srgb, var(--x-border) 70%, transparent); box-shadow: var(--lift);
  transition: transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration), border-color var(--x-duration), opacity 600ms var(--x-ease); }
.lp-card:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--x-primary) 30%, var(--x-border)); box-shadow: 0 2px 4px rgba(15, 23, 42, 0.04), 0 28px 56px -24px rgba(15, 23, 42, 0.28); }
.lp-icon { width: 44px; height: 44px; border-radius: var(--r-sm); flex: none; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6); }
.lp-icon--lg { width: 52px; height: 52px; border-radius: 14px; }

/* who chooses it */
.lp-why { padding-block: var(--s3); background: var(--x-surface); border-block-start: 1px solid var(--x-border); }
.lp-why__grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s1); }
.lp-why__card { padding: 28px; display: flex; align-items: flex-start; gap: 18px; background: var(--x-bg); }
.lp-why__card h3 { margin: 4px 0 8px; font-family: var(--x-font-display); font-size: var(--h3); font-weight: 700; letter-spacing: -0.01em; }
.lp-why__card p { margin: 0; color: var(--x-text-muted); font-size: 15.5px; line-height: 1.6; }

/* product story: device visual beside copy, visual left first */
.lp-story { padding-block: calc(var(--s3) * 0.85); background: var(--x-surface); }
.lp-story--tint { background: var(--x-bg); }
.lp-story__in { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: clamp(40px, 6vw, 96px); align-items: center; }
.lp-story--flip .lp-story__in { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); }
.lp-story--flip .lp-stage { order: 2; }
.lp-story__copy { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1); min-width: 0; }
.lp-story__copy .lp-sub { font-size: var(--body); }
.lp-checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.lp-checks li { display: flex; align-items: flex-start; gap: 12px; font-size: 16px; font-weight: 500; line-height: 1.5; }
.lp-checks svg { color: var(--x-success); flex: none; margin-top: 2px; }
/* the stage: a soft gradient field with a faint grid, the device sits on it */
.lp-stage { position: relative; isolation: isolate; min-width: 0; padding: clamp(24px, 4vw, 56px) clamp(16px, 3.5vw, 48px) clamp(40px, 5vw, 64px); border-radius: calc(var(--r) + 8px);
  background: radial-gradient(80% 70% at 30% 20%, var(--stage-a), transparent), linear-gradient(150deg, var(--stage-a), var(--stage-b));
  border: 1px solid color-mix(in srgb, var(--stage-b) 60%, var(--x-border)); }
.lp-stage::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; opacity: 0.5;
  background-image: linear-gradient(color-mix(in srgb, var(--stage-c) 18%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--stage-c) 18%, transparent) 1px, transparent 1px);
  background-size: 32px 32px; mask-image: radial-gradient(70% 70% at 50% 40%, #000, transparent); -webkit-mask-image: radial-gradient(70% 70% at 50% 40%, #000, transparent); }
.lp-stage--amber { --stage-a: #fffbeb; --stage-b: #fde9c4; --stage-c: #d97706; }
.lp-stage--sky { --stage-a: #f0f9ff; --stage-b: #d6ecfb; --stage-c: #0284c7; }
.lp-stage--emerald { --stage-a: #ecfdf5; --stage-b: #cdf3e2; --stage-c: #059669; }
.lp-stage--rose { --stage-a: #fff1f2; --stage-b: #fbd9de; --stage-c: #e11d48; }
.lp-stage--violet { --stage-a: #f5f3ff; --stage-b: #e2dcfd; --stage-c: #7c3aed; }
:root[data-theme='dark'] .lp-stage { --stage-a: #111a2e; --stage-b: #17233d; }
.lp-insight { display: flex; align-items: center; gap: 12px; }
.lp-insight__ic { width: 38px; height: 38px; border-radius: 10px; flex: none; }
.lp-insight b { display: block; font-size: 14.5px; font-weight: 700; color: var(--x-text); white-space: nowrap; }
.lp-insight small { display: block; font-size: 12.5px; color: var(--x-text-muted); white-space: nowrap; }

/* platform: the POS inside XentraERP */
.lp-platform { position: relative; overflow: hidden; color: #e2e8f0;
  background: radial-gradient(50% 70% at 85% 30%, rgba(37, 99, 235, 0.35), transparent 65%), radial-gradient(40% 60% at 10% 100%, rgba(20, 184, 166, 0.22), transparent 60%), #0b1120; }
.lp-platform__in { padding-block: var(--s3); display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: clamp(40px, 6vw, 96px); align-items: center; }
.lp-platform__copy { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1); }
.lp-platform .lp-h2 { color: #fff; }
.lp-platform .lp-sub { color: #94a3b8; font-size: var(--body); }
.lp-checks--dark li { color: #e2e8f0; }
.lp-checks--dark svg { color: #5eead4; }
.lp-eco { position: relative; display: grid; place-items: center; aspect-ratio: 1 / 0.82; }
/* rings behind the hub */
.lp-eco::before, .lp-eco::after { content: ''; position: absolute; left: 50%; top: 50%; translate: -50% -50%; border-radius: 50%; border: 1px dashed rgba(148, 163, 184, 0.25); }
.lp-eco::before { width: 58%; aspect-ratio: 1; }
.lp-eco::after { width: 92%; aspect-ratio: 1; border-style: solid; border-color: rgba(148, 163, 184, 0.12); }
.lp-eco__core { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 26px 30px; border-radius: 28px; color: #fff;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04)); border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 0 0 10px rgba(37, 99, 235, 0.1), 0 30px 60px -24px rgba(37, 99, 235, 0.6); }
.lp-eco__core img { border-radius: 12px; }
.lp-eco__core b { font-family: var(--x-font-display); font-size: 20px; font-weight: 800; }
.lp-eco__core span { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; padding: 3px 9px; border-radius: 999px; background: var(--x-brand-gradient); }
/* modules placed on the outer ring */
.lp-eco__mods { list-style: none; margin: 0; padding: 0; position: absolute; inset: 0; }
.lp-eco__mods li { --a: calc(var(--i) * 45deg - 90deg); position: absolute; left: calc(50% + cos(var(--a)) * 42%); top: calc(50% + sin(var(--a)) * 46%); translate: -50% -50%;
  display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 999px; white-space: nowrap; font-size: 14px; font-weight: 600; color: #e2e8f0;
  background: rgba(15, 23, 42, 0.72); border: 1px solid rgba(148, 163, 184, 0.22); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 12px 24px -12px rgba(0, 0, 0, 0.6); }
.lp-eco__mods li svg { color: #93c5fd; }
.lp-eco__mods li:nth-child(1) { --i: 0; } .lp-eco__mods li:nth-child(2) { --i: 1; } .lp-eco__mods li:nth-child(3) { --i: 2; } .lp-eco__mods li:nth-child(4) { --i: 3; }
.lp-eco__mods li:nth-child(5) { --i: 4; } .lp-eco__mods li:nth-child(6) { --i: 5; } .lp-eco__mods li:nth-child(7) { --i: 6; } .lp-eco__mods li:nth-child(8) { --i: 7; }

/* pillars */
.lp-pillars { position: relative; padding-block: var(--s3); background:
  radial-gradient(40% 50% at 10% 10%, color-mix(in srgb, var(--x-primary) 8%, transparent), transparent 70%),
  radial-gradient(40% 50% at 90% 90%, color-mix(in srgb, var(--x-brand-teal) 8%, transparent), transparent 70%), var(--x-bg); }
.lp-pgrid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s1); }
.lp-pcard { position: relative; overflow: hidden; padding: 32px; display: flex; flex-direction: column; gap: 14px; border-radius: var(--r);
  background: color-mix(in srgb, var(--x-surface) 78%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--x-border) 80%, transparent); box-shadow: var(--lift);
  transition: transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration), opacity 600ms var(--x-ease); }
/* a gradient hairline along the top edge */
.lp-pcard::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: var(--x-brand-gradient); opacity: 0.85; }
.lp-pcard:hover { transform: translateY(-4px); box-shadow: 0 2px 4px rgba(15, 23, 42, 0.04), 0 28px 56px -24px rgba(15, 23, 42, 0.28); }
.lp-pcard h3 { margin: 8px 0 0; font-family: var(--x-font-display); font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.lp-pcard p { margin: 0; color: var(--x-text-muted); font-size: 16px; line-height: 1.6; }

/* security */
.lp-sec { background: radial-gradient(70% 60% at 85% 20%, rgba(37, 99, 235, 0.28), transparent 60%), #0b1120; color: #e2e8f0; border-block-start: 1px solid rgba(255, 255, 255, 0.06); }
.lp-sec__in { padding-block: var(--s3); display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: clamp(32px, 5vw, 80px); align-items: center; }
.lp-sec__copy { display: flex; flex-direction: column; gap: var(--s1); align-items: flex-start; }
.lp-sec .lp-h2 { color: #fff; }
.lp-sec .lp-sub { color: #94a3b8; font-size: var(--body); }
.lp-eyebrow--dark { color: #bfdbfe; }
.lp-eyebrow--dark > span { display: grid; place-items: center; background: rgba(147, 197, 253, 0.12); color: #93c5fd; }
.lp-sec__grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: var(--s1); }
.lp-sec__grid li { display: flex; flex-direction: column; gap: 8px; padding: var(--s1); border-radius: var(--r); background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); backdrop-filter: blur(8px); transition: background var(--x-duration), border-color var(--x-duration), transform var(--x-duration) var(--x-ease), opacity 600ms var(--x-ease); }
.lp-sec__grid li:hover { background: rgba(255, 255, 255, 0.07); border-color: rgba(147, 197, 253, 0.3); transform: translateY(-4px); }
.lp-sec__grid b { color: #fff; font-size: 17px; }
.lp-sec__grid span:last-child { color: #94a3b8; font-size: 15px; line-height: 1.55; }
.lp-sec__ic { width: 44px; height: 44px; border-radius: var(--r-sm); display: grid; place-items: center; background: linear-gradient(135deg, rgba(37, 99, 235, 0.35), rgba(20, 184, 166, 0.3)); color: #bfdbfe; margin-bottom: 8px; }

/* closing call to action */
.lp-final { padding-block: var(--s3); background: var(--x-bg); }
.lp-final__card { padding: clamp(40px, 6vw, 80px) var(--s1); border-radius: var(--r); text-align: center; display: flex; flex-direction: column; align-items: center; gap: var(--s1); color: #fff;
  background: radial-gradient(60% 80% at 100% 0%, rgba(20, 184, 166, 0.35), transparent 60%), linear-gradient(120deg, #0f172a 10%, #1e3a8a 70%, #1d4ed8); box-shadow: 0 32px 64px -32px rgba(30, 58, 138, 0.6); }
.lp-final .lp-h2 { color: #fff; }
.lp-final .lp-sub { color: rgba(226, 232, 240, 0.85); }
.lp-final .lp-ctas { justify-content: center; }
.lp-final__contact { margin: 0; font-size: var(--small); color: rgba(226, 232, 240, 0.7); max-width: var(--measure); }
.lp-final__contact a { color: #fff; font-weight: 600; }

.lp-foot { background: var(--x-surface); border-block-start: 1px solid var(--x-border); }
.lp-foot__in { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px var(--s1); padding-block: var(--s1); font-size: 13.5px; color: var(--x-text-muted); }
.lp-foot__in a { color: var(--x-primary-text); font-weight: 600; text-decoration: none; }
.lp-sticky { display: none; }
.lp-sticky { transition: opacity var(--x-duration), transform var(--x-duration) var(--x-ease); }
.lp-sticky.is-hidden { opacity: 0; transform: translateY(16px); pointer-events: none; }

@media (max-width: 1179px) {
  .lp-nav__links { display: none; }
  .lp-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lp-metric:nth-child(4) { border-inline-start: 0; }
  .lp-metric:nth-child(n + 4) { border-block-start: 1px solid var(--x-border); }
  .lp-why__grid, .lp-pgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 1023px) {
  .lp { --s3: 80px; }
  .lp-hero__in { grid-template-columns: 1fr; padding-block: var(--s1) var(--s2); }
  .lp-hero__media { max-width: 680px; width: 100%; margin-inline: auto; }
  .lp-story__in, .lp-story--flip .lp-story__in, .lp-sec__in, .lp-platform__in { grid-template-columns: 1fr; }
  .lp-story--flip .lp-stage { order: 0; }
  .lp-eco { max-width: 560px; width: 100%; margin-inline: auto; }
  .lp-sticky { display: flex; position: fixed; inset-inline: 16px; inset-block-end: max(16px, env(safe-area-inset-bottom)); z-index: var(--x-z-sticky); justify-content: center; align-items: center; min-height: 54px; border-radius: var(--x-radius-full); background: var(--x-primary); color: #fff; font-weight: 700; text-decoration: none; box-shadow: var(--x-shadow-brand); }
}
@media (max-width: 767px) {
  .lp { --s2: 32px; --s3: 64px; }
  .lp-nav__in { gap: 12px; min-height: 64px; }
  .lp-nav__end .lp-btn { display: none; }
  .lp-brand__word { font-size: 18px; }
  .lp-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-metric { padding: 14px; }
  .lp-metric + .lp-metric { border-inline-start: 0; }
  .lp-metric:nth-child(even) { border-inline-start: 1px solid var(--x-border); }
  .lp-metric:nth-child(n + 3) { border-block-start: 1px solid var(--x-border); }
  .lp-why__grid, .lp-pgrid, .lp-sec__grid { grid-template-columns: 1fr; }
  .lp-stage { padding-bottom: 64px; }
  .lp-insight :is(b, small) { white-space: normal; }
  /* the module ring becomes a two-column list under the hub */
  .lp-eco { aspect-ratio: auto; display: flex; flex-direction: column; gap: var(--s1); }
  .lp-eco::before, .lp-eco::after { display: none; }
  .lp-eco__mods { position: static; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
  .lp-eco__mods li { position: static; translate: none; justify-content: flex-start; }
  .lp-ctas .lp-btn { flex: 1 1 100%; }
  .lp-foot__in { justify-content: center; text-align: center; padding-bottom: 96px; }
}
</style>
