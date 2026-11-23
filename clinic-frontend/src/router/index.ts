import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useClinicStore } from '@/stores/clinic'
import { ApiError } from '@/lib/api'
import type { Cap } from '@/lib/types'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    bare?: boolean
    cap?: Cap
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'signin', component: () => import('@/views/SignInView.vue'), meta: { public: true, bare: true } },
    { path: '/today', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
    { path: '/appointments', name: 'appointments', component: () => import('@/views/AppointmentsView.vue'), meta: { cap: 'appointments' } },
    { path: '/patients', name: 'patients', component: () => import('@/views/PatientsView.vue'), meta: { cap: 'patients' } },
    { path: '/patients/:id', name: 'patient', component: () => import('@/views/PatientView.vue'), meta: { cap: 'patients' } },
    { path: '/visit/:id', name: 'encounter', component: () => import('@/views/EncounterView.vue') },
    { path: '/billing', name: 'billing', component: () => import('@/views/BillingView.vue'), meta: { cap: 'billing' } },
    { path: '/claims', name: 'claims', component: () => import('@/views/ClaimsView.vue'), meta: { cap: 'claims' } },
    { path: '/setup', name: 'setup', component: () => import('@/views/SetupView.vue'), meta: { cap: 'setup' } },
    { path: '/print/:kind/:id', name: 'print', component: () => import('@/views/PrintView.vue'), meta: { bare: true } },
    { path: '/unavailable', name: 'unavailable', component: () => import('@/views/StateView.vue'), meta: { bare: true, public: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/StateView.vue'), meta: { public: true, bare: true } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const store = useClinicStore()
  if (!auth.checked) await auth.checkSession()
  if (!auth.user) {
    if (to.meta.public) return true
    return { name: 'signin', query: to.fullPath !== '/' ? { next: to.fullPath } : {} }
  }
  if (!store.ctx) {
    try {
      await store.load()
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'ERROR'
      if (to.name === 'unavailable') return true
      return { name: 'unavailable', query: { reason: code } }
    }
  }
  if (to.name === 'signin') return { name: store.ctx?.configured ? 'dashboard' : store.can('setup') ? 'setup' : 'dashboard' }
  if (to.meta.cap && !store.can(to.meta.cap)) return { name: 'dashboard' }
  return true
})

export default router
