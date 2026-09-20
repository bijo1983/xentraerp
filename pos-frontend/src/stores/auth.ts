import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import { usePosStore } from '@/stores/pos'

interface POSUser {
  name: string
  email: string
  full_name: string
  user_image: string
  roles: string[]
}

export interface POSProfileSummary {
  name: string
  company: string
  currency: string
  customer: string | null
  payment_methods: string[]
  selling_price_list: string | null
}

interface AuthState {
  orgName: string | null
  user: POSUser | null
  // The register a PIN is locked to, if the admin restricted it (see
  // custom_erp.api.pos.set_pin's pos_profile arg) — just a name, since
  // pin_login only knows the restriction, not the full profile record.
  // Null means the cashier picks any register.
  restrictedProfile: string | null
  // The register actually selected for this session (full details, so the
  // terminal doesn't need a second fetch) — set once, in RegisterSelectView.
  posProfile: POSProfileSummary | null
  loading: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    orgName: null,
    user: null,
    restrictedProfile: null,
    posProfile: null,
    loading: true,
    error: null,
  }),

  actions: {
    // Step 1 of PIN login: validate the tenant code exists and is active,
    // against the control-plane site — same tenant_lookup endpoint the
    // back-office tenant-code login already uses.
    async lookupTenant(tenantCode: string) {
      this.error = null
      api.setTenantCookie('')
      const res = await api.call<{ organization_name: string }>('custom_erp.api.signup.tenant_lookup', {
        tenant_code: tenantCode,
      })
      this.orgName = res.organization_name
      // Everything after this point (the PIN check itself) routes to the
      // tenant's own site.
      api.setTenantCookie(tenantCode)
    },

    // Step 2: the actual PIN check, on the tenant's own site.
    async pinLogin(pin: string) {
      this.loading = true
      this.error = null
      try {
        const result = await api.call<{ user: POSUser; pos_profile: string | null }>('custom_erp.api.pos.pin_login', {
          pin,
        })
        this.user = result.user
        this.restrictedProfile = result.pos_profile
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Incorrect PIN'
        throw err
      } finally {
        this.loading = false
      }
    },

    async checkSession() {
      try {
        const username = await api.getLoggedUser()
        if (!username || username === 'Guest') {
          this.user = null
          this.loading = false
          return
        }
        const userData = await api.getDoc<{
          name: string
          email: string
          full_name: string
          user_image: string
          roles?: { role: string }[]
        }>('User', username)
        this.user = {
          name: userData.name,
          email: userData.email,
          full_name: userData.full_name,
          user_image: userData.user_image,
          roles: (userData.roles || []).map((r) => r.role),
        }
      } catch {
        this.user = null
      } finally {
        this.loading = false
      }
    },

    async logout() {
      await api.logout().catch(() => {})
      api.setTenantCookie('')
      this.user = null
      this.orgName = null
      this.restrictedProfile = null
      this.posProfile = null
      usePosStore().reset()
    },
  },
})
