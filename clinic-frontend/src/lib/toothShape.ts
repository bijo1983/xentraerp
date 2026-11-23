// Anatomical tooth outlines for the odontogram (buccal view), built per FDI tooth.
// Local coordinates: x in [0, w], y in [0, H]; roots at the top (apex near y=0), the biting edge at y=H.
// Lower teeth are drawn with the same shape flipped vertically, so their roots point down.

export const H = 100
export const NECK = 56 // cemento-enamel junction

export type ToothKind = 'central' | 'lateral' | 'canine' | 'premolar' | 'molar'

export interface ToothInfo {
  kind: ToothKind
  upper: boolean
  primary: boolean
  /** true when the tooth's mesial side faces the viewer's right (patient's right side: quadrants 1, 4, 5, 8) */
  mesialRight: boolean
  anterior: boolean
}

export function toothInfo(t: number): ToothInfo {
  const q = Math.floor(t / 10)
  const n = t % 10
  const primary = q >= 5
  let kind: ToothKind
  if (n === 1) kind = 'central'
  else if (n === 2) kind = 'lateral'
  else if (n === 3) kind = 'canine'
  else if (!primary && n <= 5) kind = 'premolar'
  else kind = 'molar'
  return { kind, upper: [1, 2, 5, 6].includes(q), primary, mesialRight: [1, 4, 5, 8].includes(q), anterior: n <= 3 }
}

const WIDTH: Record<string, number[]> = {
  // index = tooth number within the quadrant (1..8)
  upper: [0, 31, 25, 28, 27, 26, 40, 37, 33],
  lower: [0, 22, 23, 26, 27, 27, 42, 40, 36],
  primaryUpper: [0, 24, 20, 23, 0, 30, 34],
  primaryLower: [0, 18, 19, 21, 0, 31, 36],
}

export function toothWidth(t: number): number {
  const { upper, primary } = toothInfo(t)
  const n = t % 10
  if (primary) return (upper ? WIDTH.primaryUpper : WIDTH.primaryLower)[n === 4 ? 5 : n === 5 ? 6 : n]
  return (upper ? WIDTH.upper : WIDTH.lower)[n]
}

function f(n: number) {
  return Math.round(n * 10) / 10
}

/** Crown outline: from the neck, out to the widest point, along the biting edge and back. */
export function crownPath(t: number): string {
  const { kind } = toothInfo(t)
  const w = toothWidth(t)
  const nw = w * (kind === 'molar' ? 0.74 : 0.6)
  const nl = (w - nw) / 2
  const nr = w - nl
  const side = kind === 'molar' ? 90 : kind === 'premolar' ? 88 : kind === 'canine' ? 84 : 92
  let edge: string
  if (kind === 'central' || kind === 'lateral') {
    edge = `Q 1.5 ${H - 1} 5 ${H - 1} L ${f(w - 5)} ${H - 1} Q ${f(w - 1.5)} ${H - 1} ${f(w - 1.5)} ${side}`
  } else if (kind === 'canine') {
    edge = `Q ${f(w * 0.22)} ${H - 7} ${f(w / 2)} ${H} Q ${f(w * 0.78)} ${H - 7} ${f(w - 1.5)} ${side}`
  } else if (kind === 'premolar') {
    edge = `Q ${f(w * 0.2)} ${H - 3} ${f(w / 2)} ${H - 0.5} Q ${f(w * 0.8)} ${H - 3} ${f(w - 1.5)} ${side}`
  } else {
    edge =
      `Q ${f(w * 0.08)} ${H - 1} ${f(w * 0.27)} ${H - 0.5} Q ${f(w * 0.4)} ${H} ${f(w * 0.5)} ${H - 5} ` +
      `Q ${f(w * 0.6)} ${H} ${f(w * 0.73)} ${H - 0.5} Q ${f(w * 0.92)} ${H - 1} ${f(w - 1.5)} ${side}`
  }
  return (
    `M ${f(nl)} ${NECK} C ${f(nl - w * 0.14)} ${NECK + 4} 1 ${NECK + 10} 1.5 ${side} ${edge} ` +
    `C ${f(w - 1)} ${NECK + 10} ${f(nr + w * 0.14)} ${NECK + 4} ${f(nr)} ${NECK} Q ${f(w / 2)} ${NECK - 4} ${f(nl)} ${NECK} Z`
  )
}

interface Root {
  path: string
  canal: string
  back?: boolean
}

function oneRoot(x0: number, x1: number, apexX: number, apexY: number, back = false): Root {
  const cx = (x0 + x1) / 2
  const r = ((x1 - x0) / 2) * 0.42 // half-width just above the rounded apex
  return {
    back,
    path:
      `M ${f(x0)} ${NECK + 2} C ${f(x0)} ${NECK - 20} ${f(apexX - r * 1.5)} ${f(apexY + 16)} ${f(apexX - r)} ${f(apexY + 4)} ` +
      `Q ${f(apexX)} ${f(apexY - 2)} ${f(apexX + r)} ${f(apexY + 4)} ` +
      `C ${f(apexX + r * 1.5)} ${f(apexY + 16)} ${f(x1)} ${NECK - 20} ${f(x1)} ${NECK + 2} Z`,
    canal: `M ${f(cx)} ${NECK + 8} Q ${f((cx + apexX) / 2)} ${f((NECK + apexY) / 2)} ${f(apexX)} ${f(apexY + 4)}`,
  }
}

/** Roots for the tooth: number and spread follow the tooth type and arch. */
export function roots(t: number): Root[] {
  const { kind, upper, primary } = toothInfo(t)
  const n = t % 10
  const w = toothWidth(t)
  const nw = w * (kind === 'molar' ? 0.74 : 0.6)
  const nl = (w - nw) / 2
  const nr = w - nl
  const short = primary ? 16 : 0
  if (kind !== 'molar' && !(kind === 'premolar' && upper && n === 4)) {
    const apex = (kind === 'canine' ? 2 : kind === 'premolar' ? 10 : kind === 'lateral' ? 12 : 8) + short
    return [oneRoot(nl + 1, nr - 1, w / 2 + (upper ? 1 : -1), apex)]
  }
  if (kind === 'premolar') {
    // upper first premolar: buccal and palatal roots
    const mid = w / 2
    return [oneRoot(nl + 1, mid + 1, mid - 3, 12 + short), oneRoot(mid - 1, nr - 1, mid + 3, 14 + short)]
  }
  const spread = primary ? 6 : 1
  const apex = 14 + short
  const mid = w / 2
  const list: Root[] = []
  if (upper) list.push({ ...oneRoot(mid - nw * 0.22, mid + nw * 0.22, mid, apex - 6, true), back: true })
  list.push(oneRoot(nl + 1, mid - 1.5, nl + 2 - spread, apex))
  list.push(oneRoot(mid + 1.5, nr - 1, nr - 2 + spread, apex + 2))
  return list
}

/** Five charting surfaces of a tooth's occlusal view, as polygons in a square of side s at (x, y). */
export function surfaces(t: number, x: number, y: number, s: number) {
  const { upper, mesialRight, anterior } = toothInfo(t)
  const i = s * 0.3
  const p = (pts: number[][]) => pts.map(([a, b]) => `${f(a)},${f(b)}`).join(' ')
  const top = p([[x, y], [x + s, y], [x + s - i, y + i], [x + i, y + i]])
  const bottom = p([[x, y + s], [x + s, y + s], [x + s - i, y + s - i], [x + i, y + s - i]])
  const left = p([[x, y], [x + i, y + i], [x + i, y + s - i], [x, y + s]])
  const right = p([[x + s, y], [x + s - i, y + i], [x + s - i, y + s - i], [x + s, y + s]])
  const center = p([[x + i, y + i], [x + s - i, y + i], [x + s - i, y + s - i], [x + i, y + s - i]])
  // Upper row: the outer (top) side is buccal; lower row: the outer (bottom) side is buccal.
  return [
    { code: upper ? 'B' : 'L', points: top },
    { code: upper ? 'L' : 'B', points: bottom },
    { code: mesialRight ? 'D' : 'M', points: left },
    { code: mesialRight ? 'M' : 'D', points: right },
    { code: anterior ? 'I' : 'O', points: center },
  ]
}

export const SURFACE_NAME: Record<string, string> = { M: 'mesial', D: 'distal', B: 'buccal', L: 'lingual/palatal', O: 'occlusal', I: 'incisal' }
