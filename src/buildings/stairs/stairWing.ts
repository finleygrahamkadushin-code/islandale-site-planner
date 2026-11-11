import type { LocalPoint } from '../footprint'
import { pointInPolygon, pointSegmentDistance } from '../../site/geom2d'
import { buildingToMass, massBuildingPoly, type Mass } from '../masses'
import type { RailStyle } from '../rails/railEdits'
import { boundaryPts, type TopEdge, type XZ } from './stairCurve'
import { planStair, type StairPlan, type StairSpec } from './stairPlan'
import { M_PER_FT as FT } from '../../site/units'

/**
 * A stair or ramp wing's planStair input, as the old stairWingSpec builds
 * it: the run is the wing's depth, the top meets the nearest edge of
 * another mass at its level, and the drop is measured once at the foot.
 */

/** The old planner's drop never goes under 0.3 m (legacy wdrop clamp). */
export const MIN_DROP_M = 0.3
/** A host edge counts when it passes within this of the stair's top centre (building feet). */
const HOST_FT = 1.5
const SAME_LEVEL_FT = 0.5

const isAccess = (m: Pick<Mass, 'kind'>) => m.kind === 'stair' || m.kind === 'ramp'

/** Ground and floor for an access wing, in its mass frame (feet in, metres out). */
export interface AccessSite {
  /** Absolute elevation of the mass floor (building floor + level), metres. */
  readonly floor: number
  readonly groundAt: (x: number, z: number) => number
  /** A door at the top: the handrails start back from it. */
  readonly clearTop?: boolean
  readonly railStyle?: RailStyle
}

export interface WingHost {
  readonly mi: number
  readonly i: number
  /** The host's outline in the building frame, feet. */
  readonly P: readonly LocalPoint[]
}

/**
 * The edge a stair or ramp wing hangs from (legacy wingHost, its
 * nearest-edge fallback): the edge nearest the wing's top centre, within
 * 1.5 ft, of a mass that is not a stair or ramp and is at the same level.
 */
export function wingHost(masses: readonly Mass[], mi: number): WingHost | null {
  const m = masses[mi]
  if (!m) return null
  const a = (m.rot * Math.PI) / 180
  const T: LocalPoint = [m.dx - (Math.sin(a) * m.d) / 2, m.dz - (Math.cos(a) * m.d) / 2]
  let best = HOST_FT
  let host: WingHost | null = null
  masses.forEach((hm, k) => {
    if (k === mi || isAccess(hm) || Math.abs(hm.lvl - m.lvl) >= SAME_LEVEL_FT) return
    const P = massBuildingPoly(hm)
    P.forEach((p, i) => {
      const d = pointSegmentDistance(T, p, P[(i + 1) % P.length])
      if (d < best) {
        best = d
        host = { mi: k, i, P }
      }
    })
  })
  return host
}

/** Snap to porch looks this far along the stair's centre line for an edge to meet (building feet). */
export const SNAP_FT = 12
const SNAP_DONE_FT = 0.05

/** The top centre of access wing m and the unit direction down its run, building feet. */
export function stairAxis(m: Pick<Mass, 'dx' | 'dz' | 'rot' | 'd'>): { readonly top: LocalPoint; readonly down: LocalPoint } {
  const a = (m.rot * Math.PI) / 180
  const down: LocalPoint = [Math.sin(a), Math.cos(a)]
  return { top: [m.dx - (down[0] * m.d) / 2, m.dz - (down[1] * m.d) / 2], down }
}

/** Where the line p + t·u crosses segment ab, as t, or null when it misses or runs along it. */
function crossAt(p: LocalPoint, u: LocalPoint, a: LocalPoint, b: LocalPoint): number | null {
  const ex = b[0] - a[0]
  const ez = b[1] - a[1]
  const den = u[0] * ez - u[1] * ex
  if (Math.abs(den) < 1e-9) return null
  const qx = a[0] - p[0]
  const qz = a[1] - p[1]
  const s = (qx * u[1] - qz * u[0]) / den
  if (s < -1e-9 || s > 1 + 1e-9) return null
  return (qx * ez - qz * ex) / den
}

/**
 * Snap to porch (deliberate addition, PLAN.md): the offset that slides
 * access wing mi along its own run until its top meets the nearest edge of
 * a deck, porch or walls at its level, within SNAP_FT, with the stair left
 * outside that part. Null when it already meets one or none is in reach.
 */
export function snapToHost(masses: readonly Mass[], mi: number): { readonly dx: number; readonly dz: number } | null {
  const m = masses[mi]
  if (!m || !isAccess(m)) return null
  const { top, down } = stairAxis(m)
  let best: number | null = null
  masses.forEach((hm, k) => {
    if (k === mi || isAccess(hm) || Math.abs(hm.lvl - m.lvl) >= SAME_LEVEL_FT) return
    const P = massBuildingPoly(hm)
    P.forEach((a, i) => {
      const t = crossAt(top, down, a, P[(i + 1) % P.length])
      if (t === null || Math.abs(t) > SNAP_FT) return
      // the stair hangs off the outside: just down from the new top is not inside this part
      const probe: LocalPoint = [top[0] + down[0] * (t + 0.25), top[1] + down[1] * (t + 0.25)]
      if (pointInPolygon(P, probe[0], probe[1])) return
      if (best === null || Math.abs(t) < Math.abs(best)) best = t
    })
  })
  if (best === null || Math.abs(best) < SNAP_DONE_FT) return null
  const t: number = best
  const r = (v: number) => Math.round(v * 1000) / 1000
  return { dx: r(m.dx + down[0] * t), dz: r(m.dz + down[1] * t) }
}

/** A building-frame point (feet) in the wing's stair frame (metres). */
const toStair = (m: Mass, p: LocalPoint): XZ => {
  const [x, z] = buildingToMass(m, p)
  return [x * FT, z * FT]
}

/** Where the top meets the host (legacy wingTopEdge): the sampled host outline, else the host edge's line. */
export function wingTopEdge(m: Mass, host: WingHost): TopEdge {
  const w = m.w * FT
  const run = m.d * FT
  const Pst = host.P.map((p) => toStair(m, p))
  const pts = boundaryPts(Pst, w, run)
  if (pts) return { pts }
  const a = Pst[host.i]
  const b = Pst[(host.i + 1) % Pst.length]
  return a && b ? { a, b } : null
}

/**
 * The drop from the top walking surface to the ground at the nominal foot
 * (new-app datum, PLAN.md: no 0.15 m slab): max(0.3, building floor −
 * ground) + level, less the foot's height above the ground when the foot
 * is pinned (footZ).
 */
export function wingDropAtFoot(m: Mass, site: Pick<AccessSite, 'floor' | 'groundAt'>): number {
  const lvlM = m.lvl * FT
  const gFoot = site.groundAt(0, m.d / 2)
  const drop = Math.max(MIN_DROP_M, site.floor - lvlM - gFoot) + lvlM
  return m.footZ !== undefined ? Math.max(0.05, drop - (m.footZ - gFoot)) : drop
}

/** The planStair input for access wing mi, with the host it was fitted to. */
export function wingStairSpec(masses: readonly Mass[], mi: number, site: AccessSite): (StairSpec & { readonly host: WingHost | null }) | null {
  const m = masses[mi]
  if (!m || !isAccess(m)) return null
  const host = wingHost(masses, mi)
  return {
    kind: m.kind === 'ramp' ? 'ramp' : 'stair',
    w: m.w * FT,
    run: m.d * FT,
    drop: wingDropAtFoot(m, site),
    topEdge: host ? wingTopEdge(m, host) : null,
    nosing: 0.025,
    style: site.railStyle ?? 'wood',
    rail: m.rail !== false,
    // per-side handrails (edge 1 right, 3 left), and Join on by default where the stair meets a part at its top
    railOff: ([-1, 1] as const).filter((sg) => m.rails?.[sg > 0 ? 1 : 3] === false),
    railJoin: host ? ([-1, 1] as const).filter((sg) => m.railJoin?.[sg > 0 ? 1 : 3] !== false) : [],
    clearTop: !!site.clearTop,
    groundAt: (z) => site.groundAt(0, z / FT) - site.floor,
    footPlate: m.footZ === undefined,
    host,
  }
}

/** The planned stair or ramp of access wing mi, or null for any other mass. */
export function planWingStair(masses: readonly Mass[], mi: number, site: AccessSite): StairPlan | null {
  const spec = wingStairSpec(masses, mi, site)
  return spec ? planStair(spec) : null
}
