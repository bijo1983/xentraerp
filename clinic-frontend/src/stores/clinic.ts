import { defineStore } from 'pinia'
import { clinic } from '@/lib/api'
import type { Cap, ClinicContext } from '@/lib/types'

export const useClinicStore = defineStore('clinic', {
  state: () => ({ ctx: null as ClinicContext | null }),
  getters: {
    settings: (s) => s.ctx?.settings,
    currency: (s) => s.ctx?.settings.currency || '',
    region: (s) => s.ctx?.settings.region || 'Other',
  },
  actions: {
    async load() {
      this.ctx = await clinic<ClinicContext>('get_context')
      return this.ctx
    },
    can(cap: Cap): boolean {
      return !!this.ctx?.caps.includes(cap)
    },
    practitionerName(name?: string | null): string {
      return this.ctx?.practitioners.find((p) => p.name === name)?.practitioner_name || name || ''
    },
    reset() {
      this.ctx = null
    },
  },
})
