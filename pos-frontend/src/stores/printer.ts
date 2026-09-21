import { defineStore } from 'pinia'
import { pairPrinter, reconnectLastPrinter, isBluetoothAvailable, type ConnectedPrinter } from '@/lib/bluetooth-printer'
import { buildReceiptBytes, printReceiptViaBrowser, type ReceiptData } from '@/lib/receipt'
import { buildKotBytes, printKotViaBrowser, type KotData } from '@/lib/kot'

export type PrintMethod = 'bluetooth' | 'browser'

// Which printer/method to use is a fact about THIS physical device (which
// hardware is plugged/paired into it), not about the tenant's business
// data — localStorage is the right place for it, unlike anything that
// needs to be shared across registers or read back by the back office.
const STORAGE_KEY = 'xentra-pos-printer'
// Whether THIS device prints kitchen tickets on its own: the terminal that takes the order
// (prints right after saving), and/or the kitchen screen (prints each new ticket as it appears).
const KOT_KEY = 'xentra-pos-kot-print'

function readKotPrefs(): { terminal: boolean; kitchen: boolean } {
  try {
    const raw = localStorage.getItem(KOT_KEY)
    if (raw) return { terminal: false, kitchen: false, ...JSON.parse(raw) }
  } catch {
    /* default: off */
  }
  return { terminal: false, kitchen: false }
}

function readStoredPreference(): { method: PrintMethod; deviceId?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // Private browsing, cleared storage, etc. — fall back to the default.
  }
  return { method: 'browser' }
}

function writeStoredPreference(pref: { method: PrintMethod; deviceId?: string }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref))
  } catch {
    // Non-fatal — the choice just won't be remembered for next time.
  }
}

interface PrinterState {
  method: PrintMethod
  bluetoothSupported: boolean
  connected: ConnectedPrinter | null
  connecting: boolean
  error: string | null
  autoKotTerminal: boolean
  autoKotKitchen: boolean
}

export const usePrinterStore = defineStore('printer', {
  state: (): PrinterState => {
    const stored = readStoredPreference()
    return {
      method: stored.method,
      bluetoothSupported: isBluetoothAvailable(),
      connected: null,
      connecting: false,
      error: null,
      autoKotTerminal: readKotPrefs().terminal,
      autoKotKitchen: readKotPrefs().kitchen,
    }
  },

  actions: {
    setAutoKot(where: 'terminal' | 'kitchen', on: boolean) {
      if (where === 'terminal') this.autoKotTerminal = on
      else this.autoKotKitchen = on
      try {
        localStorage.setItem(KOT_KEY, JSON.stringify({ terminal: this.autoKotTerminal, kitchen: this.autoKotKitchen }))
      } catch {
        /* not remembered */
      }
    },

    async printKot(data: KotData) {
      if (this.method === 'bluetooth') {
        if (!this.connected) throw new Error('No Bluetooth printer connected — open Printer Settings to connect one.')
        await this.connected.print(buildKotBytes(data))
      } else {
        printKotViaBrowser(data)
      }
    },

    setMethod(method: PrintMethod) {
      this.method = method
      writeStoredPreference({ method, deviceId: this.connected?.device.id })
    },

    // Opens the browser's Bluetooth device picker — must be called from a
    // real click handler, not on page load, or the browser will refuse it.
    async connectBluetoothPrinter() {
      this.error = null
      this.connecting = true
      try {
        this.connected = await pairPrinter()
        this.method = 'bluetooth'
        writeStoredPreference({ method: 'bluetooth', deviceId: this.connected.device.id })
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Could not connect to a Bluetooth printer'
        throw err
      } finally {
        this.connecting = false
      }
    },

    // Best-effort silent reconnect to whichever printer was paired last
    // time, so the cashier doesn't have to re-pick it every shift. Falls
    // through quietly if the browser/device doesn't support it — the
    // cashier can still connect manually from Printer Settings.
    async tryReconnect() {
      const stored = readStoredPreference()
      if (stored.method !== 'bluetooth' || !stored.deviceId) return
      const printer = await reconnectLastPrinter(stored.deviceId).catch(() => null)
      if (printer) this.connected = printer
    },

    async printReceipt(data: ReceiptData) {
      if (this.method === 'bluetooth') {
        if (!this.connected) {
          throw new Error('No Bluetooth printer connected — open Printer Settings to connect one.')
        }
        await this.connected.print(buildReceiptBytes(data))
      } else {
        printReceiptViaBrowser(data)
      }
    },
  },
})
