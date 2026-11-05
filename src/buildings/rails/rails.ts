import type { LocalPoint } from '../footprint'
import type { Mass } from '../masses'
import type { Interval } from './railOpenings'

const FT = 0.3048
/** Legacy GUARD_FT = 2.5: a walking surface more than 30 in above the ground gets a guard. */
export const GUARD_DROP_M = 2.5 * FT
export { GUARD_HEIGHT_M } from './railStyles'

/** Outlines with more edges than this are curves; legacy 'sides' only applies to straight-sided decks. */
export const CURVED_EDGES = 24
/** Legacy surfaceDropFt and edgeDropFt probe the ground this far outside an outline (0.9 m). */
export const DROP_PROBE_M = 0.9
const DROP_PROBE_FT = DROP_PROBE_M / FT
/** Legacy SLAB_M: a wing's walking surface sits this far above its floor, so it adds to the drop. */
export const SLAB_M = 0.15

/**
 * Port of legacy surfaceDropFt(): the largest drop from a wing's walking
 * surface to the ground just outside it, metres. The ground is read 0.9 m
 * out from each corner and edge midpoint, away from the outline's centre.
 * `groundAt` takes a point in the outline's own frame (feet).
 */
export function wingDropM(poly: readonly LocalPoint[], floor: number, groundAt: (x: number, z: number) => number, slabM = SLAB_M): number {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const cz = poly.reduce((s, p) => s + p[1], 0) / poly.length
  let drop = 0
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]
    for (const [x, z] of [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]]) {
      const l = Math.hypot(x - cx, z - cz) || 1
      drop = Math.max(drop, floor - groundAt(x + ((x - cx) / l) * DROP_PROBE_FT, z + ((z - cz) / l) * DROP_PROBE_FT))
    }
  })
  return drop + slabM
}

/**
 * Which edges of a deck or porch floor get a guard, as the old planner
 * decides it; null when the wing has none. A deck wing is railed on every
 * edge (legacy massMesh deck branch), except edges with sitting steps and,
 * for rail 'sides', its ends (odd edges). A porch is railed all round when
 * it is raised above the floor, forced (rail true), or more than 30 in
 * above the ground anywhere just outside it (legacy raisedRail and
 * wingNeedsGuard). rail false: none at all.
 */
export function guardRule(m: Pick<Mass, 'kind' | 'rail' | 'lvl' | 'steps'>, edgeCount: number, dropM: number): ((i: number) => boolean) | null {
  if (m.rail === false) return null
  const steps = m.steps
  const onSteps = (i: number) => !!steps && i >= steps.e0 && i <= steps.e1
  if (m.kind === 'deck') {
    const sides = m.rail === 'sides' && edgeCount <= CURVED_EDGES
    return (i) => onSteps(i) || (sides && i % 2 === 1)
  }
  return m.rail === true || m.lvl > 0 || dropM > GUARD_DROP_M ? onSteps : null
}

/**
 * The kept runs of every edge (metres along edge i from its first vertex)
 * joined into polylines in the outline's frame (feet): a run that ends at
 * a corner carries on into the next edge's run when that starts there, and
 * a guard that goes all the way round comes back to its start.
 */
export function joinEdgeRuns(poly: readonly LocalPoint[], runs: readonly (readonly Interval[])[]): LocalPoint[][] {
  const n = poly.length
  type Seg = { i: number; a: LocalPoint; b: LocalPoint; fromCorner: boolean; toCorner: boolean }
  const segs: Seg[] = []
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % n]
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) * FT
    if (!(L > 1e-9)) return
    const at = (u: number): LocalPoint => [p[0] + ((q[0] - p[0]) * u) / L, p[1] + ((q[1] - p[1]) * u) / L]
    for (const [u0, u1] of runs[i] ?? []) segs.push({ i, a: at(u0), b: at(u1), fromCorner: u0 <= 1e-6, toCorner: u1 >= L - 1e-6 })
  })
  const lines: { first: Seg; last: Seg; pts: LocalPoint[] }[] = []
  for (const s of segs) {
    const cur = lines[lines.length - 1]
    if (cur && cur.last.toCorner && s.fromCorner && s.i === cur.last.i + 1) {
      cur.pts.push(s.b)
      cur.last = s
    } else lines.push({ first: s, last: s, pts: [s.a, s.b] })
  }
  // the last line runs on through vertex 0 into the first
  if (lines.length > 1) {
    const head = lines[0]
    const tail = lines[lines.length - 1]
    if (tail.last.toCorner && tail.last.i === n - 1 && head.first.fromCorner && head.first.i === 0) {
      lines.pop()
      lines[0] = { first: tail.first, last: head.last, pts: [...tail.pts, ...head.pts.slice(1)] }
    }
  }
  return lines.map((l) => l.pts)
}
