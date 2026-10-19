<script setup lang="ts">
// The status bar on every signed-in screen: organization, branch, register + shift (till
// sessions only), user/role, online/offline, printer, notices, language, theme, user menu,
// and the navigation the person's role and device allow (lib/nav.ts).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import brandMark from '@/assets/brand-mark.png'
import { useAuthStore } from '@/stores/auth'
import { usePosStore } from '@/stores/pos'
import { usePrinterStore } from '@/stores/printer'
import { useNetworkStore } from '@/stores/network'
import { useUiStore, type ThemePref } from '@/stores/ui'
import { effectiveMode, visibleNav } from '@/lib/nav'
import { t } from '@/lib/i18n'
import { UiBanner, UiStatusBadge, UiUserMenu } from '@/ui'
import type { UserMenuItem } from '@/ui/UiUserMenu.vue'
import LocaleSwitch from './LocaleSwitch.vue'
import MySessionsDrawer from './MySessionsDrawer.vue'

const auth = useAuthStore()
const pos = usePosStore()
const printer = usePrinterStore()
const net = useNetworkStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const bar = ref<HTMLElement | null>(null)
const sessionsOpen = ref(false)
const noticesOpen = ref(false)

const ctx = computed(() => ({ ...pos.navContext, hasRegister: !!auth.posProfile }))
const mode = computed(() => effectiveMode(ctx.value))
const tillSession = computed(() => mode.value === 'till' || mode.value === 'manager')
const nav = computed(() => visibleNav(ctx.value))
const name = computed(() => auth.user?.full_name || auth.user?.name || '')
const branch = computed(() => auth.posProfile?.location_name || auth.posProfile?.location || pos.settings?.location || auth.session?.device?.location_name || '')
const canTheme = computed(() => ['admin', 'supervisor'].includes(pos.settings?.level || ''))
const printerOk = computed(() => printer.method === 'browser' || !!printer.connected)

const notices = computed(() => {
  const out: { tone: 'warning' | 'info' | 'danger'; text: string }[] = []
  if (!net.online) out.push({ tone: 'danger', text: t('offline.banner') })
  const exp = auth.session?.expires_at
  if (exp && exp * 1000 - Date.now() < 15 * 60_000) out.push({ tone: 'warning', text: t('shell.expiresSoon') })
  if (tillSession.value && pos.can('shift') && pos.settings?.require_shift && !pos.shift) out.push({ tone: 'info', text: t('shell.noShift') })
  if (!printerOk.value) out.push({ tone: 'warning', text: t('shell.printerDisconnected') })
  return out
})

const menuItems = computed<UserMenuItem[]>(() => {
  const items: UserMenuItem[] = []
  if (tillSession.value && pos.can('shift')) items.push({ key: 'shift', label: pos.shift ? t('menu.closeShift') : t('menu.openShift'), icon: pos.shift ? '■' : '▶' })
  if (mode.value !== 'kitchen') items.push({ key: 'lock', label: t('menu.lock'), hint: t('menu.lockHint'), icon: '🔒' })
  items.push({ key: 'switch', label: t('menu.switchUser'), hint: t('menu.switchUserHint'), icon: '⇄' })
  if (tillSession.value) items.push({ key: 'register', label: t('menu.switchRegister'), icon: '▤' })
  if (pos.canManage) items.push({ key: 'admin', label: t('menu.settings'), icon: '⚙' })
  items.push({ key: 'sessions', label: t('menu.sessions'), hint: t('menu.sessionsHint'), icon: '⌁' })
  items.push({ key: 'signout', label: t('menu.signOut'), icon: '⏻', danger: true })
  return items
})

async function onMenu(key: string) {
  if (key === 'shift') router.push('/shift')
  else if (key === 'admin') router.push('/admin')
  else if (key === 'sessions') sessionsOpen.value = true
  else if (key === 'lock') await auth.lock()
  else if (key === 'register') {
    auth.posProfile = null
    await pos.load(null).catch(() => undefined)
    router.push('/registers')
  } else if (key === 'switch') {
    await auth.switchUser()
    router.push('/')
  } else if (key === 'signout') {
    await auth.logout()
    router.push('/')
  }
}

let observer: ResizeObserver | undefined
function publishHeight() {
  document.documentElement.style.setProperty('--shell-h', `${bar.value?.offsetHeight || 0}px`)
}
onMounted(() => {
  publishHeight()
  if (typeof ResizeObserver !== 'undefined' && bar.value) {
    observer = new ResizeObserver(publishHeight)
    observer.observe(bar.value)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  document.documentElement.style.setProperty('--shell-h', '0px')
})
</script>

<template>
  <div ref="bar" class="shell">
    <header class="shell__bar">
      <a class="shell__brand" href="#" :aria-label="t('shell.home')" @click.prevent="router.push(nav[0]?.path || '/')">
        <img :src="brandMark" alt="" width="28" height="28" />
        <span class="shell__org">{{ auth.orgName || 'XentraERP' }}</span>
      </a>
      <div class="shell__ctx">
        <span v-if="branch" class="shell__chip" :title="t('shell.branch')">⌂ {{ branch }}</span>
        <span v-if="tillSession && auth.posProfile" class="shell__chip" :title="t('shell.register')">🧾 {{ auth.posProfile.name }}</span>
        <UiStatusBadge v-if="tillSession && pos.can('shift')" size="sm" :tone="pos.shift ? 'success' : 'neutral'">{{ pos.shift ? t('shell.shiftOpen') : t('shell.shiftClosed') }}</UiStatusBadge>
        <UiStatusBadge v-if="mode === 'order'" size="sm" tone="primary">{{ t('shell.orderMode') }}</UiStatusBadge>
      </div>
      <nav class="shell__nav" :aria-label="t('shell.nav')">
        <a v-for="n in nav" :key="n.name" :href="n.path" :class="{ on: route.path.startsWith(n.path) }" :aria-current="route.path.startsWith(n.path) ? 'page' : undefined" @click.prevent="router.push(n.path)">
          <span aria-hidden="true">{{ n.icon }}</span> {{ t(n.labelKey) }}
        </a>
      </nav>
      <div class="shell__status">
        <UiStatusBadge size="sm" :tone="net.online ? 'success' : 'danger'" :icon="net.online ? '●' : '○'">{{ net.online ? t('shell.online') : t('shell.offline') }}</UiStatusBadge>
        <UiStatusBadge size="sm" :tone="printerOk ? 'neutral' : 'warning'" icon="🖨">{{ printerOk ? t('shell.printerReady') : t('shell.printerOff') }}</UiStatusBadge>
        <button type="button" class="shell__icon" :aria-label="t('shell.notices', { n: notices.length })" :aria-expanded="noticesOpen" @click="noticesOpen = !noticesOpen">
          🔔<span v-if="notices.length" class="shell__count">{{ notices.length }}</span>
        </button>
        <LocaleSwitch />
        <label v-if="canTheme" class="shell__theme">
          <span class="x-sr-only">{{ t('shell.theme') }}</span>
          <select :value="ui.theme" :aria-label="t('shell.theme')" @change="ui.setTheme(($event.target as HTMLSelectElement).value as ThemePref)">
            <option value="light">{{ t('shell.themeLight') }}</option>
            <option value="dark">{{ t('shell.themeDark') }}</option>
            <option value="system">{{ t('shell.themeSystem') }}</option>
          </select>
        </label>
        <UiUserMenu :name="name" :role="pos.roleLabel" :items="menuItems" @select="onMenu" />
      </div>
    </header>
    <div v-if="!net.online" class="shell__banner">
      <UiBanner tone="danger" :title="t('offline.title')">{{ t('offline.banner') }}</UiBanner>
    </div>
    <div v-if="noticesOpen" class="shell__notices" role="region" :aria-label="t('shell.noticesTitle')">
      <p v-if="!notices.length" class="shell__none">{{ t('shell.noNotices') }}</p>
      <UiBanner v-for="(n, i) in notices" :key="i" :tone="n.tone">{{ n.text }}</UiBanner>
    </div>
    <MySessionsDrawer v-if="sessionsOpen" :open="sessionsOpen" @close="sessionsOpen = false" />
  </div>
</template>

<style scoped>
.shell { position: sticky; top: 0; z-index: var(--x-z-shell); background: var(--x-surface); border-block-end: 1px solid var(--x-border); }
.shell__bar { display: flex; align-items: center; gap: var(--x-space-3); padding: 6px var(--x-space-4); min-height: 52px; flex-wrap: wrap; }
.shell__brand { display: flex; align-items: center; gap: var(--x-space-2); text-decoration: none; color: var(--x-text); font-weight: 700; font-family: var(--x-font-display); }
.shell__brand img { border-radius: 7px; }
.shell__org { max-width: 22ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shell__ctx { display: flex; align-items: center; gap: var(--x-space-2); flex-wrap: wrap; }
.shell__chip { font-size: var(--x-text-xs); color: var(--x-text-muted); background: var(--x-surface-3); padding: 5px 10px; border-radius: var(--x-radius-full); white-space: nowrap; }
.shell__nav { display: flex; gap: 2px; flex: 1; overflow-x: auto; }
.shell__nav a { display: inline-flex; align-items: center; gap: 6px; padding: 0 var(--x-space-3); min-height: 40px; border-radius: var(--x-radius-md); color: var(--x-text-muted); text-decoration: none; font-weight: 600; font-size: var(--x-text-sm); white-space: nowrap; }
.shell__nav a.on { background: var(--x-primary-soft); color: var(--x-primary-text); }
.shell__status { display: flex; align-items: center; gap: var(--x-space-2); flex-wrap: wrap; margin-inline-start: auto; }
.shell__icon { position: relative; border: 1px solid var(--x-border); background: var(--x-surface); border-radius: 50%; width: 40px; height: 40px; cursor: pointer; }
.shell__count { position: absolute; inset-block-start: -4px; inset-inline-end: -4px; min-width: 18px; height: 18px; border-radius: 9px; background: var(--x-danger); color: #fff; font-size: 11px; font-weight: 700; display: grid; place-items: center; }
.shell__theme select { min-height: 40px; border-radius: var(--x-radius-full); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); padding: 0 var(--x-space-3); font: inherit; font-size: var(--x-text-sm); }
.shell__banner, .shell__notices { padding: 0 var(--x-space-4) var(--x-space-2); display: flex; flex-direction: column; gap: var(--x-space-2); }
.shell__none { margin: 0; color: var(--x-text-muted); font-size: var(--x-text-sm); }
@media (max-width: 767px) {
  .shell__ctx, .shell__status :deep(.x-badge) { display: none; }
  .shell__nav { order: 3; flex-basis: 100%; }
}
</style>
