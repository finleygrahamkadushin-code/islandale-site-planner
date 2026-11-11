import { signedArea, type LocalPoint } from '../footprint'
import { pointInPolygon } from '../foundation/foundation'
import { massBuildingPoly, massPoly, massToBuilding, type Mass } from '../masses'
import { stateOf, type EdgeDraw, type RailState } from './railEdits'
import { inIntervals, keepRuns, MIN_RUN_M, sampledRuns, type Interval } from './railOpenings'
import { DROP_PROBE_M, GUARD_DROP_M, guardRule, wingDropM } from './rails'
import { M_PER_FT as FT } from '../../site/units'

/**
 * Which edges of a deck or porch get a guard, and where along each edge
 * it runs (legacy attach-core rails() plus the old planner's whole-wing
 * rule). Mass frame, feet in; drops and runs in metres.
 *
 * Two regimes (Phase 5A, a deliberate change recorded in PLAN.md):
 * - a wing or standalone deck with no `rails` map draws what the old
 *   planner's 3D draws today (rails.ts guardRule, or the standalone deck's
 *   whole-deck drop), so the schemes look as they did;
 * - once a map exists every edge follows the per-edge rule:
 *   drawn = !step && (on || (free && auto && drop > 30 in)); an explicit on
 *   draws a covered edge too, so materialising keeps the runs the whole-wing
 *   rule drew there.
 */

/** Legacy edgeFree probes: a point 0.3 ft out from the edge's midpoint, and other masses' edges within 0.6 ft of it. */
const FREE_PROBE_FT = 0.3
const FREE_NEAR_FT = 0.6
/** Legacy raisedRail onWall: porch rail points within 0.6 ft of the main walls are left out. */
const ON_WALL_FT = 0.6
/** Porch edges shorter than this get no rail (legacy raisedRail). */
const PORCH_MIN_EDGE_M = 0.2

/** What lies along an edge to keep open (metres from its first vertex), and the names of what opens it. */
export interface EdgeOpenings {
  readonly intervals: readonly Interval[]
  readonly names: readonly string[]
}

const NO_OPENINGS: EdgeOpenings = { intervals: [], names: [] }

/** One edge's rail, as the panel, the chips and the scene all read it. */
export interface EdgeRail extends EdgeDraw {
  readonly i: number
  /** The stored state; a wing with no map reads auto everywhere. */
  readonly state: RailState
  /** A guard is required here: the edge is free, not a step, and more than 30 in up. */
  readonly required: boolean
  /** A guard is drawn along the edge (before openings). */
  readonly drawn: boolean
  readonly dropFt: number
  readonly lenFt: number
  readonly openings: readonly Interval[]
  readonly names: readonly string[]
  /** Where the guard actually runs, metres along the edge; empty when not drawn. */
  readonly runs: readonly Interval[]
}

/** The ground and floor of one railable mass, and what opens its edges. */
export interface RailMassSite {
  /** Absolute elevation of the mass floor, metres (a standalone deck: its top). */
  readonly floor: number
  /** Ground under a mass-local point (feet), metres. */
  readonly groundAt: (x: number, z: number) => number
  /** A standalone deck: one surface, no slab, every edge free, and its drop for the legacy rule. */
  readonly standalone?: { readonly dropM: number }
  readonly openings?: (i: number) => EdgeOpenings
}

const isAccess = (m: Pick<Mass, 'kind'>) => m.kind === 'stair' || m.kind === 'ramp'

/** Whether a mass ever carries a guard (legacy rail-edit railable): a deck or porch wing. */
export const isRailable = (m: Pick<Mass, 'kind'>): boolean => m.kind === 'deck' || m.kind === 'porch'

/** The outward unit normal of edge i of an outline (legacy attach-core edges: from the signed area). */
export function outwardNormal(poly: readonly LocalPoint[], i: number): LocalPoint {
  const a = poly[i]
  const b = poly[(i + 1) % poly.length]
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const ux = (b[0] - a[0]) / L
  const uz = (b[1] - a[1]) / L
  return signedArea(poly) >= 0 ? [uz, -ux] : [-uz, ux]
}

/** Where edgeDropM reads the ground: fractions along the edge, and distances out from it (metres, out to the 36 in the guard rule looks). */
const DROP_ALONG = [0, 0.25, 0.5, 0.75, 1]
const DROP_OUT_M = [DROP_PROBE_M / 3, (2 * DROP_PROBE_M) / 3, DROP_PROBE_M]

/**
 * The drop a guard is judged by (after legacy edgeDropFt): from the walking
 * surface along edge i, as drawn (the mass floor: decks and porches have
 * their top there; deliberate change, R3.6: the legacy 0.15 m slab is not
 * added), to the lowest ground within 0.9 m (36 in) outside it, read at
 * five points along the edge and three distances out (the legacy read only
 * its ends and middle at 0.9 m), metres.
 */
export function edgeDropM(poly: readonly LocalPoint[], i: number, floor: number, groundAt: (x: number, z: number) => number): number {
  const a = poly[i]
  const b = poly[(i + 1) % poly.length]
  const [nx, nz] = outwardNormal(poly, i)
  const lowest = Math.min(
    ...DROP_ALONG.flatMap((t) => {
      const x = a[0] + (b[0] - a[0]) * t
      const z = a[1] + (b[1] - a[1]) * t
      return DROP_OUT_M.map((out) => groundAt(x + (nx * out) / FT, z + (nz * out) / FT))
    }),
  )
  return Math.max(0, floor - lowest)
}

/** The closest point to p on segment a→b. */
function closest(p: LocalPoint, a: LocalPoint, b: LocalPoint): LocalPoint {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const LL = dx * dx + dz * dz
  const t = LL ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / LL)) : 0
  return [a[0] + dx * t, a[1] + dz * t]
}

/**
 * Port of legacy attach-core edgeFree: edge i of mass mi is free when no
 * other mass of the building covers it, meaning the point 0.3 ft out from
 * its midpoint is outside every other mass and no other mass's edge comes
 * within 0.6 ft of the midpoint on the outside. Stairs and ramps do not
 * cover the edge they hang from (a stair's own edges are covered by
 * whatever they touch), and roof-only porches (slab false) cover nothing.
 */
export function edgeFree(masses: readonly Mass[], mi: number, i: number): boolean {
  const self = masses[mi]
  if (!self) return false
  const P = massBuildingPoly(self)
  const a = P[i]
  const b = P[(i + 1) % P.length]
  if (!a || !b) return false
  const mid: LocalPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const [nx, nz] = outwardNormal(P, i)
  const probe: LocalPoint = [mid[0] + nx * FREE_PROBE_FT, mid[1] + nz * FREE_PROBE_FT]
  return masses.every((mj, j) => {
    if (j === mi || (!isAccess(self) && isAccess(mj)) || !mj.slab) return true
    const Q = massBuildingPoly(mj)
    if (Q.length < 3) return true
    if (pointInPolygon(Q, probe[0], probe[1])) return false
    return Q.every((A, k) => {
      const c = closest(mid, A, Q[(k + 1) % Q.length])
      const near = Math.hypot(c[0] - mid[0], c[1] - mid[1]) < FREE_NEAR_FT
      return !(near && (c[0] - mid[0]) * nx + (c[1] - mid[1]) * nz >= -0.01)
    })
  })
}

/** What the whole-wing rule (no map) draws on each edge: rails.ts guardRule, or a standalone deck's whole-deck drop. */
function legacyDraws(m: Mass, poly: readonly LocalPoint[], site: RailMassSite): boolean[] {
  const n = poly.length
  if (site.standalone) {
    const on = m.rail !== false && (m.rail === true || site.standalone.dropM > GUARD_DROP_M)
    return Array.from({ length: n }, () => on)
  }
  if (m.kind === 'porch' && !m.slab) return Array.from({ length: n }, () => false)
  const skip = guardRule(m, n, wingDropM(poly, site.floor, site.groundAt))
  return Array.from({ length: n }, (_, i) => !!skip && !skip(i))
}

/** Whether a porch rail point (mass frame) lies within 0.6 ft of the main walls (legacy raisedRail onWall). */
function onMainWalls(masses: readonly Mass[], m: Mass): (p: LocalPoint) => boolean {
  const main = masses[0] && masses[0] !== m ? massBuildingPoly(masses[0]) : []
  return (p) => {
    const q = massToBuilding(m, p)
    return main.some((A, k) => {
      const c = closest(q, A, main[(k + 1) % main.length])
      return Math.hypot(c[0] - q[0], c[1] - q[1]) < ON_WALL_FT
    })
  }
}

/**
 * Every edge of mass mi with its state, whether a guard is required and
 * drawn, its drop, its openings and the runs the guard keeps; null for a
 * mass that never carries a guard (main walls, wall wings, stairs, ramps).
 * A standalone deck is `[deckObjectMass(params)]` with mi 0.
 */
export function resolveEdges(masses: readonly Mass[], mi: number, site: RailMassSite): EdgeRail[] | null {
  const m = masses[mi]
  if (!m || !isRailable(m)) return null
  const poly = massPoly(m)
  const n = poly.length
  const deck = !!site.standalone
  const mapped = m.rails !== undefined
  const legacy = legacyDraws(m, poly, site)
  const onWall = m.kind === 'porch' && !deck ? onMainWalls(masses, m) : null
  return poly.map((a, i) => {
    const b = poly[(i + 1) % n]
    const lenFt = Math.hypot(b[0] - a[0], b[1] - a[1])
    const L = lenFt * FT
    const step = !deck && ((!!m.steps && i >= m.steps.e0 && i <= m.steps.e1) || !m.slab)
    const free = deck || edgeFree(masses, mi, i)
    const dropM = edgeDropM(poly, i, site.floor, site.groundAt)
    const required = !step && free && dropM > GUARD_DROP_M
    const state: RailState = mapped ? stateOf(m.rails, m.rail, i, n) : 'auto'
    // an explicit on draws a covered edge too, so the first per-edge write keeps the runs the whole-wing rule drew there
    const perEdge = !step && (state === 'on' || (free && state === 'auto' && required))
    const drawn = mapped ? perEdge : legacy[i]
    const { intervals, names } = site.openings?.(i) ?? NO_OPENINGS
    let runs: Interval[] = []
    if (drawn && onWall) {
      if (L >= PORCH_MIN_EDGE_M) {
        const at = (u: number): LocalPoint => [a[0] + ((b[0] - a[0]) * u) / L, a[1] + ((b[1] - a[1]) * u) / L]
        runs = sampledRuns(L, (u) => onWall(at(u)) || inIntervals(intervals, u))
      }
    } else if (drawn && L >= MIN_RUN_M) runs = keepRuns(intervals, L)
    return { i, state, required, drawn, free, legacy: legacy[i], auto: !step && free && required, dropFt: dropM / FT, lenFt, openings: intervals, names, runs }
  })
}
