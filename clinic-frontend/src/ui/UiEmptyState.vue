<script setup lang="ts">
// Friendly empty / zero-data state: an illustrated glyph, a title, one line of help and an action.
import type { Component } from 'vue'
import { Inbox } from 'lucide-vue-next'

withDefaults(defineProps<{ title: string; message?: string; icon?: Component | string; tone?: 'neutral' | 'primary' | 'accent' }>(), { message: undefined, icon: undefined, tone: 'primary' })
</script>

<template>
  <div class="x-empty x-enter" role="status">
    <div class="x-empty__icon" :class="`is-${tone}`" aria-hidden="true">
      <span v-if="typeof icon === 'string'">{{ icon }}</span>
      <component :is="icon || Inbox" v-else :size="28" :stroke-width="1.6" />
    </div>
    <h3 class="x-empty__title">{{ title }}</h3>
    <p v-if="message" class="x-empty__msg">{{ message }}</p>
    <div v-if="$slots.default" class="x-empty__actions"><slot /></div>
  </div>
</template>

<style scoped>
.x-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--x-space-2); padding: var(--x-space-10) var(--x-space-4); color: var(--x-text-muted); }
.x-empty__icon { position: relative; width: 72px; height: 72px; border-radius: 22px; display: grid; place-items: center; font-size: 26px; margin-block-end: var(--x-space-2); }
.x-empty__icon::before { content: ''; position: absolute; inset: -10px; border-radius: 28px; border: 1px dashed var(--x-border-strong); }
.x-empty__icon.is-primary { background: var(--x-primary-soft); color: var(--x-primary-text); }
.x-empty__icon.is-accent { background: var(--x-accent-soft); color: var(--x-accent-text); }
.x-empty__icon.is-neutral { background: var(--x-surface-3); color: var(--x-text-muted); }
.x-empty__title { margin: 0; color: var(--x-text); font-family: var(--x-font-display); font-size: var(--x-text-lg); font-weight: 700; text-wrap: balance; }
.x-empty__msg { margin: 0; max-width: 40ch; line-height: var(--x-leading); font-size: var(--x-text-sm); text-wrap: pretty; }
.x-empty__actions { margin-block-start: var(--x-space-3); display: flex; gap: var(--x-space-2); flex-wrap: wrap; justify-content: center; }
</style>
