// Fetch wrapper for the clinic backend (custom_erp.api.clinic.*), same contract as
// pos-frontend/src/lib/api.ts: same-origin /api/* through the erp-frontend proxy, which picks
// the tenant site from the xentra_tenant cookie; errors become ApiError with the backend's
// "[CODE] message" prefix parsed, never a raw traceback.
import { t } from '@/lib/i18n'

export class ApiError extends Error {
  status: number
  code: string
  ref: string
  constructor(message: string, opts: { status?: number; code?: string; ref?: string } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = opts.status ?? 0
    this.code = opts.code ?? 'ERROR'
    this.ref = opts.ref ?? ''
  }
}

type Listener = (err: ApiError) => void
const listeners = new Set<Listener>()
export function onApiError(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function newRequestRef(): string {
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function setTenantCookie(code: string) {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  if (!code) {
    document.cookie = `xentra_tenant=; path=/; SameSite=Lax${secure}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    return
  }
  document.cookie = `xentra_tenant=${encodeURIComponent(code)}; path=/; SameSite=Lax${secure}`
}

export function getTenantCookie(): string {
  const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|;\s*)xentra_tenant=([^;]*)/) : null
  return m ? decodeURIComponent(m[1]) : ''
}

const CODE_RE = /^\s*\[([A-Z_]+)\]\s*/

export function parseErrorBody(data: unknown, status: number): { code: string; message: string } {
  const d = (data || {}) as Record<string, unknown>
  let message = ''
  const sm = d._server_messages
  if (typeof sm === 'string') {
    try {
      const arr = JSON.parse(sm) as string[]
      message = arr
        .map((m) => {
          try {
            return (JSON.parse(m) as { message?: string }).message || ''
          } catch {
            return m
          }
        })
        .filter(Boolean)
        .join(' ')
    } catch {
      message = ''
    }
  }
  if (!message && typeof d.message === 'string') message = d.message
  if (!message && typeof d.exception === 'string') message = d.exception.replace(/^[\w.]+(Error|Exception|Expired)\s*:\s*/, '')
  if (!message && typeof d.error === 'string') message = d.error
  message = message.replace(/<[^>]+>/g, '').trim()
  let code = ''
  const m = message.match(CODE_RE)
  if (m) {
    code = m[1]
    message = message.replace(CODE_RE, '')
  }
  if (!code) {
    if (status === 401) code = 'NOT_AUTHENTICATED'
    else if (status === 403) code = 'PERMISSION_DENIED'
    else if (status === 404 && d.code === 'UNKNOWN_TENANT') code = 'UNKNOWN_TENANT'
    else if (status === 429) code = 'RATE_LIMITED'
    else if (status === 502 || status === 503 || status === 504) code = 'API_UNAVAILABLE'
    else if (status >= 500) code = 'SERVER_ERROR'
    else code = 'ERROR'
  }
  if (!message || status >= 500) {
    message = code === 'API_UNAVAILABLE' ? t('error.apiUnavailable') : code === 'RATE_LIMITED' ? t('error.rateLimited') : status >= 500 ? t('error.unexpected') : message || t('error.unexpected')
  }
  return { code, message }
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const ref = newRequestRef()
  let res: Response
  try {
    res = await fetch(url, { ...init, credentials: 'include', headers: { Accept: 'application/json', 'X-Client-Request-Id': ref, ...(init.headers || {}) } })
  } catch {
    const err = new ApiError(t('error.network'), { code: 'API_UNAVAILABLE', ref })
    listeners.forEach((fn) => fn(err))
    throw err
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const { code, message } = parseErrorBody(data, res.status)
    const err = new ApiError(message, { status: res.status, code, ref })
    listeners.forEach((fn) => fn(err))
    throw err
  }
  return data as T
}

export async function call<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
  const data = await request<{ message: T }>(`/api/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  })
  return data.message
}

/**
 * Calls a guest method on the XentraERP control plane (the CLINZA signup), whichever clinic the
 * browser signed in to last: the proxy picks the site from x-xentra-tenant before the cookie, and
 * "sandbox" is its alias for the default (control-plane) site.
 */
export async function controlPlane<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
  const data = await request<{ message: T }>(`/api/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Xentra-Tenant': 'sandbox' },
    body: JSON.stringify(args || {}),
  })
  return data.message
}

const C = 'custom_erp.api.clinic.'
/** Shorthand for a clinic API method. */
export const clinic = <T = unknown>(name: string, args?: Record<string, unknown>) => call<T>(C + name, args)

export interface LoginResult {
  /** Set when the account uses an authenticator app: no session yet, send the code with loginOtp. */
  tmp_id?: string
  verification?: { method?: string; setup?: boolean; prompt?: string }
}

export async function login(usr: string, pwd: string): Promise<LoginResult> {
  return request<LoginResult>('/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usr, pwd }) })
}

/** Second step of a two-factor sign-in (Frappe keeps the password from step one under tmp_id). */
export async function loginOtp(usr: string, otp: string, tmpId: string): Promise<LoginResult> {
  return request<LoginResult>('/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usr, otp, tmp_id: tmpId }) })
}

export async function logout(): Promise<void> {
  await call('logout').catch(() => undefined)
}

export async function loggedUser(): Promise<string> {
  return call<string>('xentraerp.auth.get_logged_user').catch(() => 'Guest')
}

export async function tenantLookup(code: string): Promise<{ organization_name?: string; valid?: boolean } | null> {
  // The registry of clinic codes lives on the control plane, never on the clinic's own site.
  return controlPlane<{ organization_name?: string; valid?: boolean }>('custom_erp.api.signup.tenant_lookup', { tenant_code: code })
}

export function errorMessage(err: unknown, fallback = t('error.unexpected')): string {
  if (err instanceof ApiError) return err.message || fallback
  return fallback
}

const F = 'custom_erp.api.clinic_flow.'
/** Shorthand for a visit-flow method (front desk → triage → doctor). */
export const flow = <T = unknown>(name: string, args?: Record<string, unknown>) => call<T>(F + name, args)
