import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SignInPanel from '@/components/auth/SignInPanel.vue'

type Handler = (body: Record<string, unknown>) => { status?: number; message?: unknown; raw?: unknown }
let handlers: Record<string, Handler>
let calls: { method: string; body: Record<string, unknown> }[]

function install() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const method = url.replace('/api/method/', '')
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      calls.push({ method, body })
      const h = handlers[method]
      if (!h) return new Response(JSON.stringify({ message: null }), { status: 200 })
      const r = h(body)
      const payload = r.raw ?? { message: r.message }
      return new Response(JSON.stringify(payload), { status: r.status ?? 200 })
    }),
  )
}
const err = (msg: string, status: number) => ({ status, raw: { _server_messages: JSON.stringify([JSON.stringify({ message: msg })]) } })

const CONTEXT = {
  device: { registered: true, id: 'DEV-00001', label: 'Front till', type: 'Till' },
  require_registered_device: true,
  can_sign_in: true,
  staff: [{ staff: '4821', name: 'Aisha K.', initials: 'AK' }],
  pin_min: 6,
  pin_max: 8,
  device_types: ['Till', 'Order Taking', 'Kitchen Display'],
}
const USER = { name: 'aisha@x.com', email: 'aisha@x.com', full_name: 'Aisha Khalid', user_image: '', roles: ['POS Cashier'] }

beforeEach(() => {
  setActivePinia(createPinia())
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
  calls = []
  handlers = {
    'custom_erp.api.pos_auth.lookup_organization': (b) => (b.tenant_code === '197349' ? { message: { organization_name: 'JJC Cafe', tenant_code: '197349' } } : err('[ORG_NOT_FOUND] We couldn\'t find an active organization with that code.', 417)),
    'custom_erp.api.pos_auth.login_context': () => ({ message: CONTEXT }),
    'custom_erp.api.pos_auth.pin_login': (b) => (b.staff === '4821' && b.pin === '123456' ? { message: { user: USER, pos_profile: null, session: { pos_session: true, mode: 'till' } } } : err('[BAD_CREDENTIALS] Incorrect staff number or PIN.', 401)),
  }
  install()
})

async function enterOrg(w: ReturnType<typeof mount>, code = '197349') {
  await w.find('input').setValue(code)
  await w.find('form').trigger('submit')
  await flushPromises()
}
async function typePin(w: ReturnType<typeof mount>, pin: string) {
  for (const d of pin) await w.findAll('.x-key').find((b) => b.text() === d)!.trigger('click')
}

describe('sign-in flow', () => {
  it('organization -> staff tile -> PIN -> signed in (identity + PIN sent, never PIN alone)', async () => {
    const w = mount(SignInPanel)
    await enterOrg(w)
    expect(document.cookie).toContain('xentra_tenant=197349')
    expect(w.text()).toContain('JJC Cafe')
    await w.findAll('.tile').find((b) => b.text().includes('Aisha K.'))!.trigger('click')
    await typePin(w, '123456')
    expect(w.findAll('.x-pin i.filled')).toHaveLength(6)
    await w.findAll('button').find((b) => b.text() === 'Sign in')!.trigger('click')
    await flushPromises()
    const login = calls.find((c) => c.method.endsWith('pin_login'))!
    expect(login.body).toEqual({ staff: '4821', pin: '123456' })
    expect(w.emitted('signed-in')).toHaveLength(1)
  })

  it('wrong PIN shows the generic message and clears the dots', async () => {
    const w = mount(SignInPanel)
    await enterOrg(w)
    await w.findAll('.tile')[0].trigger('click')
    await typePin(w, '999999')
    await w.findAll('button').find((b) => b.text() === 'Sign in')!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Incorrect staff number or PIN.')
    expect(w.findAll('.x-pin i.filled')).toHaveLength(0)
    expect(w.emitted('signed-in')).toBeUndefined()
  })

  it('unknown organization shows the generic error', async () => {
    const w = mount(SignInPanel)
    await enterOrg(w, '000000')
    expect(w.text()).toContain("couldn't find an active organization")
    expect(calls.some((c) => c.method.endsWith('login_context'))).toBe(false)
  })

  it('unregistered device asks for an approval code first', async () => {
    let registered = false
    handlers['custom_erp.api.pos_auth.login_context'] = () => ({ message: registered ? CONTEXT : { ...CONTEXT, device: { registered: false }, can_sign_in: false, staff: [] } })
    handlers['custom_erp.api.pos_auth.register_device'] = (b) => {
      registered = b.code === 'ABCD-EFGH'
      return registered ? { message: CONTEXT.device } : err('[BAD_CODE] That approval code isn\'t valid or has expired.', 401)
    }
    const w = mount(SignInPanel)
    await enterOrg(w)
    expect(w.text()).toContain('Register this device')
    await w.find('input').setValue('ABCD-EFGH')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.findAll('.tile')).toHaveLength(1)
  })

  it('staff number can be typed instead of picking a name', async () => {
    handlers['custom_erp.api.pos_auth.login_context'] = () => ({ message: { ...CONTEXT, staff: [] } })
    const w = mount(SignInPanel)
    await enterOrg(w)
    await w.find('input').setValue('4821')
    await w.find('form').trigger('submit')
    await typePin(w, '123456')
    await w.findAll('button').find((b) => b.text() === 'Sign in')!.trigger('click')
    await flushPromises()
    expect(w.emitted('signed-in')).toHaveLength(1)
  })

  it('management sign-in asks for the authenticator code, separate from PIN sign-in', async () => {
    handlers['custom_erp.api.pos_auth.management_login'] = (b) =>
      !b.otp ? { message: { status: 'otp_required' } } : b.otp === '654321' ? { message: { status: 'ok', user: { ...USER, roles: ['System Manager'] }, session: { pos_session: true, kind: 'Management', mode: 'manager' } } } : err('[BAD_CREDENTIALS] Incorrect email, password or code.', 401)
    const w = mount(SignInPanel)
    await enterOrg(w)
    await w.findAll('[role="tab"]')[1].trigger('click')
    const inputs = w.findAll('input')
    await inputs[0].setValue('owner@x.com')
    await inputs[1].setValue('secret')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('Authenticator code')
    await w.find('input').setValue('654321')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.emitted('signed-in')).toHaveLength(1)
    expect(calls.some((c) => c.method.endsWith('pin_login'))).toBe(false)
  })

  it('a remembered organization skips straight to the staff step', async () => {
    localStorage.setItem('xpos.org', JSON.stringify({ code: '197349', name: 'JJC Cafe' }))
    setActivePinia(createPinia())
    const w = mount(SignInPanel)
    await flushPromises()
    expect(w.findAll('.tile')).toHaveLength(1)
    expect(calls.some((c) => c.method.endsWith('lookup_organization'))).toBe(false)
  })
})
