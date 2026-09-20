import { defineStore } from 'pinia'
import { api } from '@/lib/api'

export type PosMode = 'Retail' | 'F&B'

export interface CashRow {
  currency: string
  opening: number
  expected: number
  counted: number
  variance: number
  cash_in?: number
}

export interface Shift {
  name: string
  pos_profile: string
  cashier: string
  status: 'Open' | 'Closed'
  business_date: string | null
  opened_at: string | null
  closed_at: string | null
  cash: CashRow[]
  invoice_count: number
  total_sales: number
  by_payment?: { mode: string; currency: string; tendered: number; amount: number }[]
}

export interface PosSettings {
  pos_mode: PosMode
  require_shift: number
  pos_247: number
  previous_day_billing: number
  previous_day_until: string
  can_switch: boolean
  business_date: string
  shift: Shift | null
}

const CORE = 'custom_erp.api.pos_core.'

// Tenant-wide POS behaviour (Retail vs F&B, shift rules) plus the signed-in
// cashier's open shift. Loaded right after login and refreshed after any
// change, so screens never guess which mode they are in.
export const usePosStore = defineStore('pos', {
  state: () => ({
    settings: null as PosSettings | null,
    shift: null as Shift | null,
    loaded: false,
  }),
  getters: {
    mode: (s): PosMode => s.settings?.pos_mode ?? 'Retail',
    isFnb(): boolean {
      return this.mode === 'F&B'
    },
    canAdmin: (s) => !!s.settings?.can_switch,
    needsShift: (s) => !!s.settings?.require_shift && !s.shift,
  },
  actions: {
    async load() {
      const s = await api.call<PosSettings>(CORE + 'get_pos_settings')
      this.settings = s
      this.shift = s.shift
      this.loaded = true
    },
    reset() {
      this.settings = null
      this.shift = null
      this.loaded = false
    },
    async setMode(mode: PosMode) {
      await api.call(CORE + 'set_pos_mode', { mode })
      await this.load()
    },
    async saveSettings(patch: Partial<Pick<PosSettings, 'require_shift' | 'pos_247' | 'previous_day_billing' | 'previous_day_until'>>) {
      await api.call(CORE + 'save_pos_settings', patch)
      await this.load()
    },
    async openShift(posProfile: string, openingCash: Record<string, number>) {
      this.shift = await api.call<Shift>(CORE + 'open_shift', { pos_profile: posProfile, opening_cash: JSON.stringify(openingCash) })
      await this.load()
    },
    async closeShift(counted: Record<string, number>, notes: string) {
      if (!this.shift) return null
      const closed = await api.call<Shift>(CORE + 'close_shift', { shift: this.shift.name, counted: JSON.stringify(counted), notes })
      await this.load()
      return closed
    },
  },
})
