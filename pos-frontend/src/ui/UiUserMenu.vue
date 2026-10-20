<script setup lang="ts">
import type { Component } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
// The signed-in person's menu (shell header). Items are filtered by the caller.
import { computed, nextTick, ref } from 'vue'
import { t } from '@/lib/i18n'

export interface UserMenuItem { key: string; label: string; hint?: string; icon?: string | Component; danger?: boolean }
const props = defineProps<{ name: string; role?: string; items: UserMenuItem[] }>()
const emit = defineEmits<{ (e: 'select', key: string): void }>()
const open = ref(false)
const menu = ref<HTMLElement | null>(null)
const initials = computed(() => props.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?')

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    menu.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }
}
function pick(key: string) {
  open.value = false
  emit('select', key)
}
function onKey(e: KeyboardEvent) {
  const items = Array.from(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [])
  const i = items.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'Escape') open.value = false
  else if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus()
  else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus()
  else return
  e.preventDefault()
}
</script>

<template>
  <div class="x-umenu" @keydown="onKey">
    <button type="button" class="x-umenu__btn" :aria-expanded="open" aria-haspopup="menu" :aria-label="t('shell.accountMenu')" @click="toggle">
      <span class="x-umenu__avatar" aria-hidden="true">{{ initials }}</span>
      <span class="x-umenu__who">
        <b>{{ name }}</b>
        <small v-if="role">{{ role }}</small>
      </span>
      <ChevronDown :size="16" aria-hidden="true" class="x-umenu__caret" />
    </button>
    <div v-if="open" class="x-umenu__back" @click="open = false" />
    <ul v-if="open" ref="menu" class="x-umenu__list" role="menu">
      <li v-for="it in items" :key="it.key" role="none">
        <button type="button" role="menuitem" class="x-umenu__item" :class="{ danger: it.danger }" @click="pick(it.key)">
          <span class="x-umenu__icon" aria-hidden="true"><component :is="it.icon" v-if="it.icon && typeof it.icon !== 'string'" :size="18" /><template v-else>{{ it.icon || '•' }}</template></span>
          <span><b>{{ it.label }}</b><small v-if="it.hint">{{ it.hint }}</small></span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.x-umenu { position: relative; }
.x-umenu__btn { display: flex; align-items: center; gap: var(--x-space-2); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); border-radius: var(--x-radius-full); padding: 4px var(--x-space-3) 4px 4px; min-height: 40px; font: inherit; cursor: pointer; }
.x-umenu__caret { color: var(--x-text-muted); }
.x-umenu__avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--x-brand-gradient); color: #fff; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.x-umenu__who { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.15; text-align: start; }
.x-umenu__who b { font-size: var(--x-text-sm); }
.x-umenu__who small { font-size: 11px; color: var(--x-text-muted); }
.x-umenu__back { position: fixed; inset: 0; z-index: calc(var(--x-z-shell) + 1); }
.x-umenu__list { position: absolute; inset-inline-end: 0; inset-block-start: calc(100% + 6px); z-index: calc(var(--x-z-shell) + 2); min-width: 280px; margin: 0; padding: var(--x-space-2); list-style: none; background: var(--x-surface); border: 1px solid var(--x-border); border-radius: var(--x-radius-lg); box-shadow: var(--x-shadow-lg); }
.x-umenu__item { display: flex; gap: var(--x-space-3); align-items: center; width: 100%; text-align: start; border: 0; background: transparent; color: var(--x-text); font: inherit; padding: var(--x-space-2) var(--x-space-3); min-height: var(--x-touch); border-radius: var(--x-radius-md); cursor: pointer; }
.x-umenu__item:hover, .x-umenu__item:focus-visible { background: var(--x-surface-2); }
.x-umenu__item span:last-child { display: flex; flex-direction: column; }
.x-umenu__item small { color: var(--x-text-muted); font-size: 12px; }
.x-umenu__item.danger { color: var(--x-danger-text); }
.x-umenu__icon { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--x-surface-3); color: var(--x-text-muted); flex: none; }
.x-umenu__item.danger .x-umenu__icon { background: var(--x-danger-soft); color: var(--x-danger); }
</style>
