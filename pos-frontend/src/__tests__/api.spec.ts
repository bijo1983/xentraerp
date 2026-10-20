import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, onApiError, parseErrorBody, setOnlineProbe } from '@/lib/api'

afterEach(() => {
  setOnlineProbe(() => true)
  vi.unstubAllGlobals()
})

function frappeError(msg: string) {
  return { exc_type: 'ValidationError', _server_messages: JSON.stringify([JSON.stringify({ message: msg })]) }
}

describe('error contract', () => {
  it('parses the [CODE] prefix and strips it from the message', () => {
    expect(parseErrorBody(frappeError('[LOCKED] Too many incorrect attempts.'), 401)).toEqual({ code: 'LOCKED', message: 'Too many incorrect attempts.' })
  })
  it('maps statuses when there is no code', () => {
    expect(parseErrorBody(frappeError('Waiter accounts can\'t do this'), 403).code).toBe('PERMISSION_DENIED')
    expect(parseErrorBody({ error: 'Backend unavailable' }, 502).code).toBe('API_UNAVAILABLE')
    expect(parseErrorBody({ error: 'Unknown organization', code: 'UNKNOWN_TENANT' }, 404).code).toBe('UNKNOWN_TENANT')
  })
  it('never shows a server stack trace or module path', () => {
    const r = parseErrorBody({ exception: 'frappe.exceptions.ValidationError: boom', exc: 'Traceback (most recent call last) ...' }, 500)
    expect(r.message).not.toMatch(/Traceback|frappe\.exceptions/)
    expect(r.code).toBe('SERVER_ERROR')
  })
})

describe('api.call', () => {
  it('sends a request id and keeps it as the error reference', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(frappeError('[BAD_CREDENTIALS] Incorrect staff number or PIN.')), { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const err = (await api.call('custom_erp.api.pos_auth.pin_login', { staff: '1', pin: '2' }).catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('BAD_CREDENTIALS')
    expect(err.message).toBe('Incorrect staff number or PIN.')
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers['X-Client-Request-Id']).toBe(err.ref)
    expect(err.ref).toMatch(/^[0-9A-F]{12}$/)
  })

  it('blocks selling calls while offline without touching the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setOnlineProbe(() => false)
    const seen: string[] = []
    const off = onApiError((e) => seen.push(e.code))
    const err = (await api.call('custom_erp.api.pos_fnb.bill_order', { order: 'X' }).catch((e) => e)) as ApiError
    off()
    expect(err.code).toBe('OFFLINE_BLOCKED')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(seen).toEqual(['OFFLINE_BLOCKED'])
  })

  it('still allows reads while offline (they fail on their own)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('network down')
    })
    vi.stubGlobal('fetch', fetchMock)
    setOnlineProbe(() => false)
    const err = (await api.call('custom_erp.api.pos_core.get_pos_settings').catch((e) => e)) as ApiError
    expect(fetchMock).toHaveBeenCalled()
    expect(err.code).toBe('OFFLINE')
  })
})
