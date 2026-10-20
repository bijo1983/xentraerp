import { describe, expect, it } from 'vitest'
import { effectiveMode, guardRoute, landingRoute, needsRegisterPicker, needsShift, visibleNav, type NavContext } from '@/lib/nav'

const WAITER = ['view', 'kot', 'order', 'reserve']
const CASHIER = [...WAITER, 'modify', 'bill', 'shift']
const SUPERVISOR = [...CASHIER, 'supervise', 'tables', 'menu', 'reports']
const ADMIN = [...SUPERVISOR, 'settings']
// What the backend masks an Order Taking device to (pos_security.device_cap_mask).
const ORDER_DEVICE_MASK = ['view', 'kot', 'order', 'reserve', 'modify']

function ctx(p: Partial<NavContext>): NavContext {
  return { level: 'cashier', mode: 'till', caps: CASHIER, modes: ['F&B', 'Retail'], hasRegister: true, shiftOpen: true, requireShift: true, ...p }
}
const names = (c: NavContext) => visibleNav(c).map((n) => n.name)

describe('routing by role and device type', () => {
  it('F&B waiter (order session) goes straight to the floor: no register picker, no shift', () => {
    const c = ctx({ level: 'waiter', mode: 'order', caps: WAITER, hasRegister: false, shiftOpen: false })
    expect(landingRoute(c)).toBe('/floor')
    expect(needsRegisterPicker(c)).toBe(false)
    expect(needsShift(c)).toBe(false)
    expect(guardRoute('registers', c)).toBe('/floor')
    expect(guardRoute('shift', c)).toBe('/floor')
    expect(guardRoute('terminal', c)).toBe('/floor')
    expect(guardRoute('floor', c)).toBe(true)
    expect(guardRoute('order', c)).toBe(true)
  })

  it('a waiter with no session record (legacy) is still treated as an order taker', () => {
    expect(effectiveMode({ level: 'waiter', mode: null })).toBe('order')
  })

  it('cashier on an Order Taking device gets an order session (masked caps, no till)', () => {
    const c = ctx({ level: 'cashier', mode: 'order', caps: ORDER_DEVICE_MASK, hasRegister: false, shiftOpen: false })
    expect(landingRoute(c)).toBe('/floor')
    expect(names(c)).toEqual(['floor'])
    expect(guardRoute('shift', c)).toBe('/floor')
  })

  it('F&B cashier on a till needs a register, then an open shift, then the floor', () => {
    expect(landingRoute(ctx({ hasRegister: false }))).toBe('/registers')
    expect(landingRoute(ctx({ shiftOpen: false }))).toBe('/shift')
    expect(guardRoute('floor', ctx({ shiftOpen: false }))).toBe('/shift')
    expect(landingRoute(ctx({}))).toBe('/floor')
    expect(names(ctx({}))).toEqual(['floor', 'terminal', 'kitchen', 'shift'])
  })

  it('require_shift off: a cashier sells without a shift', () => {
    expect(landingRoute(ctx({ shiftOpen: false, requireShift: false }))).toBe('/floor')
  })

  it('Retail: every seller is a cashier on a till; no waiter flows', () => {
    const retail = ctx({ modes: ['Retail'] })
    expect(landingRoute(retail)).toBe('/terminal')
    expect(names(retail)).not.toContain('floor')
    expect(guardRoute('floor', retail)).toBe('/terminal')
    const waiterInRetail = ctx({ level: 'waiter', mode: 'order', caps: WAITER, modes: ['Retail'], hasRegister: false })
    expect(landingRoute(waiterInRetail)).toBe('/unavailable')
    expect(names(waiterInRetail)).toEqual([])
    expect(guardRoute('terminal', waiterInRetail)).toBe('/unavailable')
  })

  it('kitchen sessions only ever see the kitchen board', () => {
    const k = ctx({ level: 'kitchen', mode: 'kitchen', caps: ['view', 'kot'], hasRegister: false })
    expect(landingRoute(k)).toBe('/kitchen')
    expect(names(k)).toEqual(['kitchen'])
    for (const r of ['floor', 'terminal', 'shift', 'admin', 'registers']) expect(guardRoute(r, k)).toBe('/kitchen')
    expect(guardRoute('kitchen', k)).toBe(true)
  })

  it('supervisor on a Kitchen Display is in kitchen mode', () => {
    expect(landingRoute(ctx({ level: 'supervisor', mode: 'kitchen', caps: SUPERVISOR }))).toBe('/kitchen')
  })

  it('administrators (management sign-in) get everything including settings', () => {
    const a = ctx({ level: 'admin', mode: 'manager', caps: ADMIN })
    expect(needsRegisterPicker(a)).toBe(true)
    expect(names(a)).toContain('admin')
    expect(guardRoute('admin', a)).toBe(true)
  })

  it('management sign-in lands on the dashboard, with or without a register', () => {
    const a = ctx({ level: 'admin', mode: 'manager', caps: ADMIN })
    expect(landingRoute(a)).toBe('/dashboard')
    expect(landingRoute({ ...a, hasRegister: false })).toBe('/dashboard')
    expect(names(a)[0]).toBe('dashboard')
    expect(guardRoute('dashboard', { ...a, hasRegister: false })).toBe(true)
    // selling still needs a register
    expect(guardRoute('floor', { ...a, hasRegister: false })).toBe('/registers')
  })

  it('only people with the reports right see the dashboard', () => {
    expect(names(ctx({}))).not.toContain('dashboard')
    expect(guardRoute('dashboard', ctx({}))).toBe('/floor')
    expect(names(ctx({ level: 'supervisor', caps: SUPERVISOR }))).toContain('dashboard')
    expect(landingRoute(ctx({ level: 'supervisor', caps: SUPERVISOR }))).toBe('/floor')
  })

  it('navigation is filtered by permission', () => {
    expect(names(ctx({ level: 'supervisor', caps: SUPERVISOR }))).toContain('admin')
    expect(names(ctx({}))).not.toContain('admin')
    expect(guardRoute('admin', ctx({}))).toBe('/registers')
  })

  it('cashier without retail at an F&B-only location is sent to the floor from the counter', () => {
    expect(guardRoute('terminal', ctx({ modes: ['F&B'] }))).toBe('/floor')
  })
})
