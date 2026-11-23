import { defineStore } from 'pinia'
import { ApiError, getTenantCookie, loggedUser, login, logout, setTenantCookie, tenantLookup } from '@/lib/api'

const ORG_KEY = 'clinza.org'

function readOrg(): { code: string; name: string } | null {
  try {
    const raw = localStorage.getItem(ORG_KEY)
    return raw ? (JSON.parse(raw) as { code: string; name: string }) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as string | null,
    org: readOrg(),
    checked: false,
  }),
  actions: {
    async lookup(code: string) {
      const clean = code.trim()
      if (!/^\d{4,8}$/.test(clean)) throw new ApiError('Enter your clinic code (the number you got at signup).', { code: 'BAD_CODE' })
      setTenantCookie(clean)
      const res = await tenantLookup(clean)
      if (!res?.organization_name) {
        setTenantCookie('')
        throw new ApiError("We couldn't find an active clinic with that code.", { code: 'UNKNOWN_TENANT' })
      }
      this.org = { code: clean, name: res.organization_name }
      try {
        localStorage.setItem(ORG_KEY, JSON.stringify(this.org))
      } catch {
        /* private mode: remembered for this tab only */
      }
    },
    forgetOrg() {
      this.org = null
      setTenantCookie('')
      try {
        localStorage.removeItem(ORG_KEY)
      } catch {
        /* ignore */
      }
    },
    async signIn(email: string, password: string) {
      if (!this.org) throw new ApiError('Enter your clinic code first.')
      setTenantCookie(this.org.code)
      await login(email.trim(), password)
      this.user = email.trim().toLowerCase()
    },
    async checkSession() {
      if (this.org && !getTenantCookie()) setTenantCookie(this.org.code)
      const who = this.org ? await loggedUser() : 'Guest'
      this.user = who && who !== 'Guest' ? who : null
      this.checked = true
    },
    async signOut() {
      await logout()
      this.user = null
    },
  },
})
