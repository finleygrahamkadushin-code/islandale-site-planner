import { partEdges } from '../../buildings/parts/attach'
import { localToSite } from '../../buildings/footprint'
import { edgeFree } from '../../buildings/rails/railRules'
import { partFrame } from '../../buildings/parts/partFrame'
import { stairTopOf, surfaceZ } from '../../buildings/rails/railWorld'
import type { Ground } from '../../site/earthworks/earthworks'
import type { Terrain } from '../../site/types'
import type { ObjectId, PlanObject } from '../../store/types'
import { FT, hyp, unit, type ConnectEnd, type P2 } from './connectSpec'

/**
 * What Connect can pick beyond the path snap targets (old connect glue
 * wingTops, edgeCands, edgeTarget, pickCandidate), site metres: the tops
 * of stair and ramp wings, free deck and porch edges as whole segments
 * (a picked point slides along them), and the nearest of a set of targets
 * to a point. Pure.
 */

export interface ConnectTarget extends ConnectEnd {
  readonly z: number
  readonly kind: string
  readonly label: string
  readonly owner?: ObjectId
  readonly mi?: number
  readonly edge?: number
}

/** A free deck or porch edge, site metres. */
export interface EdgeSegment {
  readonly a: P2
  readonly b: P2
  /** Outward unit normal. */
  readonly nrm: P2
  readonly z: number
  readonly label: string
  readonly owner: ObjectId
  readonly mi: number
  readonly edge: number
}

/** Corners keep picked points this far off, metres (2 ft). */
export const EDGE_MARGIN_M = 2 * FT
/** A point beats an edge this much closer, metres. */
const POINT_BIAS_M = 0.02

/** The top of every stair and ramp wing: its centre, flush with the floor it serves, `dir` from the wing toward the top. */
export function wingTopTargets(objects: readonly PlanObject[], terrain: Terrain, ground: Ground): ConnectTarget[] {
  return objects.flatMap((o) => {
    if (o.hidden || o.type !== 'house') return []
    const frame = partFrame(o, terrain, ground)
    if (!frame) return []
    return frame.masses.flatMap((m, mi): ConnectTarget[] => {
      if (m.kind !== 'stair' && m.kind !== 'ramp') return []
      const top = stairTopOf(o, m)
      return [{ x: top.c[0], n: top.c[1], z: surfaceZ(frame, m), dir: [-top.axis[0], -top.axis[1]], label: `${o.name} · ${m.kind === 'ramp' ? 'ramp' : 'stairs'} top`, kind: 'wingtop', owner: o.id, mi }]
    })
  })
}

/** Every free deck and porch edge of houses and standalone decks. */
export function deckEdgeSegments(objects: readonly PlanObject[], terrain: Terrain, ground: Ground): EdgeSegment[] {
  return objects.flatMap((o) => {
    if (o.hidden || (o.type !== 'house' && o.type !== 'deck')) return []
    const frame = partFrame(o, terrain, ground)
    if (!frame) return []
    return frame.masses.flatMap((m, mi): EdgeSegment[] => {
      if (m.kind !== 'deck' && m.kind !== 'porch') return []
      return partEdges(frame.masses, mi, frame.site)
        .filter((e) => edgeFree(frame.masses, mi, e.i))
        .map((e) => {
          const at = (p: readonly [number, number]) => localToSite(o.position, o.rotation, p)
          const n0 = at(e.mid)
          const n1 = at([e.mid[0] + e.n[0], e.mid[1] + e.n[1]])
          return { a: at(e.a), b: at(e.b), nrm: unit([n1[0] - n0[0], n1[1] - n0[1]]) ?? [1, 0], z: e.z, label: `${o.name} · ${m.name ?? m.kind} edge`, owner: o.id, mi, edge: e.i }
        })
    })
  })
}

/** The point of segment a–b nearest q: its parameter, the point and the distance. */
export function nearestOnSegment(a: P2, b: P2, q: P2): { t: number; x: number; n: number; d: number } {
  const dx = b[0] - a[0]
  const dn = b[1] - a[1]
  const L2 = dx * dx + dn * dn
  const t = Math.max(0, Math.min(1, L2 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dn) / L2 : 0))
  return { t, x: a[0] + dx * t, n: a[1] + dn * t, d: hyp(q[0] - a[0] - dx * t, q[1] - a[1] - dn * t) }
}

/** A picked point on an edge (its midpoint without q), kept `marginM` off the corners; it carries the edge so a stair top can slide. */
export function edgeTarget(e: EdgeSegment, q: P2 | null, marginM = EDGE_MARGIN_M): ConnectTarget {
  const L = hyp(e.b[0] - e.a[0], e.b[1] - e.a[1])
  const m = L > 0 ? Math.min(0.5, marginM / L) : 0.5
  const t = Math.max(m, Math.min(1 - m, q ? nearestOnSegment(e.a, e.b, q).t : 0.5))
  return {
    x: e.a[0] + (e.b[0] - e.a[0]) * t,
    n: e.a[1] + (e.b[1] - e.a[1]) * t,
    z: e.z,
    dir: e.nrm,
    label: e.label,
    kind: 'deck-edge',
    owner: e.owner,
    mi: e.mi,
    edge: e.edge,
    segment: { a: e.a, b: e.b },
  }
}

/**
 * The target nearest q within reach (old pickCandidate, in site metres):
 * point targets, or edges (as a point slid along them); a point wins a
 * near tie. Null when nothing is within `maxM`.
 */
export function nearestTarget(points: readonly ConnectTarget[], edges: readonly EdgeSegment[], q: P2, maxM: number): ConnectTarget | null {
  let best: { d: number; pick: () => ConnectTarget } | null = null
  for (const p of points) {
    const d = hyp(p.x - q[0], p.n - q[1]) - POINT_BIAS_M
    if (d <= maxM && (!best || d < best.d)) best = { d, pick: () => p }
  }
  for (const e of edges) {
    const d = nearestOnSegment(e.a, e.b, q).d
    if (d <= maxM && (!best || d < best.d)) best = { d, pick: () => edgeTarget(e, q) }
  }
  return best ? best.pick() : null
}
