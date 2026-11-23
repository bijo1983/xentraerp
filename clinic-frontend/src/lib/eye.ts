// Regions of the eye drawing (anterior segment + fundus) and their common findings.
// The first finding of each region is the normal one: a region set to it is not highlighted.
export type EyeSide = 'od' | 'os'

export interface EyeRegion {
  key: string
  label: string
  view: 'anterior' | 'fundus'
  findings: string[]
}

export const EYE_REGIONS: EyeRegion[] = [
  { key: 'lids', label: 'Lids & lashes', view: 'anterior', findings: ['Normal', 'Blepharitis', 'Chalazion', 'Stye', 'Ptosis', 'Entropion', 'Ectropion', 'Trichiasis'] },
  { key: 'conjunctiva', label: 'Conjunctiva / sclera', view: 'anterior', findings: ['White & quiet', 'Injected', 'Pterygium', 'Pinguecula', 'Subconjunctival haemorrhage', 'Discharge', 'Follicles / papillae'] },
  { key: 'cornea', label: 'Cornea', view: 'anterior', findings: ['Clear', 'Abrasion', 'Ulcer', 'Opacity / scar', 'Punctate staining (dry eye)', 'Oedema', 'Keratoconus', 'Arcus'] },
  { key: 'ac', label: 'Anterior chamber', view: 'anterior', findings: ['Deep & quiet', 'Shallow', 'Cells / flare', 'Hyphaema', 'Hypopyon'] },
  { key: 'iris', label: 'Iris', view: 'anterior', findings: ['Normal', 'Rubeosis', 'Posterior synechiae', 'Coloboma', 'Peripheral iridotomy', 'Atrophy'] },
  { key: 'pupil', label: 'Pupil', view: 'anterior', findings: ['Round & reactive', 'RAPD', 'Irregular', 'Fixed dilated', 'Miosed', 'Sluggish'] },
  { key: 'lens', label: 'Lens', view: 'anterior', findings: ['Clear', 'Nuclear sclerosis', 'Cortical cataract', 'Posterior subcapsular cataract', 'Mature cataract', 'Pseudophakia (IOL)', 'Aphakia'] },
  { key: 'disc', label: 'Optic disc', view: 'fundus', findings: ['Healthy', 'Glaucomatous cupping', 'Pallor', 'Swelling', 'Disc haemorrhage', 'Tilted'] },
  { key: 'macula', label: 'Macula', view: 'fundus', findings: ['Normal', 'Drusen', 'Oedema', 'Hard exudates', 'Haemorrhage', 'Scar', 'Hole', 'Epiretinal membrane'] },
  { key: 'vessels', label: 'Vessels', view: 'fundus', findings: ['Normal', 'AV nipping', 'Arteriolar narrowing', 'Tortuous', 'Vein occlusion', 'Artery occlusion', 'Neovascularisation'] },
  { key: 'retina', label: 'Retina / periphery', view: 'fundus', findings: ['Flat & attached', 'Dot-blot haemorrhages', 'Cotton-wool spots', 'Laser scars', 'Retinal tear', 'Detachment', 'Lattice degeneration'] },
]

export const REGION = Object.fromEntries(EYE_REGIONS.map((r) => [r.key, r])) as Record<string, EyeRegion>

export function isAbnormal(region: string, finding: string | undefined): boolean {
  return !!finding && REGION[region]?.findings[0] !== finding
}

export const EYE_LABEL: Record<EyeSide, string> = { od: 'Right eye (OD)', os: 'Left eye (OS)' }

export interface EyeValue {
  od?: Record<string, string>
  os?: Record<string, string>
  od_cd?: number
  os_cd?: number
}

/** "OD: Lens Nuclear sclerosis; OS: …" — only abnormal findings, for summaries and reprints. */
export function eyeSummary(v: EyeValue | undefined): string[] {
  const out: string[] = []
  for (const side of ['od', 'os'] as EyeSide[]) {
    const f = Object.entries(v?.[side] || {}).filter(([k, x]) => isAbnormal(k, x))
    const cd = v?.[`${side}_cd`]
    const parts = f.map(([k, x]) => `${REGION[k]?.label || k}: ${x}`)
    if (cd) parts.push(`C/D ${cd.toFixed(2)}`)
    if (parts.length) out.push(`${side.toUpperCase()} — ${parts.join(', ')}`)
  }
  return out
}
