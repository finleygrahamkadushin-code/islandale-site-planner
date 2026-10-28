import type { LocalPoint } from './footprint'
import { addPolygon, emptyMesh, type MeshData, type V3 } from './geom'
import type { Mass } from './masses'

const FT = 0.3048
const IN = 0.0254
/** Legacy GUARD_FT = 2.5: a walking surface more than 30 in above the ground gets a guard. */
export const GUARD_DROP_M = 2.5 * FT
export const GUARD_HEIGHT_M = 36 * IN
const TOP_RAIL_M = 0.06
const BOTTOM_RAIL_M = 0.04
const BOTTOM_RAIL_Y_M = 3.5 * IN
const BALUSTER_M = 0.035
/** Balusters at 4 in gaps, posts about every 6 ft. */
const BALUSTER_GAP_M = 4 * IN + BALUSTER_M
const POST_GAP_M = 6 * FT
const POST_M = 0.09
/** Rails are judged in pieces about this long, feet. */
const PIECE_FT = 2

/** Outlines with more edges than this are curves; legacy 'sides' only applies to straight-sided decks. */
const CURVED_EDGES = 24
/** Legacy surfaceDropFt probes the ground this far outside a wing's outline, feet (0.9 m). */
const DROP_PROBE_FT = 0.9 / FT
/** Legacy SLAB_M: the floor slab adds to the drop. */
const SLAB_M = 0.15

/**
 * Port of legacy surfaceDropFt(): the largest drop from a wing's walking
 * surface to the ground just outside it, metres. The ground is read 0.9 m
 * out from each corner and edge midpoint, away from the outline's centre.
 * `groundAt` takes a point in the outline's own frame (feet).
 */
export function wingDropM(poly: readonly LocalPoint[], floor: number, groundAt: (x: number, z: number) => number): number {
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
  return drop + SLAB_M
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
 * A stair wing gets handrails on both sides unless its rail is off (legacy
 * stairWingSpec: rail = m.rail !== false). The old planner counts its slab
 * in the drop, so even a stair landing level with the ground has a step
 * and its rails there.
 */
export function stairHasHandrails(m: Pick<Mass, 'rail'>): boolean {
  return m.rail !== false
}

interface RailRules {
  /** Edges that stay open (steps, stairs). */
  readonly skipEdge: (i: number) => boolean
  /** Points where a wall or another mass is in the way. */
  readonly blocked: (p: LocalPoint) => boolean
}

/**
 * Where a guard runs round an outline (feet): every edge piece that is
 * neither skipped nor blocked, joined into continuous polylines. A run
 * that goes all the way round comes back to its start.
 */
export function railRuns(poly: readonly LocalPoint[], rules: RailRules): LocalPoint[][] {
  type Piece = { a: LocalPoint; b: LocalPoint; keep: boolean }
  const pieces: Piece[] = []
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / PIECE_FT))
    for (let j = 0; j < k; j++) {
      const p: LocalPoint = [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]
      const q: LocalPoint = [a[0] + ((b[0] - a[0]) * (j + 1)) / k, a[1] + ((b[1] - a[1]) * (j + 1)) / k]
      const mid: LocalPoint = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
      pieces.push({ a: p, b: q, keep: !rules.skipEdge(i) && !rules.blocked(mid) })
    }
  })
  if (pieces.every((p) => p.keep)) return [[...pieces.map((p) => p.a), pieces[0].a]]
  // start just after a gap so no run is split across the wrap-around
  const start = pieces.findIndex((p, i) => !pieces[(i - 1 + pieces.length) % pieces.length].keep && p.keep)
  if (start < 0) return []
  const runs: LocalPoint[][] = []
  let run: LocalPoint[] | null = null
  for (let n = 0; n < pieces.length; n++) {
    const p = pieces[(start + n) % pieces.length]
    if (p.keep) {
      run ??= [p.a]
      run.push(p.b)
    } else if (run) {
      runs.push(run)
      run = null
    }
  }
  if (run) runs.push(run)
  return runs
}

/**
 * A wood guard along each run (feet in, local metres out, floor at y 0):
 * top rail at 36 in, a bottom rail, posts about every 6 ft and balusters
 * at 4 in gaps.
 */
export function buildRail(runs: readonly (readonly LocalPoint[])[], baseY = 0): MeshData {
  const mesh = emptyMesh()
  for (const run of runs) {
    const pts = run.map(([x, z]) => [x * FT, z * FT] as const)
    let sincePost = Infinity
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 1e-4) continue
      addBar(mesh, a, b, baseY + GUARD_HEIGHT_M - TOP_RAIL_M, TOP_RAIL_M, TOP_RAIL_M)
      addBar(mesh, a, b, baseY + BOTTOM_RAIL_Y_M, BOTTOM_RAIL_M, BOTTOM_RAIL_M)
      for (let d = 0; d < len; d += BALUSTER_GAP_M) {
        const f = d / len
        const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as const
        if (sincePost >= POST_GAP_M) {
          addPost(mesh, p, baseY, baseY + GUARD_HEIGHT_M, POST_M)
          sincePost = 0
        } else addPost(mesh, p, baseY + BOTTOM_RAIL_Y_M, baseY + GUARD_HEIGHT_M - TOP_RAIL_M, BALUSTER_M)
        sincePost += BALUSTER_GAP_M
      }
    }
    const end = pts[pts.length - 1]
    addPost(mesh, end, baseY, baseY + GUARD_HEIGHT_M, POST_M)
  }
  return mesh
}

/** A horizontal bar from a to b (metres), its bottom at y. */
function addBar(mesh: MeshData, a: readonly [number, number], b: readonly [number, number], y: number, w: number, h: number): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  const n = [-t[1] * (w / 2), t[0] * (w / 2)]
  const corner = (p: readonly [number, number], s: number, yy: number): V3 => [p[0] + n[0] * s, yy, p[1] + n[1] * s]
  addBox(mesh, [corner(a, -1, y), corner(b, -1, y), corner(b, 1, y), corner(a, 1, y)], h)
}

/** A square upright at p (metres) from y0 to y1. */
function addPost(mesh: MeshData, p: readonly [number, number], y0: number, y1: number, size: number): void {
  const s = size / 2
  addBox(mesh, [[p[0] - s, y0, p[1] - s], [p[0] + s, y0, p[1] - s], [p[0] + s, y0, p[1] + s], [p[0] - s, y0, p[1] + s]], y1 - y0)
}

/** A prism from a bottom quad raised by h. */
function addBox(mesh: MeshData, base: readonly V3[], h: number): void {
  const top = base.map(([x, y, z]) => [x, y + h, z] as const)
  const c: V3 = [base.reduce((s, p) => s + p[0], 0) / 4, base[0][1] + h / 2, base.reduce((s, p) => s + p[2], 0) / 4]
  addPolygon(mesh, top, [0, 1, 0])
  addPolygon(mesh, base, [0, -1, 0])
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    const mid = [(base[i][0] + base[j][0]) / 2, (base[i][2] + base[j][2]) / 2]
    addPolygon(mesh, [base[i], base[j], top[j], top[i]], [mid[0] - c[0], 0, mid[1] - c[2]])
  }
}
