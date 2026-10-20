<script setup lang="ts">
// Public landing page at "/": a premium product story on the left and the real sign-in in a
// glass card on the right (visible without scrolling on a standard desktop); single column with
// a sticky "Sign in" button on tablets and phones. Every section is a marketing component
// (icon, heading, description, visual, CTA). Photos are self-hosted (CSP img-src 'self') from
// Unsplash under the Unsplash License — see public/img/stock/CREDITS.md. Dashboard figures are
// sample data and labelled as such.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight, Banknote, Boxes, Building2, ChartColumn, CircleCheck, CreditCard, Fingerprint, Globe, KeyRound, Languages, Layers,
  LockKeyhole, MonitorSmartphone, Printer, ScanBarcode, ShieldCheck, ShoppingBag, Sparkles, Timer, Users, UtensilsCrossed, Wallet,
} from 'lucide-vue-next'
import brandMark from '@/assets/brand-mark.png'
import SignInPanel from '@/components/auth/SignInPanel.vue'
import LocaleSwitch from '@/components/shell/LocaleSwitch.vue'
import DashboardPreview from '@/components/landing/DashboardPreview.vue'
import MarketingSection from '@/components/landing/MarketingSection.vue'
import { routeAfterSignIn } from '@/composables/useSessionBoot'
import { useReveal } from '@/composables/useReveal'
import { t } from '@/lib/i18n'
import UiItemArt from '@/ui/UiItemArt.vue'

const router = useRouter()
const route = useRoute()
const year = new Date().getFullYear()
const root = ref<HTMLElement | null>(null)
useReveal(root)

const scrolled = ref(false)
const onScroll = () => (scrolled.value = window.scrollY > 8)
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

async function signedIn() {
  await routeAfterSignIn(router, typeof route.query.next === 'string' ? route.query.next : null)
}

const img = (name: string) => ({ src: `/img/stock/${name}.webp`, srcset: `/img/stock/${name}-sm.webp 560w, /img/stock/${name}.webp 1200w` })

const sections = computed(() => [
  { id: 'product', label: t('landing.nav.product') },
  { id: 'fnb', label: t('landing.nav.fnb') },
  { id: 'retail', label: t('landing.nav.retail') },
  { id: 'analytics', label: t('landing.nav.analytics') },
  { id: 'security', label: t('landing.nav.security') },
])
const trust = computed(() => [
  { icon: MonitorSmartphone, text: t('landing.trust.devices') },
  { icon: Fingerprint, text: t('landing.trust.pin') },
  { icon: KeyRound, text: t('landing.trust.mfa') },
  { icon: Languages, text: t('landing.trust.lang') },
])
const highlights = computed(() => [
  { icon: UtensilsCrossed, tone: 'orange', title: t('landing.hl.1.title'), body: t('landing.hl.1.body') },
  { icon: ScanBarcode, tone: 'blue', title: t('landing.hl.2.title'), body: t('landing.hl.2.body') },
  { icon: ChartColumn, tone: 'teal', title: t('landing.hl.3.title'), body: t('landing.hl.3.body') },
])
const madeFor = computed(() => [
  { photo: 'dining', label: t('landing.for.restaurants') },
  { photo: 'coffee', label: t('landing.for.cafes') },
  { photo: 'store', label: t('landing.for.retail') },
])
const features = computed(() => [
  { icon: Users, tone: 'blue', title: t('landing.f1.title'), body: t('landing.f1.body') },
  { icon: Wallet, tone: 'teal', title: t('landing.f2.title'), body: t('landing.f2.body') },
  { icon: Banknote, tone: 'amber', title: t('landing.f3.title'), body: t('landing.f3.body') },
  { icon: Printer, tone: 'violet', title: t('landing.f4.title'), body: t('landing.f4.body') },
  { icon: Globe, tone: 'rose', title: t('landing.f5.title'), body: t('landing.f5.body') },
  { icon: Layers, tone: 'emerald', title: t('landing.f6.title'), body: t('landing.f6.body') },
])
const security = computed(() => [
  { icon: MonitorSmartphone, title: t('landing.security.s1.title'), body: t('landing.security.s1.body') },
  { icon: Fingerprint, title: t('landing.security.s2.title'), body: t('landing.security.s2.body') },
  { icon: KeyRound, title: t('landing.security.s3.title'), body: t('landing.security.s3.body') },
  { icon: Timer, title: t('landing.security.s4.title'), body: t('landing.security.s4.body') },
])
const stock = computed(() => [
  { name: t('landing.sample.stock1'), group: 'Coffee', level: 22, low: true },
  { name: t('landing.sample.stock2'), group: 'Milk', level: 64, low: false },
  { name: t('landing.sample.stock3'), group: 'Bakery bun', level: 81, low: false },
])
const barcode = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2]
</script>

<template>
  <div ref="root" class="lp">
    <a class="lp-skip" href="#signin">{{ t('landing.skipToSignIn') }}</a>

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
          <a class="lp-btn lp-btn--dark lp-btn--sm" href="#signin">{{ t('auth.signIn') }}</a>
        </div>
      </div>
    </header>

    <!-- hero -->
    <main id="top" class="lp-hero">
      <div class="lp-hero__bg" aria-hidden="true"><i class="o1" /><i class="o2" /><i class="o3" /></div>
      <div class="lp-hero__in">
        <div class="lp-hero__story">
          <p class="lp-badge x-enter"><span><Sparkles :size="14" /></span>{{ t('landing.badge') }}</p>
          <h1 class="lp-hero__title x-enter">{{ t('landing.headline') }}</h1>
          <p class="lp-hero__lead x-enter">{{ t('landing.lead') }}</p>
          <div class="lp-hero__ctas x-enter">
            <a class="lp-btn lp-btn--primary" href="#signin">{{ t('landing.cta.primary') }} <ArrowRight class="lp-arrow" :size="18" aria-hidden="true" /></a>
            <a class="lp-btn lp-btn--ghost" href="#product">{{ t('landing.cta.secondary') }}</a>
          </div>
          <ul class="lp-trust x-enter" :aria-label="t('landing.trust.label')">
            <li v-for="x in trust" :key="x.text"><component :is="x.icon" :size="17" aria-hidden="true" />{{ x.text }}</li>
          </ul>
          <ul class="lp-hl x-enter">
            <li v-for="h in highlights" :key="h.title">
              <span class="lp-hl__ic x-art" :class="`x-art--${h.tone}`" aria-hidden="true"><component :is="h.icon" :size="20" :stroke-width="1.8" /></span>
              <span><b>{{ h.title }}</b><small>{{ h.body }}</small></span>
            </li>
          </ul>
          <div class="lp-for x-enter">
            <span class="lp-for__label">{{ t('landing.for.label') }}</span>
            <ul>
              <li v-for="m in madeFor" :key="m.photo"><img :src="`/img/stock/${m.photo}-sm.webp`" alt="" width="40" height="40" loading="eager" />{{ m.label }}</li>
            </ul>
          </div>
        </div>

        <aside id="signin" class="lp-hero__panel">
          <div class="lp-panel__photo" aria-hidden="true"><img v-bind="img('checkout-tablet')" sizes="420px" alt="" /></div>
          <div class="lp-panel">
            <SignInPanel @signed-in="signedIn" />
          </div>
        </aside>
      </div>
    </main>

    <!-- product preview -->
    <section id="product" class="lp-preview" aria-labelledby="product-title">
      <div class="lp-center" data-reveal>
        <p class="lp-eyebrow"><span><Layers :size="16" /></span>{{ t('landing.preview.eyebrow') }}</p>
        <h2 id="product-title" class="lp-h2">{{ t('landing.preview.title') }}</h2>
        <p class="lp-sub">{{ t('landing.preview.body') }}</p>
      </div>
      <div class="lp-preview__frame" data-reveal><DashboardPreview /></div>
      <div class="lp-center" data-reveal>
        <a class="lp-btn lp-btn--primary" href="#signin">{{ t('landing.preview.cta') }} <ArrowRight class="lp-arrow" :size="18" aria-hidden="true" /></a>
      </div>
    </section>

    <!-- F&B -->
    <MarketingSection id="fnb" :icon="UtensilsCrossed" tone="amber" :eyebrow="t('landing.fnb.eyebrow')" :title="t('landing.fnb.title')" :body="t('landing.fnb.body')" :bullets="[t('landing.fnb.b1'), t('landing.fnb.b2'), t('landing.fnb.b3')]" :cta="t('landing.fnb.cta')">
      <div class="lp-collage">
        <img class="lp-collage__main" v-bind="img('dining')" sizes="(max-width: 1023px) 92vw, 560px" :alt="t('landing.photo.dining')" loading="lazy" />
        <img class="lp-collage__a" v-bind="img('burger')" sizes="220px" :alt="t('landing.photo.burger')" loading="lazy" />
        <img class="lp-collage__b" v-bind="img('coffee')" sizes="200px" :alt="t('landing.photo.coffee')" loading="lazy" />
        <div class="lp-float lp-float--ticket" aria-hidden="true">
          <div class="lp-float__row"><b>{{ t('landing.fnb.card.table') }}</b><span class="lp-pill lp-pill--ok"><CircleCheck :size="13" />{{ t('landing.fnb.card.status') }}</span></div>
          <ul>
            <li><span class="lp-mini-art"><UiItemArt :name="t('landing.sample.item2')" group="Sandwich" :size="14" rounded="7px" /></span>2 × {{ t('landing.sample.item2') }}</li>
            <li><span class="lp-mini-art"><UiItemArt :name="t('landing.sample.item1')" group="Tea" :size="14" rounded="7px" /></span>4 × {{ t('landing.sample.item1') }}</li>
          </ul>
          <small>{{ t('landing.fnb.card.ticket') }} · 12:42</small>
        </div>
      </div>
    </MarketingSection>

    <!-- Retail -->
    <MarketingSection id="retail" reverse :icon="ShoppingBag" tone="blue" :eyebrow="t('landing.retail.eyebrow')" :title="t('landing.retail.title')" :body="t('landing.retail.body')" :bullets="[t('landing.retail.b1'), t('landing.retail.b2'), t('landing.retail.b3')]" :cta="t('landing.retail.cta')">
      <div class="lp-collage lp-collage--retail">
        <img class="lp-collage__main" v-bind="img('store')" sizes="(max-width: 1023px) 92vw, 560px" :alt="t('landing.photo.store')" loading="lazy" />
        <img class="lp-collage__a" v-bind="img('grocery')" sizes="220px" :alt="t('landing.photo.grocery')" loading="lazy" />
        <div class="lp-float lp-float--scan" aria-hidden="true">
          <div class="lp-scan">
            <svg viewBox="0 0 120 40" class="lp-barcode"><rect v-for="(w, i) in barcode" :key="i" :x="barcode.slice(0, i).reduce((a, b) => a + b + 1.4, 4)" y="2" :width="w" height="30" /></svg>
            <span class="lp-scan__line" />
          </div>
          <div class="lp-float__row"><span class="lp-pill lp-pill--info"><ScanBarcode :size="13" />{{ t('landing.retail.card.scanned') }}</span><small dir="ltr">6291041500213</small></div>
          <div class="lp-float__row lp-float__item">
            <span class="lp-mini-art"><UiItemArt :name="t('landing.retail.card.item')" group="Juice" :size="16" rounded="8px" /></span>
            <b>{{ t('landing.retail.card.item') }}</b><b class="x-tabular">BHD 0.600</b>
          </div>
          <div class="lp-added"><CircleCheck :size="15" />{{ t('landing.retail.card.added') }}</div>
        </div>
      </div>
    </MarketingSection>

    <!-- Analytics -->
    <MarketingSection id="analytics" :icon="ChartColumn" tone="teal" :eyebrow="t('landing.analytics.eyebrow')" :title="t('landing.analytics.title')" :body="t('landing.analytics.body')" :bullets="[t('landing.analytics.b1'), t('landing.analytics.b2'), t('landing.analytics.b3')]" :cta="t('landing.analytics.cta')">
      <div class="lp-eod">
        <div class="lp-eod__head"><b>{{ t('landing.eod.title') }}</b><span class="lp-pill lp-pill--ok"><CircleCheck :size="13" />{{ t('landing.eod.balanced') }}</span></div>
        <div class="lp-eod__total"><small>{{ t('landing.eod.gross') }}</small><b class="x-tabular">BHD 1,284.500</b></div>
        <div class="lp-eod__split">
          <div><span class="lp-eod__ic is-card"><CreditCard :size="16" /></span><small>{{ t('landing.eod.card') }}</small><b class="x-tabular">BHD 693.630</b></div>
          <div><span class="lp-eod__ic is-cash"><Banknote :size="16" /></span><small>{{ t('landing.eod.cash') }}</small><b class="x-tabular">BHD 590.870</b></div>
        </div>
        <dl class="lp-eod__rows">
          <div><dt>{{ t('landing.eod.expected') }}</dt><dd class="x-tabular">BHD 640.870</dd></div>
          <div><dt>{{ t('landing.eod.counted') }}</dt><dd class="x-tabular">BHD 640.870</dd></div>
          <div class="is-var"><dt>{{ t('landing.eod.variance') }}</dt><dd class="x-tabular">BHD 0.000</dd></div>
        </dl>
        <small class="lp-eod__note">{{ t('landing.preview.note') }}</small>
      </div>
    </MarketingSection>

    <!-- Branches -->
    <MarketingSection id="branches" reverse :icon="Building2" tone="violet" :eyebrow="t('landing.branches.eyebrow')" :title="t('landing.branches.title')" :body="t('landing.branches.body')" :bullets="[t('landing.branches.b1'), t('landing.branches.b2'), t('landing.branches.b3')]" :cta="t('landing.branches.cta')">
      <div class="lp-collage lp-collage--branches">
        <img class="lp-collage__main" v-bind="img('storefront')" sizes="(max-width: 1023px) 92vw, 560px" :alt="t('landing.photo.storefront')" loading="lazy" />
        <img class="lp-collage__a" v-bind="img('cafe')" sizes="220px" :alt="t('landing.photo.cafe')" loading="lazy" />
        <div class="lp-float lp-float--branches" aria-hidden="true">
          <b class="lp-float__title"><Building2 :size="15" />{{ t('landing.preview.branches') }}</b>
          <ul>
            <li><i class="ok" />{{ t('landing.sample.branch1') }}<small>{{ t('landing.preview.open') }}</small></li>
            <li><i class="ok" />{{ t('landing.sample.branch2') }}<small>{{ t('landing.preview.open') }}</small></li>
            <li><i class="warn" />{{ t('landing.sample.branch3') }}<small>{{ t('landing.preview.closing') }}</small></li>
          </ul>
        </div>
      </div>
    </MarketingSection>

    <!-- Inventory -->
    <MarketingSection id="inventory" :icon="Boxes" tone="rose" :eyebrow="t('landing.inventory.eyebrow')" :title="t('landing.inventory.title')" :body="t('landing.inventory.body')" :bullets="[t('landing.inventory.b1'), t('landing.inventory.b2'), t('landing.inventory.b3')]" :cta="t('landing.inventory.cta')">
      <div class="lp-collage lp-collage--stock">
        <img class="lp-collage__main" v-bind="img('produce')" sizes="(max-width: 1023px) 92vw, 560px" :alt="t('landing.photo.grocery')" loading="lazy" />
        <div class="lp-float lp-float--stock" aria-hidden="true">
          <b class="lp-float__title"><Boxes :size="15" />{{ t('landing.preview.stock') }}</b>
          <ul>
            <li v-for="s in stock" :key="s.name">
              <span class="lp-mini-art"><UiItemArt :name="s.name" :group="s.group" :size="14" rounded="7px" /></span>
              <span class="lp-stock__name">{{ s.name }}<span class="lp-stock__bar"><span :class="{ low: s.low }" :style="{ width: s.level + '%' }" /></span></span>
              <small :class="s.low ? 'is-low' : 'is-ok'">{{ s.low ? t('landing.preview.low') : t('landing.preview.ok') }}</small>
            </li>
          </ul>
        </div>
      </div>
    </MarketingSection>

    <!-- Features -->
    <section id="features" class="lp-features" aria-labelledby="features-title">
      <div class="lp-center" data-reveal>
        <p class="lp-eyebrow"><span><Sparkles :size="16" /></span>{{ t('landing.features.eyebrow') }}</p>
        <h2 id="features-title" class="lp-h2">{{ t('landing.features.title') }}</h2>
        <p class="lp-sub">{{ t('landing.features.body') }}</p>
      </div>
      <ul class="lp-fgrid">
        <li v-for="f in features" :key="f.title" class="lp-fcard" data-reveal>
          <span class="lp-fcard__ic x-art" :class="`x-art--${f.tone}`" aria-hidden="true"><component :is="f.icon" :size="22" :stroke-width="1.8" /></span>
          <h3>{{ f.title }}</h3>
          <p>{{ f.body }}</p>
        </li>
      </ul>
      <div class="lp-center" data-reveal>
        <a class="lp-btn lp-btn--dark" href="#signin">{{ t('landing.features.cta') }} <ArrowRight class="lp-arrow" :size="18" aria-hidden="true" /></a>
      </div>
    </section>

    <!-- Security -->
    <section id="security" class="lp-sec" aria-labelledby="security-title">
      <div class="lp-sec__in">
        <div class="lp-sec__copy" data-reveal>
          <p class="lp-eyebrow lp-eyebrow--dark"><span><ShieldCheck :size="16" /></span>{{ t('landing.security.eyebrow') }}</p>
          <h2 id="security-title" class="lp-h2">{{ t('landing.security.title') }}</h2>
          <p class="lp-sub">{{ t('landing.security.body') }}</p>
          <ul class="lp-sec__grid">
            <li v-for="s in security" :key="s.title">
              <span class="lp-sec__ic" aria-hidden="true"><component :is="s.icon" :size="20" /></span>
              <b>{{ s.title }}</b>
              <span>{{ s.body }}</span>
            </li>
          </ul>
          <a class="lp-btn lp-btn--primary" href="#signin">{{ t('landing.security.cta') }} <ArrowRight class="lp-arrow" :size="18" aria-hidden="true" /></a>
        </div>
        <div class="lp-sec__visual" data-reveal aria-hidden="true">
          <div class="lp-shield"><ShieldCheck :size="54" :stroke-width="1.4" /></div>
          <div class="lp-device">
            <span class="lp-device__ic"><MonitorSmartphone :size="20" /></span>
            <span class="lp-device__tx"><b>{{ t('landing.security.device') }}</b><small><ShieldCheck :size="13" />{{ t('landing.security.trusted') }}</small></span>
          </div>
          <div class="lp-device lp-device--b">
            <span class="lp-device__ic"><LockKeyhole :size="20" /></span>
            <span class="lp-device__tx"><b>{{ t('landing.security.s4.title') }}</b><small><Timer :size="13" />{{ t('landing.security.locked') }}</small></span>
          </div>
          <div class="lp-pinpad"><i v-for="n in 6" :key="n" :class="{ on: n <= 4 }" /></div>
        </div>
      </div>
    </section>

    <!-- final CTA + contact -->
    <section id="contact" class="lp-final" aria-labelledby="final-title">
      <img class="lp-final__bg" v-bind="img('food-spread')" sizes="100vw" alt="" loading="lazy" />
      <div class="lp-final__in" data-reveal>
        <h2 id="final-title" class="lp-h2">{{ t('landing.final.title') }}</h2>
        <p class="lp-sub">{{ t('landing.final.body') }}</p>
        <div class="lp-hero__ctas">
          <a class="lp-btn lp-btn--primary" href="#signin">{{ t('landing.final.primary') }} <ArrowRight class="lp-arrow" :size="18" aria-hidden="true" /></a>
          <a class="lp-btn lp-btn--glass" href="https://xentraerp.net">{{ t('landing.final.secondary') }}</a>
        </div>
        <p class="lp-final__contact">{{ t('landing.contact.body') }} <a href="https://xentraerp.net">xentraerp.net</a></p>
      </div>
    </section>

    <footer class="lp-foot">
      <div class="lp-foot__in">
        <span class="lp-brand lp-brand--sm"><img :src="brandMark" alt="" width="24" height="24" /><span class="lp-brand__word">Xentra<b>ERP</b></span></span>
        <span>© {{ year }} XentraERP · {{ t('landing.footer.rights') }}</span>
        <span class="lp-foot__photos">{{ t('landing.footer.photos') }}</span>
      </div>
    </footer>

    <a class="lp-sticky" href="#signin">{{ t('auth.signIn') }}</a>
  </div>
</template>

<style scoped>
.lp { min-height: 100dvh; background: var(--x-bg); color: var(--x-text); font-family: var(--x-font-sans); overflow-x: clip; scroll-behavior: smooth; }
.lp :is(h1, h2, h3) { text-wrap: balance; word-spacing: 0.06em; }
.lp-skip { position: absolute; inset-inline-start: -9999px; }
.lp-skip:focus { inset-inline-start: 16px; top: 16px; z-index: 300; background: var(--x-surface); padding: 8px 12px; border-radius: 8px; }

/* buttons */
.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 24px; border-radius: var(--x-radius-md); font-weight: 600; font-size: 16px; text-decoration: none; white-space: nowrap; transition: transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration), background var(--x-duration); }
.lp-btn:hover { transform: translateY(-1px); }
.lp-btn:active { transform: scale(0.98); }
.lp-btn--sm { min-height: 40px; padding: 0 16px; font-size: 14px; }
.lp-btn--primary { background: var(--x-primary); color: #fff; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), var(--x-shadow-brand); }
.lp-btn--primary:hover { background: var(--x-primary-hover); }
.lp-btn--dark { background: var(--x-brand-navy); color: #fff; box-shadow: 0 10px 24px -12px rgba(15, 23, 42, 0.7); }
:root[data-theme='dark'] .lp-btn--dark { background: #fff; color: #0f172a; }
.lp-btn--ghost { background: var(--x-surface); color: var(--x-text); border: 1px solid var(--x-border); box-shadow: var(--x-shadow-xs); }
.lp-btn--ghost:hover { border-color: var(--x-border-strong); }
.lp-btn--glass { background: rgba(255, 255, 255, 0.12); color: #fff; border: 1px solid rgba(255, 255, 255, 0.28); backdrop-filter: blur(8px); }
.lp-arrow { transition: transform var(--x-duration) var(--x-ease); }
.lp-btn:hover .lp-arrow { transform: translateX(3px); }
[dir='rtl'] .lp-arrow { transform: scaleX(-1); }
[dir='rtl'] .lp-btn:hover .lp-arrow { transform: scaleX(-1) translateX(3px); }

/* nav */
.lp-nav { position: sticky; top: 0; z-index: 200; transition: background var(--x-duration), box-shadow var(--x-duration), border-color var(--x-duration); border-block-end: 1px solid transparent; }
.lp-nav.is-scrolled { background: var(--x-surface-glass); backdrop-filter: saturate(1.6) blur(14px); -webkit-backdrop-filter: saturate(1.6) blur(14px); border-color: var(--x-border); box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02); }
.lp-nav__in { max-width: 1320px; margin: 0 auto; display: flex; align-items: center; gap: 32px; min-height: 72px; padding: 0 clamp(16px, 4vw, 48px); }
.lp-brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: var(--x-text); flex: none; }
.lp-brand img { border-radius: 10px; box-shadow: var(--x-shadow-sm); }
.lp-brand__word { font-family: var(--x-font-display); font-weight: 800; font-size: 20px; letter-spacing: -0.02em; }
.lp-brand__word b { color: var(--x-primary); }
.lp-brand__tag { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; color: var(--x-accent-text); background: var(--x-accent-soft); border-radius: 6px; padding: 3px 7px; }
.lp-brand--sm .lp-brand__word { font-size: 16px; }
.lp-nav__links { display: flex; gap: 4px; flex: 1; justify-content: center; }
.lp-nav__links a { color: var(--x-text-muted); text-decoration: none; font-size: 15px; font-weight: 500; padding: 8px 14px; border-radius: 10px; white-space: nowrap; transition: color var(--x-duration), background var(--x-duration); }
.lp-nav__links a:hover { color: var(--x-text); background: var(--x-surface-3); }
.lp-nav__end { display: flex; align-items: center; gap: 10px; margin-inline-start: auto; }

/* hero */
.lp-hero { position: relative; isolation: isolate; }
.lp-hero__bg { position: absolute; inset: -72px 0 0; z-index: -1; overflow: hidden; pointer-events: none;
  background-image: linear-gradient(var(--x-border) 1px, transparent 1px), linear-gradient(90deg, var(--x-border) 1px, transparent 1px);
  background-size: 56px 56px; mask-image: radial-gradient(80% 70% at 50% 0%, #000 30%, transparent 75%); -webkit-mask-image: radial-gradient(80% 70% at 50% 0%, #000 30%, transparent 75%); opacity: 0.55; }
.lp-hero__bg i { position: absolute; border-radius: 50%; filter: blur(80px); }
.lp-hero__bg .o1 { width: 520px; height: 520px; background: rgba(37, 99, 235, 0.22); inset-block-start: -120px; inset-inline-end: 6%; }
.lp-hero__bg .o2 { width: 420px; height: 420px; background: rgba(20, 184, 166, 0.2); inset-block-start: 260px; inset-inline-end: 28%; }
.lp-hero__bg .o3 { width: 360px; height: 360px; background: rgba(245, 158, 11, 0.12); inset-block-start: 40px; inset-inline-start: -80px; }
.lp-hero__in { max-width: 1320px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(400px, 480px); gap: clamp(32px, 5vw, 80px); align-items: start; padding: clamp(28px, 4vw, 56px) clamp(16px, 4vw, 48px) clamp(56px, 7vw, 96px); }
.lp-hero__story { display: flex; flex-direction: column; gap: 24px; padding-block-start: clamp(8px, 2vw, 32px); min-width: 0; }
.lp-badge { align-self: flex-start; display: inline-flex; align-items: center; gap: 10px; margin: 0; padding: 6px 14px 6px 6px; border-radius: 999px; background: var(--x-surface); border: 1px solid var(--x-border); box-shadow: var(--x-shadow-xs); font-size: 14px; font-weight: 600; color: var(--x-text); }
.lp-badge span { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--x-brand-gradient); color: #fff; }
.lp-hero__title { padding-block-end: 0.08em; margin: 0; font-family: var(--x-font-display); font-weight: 800; font-size: var(--x-text-hero); line-height: 1.04; letter-spacing: -0.03em; max-width: 15ch;
  background: linear-gradient(180deg, var(--x-text) 30%, color-mix(in srgb, var(--x-text) 72%, var(--x-primary))); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lp-hero__lead { margin: 0; font-size: clamp(17px, 1.35vw, 20px); line-height: 1.6; color: var(--x-text-muted); max-width: 56ch; text-wrap: pretty; }
.lp-hero__ctas { display: flex; flex-wrap: wrap; gap: 12px; }
.lp-trust { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px 22px; }
.lp-trust li { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: var(--x-text-muted); white-space: nowrap; }
.lp-trust li svg { color: var(--x-success); }
.lp-hl { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.lp-hl li { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border-radius: var(--x-radius-lg); background: var(--x-surface-glass); border: 1px solid var(--x-border); box-shadow: var(--x-shadow-sm); backdrop-filter: blur(8px); transition: transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration); min-width: 0; }
.lp-hl li:hover { transform: translateY(-2px); box-shadow: var(--x-shadow-md); }
.lp-hl__ic { width: 40px; height: 40px; flex: none; border-radius: 12px; }
.lp-hl b { display: block; font-size: 15px; font-weight: 700; color: var(--x-text); }
.lp-hl small { display: block; font-size: 13px; line-height: 1.45; color: var(--x-text-muted); margin-top: 2px; }
.lp-for { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.lp-for__label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--x-text-faint); }
.lp-for ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 10px; flex-wrap: wrap; }
.lp-for li { display: inline-flex; align-items: center; gap: 8px; padding: 4px 14px 4px 4px; border-radius: 999px; background: var(--x-surface); border: 1px solid var(--x-border); font-size: 14px; font-weight: 600; box-shadow: var(--x-shadow-xs); }
.lp-for img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }

.lp-hero__panel { position: relative; position: sticky; top: 92px; }
.lp-panel__photo { position: absolute; inset-block-start: -18px; inset-inline-end: -26px; width: 72%; aspect-ratio: 4 / 3; border-radius: var(--x-radius-xl); overflow: hidden; transform: rotate(4deg); box-shadow: var(--x-shadow-lg); opacity: 0.9; }
[dir='rtl'] .lp-panel__photo { transform: rotate(-4deg); }
.lp-panel__photo img { width: 100%; height: 100%; object-fit: cover; }
.lp-panel { position: relative; padding: clamp(20px, 2.2vw, 30px); border-radius: var(--x-radius-2xl); background: var(--x-surface-glass); border: 1px solid rgba(255, 255, 255, 0.7); box-shadow: var(--x-shadow-lg), inset 0 1px 0 rgba(255, 255, 255, 0.8); backdrop-filter: saturate(1.6) blur(22px); -webkit-backdrop-filter: saturate(1.6) blur(22px); margin-top: 56px; }
:root[data-theme='dark'] .lp-panel { border-color: rgba(148, 163, 184, 0.18); box-shadow: var(--x-shadow-lg); }

/* section headings */
.lp-center { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; max-width: 760px; margin: 0 auto; }
.lp-eyebrow { display: inline-flex; align-items: center; gap: 10px; margin: 0; font-size: 14px; font-weight: 700; color: var(--x-primary-text); }
.lp-eyebrow span { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; background: var(--x-primary-soft); }
.lp-h2 { margin: 0; font-family: var(--x-font-display); font-weight: 800; font-size: var(--x-text-section); line-height: 1.08; letter-spacing: var(--x-tracking-tight); color: var(--x-text); }
.lp-sub { margin: 0; font-size: var(--x-text-body); line-height: 1.65; color: var(--x-text-muted); max-width: 60ch; text-wrap: pretty; }
[data-reveal] { opacity: 0; transform: translateY(18px); transition: opacity 600ms var(--x-ease), transform 600ms var(--x-ease); }
[data-reveal].is-in { opacity: 1; transform: none; }

/* preview */
.lp-preview { padding: clamp(56px, 8vw, 112px) clamp(16px, 4vw, 48px); background: linear-gradient(180deg, transparent, var(--x-surface) 40%, var(--x-surface)); display: flex; flex-direction: column; gap: clamp(32px, 4vw, 56px); }
.lp-preview__frame { max-width: 1120px; width: 100%; margin: 0 auto; }

/* collage visuals */
.lp-collage { position: relative; padding: 0 0 48px; }
.lp-collage img { display: block; object-fit: cover; box-shadow: var(--x-shadow-lg); }
.lp-collage__main { width: 88%; aspect-ratio: 4 / 3; border-radius: var(--x-radius-2xl); }
.lp-collage__a { position: absolute; inset-inline-end: 0; inset-block-start: 10%; width: 36%; aspect-ratio: 1; border-radius: var(--x-radius-xl); border: 6px solid var(--x-surface); }
.lp-collage__b { position: absolute; inset-inline-end: 6%; inset-block-end: 0; width: 30%; aspect-ratio: 1; border-radius: 50%; border: 6px solid var(--x-surface); }
.lp-float { position: absolute; z-index: 2; padding: 16px; border-radius: var(--x-radius-xl); background: var(--x-surface-glass); border: 1px solid rgba(255, 255, 255, 0.7); box-shadow: var(--x-shadow-lg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); display: flex; flex-direction: column; gap: 10px; font-size: 14px; width: min(300px, 70%); animation: lp-float 6s ease-in-out infinite; }
:root[data-theme='dark'] .lp-float { border-color: rgba(148, 163, 184, 0.2); }
@keyframes lp-float { 50% { transform: translateY(-6px); } }
.lp-float ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.lp-float li { display: flex; align-items: center; gap: 10px; font-weight: 500; }
.lp-float small { color: var(--x-text-muted); font-size: 12.5px; }
.lp-float__row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.lp-float__title { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.lp-float__title svg { color: var(--x-text-faint); }
.lp-float--ticket { inset-inline-start: -4%; inset-block-end: 0; }
.lp-float--scan { inset-inline-start: -4%; inset-block-end: 0; width: min(320px, 76%); }
.lp-float--branches { inset-inline-start: -4%; inset-block-end: 4%; width: min(270px, 66%); }
.lp-float--branches li { justify-content: flex-start; }
.lp-float--branches li small { margin-inline-start: auto; }
.lp-float--branches i { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.lp-float--branches i.ok { background: var(--x-success); box-shadow: 0 0 0 3px var(--x-success-soft); }
.lp-float--branches i.warn { background: var(--x-warning); box-shadow: 0 0 0 3px var(--x-warning-soft); }
.lp-float--stock { inset-inline-end: 0; inset-block-end: 0; width: min(330px, 76%); }
.lp-mini-art { width: 28px; height: 28px; flex: none; display: block; }
.lp-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.lp-pill--ok { background: var(--x-success-soft); color: var(--x-success-text); }
.lp-pill--info { background: var(--x-primary-soft); color: var(--x-primary-text); }
.lp-scan { position: relative; border-radius: 12px; background: #fff; padding: 8px 10px; overflow: hidden; border: 1px solid var(--x-border); }
.lp-barcode { width: 100%; height: 38px; display: block; } .lp-barcode rect { fill: #0f172a; }
.lp-scan__line { position: absolute; inset-inline: 6px; height: 2px; top: 50%; background: #ef4444; box-shadow: 0 0 10px 2px rgba(239, 68, 68, 0.6); animation: lp-scan 2.4s ease-in-out infinite; }
@keyframes lp-scan { 0%, 100% { transform: translateY(-16px); } 50% { transform: translateY(16px); } }
.lp-float__item b:first-of-type { flex: 1; font-size: 13.5px; }
.lp-added { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 8px; border-radius: 10px; background: var(--x-success); color: #fff; font-weight: 700; font-size: 13.5px; }
.lp-stock__name { flex: 1; display: flex; flex-direction: column; gap: 5px; font-weight: 600; font-size: 13.5px; min-width: 0; }
.lp-stock__bar { display: block; height: 6px; border-radius: 3px; background: var(--x-surface-3); overflow: hidden; }
.lp-stock__bar span { display: block; height: 100%; border-radius: 3px; background: var(--x-success); }
.lp-stock__bar span.low { background: var(--x-warning); }
.lp-float--stock small { font-weight: 700; font-size: 12px; }
.is-low { color: var(--x-warning-text) !important; } .is-ok { color: var(--x-success-text) !important; }

/* end-of-day card */
.lp-eod { max-width: 460px; margin-inline: auto; padding: 24px; border-radius: var(--x-radius-2xl); background: var(--x-surface); border: 1px solid var(--x-border); box-shadow: var(--x-shadow-lg); display: flex; flex-direction: column; gap: 18px; position: relative; }
.lp-eod::before { content: ''; position: absolute; inset: 24px -24px -24px 24px; z-index: -1; border-radius: var(--x-radius-2xl); background: linear-gradient(135deg, rgba(20, 184, 166, 0.25), rgba(37, 99, 235, 0.2)); filter: blur(2px); }
.lp-eod__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-family: var(--x-font-display); font-size: 17px; }
.lp-eod__total small { display: block; font-size: 13px; color: var(--x-text-muted); font-weight: 600; }
.lp-eod__total b { font-family: var(--x-font-display); font-size: clamp(30px, 3.2vw, 40px); letter-spacing: -0.03em; }
.lp-eod__split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.lp-eod__split > div { display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: var(--x-radius-lg); background: var(--x-surface-2); border: 1px solid var(--x-border); }
.lp-eod__split small { color: var(--x-text-muted); font-weight: 600; font-size: 13px; }
.lp-eod__split b { font-size: 16px; }
.lp-eod__ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; margin-bottom: 4px; }
.lp-eod__ic.is-card { background: var(--x-primary-soft); color: var(--x-primary-text); }
.lp-eod__ic.is-cash { background: var(--x-success-soft); color: var(--x-success-text); }
.lp-eod__rows { margin: 0; display: flex; flex-direction: column; gap: 10px; border-top: 1px dashed var(--x-border-strong); padding-top: 16px; }
.lp-eod__rows div { display: flex; justify-content: space-between; font-size: 14.5px; }
.lp-eod__rows dt { color: var(--x-text-muted); } .lp-eod__rows dd { margin: 0; font-weight: 600; }
.lp-eod__rows .is-var dd { color: var(--x-success-text); font-weight: 800; }
.lp-eod__note { color: var(--x-text-faint); font-size: 12px; text-align: center; }

/* features */
.lp-features { padding: clamp(56px, 8vw, 112px) clamp(16px, 4vw, 48px); background: var(--x-surface); border-block: 1px solid var(--x-border); display: flex; flex-direction: column; gap: clamp(32px, 4vw, 56px); }
.lp-fgrid { list-style: none; margin: 0 auto; padding: 0; max-width: 1180px; width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.lp-fcard { padding: 28px; border-radius: var(--x-radius-xl); background: var(--x-bg); border: 1px solid var(--x-border); display: flex; flex-direction: column; gap: 12px; transition: transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration), background var(--x-duration), opacity 600ms var(--x-ease); }
.lp-fcard:hover { transform: translateY(-3px); box-shadow: var(--x-shadow-md); background: var(--x-surface); }
.lp-fcard__ic { width: 52px; height: 52px; border-radius: 16px; }
.lp-fcard h3 { margin: 4px 0 0; font-family: var(--x-font-display); font-size: var(--x-text-card); font-weight: 700; letter-spacing: -0.015em; line-height: 1.2; }
.lp-fcard p { margin: 0; color: var(--x-text-muted); font-size: 16px; line-height: 1.6; }

/* security */
.lp-sec { background: radial-gradient(80% 60% at 85% 20%, rgba(37, 99, 235, 0.35), transparent 60%), radial-gradient(60% 50% at 10% 90%, rgba(20, 184, 166, 0.22), transparent 60%), #0b1120; color: #e2e8f0; }
.lp-sec__in { max-width: 1240px; margin: 0 auto; padding: clamp(64px, 9vw, 120px) clamp(16px, 4vw, 48px); display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: clamp(32px, 6vw, 88px); align-items: center; }
.lp-sec__copy { display: flex; flex-direction: column; gap: 20px; align-items: flex-start; }
.lp-sec .lp-h2 { color: #fff; }
.lp-sec .lp-sub { color: #94a3b8; }
.lp-eyebrow--dark { color: #93c5fd; } .lp-eyebrow--dark span { background: rgba(147, 197, 253, 0.12); }
.lp-sec__grid { list-style: none; margin: 8px 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 100%; }
.lp-sec__grid li { display: flex; flex-direction: column; gap: 6px; padding: 20px; border-radius: var(--x-radius-xl); background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); transition: background var(--x-duration), border-color var(--x-duration); }
.lp-sec__grid li:hover { background: rgba(255, 255, 255, 0.07); border-color: rgba(147, 197, 253, 0.3); }
.lp-sec__grid b { color: #fff; font-size: 17px; }
.lp-sec__grid span:last-child { color: #94a3b8; font-size: 14.5px; line-height: 1.55; }
.lp-sec__ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: linear-gradient(135deg, rgba(37, 99, 235, 0.35), rgba(20, 184, 166, 0.3)); color: #bfdbfe; margin-bottom: 6px; }
.lp-sec__visual { position: relative; min-height: 380px; display: grid; place-items: center; }
.lp-shield { width: 168px; height: 168px; border-radius: 48px; display: grid; place-items: center; color: #fff; background: var(--x-brand-gradient); box-shadow: 0 30px 80px -20px rgba(37, 99, 235, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
.lp-device { position: absolute; inset-block-start: 8%; inset-inline-start: 0; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 16px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(12px); box-shadow: 0 20px 40px -20px rgba(0, 0, 0, 0.6); animation: lp-float 7s ease-in-out infinite; }
.lp-device--b { inset-block-start: auto; inset-block-end: 10%; inset-inline-start: auto; inset-inline-end: 0; animation-delay: -3s; }
.lp-device__ic { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; background: rgba(147, 197, 253, 0.14); color: #93c5fd; }
.lp-device__tx { display: flex; flex-direction: column; gap: 2px; }
.lp-device__tx b { color: #fff; font-size: 14px; }
.lp-device__tx small { display: inline-flex; align-items: center; gap: 5px; color: #6ee7b7; font-size: 12.5px; font-weight: 600; }
.lp-pinpad { position: absolute; inset-block-end: -4px; inset-inline-start: 12%; display: flex; gap: 10px; padding: 14px 18px; border-radius: 999px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
.lp-pinpad i { width: 12px; height: 12px; border-radius: 50%; background: rgba(255, 255, 255, 0.18); }
.lp-pinpad i.on { background: #60a5fa; box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.18); }

/* final CTA */
.lp-final { position: relative; isolation: isolate; overflow: hidden; padding: clamp(72px, 10vw, 136px) clamp(16px, 4vw, 48px); color: #fff; }
.lp-final__bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; }
.lp-final::before { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(120deg, rgba(15, 23, 42, 0.94) 20%, rgba(30, 64, 175, 0.82) 70%, rgba(13, 148, 136, 0.7)); }
.lp-final__in { max-width: 760px; margin: 0 auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 20px; }
.lp-final .lp-h2 { color: #fff; }
.lp-final .lp-sub { color: rgba(226, 232, 240, 0.85); }
.lp-final .lp-hero__ctas { justify-content: center; }
.lp-final__contact { margin: 8px 0 0; font-size: 14.5px; color: rgba(226, 232, 240, 0.7); max-width: 60ch; }
.lp-final__contact a { color: #fff; font-weight: 600; }

.lp-foot { background: var(--x-surface); border-block-start: 1px solid var(--x-border); }
.lp-foot__in { max-width: 1320px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 24px; padding: 24px clamp(16px, 4vw, 48px); font-size: 13.5px; color: var(--x-text-muted); }
.lp-foot__photos { color: var(--x-text-faint); }
.lp-sticky { display: none; }

@media (max-width: 1279px) {
  .lp-hero__in { grid-template-columns: 1fr; }
  .lp-hero__panel { position: relative; top: 0; order: -1; max-width: 560px; width: 100%; margin-inline: auto; }
  .lp-panel__photo { display: none; }
  .lp-panel { margin-top: 0; }
  .lp-hero__title { max-width: 18ch; }
  .lp-nav__links { display: none; }
  .lp-sticky { display: flex; position: fixed; inset-inline: 16px; inset-block-end: max(16px, env(safe-area-inset-bottom)); z-index: var(--x-z-sticky); justify-content: center; align-items: center; min-height: 54px; border-radius: var(--x-radius-full); background: var(--x-primary); color: #fff; font-weight: 700; text-decoration: none; box-shadow: var(--x-shadow-brand); }
}
@media (max-width: 1023px) {
  .lp-fgrid { grid-template-columns: 1fr 1fr; }
  .lp-sec__in { grid-template-columns: 1fr; }
  .lp-sec__visual { min-height: 320px; }
}
@media (max-width: 767px) {
  .lp-nav__in { gap: 12px; min-height: 64px; }
  .lp-nav__end .lp-btn { display: none; }
  .lp-brand__word { font-size: 18px; }
  .lp-hl { grid-template-columns: 1fr; }
  .lp-fgrid, .lp-sec__grid { grid-template-columns: 1fr; }
  .lp-panel { padding: 18px; border-radius: var(--x-radius-xl); }
  .lp-collage__main { width: 100%; }
  .lp-collage__a, .lp-collage__b { display: none; }
  .lp-float { position: relative; inset: auto; width: auto; margin: -56px 12px 0; animation: none; }
  .lp-collage { padding: 0; }
  .lp-hero__ctas .lp-btn { flex: 1 1 100%; }
  .lp-foot__in { justify-content: center; text-align: center; padding-bottom: 96px; }
}
</style>
