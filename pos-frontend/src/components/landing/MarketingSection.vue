<script setup lang="ts">
// One landing-page section as a marketing component: icon + eyebrow, heading, description,
// checked bullet points, a call to action, and a supporting visual (slot) beside it.
import type { Component } from 'vue'
import { ArrowRight, Check } from 'lucide-vue-next'

withDefaults(
  defineProps<{ id: string; icon: Component; eyebrow: string; title: string; body: string; bullets?: string[]; cta: string; ctaHref?: string; reverse?: boolean; tone?: 'blue' | 'teal' | 'amber' | 'violet' | 'rose' }>(),
  { bullets: () => [], ctaHref: '#signin', reverse: false, tone: 'blue' },
)
</script>

<template>
  <section :id="id" class="ms" :class="{ 'is-reverse': reverse }" :aria-labelledby="`${id}-title`">
    <div class="ms__copy" data-reveal>
      <p class="ms__eyebrow" :class="`is-${tone}`">
        <span class="ms__icon" aria-hidden="true"><component :is="icon" :size="18" :stroke-width="2" /></span>
        {{ eyebrow }}
      </p>
      <h2 :id="`${id}-title`" class="ms__title">{{ title }}</h2>
      <p class="ms__body">{{ body }}</p>
      <ul v-if="bullets.length" class="ms__bullets">
        <li v-for="b in bullets" :key="b"><span class="ms__check" aria-hidden="true"><Check :size="14" :stroke-width="3" /></span>{{ b }}</li>
      </ul>
      <a class="ms__cta" :href="ctaHref">{{ cta }} <ArrowRight class="ms__arrow" :size="18" aria-hidden="true" /></a>
    </div>
    <div class="ms__visual" data-reveal>
      <slot />
    </div>
  </section>
</template>

<style scoped>
.ms { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: clamp(32px, 6vw, 88px); align-items: center; max-width: 1240px; margin: 0 auto; padding: clamp(56px, 8vw, 112px) clamp(16px, 4vw, 48px); }
.ms.is-reverse .ms__copy { order: 2; }
.ms__copy { display: flex; flex-direction: column; gap: 18px; max-width: 540px; }
.ms__eyebrow { display: inline-flex; align-items: center; gap: 10px; margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.02em; color: var(--tone-text); }
.ms__icon { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: var(--tone-soft); color: var(--tone-text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tone-text) 14%, transparent); }
.is-blue { --tone-soft: #eff6ff; --tone-text: #1d4ed8; }
.is-teal { --tone-soft: #f0fdfa; --tone-text: #0f766e; }
.is-amber { --tone-soft: #fffbeb; --tone-text: #b45309; }
.is-violet { --tone-soft: #f5f3ff; --tone-text: #6d28d9; }
.is-rose { --tone-soft: #fff1f2; --tone-text: #be123c; }
:root[data-theme='dark'] .ms__eyebrow { --tone-soft: rgba(148, 163, 184, 0.12); --tone-text: #93c5fd; }
.ms__title { margin: 0; font-family: var(--x-font-display); font-size: var(--x-text-section); line-height: 1.08; letter-spacing: var(--x-tracking-tight); font-weight: 800; color: var(--x-text); text-wrap: balance; }
.ms__body { margin: 0; font-size: var(--x-text-body); line-height: 1.65; color: var(--x-text-muted); text-wrap: pretty; }
.ms__bullets { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.ms__bullets li { display: flex; align-items: flex-start; gap: 12px; font-size: 16px; line-height: 1.5; color: var(--x-text); font-weight: 500; }
.ms__check { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; flex: none; margin-top: 1px; background: var(--x-success-soft); color: var(--x-success-text); }
.ms__cta { align-self: flex-start; margin-top: 8px; display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 20px; border-radius: var(--x-radius-md); background: var(--x-brand-navy); color: #fff; font-weight: 600; text-decoration: none; box-shadow: 0 10px 24px -12px rgba(15, 23, 42, 0.7); transition: transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration); }
:root[data-theme='dark'] .ms__cta { background: var(--x-primary); }
.ms__cta:hover { transform: translateY(-1px); box-shadow: 0 14px 30px -12px rgba(15, 23, 42, 0.75); }
.ms__arrow { transition: transform var(--x-duration) var(--x-ease); }
.ms__cta:hover .ms__arrow { transform: translateX(3px); }
[dir='rtl'] .ms__arrow { transform: scaleX(-1); }
[dir='rtl'] .ms__cta:hover .ms__arrow { transform: scaleX(-1) translateX(3px); }
.ms__visual { position: relative; min-width: 0; }
[data-reveal] { opacity: 0; transform: translateY(18px); transition: opacity 600ms var(--x-ease), transform 600ms var(--x-ease); }
[data-reveal].is-in { opacity: 1; transform: none; }
.ms__visual[data-reveal] { transition-delay: 90ms; }
@media (max-width: 1023px) {
  .ms { grid-template-columns: 1fr; }
  .ms.is-reverse .ms__copy { order: 0; }
  .ms__copy { max-width: 640px; }
}
</style>
