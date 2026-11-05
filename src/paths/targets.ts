import { partEdges } from '../buildings/parts/attach'
import { localToSite, type LocalPoint } from '../buildings/footprint'
import { massToBuilding, type Mass } from '../buildings/masses'
import { partFrame } from '../buildings/parts/partFrame'
import { railOwner } from '../buildings/rails/railWorld'
import { edgeFree } from '../buildings/rails/railRules'
import { footprintParams, localFootprint } from '../buildings/footprint'
import type { Ground } from '../site/earthworks'
import type { Terrain } from '../site/types'
import type { ObjectId, PlanObject } from '../store/types'
import { isDriveway, isPathPiece, pieceEnds } from './pieces'

/**
 * What a path piece's end can snap to (old walkSnapTargets and
 * deckEdgeTargets), in site metres: other pieces' ends, doors and sliders,
 * stair and ramp feet, free deck and porch edges, and driveway edges. Each
 * target's `dir` points away from what it belongs to, so a snapped piece
 * runs on along it.
 */
export type TargetKind = 'piece' | 'door' | 'wingfoot' | 'deck-edge' | 'driveway'

export interface SnapTarget {
  readonly x: number
  readonly n: number
  /** Surface the end meets, metres NAVD88. */
  readonly z: number
  readonly dir: readonly [number, number] | null
  readonly label: string
  readonly kind: TargetKind
  readonly owner: ObjectId
  readonly end?: 'A' | 'B'
  readonly mi?: number
  readonly edge?: number
}

type P2 = readonly [number, number]
const isAccess = (m: Mass) => m.kind === 'stair' || m.kind === 'ramp'
const unit = (a: P2, b: P2): [number, number] => {
  const dx = b[0] - a[0]
  const dn = b[1] - a[1]
  const l = Math.hypot(dx, dn) || 1
  return [dx / l, dn / l]
}

/** The point of segment a–b nearest q (the midpoint without a q). */
function nearestOn(a: P2, b: P2, q: P2 | null): [number, number] {
  if (!q) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const dx = b[0] - a[0]
  const dn = b[1] - a[1]
  const L2 = dx * dx + dn * dn || 1
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dn) / L2))
  return [a[0] + dx * t, a[1] + dn * t]
}

export const isSnappable = (o: PlanObject): boolean => isPathPiece(o) && (!o.params.shape || o.params.shape === 'rect')

/** Every snap target on the site except those of `exclude`; edges give their point nearest each query point. */
export function snapTargets(objects: readonly PlanObject[], terrain: Terrain, ground: Ground, exclude: ObjectId | null, query: readonly P2[] = []): SnapTarget[] {
  const out: SnapTarget[] = []
  const Q: (P2 | null)[] = query.length ? [...query] : [null]
  for (const o of objects) {
    if (o.id === exclude || o.hidden) continue
    if (isPathPiece(o) && o.params.shape !== 'ribbon') {
      const E = pieceEnds(o, ground)
      const u = unit(E.A, E.B)
      out.push({ x: E.A[0], n: E.A[1], z: E.zA, dir: [-u[0], -u[1]], label: `${o.name} · end A`, kind: 'piece', owner: o.id, end: 'A' })
      out.push({ x: E.B[0], n: E.B[1], z: E.zB, dir: u, label: `${o.name} · end B`, kind: 'piece', owner: o.id, end: 'B' })
      continue
    }
    if (o.type === 'house' || o.type === 'deck') {
      const frame = partFrame(o, terrain, ground)
      const owner = railOwner(o, terrain, ground)
      if (!frame || !owner) continue
      frame.masses.forEach((m, mi) => {
        if (isAccess(m)) {
          const site = (p: LocalPoint) => localToSite(o.position, o.rotation, massToBuilding(m, p))
          const c = site([0, 0])
          const f = site([0, m.d / 2])
          out.push({ x: f[0], n: f[1], z: ground(f[0], f[1]), dir: unit(c, f), label: `${o.name} · ${m.kind === 'ramp' ? 'ramp' : 'stairs'} foot`, kind: 'wingfoot', owner: o.id, mi })
          return
        }
        if (!(m.kind === 'deck' || m.kind === 'porch')) return
        for (const e of partEdges(frame.masses, mi, frame.site)) {
          if (!edgeFree(frame.masses, mi, e.i)) continue
          const a = localToSite(o.position, o.rotation, e.a)
          const b = localToSite(o.position, o.rotation, e.b)
          const n0 = localToSite(o.position, o.rotation, e.mid)
          const n1 = localToSite(o.position, o.rotation, [e.mid[0] + e.n[0], e.mid[1] + e.n[1]])
          for (const q of Q) {
            const p = nearestOn(a, b, q)
            out.push({ x: p[0], n: p[1], z: e.z, dir: unit(n0, n1), label: `${o.name} · ${m.name ?? m.kind} edge`, kind: 'deck-edge', owner: o.id, mi, edge: e.i })
          }
        }
      })
      owner.doors.forEach((d, k) =>
        out.push({ x: d.c[0], n: d.c[1], z: d.z, dir: d.nrm, label: `${o.name} · door${owner.doors.length > 1 ? ` ${k + 1}` : ''}`, kind: 'door', owner: o.id, mi: d.mi, edge: d.edge }),
      )
      continue
    }
    if (isDriveway(o) && o.params.shape !== 'ribbon') {
      const P = localFootprint(footprintParams(o)).map((p) => localToSite(o.position, o.rotation, p))
      const cx = P.reduce((s, p) => s + p[0], 0) / P.length
      const cn = P.reduce((s, p) => s + p[1], 0) / P.length
      P.forEach((a, i) => {
        const b = P[(i + 1) % P.length]
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        let nx = (b[1] - a[1]) / L
        let nn = -(b[0] - a[0]) / L
        if (nx * ((a[0] + b[0]) / 2 - cx) + nn * ((a[1] + b[1]) / 2 - cn) < 0) {
          nx = -nx
          nn = -nn
        }
        for (const q of Q) {
          const p = nearestOn(a, b, q)
          out.push({ x: p[0], n: p[1], z: ground(p[0], p[1]), dir: [nx, nn], label: `${o.name} · edge`, kind: 'driveway', owner: o.id, edge: i })
        }
      })
    }
  }
  return out
}
