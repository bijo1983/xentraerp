// Where a signed-in person may go, and where they land — pure functions so the rules are
// unit-tested (src/__tests__/nav.spec.ts). The server enforces the same rules (caps, device
// type masks); this only decides what the app shows.
//
// Session modes (backend custom_erp.api.pos_security.session_mode):
//   till    — cashier/supervisor on a Till: register + shift (if required) + payments
//   order   — F&B order taker (waiter anywhere, cashier on an Order Taking device):
//             straight to the floor, no register picker, no shift, no till management
//   kitchen — Kitchen Display / kitchen staff: kitchen board only
//   manager — administrator (management sign-in): everything, register like a till
// Retail has no order takers: an order-mode session at a Retail-only register can't sell.

export type SessionMode = 'till' | 'order' | 'kitchen' | 'manager'
export type Level = 'admin' | 'supervisor' | 'cashier' | 'waiter' | 'kitchen' | null

export interface NavContext {
  level: Level
  mode: SessionMode | null
  caps: string[]
  modes: ('Retail' | 'F&B')[] // what the register / location runs
  hasRegister: boolean
  shiftOpen: boolean
  requireShift: boolean
}

export interface NavItem {
  name: string
  path: string
  labelKey: string
  icon: string
}

/** The effective mode: legacy sessions (no POS session record) derive it from the level. */
export function effectiveMode(ctx: Pick<NavContext, 'level' | 'mode'>): SessionMode {
  if (ctx.mode) return ctx.mode
  if (ctx.level === 'admin') return 'manager'
  if (ctx.level === 'kitchen') return 'kitchen'
  if (ctx.level === 'waiter') return 'order'
  return 'till'
}

const has = (ctx: NavContext, cap: string) => ctx.caps.includes(cap)
const fnb = (ctx: NavContext) => ctx.modes.includes('F&B')
const retail = (ctx: NavContext) => ctx.modes.includes('Retail')

/** Navigation entries the person may see, in order. */
export function visibleNav(ctx: NavContext): NavItem[] {
  const mode = effectiveMode(ctx)
  const items: NavItem[] = []
  if (mode === 'kitchen') {
    if (fnb(ctx) && has(ctx, 'kot')) items.push({ name: 'kitchen', path: '/kitchen', labelKey: 'nav.kitchen', icon: '🍳' })
    return items
  }
  if (fnb(ctx) && has(ctx, 'view')) items.push({ name: 'floor', path: '/floor', labelKey: 'nav.floor', icon: '▦' })
  if (mode !== 'order' && retail(ctx) && has(ctx, 'bill')) items.push({ name: 'terminal', path: '/terminal', labelKey: 'nav.terminal', icon: '🧾' })
  if (mode !== 'order' && fnb(ctx) && has(ctx, 'kot')) items.push({ name: 'kitchen', path: '/kitchen', labelKey: 'nav.kitchen', icon: '🍳' })
  if (mode !== 'order' && has(ctx, 'shift')) items.push({ name: 'shift', path: '/shift', labelKey: 'nav.shift', icon: '⏱' })
  if (['tables', 'menu', 'reports', 'settings'].some((c) => has(ctx, c))) items.push({ name: 'admin', path: '/admin', labelKey: 'nav.admin', icon: '⚙' })
  return items
}

/** Does this session need the register picker? Only till/manager sessions. */
export function needsRegisterPicker(ctx: Pick<NavContext, 'level' | 'mode'>): boolean {
  const m = effectiveMode(ctx)
  return m === 'till' || m === 'manager'
}

/** Does this session need an open shift before selling? Till sessions with the shift cap only. */
export function needsShift(ctx: NavContext): boolean {
  const m = effectiveMode(ctx)
  return (m === 'till' || m === 'manager') && ctx.requireShift && has(ctx, 'shift') && !ctx.shiftOpen
}

/** Where to go right after sign-in / register selection. */
export function landingRoute(ctx: NavContext): string {
  const mode = effectiveMode(ctx)
  if (mode === 'kitchen') return fnb(ctx) ? '/kitchen' : '/unavailable'
  if (mode === 'order') return fnb(ctx) ? '/floor' : '/unavailable'
  if (!ctx.hasRegister) return '/registers'
  if (needsShift(ctx)) return '/shift'
  if (fnb(ctx)) return '/floor'
  if (retail(ctx) && has(ctx, 'bill')) return '/terminal'
  if (['tables', 'menu', 'reports', 'settings'].some((c) => has(ctx, c))) return '/admin'
  return '/unavailable'
}

const SELLING = new Set(['terminal', 'floor', 'order'])

/**
 * Route guard decision for an authenticated person: true = allowed, string = redirect.
 * Mirrors the original router rules (01-audit §4) plus device/session modes.
 */
export function guardRoute(name: string, ctx: NavContext): true | string {
  const mode = effectiveMode(ctx)
  const always = new Set(['unavailable', 'denied', 'not-found', 'landing'])
  if (always.has(name)) return true
  if (mode === 'kitchen') return name === 'kitchen' ? (fnb(ctx) ? true : '/unavailable') : landingRoute(ctx)
  if (mode === 'order') {
    if (name === 'floor' || name === 'order') return fnb(ctx) ? true : '/unavailable'
    if (name === 'admin' && ['tables', 'menu', 'reports', 'settings'].some((c) => has(ctx, c))) return true
    return landingRoute(ctx)
  }
  if (name === 'registers') return true
  if (name === 'terminal' && (!has(ctx, 'bill') || !retail(ctx))) return fnb(ctx) ? '/floor' : '/registers'
  if (name === 'shift' && !has(ctx, 'shift')) return fnb(ctx) ? '/floor' : '/registers'
  if ((SELLING.has(name) || name === 'shift') && !ctx.hasRegister) return '/registers'
  if (SELLING.has(name) && needsShift(ctx)) return '/shift'
  if ((name === 'floor' || name === 'order' || name === 'kitchen') && !fnb(ctx)) return '/terminal'
  if (name === 'admin' && !['tables', 'menu', 'reports', 'settings'].some((c) => has(ctx, c))) return '/registers'
  return true
}
