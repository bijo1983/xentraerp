// Online / offline status: browser events + Capacitor Network plugin (native shell) +
// a light heartbeat to the server (a captive Wi-Fi or a dead backend also counts as
// offline for selling). Offline = selling actions are blocked (lib/api.ts), never queued.
import { defineStore } from 'pinia'
import { setOnlineProbe } from '@/lib/api'

const HEARTBEAT_MS = 30_000

export const useNetworkStore = defineStore('network', {
  state: () => ({
    browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    serverReachable: true,
    lastCheck: 0,
    started: false,
  }),
  getters: {
    online: (s) => s.browserOnline && s.serverReachable,
  },
  actions: {
    async heartbeat() {
      if (!this.browserOnline) return
      try {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
        const timer = setTimeout(() => ctrl?.abort(), 8000)
        const res = await fetch('/api/method/ping', { method: 'GET', credentials: 'include', signal: ctrl?.signal, headers: { Accept: 'application/json' } })
        clearTimeout(timer)
        this.serverReachable = res.status < 500
      } catch {
        this.serverReachable = false
      }
      this.lastCheck = Date.now()
    },
    start() {
      if (this.started || typeof window === 'undefined') return
      this.started = true
      setOnlineProbe(() => this.online)
      window.addEventListener('online', () => {
        this.browserOnline = true
        this.heartbeat()
      })
      window.addEventListener('offline', () => {
        this.browserOnline = false
      })
      import('@capacitor/network')
        .then(({ Network }) => {
          Network.addListener('networkStatusChange', (s) => {
            this.browserOnline = s.connected
            if (s.connected) this.heartbeat()
          })
        })
        .catch(() => undefined)
      setInterval(() => this.heartbeat(), HEARTBEAT_MS)
      this.heartbeat()
    },
  },
})
