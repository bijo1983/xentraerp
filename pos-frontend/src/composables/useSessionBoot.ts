// After sign-in (or a page reload with a live session): load the POS settings and decide
// where this person goes, picking the register silently for order-taking and kitchen
// sessions (they never see the register picker).
import type { Router } from 'vue-router'
import { api } from '@/lib/api'
import { effectiveMode, landingRoute } from '@/lib/nav'
import { useAuthStore, type POSProfileSummary } from '@/stores/auth'
import { usePosStore } from '@/stores/pos'

export async function ensureImplicitRegister(): Promise<boolean> {
  const auth = useAuthStore()
  const pos = usePosStore()
  if (auth.posProfile) return true
  const profiles = await api.call<POSProfileSummary[]>('custom_erp.api.pos.list_pos_profiles')
  const want = pos.settings?.session?.default_register || auth.session?.default_register || auth.restrictedProfile
  const match = profiles.find((p) => p.name === want) || profiles[0]
  if (!match) return false
  auth.posProfile = match
  await pos.load(match.name)
  return true
}

export function currentNavContext() {
  const auth = useAuthStore()
  const pos = usePosStore()
  return { ...pos.navContext, hasRegister: !!auth.posProfile }
}

export async function routeAfterSignIn(router: Router, next?: string | null) {
  const pos = usePosStore()
  await pos.load(null)
  const mode = effectiveMode({ level: pos.settings?.level ?? null, mode: pos.settings?.session?.mode ?? null })
  if (mode === 'order' || mode === 'kitchen') await ensureImplicitRegister()
  const ctx = currentNavContext()
  if (next && next !== '/' && !next.startsWith('/registers')) {
    await router.push(next)
    return
  }
  await router.push(mode === 'till' || mode === 'manager' ? (ctx.hasRegister ? landingRoute(ctx) : '/registers') : landingRoute(ctx))
}
