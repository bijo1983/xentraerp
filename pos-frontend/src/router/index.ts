import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePosStore } from '@/stores/pos'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/registers', name: 'registers', component: () => import('@/views/RegisterSelectView.vue') },
    { path: '/shift', name: 'shift', component: () => import('@/views/ShiftView.vue') },
    // Retail counter sale (also available in F&B mode for quick sales).
    { path: '/terminal', name: 'terminal', component: () => import('@/views/TerminalView.vue') },
    // F&B table service.
    { path: '/floor', name: 'floor', component: () => import('@/views/FloorView.vue') },
    { path: '/order/:id', name: 'order', component: () => import('@/views/OrderView.vue') },
    { path: '/kitchen', name: 'kitchen', component: () => import('@/views/KitchenView.vue') },
    { path: '/admin', name: 'admin', component: () => import('@/views/AdminView.vue') },
    { path: '/', redirect: '/registers' },
  ],
})

let sessionChecked = false
// Screens that ring up sales — they need a register and (if the organization
// requires it) an open shift.
const SELLING = new Set(['terminal', 'floor', 'order'])

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const pos = usePosStore()

  if (!sessionChecked) {
    await auth.checkSession()
    sessionChecked = true
  }

  if (to.name !== 'login' && !auth.user) {
    return { name: 'login' }
  }
  if (auth.user && !pos.loaded) {
    try {
      await pos.load()
    } catch {
      // A user without POS access (no PIN, not an admin) lands back on login.
      auth.user = null
      return { name: 'login' }
    }
  }
  if (to.name === 'login' && auth.user) {
    return { name: 'registers' }
  }
  // Kitchen staff only ever see the kitchen board.
  if (pos.settings?.level === 'kitchen' && !['kitchen', 'registers', 'login'].includes(String(to.name))) {
    return auth.posProfile ? { name: 'kitchen' } : { name: 'registers' }
  }
  // Counter sales and the shift drawer are for people who bill; waiters take orders on the floor.
  if (to.name === 'terminal' && !pos.can('bill')) return { name: pos.isFnb ? 'floor' : 'registers' }
  if (to.name === 'shift' && !pos.can('shift')) return { name: pos.isFnb ? 'floor' : 'registers' }
  if (SELLING.has(String(to.name)) || to.name === 'shift') {
    if (!auth.posProfile) return { name: 'registers' }
  }
  if (SELLING.has(String(to.name)) && pos.needsShift) {
    return { name: 'shift' }
  }
  if ((to.name === 'floor' || to.name === 'order' || to.name === 'kitchen') && !pos.isFnb) {
    return { name: 'terminal' }
  }
  if (to.name === 'admin' && !pos.canManage) {
    return { name: 'registers' }
  }
  return true
})

export default router
