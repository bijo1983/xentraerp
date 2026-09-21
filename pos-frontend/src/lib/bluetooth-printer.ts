// Bluetooth LE printing for common ESC/POS thermal receipt printers, via
// @capacitor-community/bluetooth-le's BleClient — this one API talks to:
//   - real CoreBluetooth on the native iOS app
//   - real Android BLE stack on the native Android app
//   - Web Bluetooth under the hood in a desktop Chrome/Edge browser tab
// so this file has no platform branching of its own; BleClient's own web.ts
// implementation is what falls back to navigator.bluetooth in a browser.
//
// TWO hard platform limits, worth knowing before debugging "it doesn't
// work" on real hardware:
//
// 1. In the BROWSER tab (not the native app), Web Bluetooth only works in
//    Chromium browsers (Chrome/Edge) — Safari never implements it, on any
//    OS. This limit does NOT apply to the native iOS app — that talks to
//    CoreBluetooth directly, bypassing WebKit's Bluetooth support entirely.
//
// 2. On every platform, this only talks to Bluetooth LOW ENERGY (BLE/GATT)
//    devices. A lot of cheap "Bluetooth" thermal printers actually use
//    classic Bluetooth SPP (serial port profile), not BLE — those printers
//    are invisible here by design (a hardware/OS-level restriction, not a
//    bug to fix in this file). If a specific printer never appears in the
//    device picker, check its spec sheet for "BLE"/"Bluetooth Low Energy"
//    support, not just "Bluetooth".
//
// There is no single standard GATT profile for thermal printers (unlike,
// say, a Bluetooth keyboard). The UUIDs below cover the two profiles seen
// most often on generic 58mm/80mm ESC/POS printers sold under many
// different brand names — KNOWN_PRINTER_PROFILES may need a third entry
// added once this is tested against the client's actual hardware model.

import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le'

interface PrinterProfile {
  service: string
  writeCharacteristic: string
}

const KNOWN_PRINTER_PROFILES: PrinterProfile[] = [
  // Very common on generic Chinese-made 58mm/80mm printers (various
  // rebranded names).
  { service: '000018f0-0000-1000-8000-00805f9b34fb', writeCharacteristic: '00002af1-0000-1000-8000-00805f9b34fb' },
  // Common on HM-10-style BLE serial modules some printer boards reuse.
  { service: '0000ff00-0000-1000-8000-00805f9b34fb', writeCharacteristic: '0000ff02-0000-1000-8000-00805f9b34fb' },
]

const ALL_SERVICE_UUIDS = KNOWN_PRINTER_PROFILES.map((p) => p.service)

export interface ConnectedPrinter {
  deviceId: string
  name: string
  print: (bytes: Uint8Array) => Promise<void>
  disconnect: () => void
}

let initialized: Promise<void> | null = null

// initialize() is safe to call more than once, but it triggers a native
// permission prompt (location on Android, Bluetooth on iOS) — do it at most
// once per app session, lazily, the first time Bluetooth is actually used
// rather than on every page load.
function ensureInitialized(): Promise<void> {
  if (!initialized) initialized = BleClient.initialize({ androidNeverForLocation: true })
  return initialized
}

export function isBluetoothAvailable(): boolean {
  // BleClient itself works everywhere Capacitor runs (native + web) — the
  // one case this app still can't offer Bluetooth printing is a browser
  // with neither Capacitor nor Web Bluetooth (e.g. Safari), which surfaces
  // as an initialize()/requestDevice() rejection instead, since there's no
  // synchronous way to know that ahead of time.
  return true
}

async function findWriteCharacteristic(deviceId: string): Promise<PrinterProfile | null> {
  const services = await BleClient.getServices(deviceId)
  const serviceUuids = new Set(services.map((s) => s.uuid.toLowerCase()))
  for (const profile of KNOWN_PRINTER_PROFILES) {
    if (serviceUuids.has(profile.service.toLowerCase())) return profile
  }
  return null
}

function wrapConnectedDevice(deviceId: string, name: string, profile: PrinterProfile): ConnectedPrinter {
  // Most printer characteristics only accept small writes (~20 bytes on
  // many BLE stacks before negotiating a larger MTU) — chunk defensively
  // rather than assume the whole receipt fits in one write.
  const CHUNK_SIZE = 180
  async function print(bytes: Uint8Array) {
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.slice(offset, offset + CHUNK_SIZE)
      await BleClient.writeWithoutResponse(
        deviceId,
        profile.service,
        profile.writeCharacteristic,
        numbersToDataView(Array.from(chunk)),
      )
    }
  }

  return {
    deviceId,
    name,
    print,
    disconnect: () => {
      BleClient.disconnect(deviceId).catch(() => {})
    },
  }
}

async function connectToDevice(deviceId: string, name: string): Promise<ConnectedPrinter> {
  await BleClient.connect(deviceId)
  const profile = await findWriteCharacteristic(deviceId)
  if (!profile) {
    await BleClient.disconnect(deviceId).catch(() => {})
    throw new Error(
      "Connected, but this printer doesn't match a known profile. It may use classic Bluetooth (SPP) " +
        'rather than Bluetooth Low Energy, which this app cannot reach — check the printer supports BLE.',
    )
  }
  return wrapConnectedDevice(deviceId, name, profile)
}

// Opens the OS/browser device picker (must be called from a real user
// gesture, e.g. a button tap). acceptAllDevices is deliberately used
// instead of filtering by service, since we don't know which of the known
// profiles a given printer uses until we've connected — BleClient still
// only lets us read the services listed in optionalServices once
// connected, which is why both known profiles are listed there regardless.
export async function pairPrinter(): Promise<ConnectedPrinter> {
  await ensureInitialized()
  const device = await BleClient.requestDevice({
    // No `services` filter — we don't know which known profile a given
    // printer uses until connected, so leave the picker unfiltered
    // (BleClient's web implementation turns an empty filter set into
    // Web Bluetooth's acceptAllDevices automatically).
    optionalServices: ALL_SERVICE_UUIDS,
  })
  return connectToDevice(device.deviceId, device.name || 'Bluetooth printer')
}

// Reconnects to a printer already paired/granted in a previous session,
// without showing the picker again. Falls back to null so the caller can
// prompt for a fresh pairing instead — e.g. if the device is out of range,
// or (on Android) if the OS-level bond was removed since.
export async function reconnectLastPrinter(deviceId: string): Promise<ConnectedPrinter | null> {
  try {
    await ensureInitialized()
    const [device] = await BleClient.getDevices([deviceId])
    if (!device) return null
    return await connectToDevice(device.deviceId, device.name || 'Bluetooth printer')
  } catch {
    return null
  }
}
