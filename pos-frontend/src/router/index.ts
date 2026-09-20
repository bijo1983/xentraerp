import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/registers', name: 'registers', component: () => import('@/views/RegisterSelectView.vue') },
    { path: '/terminal', name: 'terminal', component: () => import('@/views/TerminalView.vue') },
    { path: '/', redirect: '/registers' },
  ],
})

let sessionChecked = false

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!sessionChecked) {
    await auth.checkSession()
    sessionChecked = true
  }

  if (to.name !== 'login' && !auth.user) {
    return { name: 'login' }
  }
  if (to.name === 'terminal' && !auth.posProfile) {
    return { name: 'registers' }
  }
  if (to.name === 'login' && auth.user) {
    return { name: auth.posProfile ? 'terminal' : 'registers' }
  }
  return true
})

export default router
