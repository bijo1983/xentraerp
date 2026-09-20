// Web Bluetooth printing for common ESC/POS thermal receipt printers.
//
// TWO hard platform limits, worth knowing before debugging "it doesn't
// work" on real hardware:
//
// 1. Web Bluetooth only works in Chromium browsers (Chrome/Edge) on
//    Windows/macOS/Linux/Android/ChromeOS — Safari does not implement it
//    at all, on any OS, including macOS. A register running Safari will
//    never see the pairing dialog; it needs to run Chrome or Edge.
//
// 2. Web Bluetooth only talks to Bluetooth LOW ENERGY (BLE/GATT) devices.
//    A lot of cheap "Bluetooth" thermal printers actually use classic
//    Bluetooth SPP (serial port profile), not BLE — those printers are
//    invisible to this API entirely, by design (this isn't a bug to fix
//    here, it's a hardware/OS-level restriction). If a specific printer
//    never appears in the browser's device picker, that's almost always
//    why — check the printer's spec sheet for "BLE"/"Bluetooth Low
//    Energy" support, not just "Bluetooth".
//
// There is no single standard GATT profile for thermal printers (unlike,
// say, a Bluetooth keyboard). The UUIDs below cover the two profiles seen
// most often on generic 58mm/80mm ESC/POS printers sold under many
// different brand names — REAL_PRINTER_PROFILES may need a third entry
// added once this is tested against the client's actual hardware model.

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
  device: BluetoothDevice
  print: (bytes: Uint8Array) => Promise<void>
  disconnect: () => void
}

export function isBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

async function findWriteCharacteristic(server: BluetoothRemoteGATTServer) {
  for (const profile of KNOWN_PRINTER_PROFILES) {
    try {
      const service = await server.getPrimaryService(profile.service)
      const characteristic = await service.getCharacteristic(profile.writeCharacteristic)
      return characteristic
    } catch {
      // This device doesn't expose this particular profile — try the next
      // known one rather than failing outright.
    }
  }
  return null
}

// Opens the browser's device picker (must be called from a real user
// gesture, e.g. a button click — Web Bluetooth refuses to run otherwise).
// acceptAllDevices is deliberately used instead of filtering by service,
// since we don't know which of the known profiles a given printer uses
// until we've connected — Web Bluetooth still only lets us *read* the
// services listed in optionalServices once connected, which is why both
// known profiles are listed there regardless.
export async function pairPrinter(): Promise<ConnectedPrinter> {
  if (!isBluetoothAvailable()) {
    throw new Error('This browser does not support Bluetooth printing. Use Chrome or Edge.')
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ALL_SERVICE_UUIDS,
  })
  return connectToDevice(device)
}

async function connectToDevice(device: BluetoothDevice): Promise<ConnectedPrinter> {
  const server = await device.gatt?.connect()
  if (!server) throw new Error('Could not connect to this printer.')

  const characteristic = await findWriteCharacteristic(server)
  if (!characteristic) {
    throw new Error(
      "Connected, but this printer doesn't match a known profile. It may use classic Bluetooth (SPP) " +
        'rather than Bluetooth Low Energy, which this browser cannot reach — check the printer supports BLE.',
    )
  }

  // Most printer characteristics only accept small writes (~20 bytes on
  // many BLE stacks before negotiating a larger MTU) — chunk defensively
  // rather than assume the whole receipt fits in one write.
  const CHUNK_SIZE = 180
  async function print(bytes: Uint8Array) {
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.slice(offset, offset + CHUNK_SIZE)
      await characteristic!.writeValueWithoutResponse(chunk)
    }
  }

  return {
    device,
    print,
    disconnect: () => device.gatt?.disconnect(),
  }
}

// Reconnects to a printer the browser already has permission for, without
// showing the picker again — only works for a device this origin was
// granted access to in a previous pairPrinter() call, and only in browsers
// that implement getDevices() (Chrome/Edge; not yet universal). Falls back
// to null so the caller can prompt for a fresh pairing instead.
export async function reconnectLastPrinter(deviceId: string): Promise<ConnectedPrinter | null> {
  if (!isBluetoothAvailable() || !navigator.bluetooth.getDevices) return null
  const devices = await navigator.bluetooth.getDevices()
  const device = devices.find((d) => d.id === deviceId)
  if (!device) return null
  try {
    return await connectToDevice(device)
  } catch {
    return null
  }
}
