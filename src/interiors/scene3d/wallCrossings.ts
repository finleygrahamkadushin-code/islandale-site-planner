/**
 * Interior openings that sit in a part's own wall where it runs across
 * another part's floor (D-1's gallery doors into the pods, a cased opening
 * through D-0's round wing). The interior plan puts a doorway there, but the
 * wall is the part's exterior wall, built whole by its shell, so without a
 * hole the doorway is walled shut. These are the holes to cut through it.
 */
import { signedArea, type LocalPoint } from '../../buildings/footprint'
import { pointInPolygon } from '../../site/geom2d'
import { buildingMasses, buildingToMass, massBuildingPoly, massPoly, massToBuilding } from '../../buildings/masses'
import type { WallHole } from '../../buildings/walls/wallShell'
import { STOREY_FT } from './interior3d'
import { readFloors } from '../model'
import { openingGeom } from '../rooms'
import type { OpeningKind } from '../types'

/** Head height of each kind above its floor, and a window's sill (as the interior partitions cut them). */
const HEADS: Readonly<Record<OpeningKind, number>> = { door: 6.75, slider: 6.75, open: 7, window: 7 }
const SILL_FT = 3
/** Spacing of the points tested round the wall, feet. */
const STEP_FT = 0.1
/** How much wider than its wall's half-thickness the doorway's line may pass and still be blocked by it. */
const SLACK_FT = 0.1
/** A run of wall shorter than this across a doorway is where a partition meets the wall, not a wall in the way. */
const MIN_RUN_FT = 1
/** How far beyond the outside face to look for another part's floor. */
const BEYOND_FT = 0.25
/** Ids for these holes start here, clear of the exterior cuts' own ids. */
const ID_BASE = 1_000_000

const KIND: Readonly<Record<OpeningKind, WallHole['kind']>> = { door: 'door', slider: 'slider', open: 'cutout', window: 'window' }

type Pt = LocalPoint

/**
 * The holes mass `mi`'s wall needs for interior openings, in its own
 * unrolled frame (u round its outline from vertex 0, v above its floor):
 * every stretch of the wall that stands in a doorway's line, where the wall
 * has another walled part's floor on its far side. A doorway along the wall
 * opens its whole width; one through a curved wall at an angle opens the
 * stretch it crosses. Openings in the building's outside wall are left to the
 * exterior cuts, and a partition merely meeting the wall cuts nothing.
 */
export function crossingHoles(params: Record<string, unknown>, mi: number, thicknessFt: (edge: number) => number, wallHeightFt: number): WallHole[] {
  const masses = buildingMasses(params)
  const m = masses[mi]
  if (!m || m.kind !== 'wall') return []
  const poly = massPoly(m)
  const ring = wallRing(poly, thicknessFt)
  if (!ring.length) return []
  // the other walled parts' floors, in the building frame
  const others = masses.flatMap((o, oi) => (oi !== mi && o.kind === 'wall' ? [massBuildingPoly(o)] : []))
  const inside = ring.map((s) => {
    const [x, z] = massToBuilding(m, s.beyond)
    return others.some((q) => pointInPolygon(q, x, z))
  })
  return readFloors(params).flatMap((floor, fi) =>
    floor.openings.flatMap((op) => {
      const g = openingGeom(params, fi, op, floor.rooms)
      if (!g || g.exterior) return []
      const a = buildingToMass(m, g.a)
      const b = buildingToMass(m, g.b)
      const v0 = Math.max(0, fi * STOREY_FT - m.lvl + (op.kind === 'window' ? SILL_FT : 0))
      const v1 = Math.min(wallHeightFt, fi * STOREY_FT - m.lvl + HEADS[op.kind])
      if (v1 - v0 < STEP_FT) return []
      const blocked = ring.map((s, k) => inside[k] && across(s.mid, a, b, s.half + SLACK_FT))
      const id = ID_BASE + fi * 10_000 + op.id
      return runs(ring, blocked).map(({ edge, u0, u1 }) => ({ id, kind: KIND[op.kind], edge, u0, u1, v0, v1 }))
    }),
  )
}

/** One test point of the wall: where round the outline it is, its edge, the middle of the wall there, half the wall's thickness, and a point just outside it. */
interface RingPoint {
  readonly u: number
  readonly edge: number
  /** Where round the outline its edge starts and ends. */
  readonly e0: number
  readonly e1: number
  readonly mid: Pt
  readonly half: number
  readonly beyond: Pt
}

/** Points every STEP_FT round the wall, each at the middle of its thickness. */
function wallRing(poly: readonly Pt[], thicknessFt: (edge: number) => number): RingPoint[] {
  const n = poly.length
  if (n < 3) return []
  const inward = signedArea(poly) > 0 ? 1 : -1
  const out: RingPoint[] = []
  let u = 0
  for (let e = 0; e < n; e++) {
    const a = poly[e]
    const b = poly[(e + 1) % n]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 1e-9) continue
    const dx = (b[0] - a[0]) / L
    const dz = (b[1] - a[1]) / L
    // the edge direction turned toward the inside
    const nx = -dz * inward
    const nz = dx * inward
    const half = thicknessFt(e) / 2
    const steps = Math.max(1, Math.ceil(L / STEP_FT))
    for (let k = 0; k < steps; k++) {
      const s = ((k + 0.5) / steps) * L
      const px = a[0] + dx * s
      const pz = a[1] + dz * s
      out.push({ u: u + s, edge: e, e0: u, e1: u + L, mid: [px + nx * half, pz + nz * half], half, beyond: [px - nx * BEYOND_FT, pz - nz * BEYOND_FT] })
    }
    u += L
  }
  return out
}

/** The blocked stretches as hole pieces, one per edge, dropping runs too short to be a wall in the doorway (a run over vertex 0 is joined round). */
function runs(ring: readonly RingPoint[], blocked: readonly boolean[]): { edge: number; u0: number; u1: number }[] {
  const n = ring.length
  if (!blocked.some(Boolean) || blocked.every(Boolean)) return []
  // start just after a clear point, so a run is never split at vertex 0
  const start = (blocked.findIndex((v) => !v) + 1) % n
  const groups: number[][] = []
  let cur: number[] = []
  for (let i = 0; i < n; i++) {
    const k = (start + i) % n
    if (blocked[k]) cur.push(k)
    else if (cur.length) {
      groups.push(cur)
      cur = []
    }
  }
  if (cur.length) groups.push(cur)
  return groups.flatMap((g) => {
    if (g.length * STEP_FT < MIN_RUN_FT) return []
    // a piece runs to its edge's end where the run carries on to the next edge, so the pieces meet
    const first = ring[g[0]]
    const last = ring[g[g.length - 1]]
    const byEdge = new Map<number, { u0: number; u1: number }>()
    for (const k of g) {
      const p = ring[k]
      const u0 = p.edge === first.edge ? Math.max(p.e0, first.u - STEP_FT / 2) : p.e0
      const u1 = p.edge === last.edge ? Math.min(p.e1, last.u + STEP_FT / 2) : p.e1
      byEdge.set(p.edge, { u0, u1 })
    }
    return [...byEdge].map(([edge, r]) => ({ edge, ...r }))
  })
}

/** Whether p lies within `limit` of the doorway's line a→b, between its jambs. */
function across(p: Pt, a: Pt, b: Pt, limit: number): boolean {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const L2 = dx * dx + dz * dz
  if (L2 < 1e-12) return false
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
  return t >= 0 && t <= 1 && Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / Math.sqrt(L2) <= limit
}
