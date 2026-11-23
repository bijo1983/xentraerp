<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Activity, CalendarDays, ConciergeBell, FileHeart, LayoutDashboard, LogOut, Receipt, Settings2, ShieldCheck, Stethoscope, Users } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useClinicStore } from '@/stores/clinic'
import type { Cap } from '@/lib/types'
import ClinzaMark from '@/components/ClinzaMark.vue'

const auth = useAuthStore()
const store = useClinicStore()
const router = useRouter()

const NAV: { to: string; label: string; icon: unknown; cap?: Cap }[] = [
  { to: '/today', label: 'Today', icon: LayoutDashboard },
  { to: '/front-desk', label: 'Front desk', icon: ConciergeBell, cap: 'appointments' },
  { to: '/triage', label: 'Triage', icon: Activity, cap: 'triage' },
  { to: '/consult', label: 'Consultations', icon: Stethoscope, cap: 'chart' },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays, cap: 'appointments' },
  { to: '/patients', label: 'Patients', icon: Users, cap: 'patients' },
  { to: '/billing', label: 'Billing', icon: Receipt, cap: 'billing' },
  { to: '/claims', label: 'Insurance claims', icon: ShieldCheck, cap: 'claims' },
  { to: '/setup', label: 'Setup', icon: Settings2, cap: 'setup' },
]
const items = computed(() => NAV.filter((n) => !n.cap || store.can(n.cap)))
const clinicType = computed(() => store.ctx?.catalog.clinic_types.find((c) => c.code === store.settings?.clinic_type)?.label)

async function signOut() {
  await auth.signOut()
  store.reset()
  router.push({ name: 'signin' })
}
</script>

<template>
  <div class="shell">
    <aside class="side no-print">
      <div class="brand">
        <ClinzaMark :size="34" />
        <div>
          <div class="brand__name">CLINZA</div>
          <div class="brand__org">{{ store.settings?.clinic_name || auth.org?.name }}</div>
        </div>
      </div>
      <nav class="nav" aria-label="Main">
        <router-link v-for="n in items" :key="n.to" :to="n.to" class="nav__item" active-class="is-active">
          <component :is="n.icon" :size="18" :stroke-width="2" aria-hidden="true" />
          <span>{{ n.label }}</span>
        </router-link>
      </nav>
      <div class="side__foot">
        <div v-if="clinicType" class="side__type"><FileHeart :size="14" aria-hidden="true" /> {{ clinicType }}</div>
        <div class="me">
          <div class="me__avatar" aria-hidden="true">{{ (store.ctx?.full_name || auth.user || '?').slice(0, 1).toUpperCase() }}</div>
          <div class="grow">
            <div class="me__name">{{ store.ctx?.full_name || auth.user }}</div>
            <div class="me__mail">{{ auth.user }}</div>
          </div>
          <button type="button" class="me__out" aria-label="Sign out" title="Sign out" @click="signOut"><LogOut :size="17" /></button>
        </div>
      </div>
    </aside>
    <main class="main"><slot /></main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); min-height: 100dvh; }
.side { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; gap: var(--x-space-4); padding: var(--x-space-5) var(--x-space-3); background: var(--x-surface); border-inline-end: 1px solid var(--x-border); }
.brand { display: flex; align-items: center; gap: var(--x-space-3); padding: 0 var(--x-space-2); }
.brand__name { font-family: var(--x-font-display); font-weight: 800; letter-spacing: 0.08em; font-size: 17px; }
.brand__org { font-size: var(--x-text-xs); color: var(--x-text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav__item { position: relative; display: flex; align-items: center; gap: var(--x-space-3); padding: 10px 12px; border-radius: var(--x-radius-md); color: var(--x-text-muted); text-decoration: none; font-weight: 600; }
.nav__item:hover { background: var(--x-surface-3); color: var(--x-text); }
.nav__item.is-active { background: var(--x-primary-soft); color: var(--x-primary-text); }
.nav__item.is-active::before { content: ''; position: absolute; inset-inline-start: -12px; top: 8px; bottom: 8px; width: 3px; border-radius: 3px; background: var(--x-primary); }
.side__foot { margin-top: auto; display: flex; flex-direction: column; gap: var(--x-space-3); }
.side__type { display: flex; align-items: center; gap: 6px; font-size: var(--x-text-xs); color: var(--x-primary-text); background: var(--x-primary-soft); border-radius: var(--x-radius-md); padding: 8px 10px; font-weight: 600; }
.me { display: flex; align-items: center; gap: var(--x-space-2); padding: var(--x-space-2); border-radius: var(--x-radius-md); border: 1px solid var(--x-border); }
.me__avatar { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--x-brand-gradient); color: #fff; font-weight: 700; flex: none; }
.me__name { font-weight: 600; font-size: var(--x-text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.me__mail { font-size: 11px; color: var(--x-text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.me__out { border: 0; background: transparent; color: var(--x-text-muted); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: grid; place-items: center; }
.me__out:hover { background: var(--x-surface-3); }
.main { min-width: 0; }
@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .side { position: sticky; z-index: var(--x-z-shell); height: auto; flex-direction: row; align-items: center; padding: var(--x-space-2) var(--x-space-3); border-inline-end: 0; border-bottom: 1px solid var(--x-border); overflow-x: auto; }
  .brand__org, .side__type, .me__name, .me__mail, .me__avatar, .nav__item span { display: none; }
  .nav { flex-direction: row; overflow-x: auto; min-width: 0; }
  .nav__item.is-active::before { display: none; }
  .side__foot { margin-top: 0; margin-inline-start: auto; }
  .me { border: 0; padding: 0; }
}
</style>
