import { ShapeUtils, Vector2 } from 'three'
import { extResolve, type ExtHost } from './exterior'
import type { WallKind } from './finishes'
import type { LocalPoint } from './footprint'
import { addPolygon, emptyMesh, type MeshData, type V3 } from './geom'
import { FIT, type CutData, type OpeningKind, type PlacedOpening } from './openingLayout'
import { signedAreaOf } from './organic'

/**
 * Exterior walls with thickness and real holes (legacy curvedWallMesh and
 * wallMeshes, with edgeCuts for the holes). The wall is one band round the
 * footprint, mitred at every vertex: smooth-shaded where it bends less than
 * FIT.softTurnDeg (a curve), creased at sharper corners. Every opening is cut
 * through it, with jamb, head and sill faces across the thickness. Built per
 * edge, so each wall can carry its own finish. Feet in (local frame, +z
 * front), metres out; UVs in feet along the perimeter and up the wall.
 */

const FT = 0.3048
/** A glass curtain wall is one glazed skin, 6 cm thick (legacy wallMeshes t = 0.06). */
export const GLASS_WALL_FT = 0.06 / FT
/** An inside corner moves in at most thickness / this, so a needle-sharp corner stays in the wall (legacy c ≥ 0.35). */
const MIN_MITRE = 0.35
/** Holes narrower or shorter than this are not cut (legacy cw, ch > 5 cm). */
const MIN_HOLE_FT = 0.05
const EPS = 1e-6
/** How far past a cell the neighbour test looks, feet. */
const PROBE = 1e-4
const AREA_EPS = 1e-9

type Vec2 = readonly [number, number]
type UV = readonly [number, number]
export type Thickness = number | ((edge: number) => number)

/** One opening piece as a hole in the unrolled wall. */
export interface WallHole {
  readonly id: number
  readonly kind: OpeningKind
  readonly edge: number
  /** Along the perimeter from vertex 0, feet. */
  readonly u0: number
  readonly u1: number
  /** Sill and head above the floor, feet. */
  readonly v0: number
  readonly v1: number
}

/** One wall (edge) of the band: its outside and inside faces, and every face across its thickness. */
export interface EdgeShell {
  readonly edge: number
  readonly outer: MeshData
  readonly inner: MeshData
  /** Jambs, heads and sills of its holes, and the wall top. */
  readonly reveals: MeshData
}

export interface WallShell {
  readonly edges: readonly EdgeShell[]
  /** The ceiling over the inside of the walls at the eave; empty when `cap` is false. */
  readonly cap: MeshData
  readonly holes: readonly WallHole[]
}

interface Perimeter {
  readonly P: readonly LocalPoint[]
  /** Distance round the perimeter to each vertex; cum[n] is the whole perimeter. */
  readonly cum: readonly number[]
  readonly len: readonly number[]
  readonly dir: readonly Vec2[]
}

/** The band's geometry: face and vertex normals, creases, thickness, and the mitred inside corners. */
interface Ring extends Perimeter {
  readonly fn: readonly Vec2[]
  readonly vn: readonly Vec2[]
  readonly crease: readonly boolean[]
  readonly thick: readonly number[]
  readonly inner: readonly LocalPoint[]
}

const lerp2 = (a: Vec2, b: Vec2, k: number): Vec2 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
const dot2 = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]
const unit2 = (a: Vec2, fallback: Vec2): Vec2 => {
  const l = Math.hypot(a[0], a[1])
  return l > 1e-9 ? [a[0] / l, a[1] / l] : fallback
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const uniqSorted = (vs: readonly number[]) => [...vs].sort((a, b) => a - b).filter((v, i, s) => i === 0 || v - s[i - 1] > EPS)
const thicknessOf = (t: Thickness | undefined) => (edge: number) => {
  const v = typeof t === 'function' ? t(edge) : (t ?? FIT.wallFt)
  return Number.isFinite(v) ? Math.max(0, v) : FIT.wallFt
}

function perimeter(poly: readonly LocalPoint[]): Perimeter {
  const cum = [0]
  const len: number[] = []
  const dir: Vec2[] = []
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    len.push(l)
    cum.push(cum[i] + l)
    dir.push(l > EPS ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : [1, 0])
  })
  return { P: poly, cum, len, dir }
}

/** Where the inside faces of two walls meet at a vertex, relative to it (legacy IN, with a true mitre for unequal walls). */
function mitre(fp: Vec2, fq: Vec2, tp: number, tq: number, vn: Vec2, crease: boolean): Vec2 {
  if (tp === tq || !crease) {
    const t = (tp + tq) / 2
    const c = Math.max(MIN_MITRE, dot2(vn, fq))
    return [(-vn[0] * t) / c, (-vn[1] * t) / c]
  }
  const det = fp[0] * fq[1] - fp[1] * fq[0]
  const d: Vec2 = [(fp[1] * tq - fq[1] * tp) / det, (fq[0] * tp - fp[0] * tq) / det]
  const reach = Math.max(tp, tq) / MIN_MITRE
  const l = Math.hypot(d[0], d[1])
  return l > reach ? [(d[0] * reach) / l, (d[1] * reach) / l] : d
}

/** The last edge of real length before vertex `i` (edge i - 1, or further back past zero-length edges). */
function edgeBefore(len: readonly number[], i: number): number {
  const n = len.length
  for (let k = 1; k <= n; k++) if (len[(i - k + n) % n] > EPS) return (i - k + n) % n
  return i
}

function ringOf(poly: readonly LocalPoint[], thickness: (edge: number) => number): Ring {
  const per = perimeter(poly)
  const n = poly.length
  const s = signedAreaOf(poly) >= 0 ? 1 : -1
  const valid = (e: number) => per.len[e] > EPS
  const before = (i: number) => edgeBefore(per.len, i)
  const from = (i: number) => (valid(i) ? i : before(i))
  // outward (legacy FN, either winding); a zero-length edge borrows the wall before it
  const fn = poly.map((_, e): Vec2 => {
    const d = per.dir[from(e)]
    return [s * d[1], -s * d[0]]
  })
  const thick = poly.map((_, e) => thickness(from(e)))
  const vn: Vec2[] = []
  const crease: boolean[] = []
  const inner: LocalPoint[] = []
  poly.forEach((p, i) => {
    let q = i
    for (let k = 0; k < n && !valid(q); k++) q = (q + 1) % n
    const pe = before(i)
    const v = unit2([fn[pe][0] + fn[q][0], fn[pe][1] + fn[q][1]], fn[q])
    const sharp = dot2(fn[pe], fn[q]) < Math.cos((FIT.softTurnDeg * Math.PI) / 180)
    const d = mitre(fn[pe], fn[q], thick[pe], thick[q], v, sharp)
    vn.push(v)
    crease.push(sharp)
    inner.push([p[0] + d[0], p[1] + d[1]])
  })
  return { ...per, fn, vn, crease, thick, inner }
}

/**
 * A point on wall `i` at `u` round the perimeter, a fraction `k` of the way
 * through the wall (0 outside, 1 inside). Inside points sit square across
 * from the outside, except at the wall's ends, which run to the mitred corners.
 */
function wallPoint(r: Ring, i: number, u: number, k: number): Vec2 {
  const j = (i + 1) % r.P.length
  const a = r.P[i]
  const d = r.dir[i]
  const l = r.len[i]
  const p = u - r.cum[i]
  const at = (q: number): Vec2 => [a[0] + d[0] * q, a[1] + d[1] * q]
  if (k <= 0) return at(p)
  const ia = lerp2(a, r.inner[i], k)
  const ib = lerp2(r.P[j], r.inner[j], k)
  if (p <= EPS) return ia
  if (p >= l - EPS) return ib
  const pa = dot2([ia[0] - a[0], ia[1] - a[1]], d)
  const pb = l + dot2([ib[0] - r.P[j][0], ib[1] - r.P[j][1]], d)
  if (pb - pa <= EPS) return lerp2(ia, ib, p / l)
  if (p <= pa) return ia
  if (p >= pb) return ib
  const o = at(p)
  const t = r.thick[i] * k
  return [o[0] - r.fn[i][0] * t, o[1] - r.fn[i][1] * t]
}

/** A wall's thickness by its kind: a glass curtain wall is one glazed skin, every other kind the full wall (legacy wallMeshes). */
export const wallThicknessFt = (kind: string | null | undefined): number => (kind === 'glass' ? GLASS_WALL_FT : FIT.wallFt)

/** One wall's kind ('' painted, the building's siding) and the thickness that gives it. */
export interface WallSpec {
  readonly kind: WallKind | ''
  readonly thicknessFt: number
}

/**
 * Every wall (edge) of mass `mi`, its kind read through the exterior model
 * (a painted wall, mass or house first, then the scheme's) and its
 * thickness by wallThicknessFt: what the scene builds the shell with and
 * the sheets draw.
 */
export function wallSpecsOf(params: Readonly<Record<string, unknown>>, mi: number, edges: number, host: ExtHost = 'building'): WallSpec[] {
  return Array.from({ length: edges }, (_, e) => {
    const { kind } = extResolve(params, mi, 'wall', e, host)
    return { kind, thicknessFt: wallThicknessFt(kind) }
  })
}

/** The band of walls in plan, feet, in the footprint's own frame: what the shell is built on, for drawing it. */
export interface WallPlan {
  /** The inside face's corners, vertex for vertex with the outline (the mitred corners the shell meets at). */
  readonly inner: readonly LocalPoint[]
  /** Each wall's thickness; a zero-length edge carries the wall's before it. */
  readonly thicknessFt: readonly number[]
  /** Whether each vertex is a sharp corner (creased), not a bend of a curve. */
  readonly crease: readonly boolean[]
  /** Each wall's outward unit normal. */
  readonly outward: readonly LocalPoint[]
  /**
   * The point on wall `edge`, `alongFt` from its vertex `edge`, a fraction `k`
   * of the way through the wall (0 outside, 1 inside): square across from the
   * outside, except near the wall's ends, which run to the mitred corners.
   * The shell's jambs and reveals run between k 0 and 1.
   */
  readonly across: (edge: number, alongFt: number, k: number) => LocalPoint
}

/** The walls of a footprint in plan, with the same ring, thickness and mitres buildWallShell builds them on. */
export function wallPlan(poly: readonly LocalPoint[], thicknessFt?: Thickness): WallPlan {
  const r = ringOf(poly, thicknessOf(thicknessFt))
  const n = poly.length
  return {
    inner: r.inner,
    thicknessFt: r.thick,
    crease: r.crease,
    outward: r.fn,
    across: (edge, alongFt, k) => {
      const i = ((Math.trunc(edge) % n) + n) % n
      const [x, z] = wallPoint(r, i, r.cum[i] + clamp(alongFt, 0, r.len[i]), clamp(k, 0, 1))
      return [x, z]
    },
  }
}

/** The outward shading normal on wall `i` at `u`: the vertex normals blended along a curve, the wall's own at a crease (legacy NRM). */
function normalAt(r: Ring, i: number, u: number): V3 {
  const j = (i + 1) % r.P.length
  const na = r.crease[i] ? r.fn[i] : r.vn[i]
  const nb = r.crease[j] ? r.fn[i] : r.vn[j]
  const n = unit2(lerp2(na, nb, clamp((u - r.cum[i]) / (r.len[i] || 1), 0, 1)), r.fn[i])
  return [n[0], 0, n[1]]
}

function tri(mesh: MeshData, p: readonly V3[], n: readonly V3[], uv: readonly UV[]): void {
  const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]]
  const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]
  const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
  if (Math.hypot(g[0], g[1], g[2]) < AREA_EPS) return
  const facing = g[0] * (n[0][0] + n[1][0] + n[2][0]) + g[1] * (n[0][1] + n[1][1] + n[2][1]) + g[2] * (n[0][2] + n[1][2] + n[2][2])
  for (const k of facing < 0 ? [0, 2, 1] : [0, 1, 2]) {
    mesh.positions.push(p[k][0] * FT, p[k][1] * FT, p[k][2] * FT)
    mesh.normals.push(n[k][0], n[k][1], n[k][2])
    mesh.uvs.push(uv[k][0], uv[k][1])
  }
}

/** A quad (feet) as two triangles, each wound to face its corners' normals (legacy tri / quad). */
function quad(mesh: MeshData, p: readonly V3[], n: readonly V3[], uv: readonly UV[]): void {
  tri(mesh, [p[0], p[1], p[2]], [n[0], n[1], n[2]], [uv[0], uv[1], uv[2]])
  tri(mesh, [p[0], p[2], p[3]], [n[0], n[2], n[3]], [uv[0], uv[2], uv[3]])
}

/**
 * Every opening's pieces as holes in the unrolled wall (legacy edgeCuts):
 * an along-cut is already measured round the real curve and split over the
 * facets it crosses by layoutOpenings. Hidden openings cut nothing.
 */
export function openingHoles(poly: readonly LocalPoint[], openings: readonly PlacedOpening[], heightFt: number): WallHole[] {
  const { cum, len, dir } = perimeter(poly)
  return openings.flatMap((op) =>
    op.hidden
      ? []
      : op.pieces.flatMap((piece) => {
          const i = piece.edge
          if (!Number.isInteger(i) || i < 0 || i >= poly.length || len[i] <= EPS) return []
          const a = poly[i]
          const mid = (piece.centre[0] - a[0]) * dir[i][0] + (piece.centre[2] - a[1]) * dir[i][1]
          const u0 = cum[i] + clamp(mid - piece.w / 2, 0, len[i])
          const u1 = cum[i] + clamp(mid + piece.w / 2, 0, len[i])
          const v0 = clamp(op.sill, 0, heightFt)
          const v1 = clamp(op.sill + op.h, 0, heightFt)
          return u1 - u0 < MIN_HOLE_FT || v1 - v0 < MIN_HOLE_FT ? [] : [{ id: op.id, kind: op.kind, edge: i, u0, u1, v0, v1 }]
        }),
  )
}

export interface ShellOptions {
  /** Close the top with a ceiling (false when Roofs off, so the rooms show). */
  readonly cap: boolean
  /** Wall thickness in feet, one for all or per edge; FIT.wallFt by default. */
  readonly thicknessFt?: Thickness
  /** Holes that are not the exterior cuts': interior doorways in a wall that runs across another part's floor. */
  readonly extraHoles?: readonly WallHole[]
}

/**
 * The walls of an enclosed mass from the floor (y 0) to the eave, with the
 * laid-out openings cut through (legacy curvedWallMesh for curves and
 * wallMeshes for straight walls, one builder for both).
 */
export function buildWallShell(poly: readonly LocalPoint[], heightFt: number, openings: readonly PlacedOpening[], opts: ShellOptions): WallShell {
  const r = ringOf(poly, thicknessOf(opts.thicknessFt))
  const n = poly.length
  const L = r.cum[n] ?? 0
  const h = Math.max(0, heightFt)
  const cap = emptyMesh()
  if (n < 3 || L <= EPS || h <= EPS) return { edges: [], cap, holes: [] }
  const holes = [...openingHoles(poly, openings, h), ...(opts.extraHoles ?? [])]
  const holesOn = poly.map((_, e) => holes.filter((o) => o.edge === e))
  const open = (u: number, v: number) => {
    const x = ((u % L) + L) % L
    return holes.some((o) => o.u0 < x && x < o.u1 && o.v0 < v && v < o.v1)
  }
  const edges = poly.map((_, i) => edgeShell(r, i, h, holesOn, open))
  if (opts.cap) addCap(cap, r.inner, h * FT, 1)
  return { edges, cap, holes }
}

function edgeShell(r: Ring, i: number, h: number, holesOn: readonly (readonly WallHole[])[], open: (u: number, v: number) => boolean): EdgeShell {
  const outer = emptyMesh()
  const inner = emptyMesh()
  const reveals = emptyMesh()
  const n = r.P.length
  if (r.len[i] <= EPS) return { edge: i, outer, inner, reveals }
  const ua = r.cum[i]
  const ub = r.cum[i + 1]
  const own = holesOn[i]
  // rows break at this wall's holes and its neighbours', so a jamb at a shared vertex fits its hole
  const near = [...own, ...holesOn[(i + n - 1) % n], ...holesOn[(i + 1) % n]]
  const us = uniqSorted([ua, ub, ...own.flatMap((o) => [o.u0, o.u1]).filter((u) => u > ua && u < ub)])
  const vs = uniqSorted([0, h, ...near.flatMap((o) => [o.v0, o.v1]).filter((v) => v > 0 && v < h)])
  const t = r.thick[i]
  const at = (q: Vec2, y: number): V3 => [q[0], y, q[1]]
  const along: V3 = [r.dir[i][0], 0, r.dir[i][1]]
  const UP: V3 = [0, 1, 0]
  const DOWN: V3 = [0, -1, 0]
  for (let a = 0; a + 1 < us.length; a++) {
    const u0 = us[a]
    const u1 = us[a + 1]
    const um = (u0 + u1) / 2
    const o0 = wallPoint(r, i, u0, 0)
    const o1 = wallPoint(r, i, u1, 0)
    const i0 = wallPoint(r, i, u0, 1)
    const i1 = wallPoint(r, i, u1, 1)
    const n0 = normalAt(r, i, u0)
    const n1 = normalAt(r, i, u1)
    const m0: V3 = [-n0[0], 0, -n0[2]]
    const m1: V3 = [-n1[0], 0, -n1[2]]
    // a face across the wall at height y, from the outside to the inside (wall top, head, sill)
    const across = (y: number, nrm: V3) => quad(reveals, [at(o0, y), at(o1, y), at(i1, y), at(i0, y)], [nrm, nrm, nrm, nrm], [[u0, 0], [u1, 0], [u1, t], [u0, t]])
    for (let b = 0; b + 1 < vs.length; b++) {
      const v0 = vs[b]
      const v1 = vs[b + 1]
      const vm = (v0 + v1) / 2
      if (open(um, vm)) continue
      const uv: UV[] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
      quad(outer, [at(o0, v0), at(o1, v0), at(o1, v1), at(o0, v1)], [n0, n1, n1, n0], uv)
      quad(inner, [at(i0, v0), at(i1, v0), at(i1, v1), at(i0, v1)], [m0, m1, m1, m0], uv)
      // jambs face into the hole beside this cell; head and sill face into the hole below or above it
      const jamb = (o: Vec2, q: Vec2, sg: number) => {
        const nrm: V3 = [along[0] * sg, 0, along[2] * sg]
        quad(reveals, [at(o, v0), at(q, v0), at(q, v1), at(o, v1)], [nrm, nrm, nrm, nrm], [[0, v0], [t, v0], [t, v1], [0, v1]])
      }
      if (open(u1 + PROBE, vm)) jamb(o1, i1, 1)
      if (open(u0 - PROBE, vm)) jamb(o0, i0, -1)
      if (v0 > EPS && open(um, v0 - PROBE)) across(v0, DOWN)
      if (v1 < h - EPS && open(um, v1 + PROBE)) across(v1, UP)
    }
    if (!open(um, h - PROBE)) across(h, UP)
  }
  return { edge: i, outer, inner, reveals }
}

/** One mesh from several, in order. */
export function joinMeshes(parts: readonly MeshData[]): MeshData {
  return { positions: parts.flatMap((p) => p.positions), normals: parts.flatMap((p) => p.normals), uvs: parts.flatMap((p) => p.uvs) }
}

/**
 * Some walls' meshes as one, with the wall (edge) of every triangle, so a
 * pick on the joined mesh (three.js faceIndex) can say which wall was hit.
 */
export function joinByEdge(parts: readonly EdgeMesh[]): { readonly mesh: MeshData; readonly faceEdges: readonly number[] } {
  return {
    mesh: joinMeshes(parts.map((p) => p.mesh)),
    faceEdges: parts.flatMap((p) => Array<number>(p.mesh.positions.length / 9).fill(p.edge)),
  }
}

/** A wall's outside, inside and reveal faces as one mesh. */
export const edgeMesh = (e: EdgeShell): EdgeMesh => ({ edge: e.edge, mesh: joinMeshes([e.outer, e.inner, e.reveals]) })

/** A flat horizontal cap over the footprint at height y (metres), facing up (+1) or down (-1). */
export function addCap(mesh: MeshData, poly: readonly LocalPoint[], y: number, facing: 1 | -1): void {
  const ring = poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length]
    return Math.hypot(q[0] - p[0], q[1] - p[1]) > EPS
  })
  if (ring.length < 3) return
  const tris = ShapeUtils.triangulateShape(ring.map(([x, z]) => new Vector2(x, z)), [])
  for (const [i, j, k] of tris) {
    addPolygon(
      mesh,
      [i, j, k].map((q) => [ring[q][0] * FT, y, ring[q][1] * FT] as const),
      [0, facing, 0],
    )
  }
}

// ---------- wall kinds: the glass curtain wall's mullion grid (legacy specWallDecor) ----------

/** Mullions about every 1.5 m along a run of glass (legacy nv = round(L / 1.5)). */
const MULLION_SPACING_FT = 1.5 / FT
/** Bar size across its face, and how far it stands proud of the glass each side. */
const MULLION_FT = 0.16
const MULLION_PROUD_FT = 0.03
/** Mullions keep this far off a hole (legacy inHole margin, 2 cm). */
const HOLE_CLEAR_FT = 0.02 / FT
/** The rails: 4 cm off the floor and the eave, a transom at 2.3 m when the wall is over 2.7 m, another 1.2 m over mid-height when it is over 5.5 m. */
const RAIL_INSET_FT = 0.04 / FT
const TRANSOM_FT = 2.3 / FT
const TRANSOM_OVER_FT = 2.7 / FT
const HIGH_TRANSOM_OVER_FT = 5.5 / FT
const HIGH_TRANSOM_ABOVE_MID_FT = 1.2 / FT
const MIN_BAR_FT = 0.05 / FT

export const railHeightsFt = (h: number): number[] => [
  RAIL_INSET_FT,
  h - RAIL_INSET_FT,
  ...(h > TRANSOM_OVER_FT ? [TRANSOM_FT] : []),
  ...(h > HIGH_TRANSOM_OVER_FT ? [h / 2 + HIGH_TRANSOM_ABOVE_MID_FT] : []),
]

/** A square bar from a to b (feet), its depth along `normal` (horizontal); metres out. */
function addBar(mesh: MeshData, a: V3, b: V3, normal: Vec2, depth: number): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  if (len < EPS) return
  const ax: V3 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len]
  const nz: V3 = [normal[0], 0, normal[1]]
  const w: V3 = [ax[1] * nz[2] - ax[2] * nz[1], ax[2] * nz[0] - ax[0] * nz[2], ax[0] * nz[1] - ax[1] * nz[0]]
  const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  const half = [len / 2, depth / 2, MULLION_FT / 2]
  const axes = [ax, nz, w]
  const corner = (s: readonly number[]): V3 => {
    const p = [0, 1, 2].map((k) => (c[k] + axes.reduce((acc, e, m) => acc + e[k] * half[m] * s[m], 0)) * FT)
    return [p[0], p[1], p[2]]
  }
  for (let m = 0; m < 3; m++) {
    for (const sg of [-1, 1]) {
      const [p, q] = [0, 1, 2].filter((x) => x !== m)
      const face = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
        const s = [0, 0, 0]
        s[m] = sg
        s[p] = x
        s[q] = y
        return corner(s)
      })
      addPolygon(mesh, face, [axes[m][0] * sg, axes[m][1] * sg, axes[m][2] * sg])
    }
  }
}

/** The parts of [lo, hi] clear of the given spans (each widened by the hole margin). */
function clearOf(lo: number, hi: number, spans: readonly (readonly [number, number])[]): [number, number][] {
  let out: [number, number][] = [[lo, hi]]
  for (const [s0, s1] of spans) {
    out = out.flatMap(([a, b]): [number, number][] => {
      const c0 = s0 - HOLE_CLEAR_FT
      const c1 = s1 + HOLE_CLEAR_FT
      if (c1 <= a || c0 >= b) return [[a, b]]
      return [...(c0 > a ? [[a, c0] as [number, number]] : []), ...(c1 < b ? [[c1, b] as [number, number]] : [])]
    })
  }
  return out.filter(([a, b]) => b - a > MIN_BAR_FT)
}

export type KindOf = WallKind | null | undefined | ((edge: number) => WallKind | null | undefined)

/** One wall's share of a mesh, so each wall can be finished and picked on its own. */
export interface EdgeMesh {
  readonly edge: number
  readonly mesh: MeshData
}

/**
 * Decor a wall kind adds over its surface (legacy specWallDecor): a glass
 * curtain wall gets a mullion grid in its mid-plane, mullions about every
 * 1.5 m along each run of glass (one at each sharp corner) and rails at the
 * foot, the eave and the transom heights, all clear of the holes. The other
 * kinds are surface only. `kind` is one for all walls or per edge; each
 * bar belongs to the glass wall it stands on.
 */
export function wallDecorByEdge(poly: readonly LocalPoint[], heightFt: number, kind: KindOf, openings: readonly PlacedOpening[], opts: { readonly thicknessFt?: Thickness } = {}): EdgeMesh[] {
  const meshes = poly.map(() => emptyMesh())
  const kindAt = typeof kind === 'function' ? kind : () => kind
  const r = ringOf(poly, thicknessOf(opts.thicknessFt ?? GLASS_WALL_FT))
  const n = poly.length
  const L = r.cum[n] ?? 0
  const h = Math.max(0, heightFt)
  // a zero-length edge goes with the wall before it
  const glass = poly.map((_, e) => kindAt(r.len[e] > EPS ? e : edgeBefore(r.len, e)) === 'glass')
  if (n < 3 || L <= EPS || h <= EPS || !glass.some(Boolean)) return []
  const holes = openingHoles(poly, openings, h)
  const depth = (e: number) => r.thick[e] + 2 * MULLION_PROUD_FT
  const at = (q: Vec2, y: number): V3 => [q[0], y, q[1]]

  // vertical mullions: runs of glass between sharp corners and changes of kind
  const breaks = poly.map((_, i) => r.crease[i] || glass[edgeBefore(r.len, i)] !== glass[i])
  const places = new Map<string, { edge: number; u: number }>()
  const place = (u: number) => {
    const x = ((u % L) + L) % L
    const at0 = x > L - EPS ? 0 : x
    let e = r.cum.findIndex((c, k) => k < n && at0 >= c - EPS && at0 < r.cum[k + 1] - EPS)
    if (e < 0) e = n - 1
    places.set(at0.toFixed(4), { edge: e, u: at0 })
  }
  const start = breaks.findIndex(Boolean)
  if (start < 0) {
    const count = Math.max(1, Math.round(L / MULLION_SPACING_FT))
    for (let k = 0; k < count; k++) place((L * k) / count)
  } else {
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n
      if (!breaks[i] || !glass[i]) continue
      let run = 0
      for (let m = 0; m < n; m++) {
        const e = (i + m) % n
        if (m > 0 && breaks[e]) break
        run += r.len[e]
      }
      const count = Math.max(1, Math.round(run / MULLION_SPACING_FT))
      for (let m = 0; m <= count; m++) place(r.cum[i] + (run * m) / count)
    }
  }
  for (const { edge, u } of places.values()) {
    const atVertex = Math.abs(u - r.cum[edge]) < EPS
    // a mullion where glass meets another kind stands on the glass wall
    const owner = glass[edge] ? edge : edgeBefore(r.len, edge)
    const normal = atVertex ? r.vn[edge] : r.fn[edge]
    const mid = wallPoint(r, edge, u, 0.5)
    const crosses = (o: WallHole) => [u - L, u, u + L].some((x) => o.u0 - HOLE_CLEAR_FT < x && x < o.u1 + HOLE_CLEAR_FT)
    const across = holes.filter(crosses).map((o) => [o.v0, o.v1] as const)
    for (const [y0, y1] of clearOf(0, h, across)) addBar(meshes[owner], at(mid, y0), at(mid, y1), normal, depth(owner))
  }

  // rails: along each glass wall at each rail height, clear of the holes
  poly.forEach((_, i) => {
    if (!glass[i]) return
    for (const y of railHeightsFt(h)) {
      const spans = holes.filter((o) => o.edge === i && o.v0 - HOLE_CLEAR_FT < y && y < o.v1 + HOLE_CLEAR_FT).map((o) => [o.u0, o.u1] as const)
      for (const [u0, u1] of clearOf(r.cum[i], r.cum[i + 1], spans)) {
        addBar(meshes[i], at(wallPoint(r, i, u0, 0.5), y), at(wallPoint(r, i, u1, 0.5), y), r.fn[i], depth(i))
      }
    }
  })
  return meshes.flatMap((mesh, edge) => (mesh.positions.length ? [{ edge, mesh }] : []))
}

/** wallDecorByEdge as one mesh. */
export function wallDecor(poly: readonly LocalPoint[], heightFt: number, kind: KindOf, openings: readonly PlacedOpening[], opts: { readonly thicknessFt?: Thickness } = {}): MeshData {
  return joinMeshes(wallDecorByEdge(poly, heightFt, kind, openings, opts).map((d) => d.mesh))
}

// ---------- the Walls editor's view of a curved mass (legacy perimWall, wallFaces, curvedToAlong) ----------

/** Shapes whose walls are one unrolled wall in the Walls editor (legacy CURVED). */
const CURVED_WALLS = ['ellipse', 'kidney', 'teardrop', 'blob', 'poly']
export const isCurvedWall = (shape: string | undefined): boolean => !!shape && CURVED_WALLS.includes(shape)

export interface WallFace {
  /** The edge index, or 'along' for a curved mass's whole perimeter. */
  readonly edge: number | 'along'
  readonly lengthFt: number
}

/** The walls the Walls editor shows: a curved mass as one unrolled wall, any other as one per edge of 1 ft or more (legacy wallFaces). */
export function wallFaces(poly: readonly LocalPoint[], shape: string | undefined): WallFace[] {
  const { len, cum } = perimeter(poly)
  if (isCurvedWall(shape)) return [{ edge: 'along', lengthFt: cum[poly.length] ?? 0 }]
  return len.flatMap((l, i) => (l * FT >= 0.3 ? [{ edge: i, lengthFt: l }] : []))
}

/** A curved mass's per-edge cuts as along-cuts at the same place on the wall, x to the half foot (legacy curvedToAlong). */
export function curvedToAlong(poly: readonly LocalPoint[], cuts: readonly CutData[]): CutData[] {
  if (poly.length === 0) return [...cuts]
  const { len, cum } = perimeter(poly)
  const positive = signedAreaOf(poly) > 0
  return cuts.map((c) => {
    if (c.along) return c
    const i = clamp(Math.trunc(Number(c.edge) || 0), 0, poly.length - 1)
    const x = Number(c.x) || 0
    const s = positive ? len[i] - x - (Number(c.w) || 0) : x
    const { edge: _edge, ...rest } = c
    return { ...rest, along: true, x: Math.round((cum[i] + s) * 2) / 2 }
  })
}
