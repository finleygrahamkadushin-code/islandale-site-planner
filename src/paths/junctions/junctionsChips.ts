import type { Ground } from '../../site/earthworks/earthworks'
import type { Terrain } from '../../site/types'
import type { ObjectId, PlanObject } from '../../store/types'
import { isFlush, LEVEL_M, type Junction } from './junctions'
import { isHost, siteJunctions } from './junctionsSite'
import { fmtIn } from './levels'

/**
 * The "6 in step" chips (old level-floors levelLast and polish3
 * junctionChips): every junction on the site that steps more than ½ in
 * gets a warning chip at the point where it meets the edge, at the higher
 * of the two surfaces. A gap alone gets no chip. Pure.
 */

/** At most this many chips on the site. */
export const MAX_CHIPS = 60
/** The scene draws a chip this far above its junction, metres (true scale). */
export const CHIP_LIFT_M = 0.5

/** One junction on the site, with the host it belongs to. */
export interface SiteJunction extends Junction {
  readonly hostId: ObjectId
  /** The higher of the two surfaces, metres NAVD88. */
  readonly z: number
  readonly flush: boolean
}

export interface JunctionChip {
  readonly x: number
  readonly n: number
  /** Surface the chip stands on, metres NAVD88 (draw it CHIP_LIFT_M higher). */
  readonly z: number
  /** "6 in step". */
  readonly text: string
  readonly severity: 'warn'
  readonly hostId: ObjectId
}

/** Every junction of every building and standalone deck (legacy computeLast). */
export function allJunctions(objects: readonly PlanObject[], terrain: Terrain, ground: Ground): SiteJunction[] {
  return objects
    .filter((o) => isHost(o) && !o.hidden)
    .flatMap((o) => siteJunctions(o, objects, terrain, ground).map((j): SiteJunction => ({ ...j, hostId: o.id, z: Math.max(j.zHere, j.zOther), flush: isFlush(j) })))
}

/** Chips for the junctions that step more than ½ in, one per point and text, at most MAX_CHIPS. */
export function junctionChips(J: readonly SiteJunction[]): JunctionChip[] {
  const seen = new Set<string>()
  const out: JunctionChip[] = []
  for (const j of J) {
    if (out.length >= MAX_CHIPS) break
    if (!Number.isFinite(j.dz) || Math.abs(j.dz) <= LEVEL_M) continue
    const [x, n] = j.at
    if (!Number.isFinite(x) || !Number.isFinite(n)) continue
    const text = `${fmtIn(j.dz)} step`
    const key = `${x.toFixed(1)},${n.toFixed(1)},${text}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ x, n, z: Number.isFinite(j.z) ? j.z : j.zHere, text, severity: 'warn', hostId: j.hostId })
  }
  return out
}
