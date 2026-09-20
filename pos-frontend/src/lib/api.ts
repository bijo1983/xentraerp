// Thin fetch wrapper for the Frappe REST API. Same-origin only — production
// nginx proxies pos.xentraerp.net/api/* straight to the erp-frontend
// Next.js process, which resolves the target tenant site purely from the
// xentra_tenant cookie (see erp-frontend/src/lib/tenancy/registry.ts).
// There is no separate backend for this app; it reuses that proxy as-is.

function setTenantCookie(code: string) {
  if (!code) {
    document.cookie = 'xentra_tenant=; path=/; SameSite=Lax; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    return
  }
  document.cookie = `xentra_tenant=${code}; path=/; SameSite=Lax`
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.exception || data?._server_messages || data?.message || res.statusText
    throw new Error(String(message))
  }
  return data
}

async function call<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/method/${method}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(args || {}),
  })
  const data = await handle<{ message: T }>(res)
  return data.message
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
  const res = await fetch(`/api/resource/${encodeURIComponent(doctype)}?${search.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await handle<{ data: T[] }>(res)
  return data.data
}

async function getLoggedUser(): Promise<string> {
  return call<string>('xentraerp.auth.get_logged_user')
}

async function getDoc<T = Record<string, unknown>>(doctype: string, name: string): Promise<T> {
  const res = await fetch(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await handle<{ data: T }>(res)
  return data.data
}

async function createDoc<T = Record<string, unknown>>(doctype: string, doc: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/resource/${encodeURIComponent(doctype)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...doc, doctype }),
  })
  const data = await handle<{ data: T }>(res)
  return data.data
}

// A child table field (e.g. POS Invoice's `payments`) isn't a plain
// column — frappe.client.set_value delegates to a database field update
// and can't persist it. A real document update (PUT), the same REST path
// createDoc/handleSave already use elsewhere in this app, goes through
// the document's normal set()/append() machinery and does.
async function updateDoc<T = Record<string, unknown>>(
  doctype: string,
  name: string,
  patch: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = await handle<{ data: T }>(res)
  return data.data
}

async function logout(): Promise<void> {
  await call('logout')
}

export const api = { setTenantCookie, call, getList, getDoc, createDoc, updateDoc, getLoggedUser, logout }
