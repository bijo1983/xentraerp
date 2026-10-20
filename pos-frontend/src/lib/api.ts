// Thin fetch wrapper for the Frappe REST API. Same-origin only — production
// nginx proxies pos.xentraerp.net/api/* straight to the erp-frontend
// Next.js process, which resolves the target tenant site from the
// xentra_tenant cookie (validated against the tenant registry since Phase 1,
// see erp-frontend/src/lib/tenancy/registry.ts).
//
// Phase 1 additions:
//  - every request carries an X-Client-Request-Id; errors keep it as a support reference;
//  - errors become ApiError {status, code, message, ref} with the backend's stable
//    "[CODE] message" prefix parsed (never a raw JSON blob or a stack trace);
//  - selling calls are refused locally while the device is offline (no queueing);
//  - session-expired / screen-locked answers are broadcast so the shell can react.
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

// Methods that move money or change orders/stock: refused while offline (owner decision D:
// no offline selling, no queueing, never claim it works offline).
export const SELLING_METHODS = new Set([
  'custom_erp.api.pos_core.retail_checkout',
  'custom_erp.api.pos_core.settle_invoice',
  'custom_erp.api.pos_core.open_shift',
  'custom_erp.api.pos_core.close_shift',
  'custom_erp.api.pos_fnb.open_order',
  'custom_erp.api.pos_fnb.set_order_items',
  'custom_erp.api.pos_fnb.send_kot',
  'custom_erp.api.pos_fnb.close_bill',
  'custom_erp.api.pos_fnb.reopen_bill',
  'custom_erp.api.pos_fnb.bill_order',
  'custom_erp.api.pos_fnb.split_order',
  'custom_erp.api.pos_fnb.merge_orders',
  'custom_erp.api.pos_fnb.merge_tables',
  'custom_erp.api.pos_fnb.unmerge_table',
  'custom_erp.api.pos_fnb.transfer_table',
  'custom_erp.api.pos_fnb.cancel_order',
  'custom_erp.api.pos_fnb.request_bill',
  'custom_erp.api.pos_fnb.set_kot_status',
])

type Listener = (err: ApiError) => void
const listeners = new Set<Listener>()
/** The shell subscribes to react to SESSION_EXPIRED / POS_SESSION_LOCKED / NOT_LOGGED_IN. */
export function onApiError(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let isOnline: () => boolean = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)
export function setOnlineProbe(fn: () => boolean) {
  isOnline = fn
}

export function newRequestRef(): string {
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function setTenantCookie(code: string) {
  if (!code) {
    document.cookie = 'xentra_tenant=; path=/; SameSite=Lax; Secure; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    return
  }
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `xentra_tenant=${encodeURIComponent(code)}; path=/; SameSite=Lax${secure}`
}

const CODE_RE = /^\s*\[([A-Z_]+)\]\s*/

/** Extract a human message (and the optional [CODE] prefix) from a Frappe error body. */
export function parseErrorBody(data: unknown, status: number): { code: string; message: string } {
  const d = (data || {}) as Record<string, unknown>
  let message = ''
  const sm = d._server_messages
  if (typeof sm === 'string') {
    try {
      const arr = JSON.parse(sm) as string[]
      const texts = arr.map((m) => {
        try {
          const o = JSON.parse(m) as { message?: string }
          return o.message || ''
        } catch {
          return m
        }
      })
      message = texts.filter(Boolean).join(' ')
    } catch {
      message = ''
    }
  }
  if (!message && typeof d.message === 'string') message = d.message
  if (!message && typeof d.exception === 'string') {
    // "frappe.exceptions.ValidationError: text" -> "text"; never show a module path
    message = d.exception.replace(/^[\w.]+(Error|Exception|Expired)\s*:\s*/, '')
  }
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
    message =
      code === 'API_UNAVAILABLE' ? t('error.apiUnavailable') : status >= 500 ? t('error.unexpected') : code === 'RATE_LIMITED' ? t('error.rateLimited') : message || t('error.unexpected')
  }
  return { code, message }
}

async function request<T>(url: string, init: RequestInit, method?: string): Promise<T> {
  const ref = newRequestRef()
  if (method && SELLING_METHODS.has(method) && !isOnline()) {
    const err = new ApiError(t('offline.blocked'), { code: 'OFFLINE_BLOCKED', ref })
    listeners.forEach((fn) => fn(err))
    throw err
  }
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: { Accept: 'application/json', 'X-Client-Request-Id': ref, ...(init.headers || {}) },
    })
  } catch {
    const err = new ApiError(t('error.network'), { code: isOnline() ? 'API_UNAVAILABLE' : 'OFFLINE', ref })
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

async function call<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
  const data = await request<{ message: T }>(
    `/api/method/${method}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) },
    method,
  )
  return data.message
}

/** Full JSON body (Frappe's own login returns fields beside `message`). */
async function callRaw<T = Record<string, unknown>>(method: string, args?: Record<string, unknown>): Promise<T> {
  return request<T>(`/api/method/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) }, method)
}

async function getList<T = Record<string, unknown>>(
  doctype: string,
  params: { fields?: string[]; filters?: unknown; order_by?: string; limit_page_length?: number } = {},
): Promise<T[]> {
  const search = new URLSearchParams()
  if (params.fields) search.set('fields', JSON.stringify(params.fields))
  if (params.filters) search.set('filters', JSON.stringify(params.filters))
  if (params.order_by) search.set('order_by', params.order_by)
  search.set('limit_page_length', String(params.limit_page_length ?? 100))
  const data = await request<{ data: T[] }>(`/api/resource/${encodeURIComponent(doctype)}?${search.toString()}`, {})
  return data.data
}

async function getLoggedUser(): Promise<string> {
  return call<string>('xentraerp.auth.get_logged_user')
}

async function getDoc<T = Record<string, unknown>>(doctype: string, name: string): Promise<T> {
  const data = await request<{ data: T }>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {})
  return data.data
}

async function createDoc<T = Record<string, unknown>>(doctype: string, doc: Record<string, unknown>): Promise<T> {
  const data = await request<{ data: T }>(`/api/resource/${encodeURIComponent(doctype)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...doc, doctype }),
  })
  return data.data
}

// A child table field (e.g. POS Invoice's `payments`) isn't a plain
// column — frappe.client.set_value delegates to a database field update
// and can't persist it. A real document update (PUT) goes through
// the document's normal set()/append() machinery and does.
async function updateDoc<T = Record<string, unknown>>(doctype: string, name: string, patch: Record<string, unknown>): Promise<T> {
  const data = await request<{ data: T }>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return data.data
}

async function logout(): Promise<void> {
  // Ends the POS session record too; falls back to Frappe's own logout.
  try {
    await call('custom_erp.api.pos_auth.logout')
  } catch {
    await call('logout')
  }
}

/** Human message for anything thrown (never a stack trace). */
export function errorMessage(err: unknown, fallback = t('error.unexpected')): string {
  if (err instanceof ApiError) return err.message || fallback
  return fallback
}

export const api = { setTenantCookie, call, callRaw, getList, getDoc, createDoc, updateDoc, getLoggedUser, logout }
