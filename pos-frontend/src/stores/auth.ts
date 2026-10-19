// Sign-in state: organization -> device -> staff identity + PIN (or management sign-in
// with password + authenticator code) -> session. See custom_erp.api.pos_auth.
import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import { readJson, writeJson } from '@/lib/storage'
import { usePosStore } from '@/stores/pos'

export interface POSUser {
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
  location?: string | null
  location_name?: string | null
}

export interface DeviceInfo {
  registered: boolean
  id?: string
  label?: string
  type?: 'Till' | 'Order Taking' | 'Kitchen Display'
  location?: string | null
  location_name?: string | null
  register?: string | null
}

export interface SessionSummary {
  pos_session: boolean
  id?: string
  kind?: 'PIN' | 'Management'
  mode: 'till' | 'order' | 'kitchen' | 'manager' | null
  device?: DeviceInfo
  needs_register?: boolean
  default_register?: string | null
  locked?: boolean
  expires_at?: number | null
  idle_lock_minutes?: number
}

export interface StaffTile {
  staff: string
  name: string
  initials: string
}

export interface LoginContext {
  device: DeviceInfo
  require_registered_device: boolean
  can_sign_in: boolean
  staff: StaffTile[]
  pin_min: number
  pin_max: number
  company?: string | null
  device_types: string[]
}

export type ManagementResult =
  | { status: 'ok'; user: POSUser; session: SessionSummary }
  | { status: 'otp_required' }
  | { status: 'enroll'; enroll_token: string; secret: string; otpauth_uri: string; qr_svg_base64: string }

interface RememberedOrg {
  code: string
  name: string
}

const ORG_KEY = 'xpos.org'
const AUTH = 'custom_erp.api.pos_auth.'

interface AuthState {
  orgName: string | null
  tenantCode: string | null
  rememberOrg: boolean
  user: POSUser | null
  restrictedProfile: string | null
  posProfile: POSProfileSummary | null
  session: SessionSummary | null
  context: LoginContext | null
  locked: boolean
  expiredNotice: boolean
  loading: boolean
  error: string | null
}

function remembered(): RememberedOrg | null {
  return readJson<RememberedOrg | null>(ORG_KEY, null) || readJson<RememberedOrg | null>(ORG_KEY, null, 'session')
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => {
    const org = remembered()
    return {
      orgName: org?.name ?? null,
      tenantCode: org?.code ?? null,
      rememberOrg: !!readJson<RememberedOrg | null>(ORG_KEY, null),
      user: null,
      restrictedProfile: null,
      posProfile: null,
      session: null,
      context: null,
      locked: false,
      expiredNotice: false,
      loading: true,
      error: null,
    }
  },

  getters: {
    isManagement: (s) => s.session?.kind === 'Management',
  },

  actions: {
    /** Step 1, on the control-plane site: is this organization code usable? */
    async lookupOrganization(code: string, remember: boolean) {
      this.error = null
      api.setTenantCookie('')
      const res = await api.call<{ organization_name: string; tenant_code: string }>(AUTH + 'lookup_organization', { tenant_code: code.trim() })
      this.orgName = res.organization_name
      this.tenantCode = res.tenant_code
      this.rememberOrg = remember
      // Remember on trusted devices only; otherwise just for this browser tab.
      writeJson(ORG_KEY, remember ? { code: res.tenant_code, name: res.organization_name } : null)
      writeJson(ORG_KEY, remember ? null : { code: res.tenant_code, name: res.organization_name }, 'session')
      // Everything after this point routes to the tenant's own site.
      api.setTenantCookie(res.tenant_code)
    },

    forgetOrganization() {
      writeJson(ORG_KEY, null)
      writeJson(ORG_KEY, null, 'session')
      api.setTenantCookie('')
      this.orgName = null
      this.tenantCode = null
      this.context = null
    },

    /** Step 2, on the tenant site: device registration + staff picker. */
    async loadContext() {
      if (this.tenantCode) api.setTenantCookie(this.tenantCode)
      this.context = await api.call<LoginContext>(AUTH + 'login_context')
      return this.context
    },

    async registerDevice(code: string) {
      const device = await api.call<DeviceInfo>(AUTH + 'register_device', { code })
      await this.loadContext()
      return device
    },

    async pinLogin(staff: string, pin: string) {
      this.error = null
      const result = await api.call<{ user: POSUser; pos_profile: string | null; session: SessionSummary }>(AUTH + 'pin_login', { staff, pin })
      this.user = result.user
      this.restrictedProfile = result.pos_profile
      this.session = result.session
      this.locked = false
      this.expiredNotice = false
      usePosStore().reset()
    },

    async managementLogin(usr: string, pwd: string, otp?: string, enrollToken?: string): Promise<ManagementResult> {
      this.error = null
      const res = await api.call<ManagementResult>(AUTH + 'management_login', { usr, pwd, otp: otp || null, enroll_token: enrollToken || null })
      if (res.status === 'ok') {
        this.user = res.user
        this.restrictedProfile = null
        this.session = res.session
        this.locked = false
        this.expiredNotice = false
        usePosStore().reset()
      }
      return res
    },

    async checkSession() {
      try {
        const username = await api.getLoggedUser()
        if (!username || username === 'Guest') {
          this.user = null
          return
        }
        const [userData, info] = await Promise.all([
          api.getDoc<{ name: string; email: string; full_name: string; user_image: string; roles?: { role: string }[] }>('User', username),
          api.call<SessionSummary>(AUTH + 'session_info').catch(() => null),
        ])
        this.user = {
          name: userData.name,
          email: userData.email,
          full_name: userData.full_name,
          user_image: userData.user_image,
          roles: (userData.roles || []).map((r) => r.role),
        }
        this.session = info
        this.locked = !!info?.locked
      } catch {
        this.user = null
      } finally {
        this.loading = false
      }
    },

    async lock() {
      if (!this.user) return
      this.locked = true
      await api.call(AUTH + 'lock_session').catch(() => undefined)
    },

    async unlock(secret: string) {
      const args = this.isManagement ? { password: secret } : { pin: secret }
      await api.call(AUTH + 'unlock_session', args)
      this.locked = false
    },

    /** The server said the session is over: clear local state, keep the organization. */
    sessionEnded() {
      this.user = null
      this.session = null
      this.restrictedProfile = null
      this.posProfile = null
      this.locked = false
      this.expiredNotice = true
      usePosStore().reset()
    },

    // Hand the till to the next person: end this session but stay signed in to the
    // organization (and this registered device), so they only need their name + PIN.
    async switchUser() {
      await api.logout().catch(() => {})
      this.user = null
      this.session = null
      this.restrictedProfile = null
      this.posProfile = null
      this.locked = false
      usePosStore().reset()
    },

    async logout() {
      await api.logout().catch(() => {})
      this.user = null
      this.session = null
      this.restrictedProfile = null
      this.posProfile = null
      this.locked = false
      if (!this.rememberOrg) this.forgetOrganization()
      usePosStore().reset()
    },
  },
})
