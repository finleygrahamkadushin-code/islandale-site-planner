import { num } from '../buildings/footprint'
import { envelopeOf } from './envelope'
import { FURNITURE, furnitureCorners, isStairType, STAIR_RISERS } from './furniture'
import * as G from './geom'
import type { Pt } from './geom'
import { readFloors } from './model'
import { openingGeom, partitionSegments } from './rooms'
import { WALL, type Floor, type Furniture } from './types'

/**
 * A cabin's interior in 3D (old int2/walls3d.js): partition walls with
 * their door, window and cased-opening gaps, the upper-floor slab with its
 * stair holes, indoor stairs with handrails and guards, and furniture as
 * boxes. All in building feet, y up from the main floor; the scene draws it
 * in the building's own frame.
 */

export type V3 = readonly [number, number, number]
export type InteriorPart = 'wall' | 'header' | 'sill' | 'slab' | 'furniture' | 'stair' | 'rail'

export interface Box3 {
  /** Centre. */
  readonly p: V3
  /** Width (x), height (y) and depth (z) before turning. */
  readonly size: V3
  /** Turn about x, then about y (radians, three.js order inside a cluster). */
  readonly rx?: number
  readonly ry?: number
  readonly color: string
  readonly part: InteriorPart
}

/** A thin bar from a to b (helical handrails). */
export interface Bar3 {
  readonly a: V3
  readonly b: V3
  readonly t: number
  readonly color: string
}

export interface Cylinder3 {
  readonly p: V3
  readonly r: number
  readonly h: number
  readonly color: string
}

/** A spiral tread: the ring sector between radii rp and r, angles a0 to a1 (radians), top at `top`, `th` thick. */
export interface Wedge3 {
  readonly a0: number
  readonly a1: number
  readonly r: number
  readonly rp: number
  readonly top: number
  readonly th: number
  readonly color: string
}

/** Pieces placed and turned together: one stair, or the loose boxes of walls and furniture. */
export interface Cluster {
  readonly p: V3
  /** Turn about y, radians. */
  readonly ry: number
  readonly boxes: readonly Box3[]
  readonly bars: readonly Bar3[]
  readonly cylinders: readonly Cylinder3[]
  readonly wedges: readonly Wedge3[]
}

export interface Slab {
  readonly pts: readonly Pt[]
  /** Top of the slab, feet above the main floor. */
  readonly top: number
  readonly depth: number
}

export interface Interior3D {
  readonly clusters: readonly Cluster[]
  readonly slabs: readonly Slab[]
}

const WALL_COLOR = '#f2efe8'
const WOOD = '#b8a78e'
const RAIL = '#4b3d30'
const STEEL = '#5c5f61'
/** Floor to floor, feet. */
export const STOREY_FT = 9
const SLAB_FT = 0.75
/** Partition ends meeting the exterior wall stop this far short of it, feet. */
const PULL = 0.25
/** How far an opening may sit off a partition's line and still cut it, feet and radians. */
const LINE_TOL = 0.05
const ANG_TOL = 0.002
/** Heads (ft): doors and sliders at 6'-9", cased openings and windows at 7'; windows sit on a 3 ft sill. */
const HEADS: Readonly<Record<string, number>> = { door: 6.75, slider: 6.75, open: 7, window: 7 }
const SILL = 3

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1]
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0]

/** Wall height on floor fi, feet: 8'-3" under another floor, else up to the cabin's walls (6'-6" to 8'). */
export function wallHeight(params: Record<string, unknown>, fi: number, floorCount: number): number {
  return fi < floorCount - 1 ? 8.25 : Math.min(8, Math.max(6.5, num(params.h, 9) - fi * STOREY_FT - 0.5))
}

interface Seg {
  readonly a: Pt
  readonly u: Pt
  readonly L: number
  readonly gaps: { s0: number; s1: number; kind: string }[]
}

function partitionWalls(params: Record<string, unknown>, fi: number, floor: Floor, Hft: number): Box3[] {
  const env = envelopeOf(params, fi)
  const near = (p: Pt) => env.edges.some(([a, b]) => G.distToSeg(p, a, b).d <= G.ON + 0.05)
  const segs: Seg[] = partitionSegments(params, fi, floor.rooms).flatMap((s) => {
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    if (L < 1e-9) return []
    const u: Pt = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L]
    const pa = near(s.a)
    const pb = near(s.b)
    const a: Pt = pa ? [s.a[0] + u[0] * PULL, s.a[1] + u[1] * PULL] : s.a
    const L2 = L - (pa ? PULL : 0) - (pb ? PULL : 0)
    return L2 > 0.05 ? [{ a, u, L: L2, gaps: [] }] : []
  })
  for (const op of floor.openings) {
    const g = openingGeom(params, fi, op, floor.rooms)
    if (!g || g.exterior) continue
    for (const s of segs) {
      if (Math.abs(cross(s.u, g.dir)) > ANG_TOL || Math.abs(cross(s.u, sub(g.c, s.a))) > LINE_TOL) continue
      const sc = dot(s.u, sub(g.c, s.a))
      if (sc < -LINE_TOL || sc > s.L + LINE_TOL) continue
      const ta = dot(s.u, sub(g.a, s.a))
      const tb = dot(s.u, sub(g.b, s.a))
      const s0 = Math.max(0, Math.min(ta, tb))
      const s1 = Math.min(s.L, Math.max(ta, tb))
      if (s1 - s0 > 0.05) s.gaps.push({ s0, s1, kind: op.kind })
      break
    }
  }
  const y0 = fi * STOREY_FT
  return segs.flatMap((s) =>
    segmentPieces(s, Hft).map((pc): Box3 => {
      const m = (pc.s0 + pc.s1) / 2
      return {
        p: [s.a[0] + s.u[0] * m, y0 + (pc.y0 + pc.y1) / 2, s.a[1] + s.u[1] * m],
        size: [pc.s1 - pc.s0, pc.y1 - pc.y0, WALL.int],
        ry: -Math.atan2(s.u[1], s.u[0]),
        color: WALL_COLOR,
        part: pc.y0 > 0.001 ? 'header' : pc.y1 < Hft - 0.001 ? 'sill' : 'wall',
      }
    }),
  )
}

/** Solid stretches between the gaps of one partition, with a header over each gap and a sill under each window. */
export function segmentPieces(s: Pick<Seg, 'L' | 'gaps'>, Hft: number): { s0: number; s1: number; y0: number; y1: number }[] {
  const out: { s0: number; s1: number; y0: number; y1: number }[] = []
  let cur = 0
  for (const g of [...s.gaps].sort((p, q) => p.s0 - q.s0)) {
    const g0 = Math.max(g.s0, cur)
    const g1 = g.s1
    if (g1 <= g0) continue
    if (g0 - cur > 0.05) out.push({ s0: cur, s1: g0, y0: 0, y1: Hft })
    const head = HEADS[g.kind] ?? HEADS.door
    if (Hft - head > 0.01) out.push({ s0: g0, s1: g1, y0: head, y1: Hft })
    if (g.kind === 'window') out.push({ s0: g0, s1: g1, y0: 0, y1: Math.min(SILL, Hft) })
    cur = g1
  }
  if (s.L - cur > 0.05) out.push({ s0: cur, s1: s.L, y0: 0, y1: Hft })
  return out.filter((pc) => pc.s1 - pc.s0 > 0.05 && pc.y1 - pc.y0 > 0.01)
}

/** The hole a stair needs in the floor above: its footprint, or a spiral's circle less the landing wedge. */
function stairHole(it: Furniture): Pt[] | null {
  if (!(it.w > 0 && it.d > 0)) return null
  if (!/spiral/.test(it.type)) return furnitureCorners(it)
  const r = Math.min(it.w, it.d) / 2
  const a = (-(it.rot || 0) * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const P: Pt[] = []
  for (let k = 0; k <= 11; k++) {
    const t = (k * 30 * Math.PI) / 180
    const u = r * Math.cos(t)
    const v = r * Math.sin(t)
    P.push([it.x + u * c + v * s, it.z - u * s + v * c])
  }
  P.push([it.x, it.z])
  return G.ensureCCW(P)
}

/** The upper floor's slab: its envelope less the stair holes (stairs below, stair tops on it, else stair rooms). */
function slabPieces(params: Record<string, unknown>, floors: readonly Floor[], fi: number): Slab[] {
  let pieces: Pt[][] = envelopeOf(params, fi).tiles.map((P) => P.slice())
  const items = [...floors[fi - 1].furniture.filter((it) => it.type === 'stair' || it.type === 'spiral'), ...floors[fi].furniture.filter((it) => it.type === 'stairdn' || it.type === 'spiraldn')]
  let holes: Pt[][] = items.flatMap((it) => {
    const h = stairHole(it)
    return h ? [h] : []
  })
  if (!holes.length) holes = [floors[fi - 1], floors[fi]].flatMap((f) => f.rooms.filter((r) => r.type === 'stairs').map((r) => r.pts as Pt[]))
  for (const S of holes) pieces = G.subtractRegion(pieces, S)
  return pieces.filter((P) => P.length >= 3 && G.area(P) > 1e-6).map((pts) => ({ pts, top: fi * STOREY_FT, depth: SLAB_FT }))
}

/** One indoor stair in its own frame (u → x, v → z, the low end at +v), as the old stairMesh builds it. */
export function stairPieces(it: Pick<Furniture, 'type' | 'w' | 'd'>): Omit<Cluster, 'p' | 'ry'> {
  const { w, d, type } = it
  const boxes: Box3[] = []
  const bars: Bar3[] = []
  const cylinders: Cylinder3[] = []
  const wedges: Wedge3[] = []
  const D = Math.PI / 180
  const box = (size: V3, p: V3, color: string, part: InteriorPart, rx?: number, ry?: number) => boxes.push({ p, size, color, part, rx, ry })
  if (type === 'stair' || type === 'stairdn') {
    const N = STAIR_RISERS
    const rise = STOREY_FT / N
    const t = d / (N - 1)
    if (type === 'stair') {
      for (let k = 1; k < N; k++) box([w, 0.12, t + 0.08], [0, k * rise - 0.06, d / 2 - (k - 0.5) * t], WOOD, 'stair')
      for (const sg of [-1, 1]) {
        const x = sg * (w / 2 - 0.08)
        box([0.15, 0.9, Math.hypot(d, STOREY_FT)], [x, 4.5 - 0.3, 0], WOOD, 'stair', Math.atan2(STOREY_FT - rise, d))
        box([0.12, 0.12, Math.hypot(d, STOREY_FT)], [x, 4.5 + 2.9, 0], RAIL, 'rail', Math.atan2(STOREY_FT, d))
      }
    } else {
      // the floor above: a guard round the opening, open at the top (-v) end
      const run = (x1: number, z1: number, x2: number, z2: number) => {
        const L = Math.hypot(x2 - x1, z2 - z1)
        box([L, 0.12, 0.12], [(x1 + x2) / 2, 3, (z1 + z2) / 2], RAIL, 'rail', undefined, -Math.atan2(z2 - z1, x2 - x1))
        const n = Math.max(1, Math.round(L / 0.6))
        for (let k = 0; k <= n; k++) box([0.06, 3, 0.06], [x1 + ((x2 - x1) * k) / n, 1.5, z1 + ((z2 - z1) * k) / n], RAIL, 'rail')
      }
      run(-w / 2, -d / 2, -w / 2, d / 2)
      run(w / 2, -d / 2, w / 2, d / 2)
      run(-w / 2, d / 2, w / 2, d / 2)
    }
    return { boxes, bars, cylinders, wedges }
  }
  // spiral: 12 risers of 9 in; treads 1–11 turn 30° each from angle 0, the 12th step is the floor above (the landing)
  const R = Math.min(w, d) / 2 - 0.05
  const rp = 0.2
  const rise = 0.75
  if (type === 'spiral') {
    cylinders.push({ p: [0, 6, 0], r: rp, h: 12, color: STEEL })
    for (let k = 1; k <= 11; k++) wedges.push({ a0: (k - 1) * 30 * D, a1: k * 30 * D, r: R, rp, top: k * rise, th: 0.15, color: WOOD })
    wedges.push({ a0: 330 * D, a1: 360 * D, r: R, rp, top: STOREY_FT, th: SLAB_FT, color: WOOD })
    let prev: V3 | null = null
    for (let a = 0; a <= 330; a += 15) {
      const q: V3 = [(R - 0.1) * Math.cos(a * D), Math.min(STOREY_FT, (a / 30 + 0.5) * rise) + 3, (R - 0.1) * Math.sin(a * D)]
      if (a % 30 === 15) box([0.05, 3, 0.05], [q[0], q[1] - 1.5, q[2]], RAIL, 'rail')
      if (prev) bars.push({ a: prev, b: q, t: 0.1, color: RAIL })
      prev = q
    }
  } else {
    // spiraldn: a guard round the hole, open over the landing
    for (let a = 0; a < 330; a += 15) {
      const p0: Pt = [R * Math.cos(a * D), R * Math.sin(a * D)]
      const p1: Pt = [R * Math.cos((a + 15) * D), R * Math.sin((a + 15) * D)]
      box([Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 0.1, 0.1], [(p0[0] + p1[0]) / 2, 3, (p0[1] + p1[1]) / 2], RAIL, 'rail', undefined, -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]))
      box([0.05, 3, 0.05], [p0[0], 1.5, p0[1]], RAIL, 'rail')
    }
    box([R, 0.1, 0.1], [R / 2, 3, 0], RAIL, 'rail')
    cylinders.push({ p: [0, 1.5, 0], r: rp, h: 3, color: STEEL })
  }
  return { boxes, bars, cylinders, wedges }
}

const EMPTY = { bars: [], cylinders: [], wedges: [] } as const

/** Everything inside a cabin, on every floor with rooms or furniture. */
export function interior3d(params: Record<string, unknown>): Interior3D {
  const floors = readFloors(params)
  const clusters: Cluster[] = []
  const slabs: Slab[] = []
  floors.forEach((floor, fi) => {
    const y0 = fi * STOREY_FT
    const loose: Box3[] = partitionWalls(params, fi, floor, wallHeight(params, fi, floors.length))
    if (fi >= 1) slabs.push(...slabPieces(params, floors, fi))
    for (const it of floor.furniture) {
      const ry = (-(it.rot || 0) * Math.PI) / 180
      if (isStairType(it.type)) {
        clusters.push({ p: [it.x, y0, it.z], ry, ...stairPieces(it) })
        continue
      }
      const t = FURNITURE[it.type]
      const h = typeof it.h === 'number' && it.h > 0 ? it.h : (t?.h ?? 2.5)
      if (!(it.w > 0 && it.d > 0 && h > 0)) continue
      loose.push({ p: [it.x, y0 + h / 2, it.z], size: [it.w, h, it.d], ry, color: t?.color ?? '#9a8f80', part: 'furniture' })
    }
    if (loose.length) clusters.push({ p: [0, 0, 0], ry: 0, boxes: loose, ...EMPTY })
  })
  return { clusters, slabs }
}
