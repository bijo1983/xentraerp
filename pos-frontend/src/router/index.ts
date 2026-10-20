import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePosStore } from '@/stores/pos'
import { ApiError } from '@/lib/api'
import { effectiveMode, guardRoute, landingRoute } from '@/lib/nav'
import { currentNavContext, ensureImplicitRegister } from '@/composables/useSessionBoot'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    state?: 'unavailable' | 'permission' | 'notfound'
    bare?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Public landing page with the sign-in panel on the right (Phase 1).
    { path: '/', name: 'landing', component: () => import('@/views/LandingView.vue'), meta: { public: true, bare: true } },
    // Old links / bookmarks.
    { path: '/login', redirect: '/' },
    { path: '/registers', name: 'registers', component: () => import('@/views/RegisterSelectView.vue') },
    { path: '/shift', name: 'shift', component: () => import('@/views/ShiftView.vue') },
    // Retail counter sale (also available in F&B mode for quick sales).
    { path: '/terminal', name: 'terminal', component: () => import('@/views/TerminalView.vue') },
    // F&B table service.
    { path: '/floor', name: 'floor', component: () => import('@/views/FloorView.vue') },
    { path: '/order/:id', name: 'order', component: () => import('@/views/OrderView.vue') },
    { path: '/kitchen', name: 'kitchen', component: () => import('@/views/KitchenView.vue') },
    { path: '/admin', name: 'admin', component: () => import('@/views/AdminView.vue') },
    { path: '/unavailable', name: 'unavailable', component: () => import('@/views/SystemStateView.vue'), meta: { state: 'unavailable' } },
    { path: '/denied', name: 'denied', component: () => import('@/views/SystemStateView.vue'), meta: { state: 'permission' } },
    ...(import.meta.env.DEV ? [{ path: '/ui-kit', name: 'ui-kit', component: () => import('@/views/UiKitView.vue'), meta: { public: true, bare: true } }] : []),
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/SystemStateView.vue'), meta: { state: 'notfound', public: true } },
  ],
})

let sessionChecked = false

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const pos = usePosStore()

  if (!sessionChecked) {
    await auth.checkSession()
    sessionChecked = true
  }

  if (!auth.user) {
    if (to.meta.public) return true
    return { name: 'landing', query: to.fullPath && to.fullPath !== '/' ? { next: to.fullPath } : {} }
  }

  if (!pos.loaded) {
    try {
      await pos.load(auth.posProfile?.name ?? null)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'POS_NOT_ENTITLED') return to.name === 'unavailable' ? true : { name: 'unavailable', query: { reason: 'plan' } }
      // A user without POS access (no PIN, not an administrator) lands back on the sign-in.
      auth.user = null
      return to.meta.public ? true : { name: 'landing' }
    }
  }

  // Order takers and kitchen screens never pick a register: it is chosen for them.
  const mode = effectiveMode({ level: pos.settings?.level ?? null, mode: pos.settings?.session?.mode ?? null })
  if ((mode === 'order' || mode === 'kitchen') && !auth.posProfile) {
    await ensureImplicitRegister().catch(() => false)
  }

  const ctx = currentNavContext()
  if (to.name === 'landing') return landingRoute(ctx)
  if (to.name === 'not-found' || to.name === 'unavailable' || to.name === 'denied' || to.name === 'ui-kit') return true
  const decision = guardRoute(String(to.name), ctx)
  return decision === true ? true : decision
})

export default router
