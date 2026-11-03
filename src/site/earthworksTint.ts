import { EARTH_CLASS, type EarthField, type SiteEarthworks } from './earthworksTypes'

/**
 * Ground tints for the earthworks (legacy earthColor): pond mud, the
 * levelled court, raised berms, wet margins and cut banks, each a colour
 * the base ground colour is blended toward by some amount.
 */

export type TintKind = 'mud' | 'court' | 'berm' | 'wet' | 'bank'

/** Legacy cMud, cCourt, cBerm, cWet and cBank. */
export const EARTH_TINTS: Readonly<Record<TintKind, string>> = {
  mud: '#5d5a3e',
  court: '#bdb29b',
  berm: '#97b96f',
  wet: '#6f9a55',
  bank: '#9a8f6c',
}

export interface EarthTint {
  readonly kind: TintKind
  readonly colour: string
  /** How far to blend the ground colour toward `colour`, 0–1. */
  readonly amount: number
}

const tint = (kind: TintKind, amount: number): EarthTint => ({ kind, colour: EARTH_TINTS[kind], amount })

/** The tint of one raster sample, or null where the ground is untouched. */
export function sampleTint(f: EarthField, k: number): EarthTint | null {
  const dz = f.z[k] - f.zb[k]
  const cls = f.cls[k]
  if (cls === EARTH_CLASS.pond) return tint('mud', Math.min(1, 0.45 + f.str[k] * 0.55))
  if (cls === EARTH_CLASS.court && dz < -0.05) return tint('court', 0.85)
  if (dz > 0.03) return tint('berm', Math.min(0.75, (dz / 0.5) * 0.75))
  if (cls === EARTH_CLASS.wet) return tint('wet', 0.55 * f.str[k] + 0.1)
  if (dz < -0.03) return tint('bank', Math.min(0.6, (-dz / 0.4) * 0.6))
  return null
}

/** The tint at a site point (its nearest raster sample), or null off the earthworks. */
export function earthTintAt(works: Pick<SiteEarthworks, 'fields'>, x: number, n: number): EarthTint | null {
  for (const f of works.fields) {
    const I = Math.round((x - f.x0) / f.h)
    const J = Math.round((n - f.n0) / f.h)
    if (I < 0 || J < 0 || I > f.ni || J > f.nj) continue
    return sampleTint(f, J * (f.ni + 1) + I)
  }
  return null
}
