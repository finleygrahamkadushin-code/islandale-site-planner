import type { LocalPoint } from '../footprint'
import { effectiveSupport, pointInPolygon, type SupportKind } from './foundation'
import { addPolygon, emptyMesh, type MeshData, type V3 } from '../geom'
import { curvePosts, offsetOutline } from '../outline'
import { buildSlab } from '../slab'
import { buildWalls } from '../walls/walls'

/**
 * Supports under a mass (legacy supportsMesh / _supportsMesh0,
 * curvedSupports, specSupports): a concrete skirt or slab, posts, piers or
 * pilings on beams (braced on a square grid when asked), a mast (one core
 * with radiating struts) or stilts (splayed raking columns on footings).
 * Everything is in the mass's frame: plans in feet in, metres out, y up
 * from the mass floor. Each post, pile and stilt runs down to the real
 * ground under it, not to one common depth as in the old planner.
 */

const FT = 0.3048
const IN = 0.0254
/** Posts, piles, cores and skirts go this far into the ground, metres. */
export const SUPPORT_EMBED_M = 0.3
/** Outlines with more vertices than this are curves (legacy P.length > 24). */
const CURVED_VERTICES = 24
/** Beams under the floor are this deep and wide, metres. */
export const BEAM_H_M = 0.28
export const BEAM_W_M = 0.12
/** A stilt's footing pad's radius, metres. */
export const FOOTING_R_M = 0.26
/** A mast core's radius at its foot and its flared head, as shares of its radius r. */
export const MAST_FOOT_R = 1.1
export const MAST_HEAD_R = 2.4
const BRACE_R_M = 0.04
/** Bracing goes where the floor is more than this over the ground, metres (legacy drop > 1.8). */
const BRACE_MIN_DROP_M = 1.8
/** The X-braces rise this share of the drop from the ground (legacy bh = drop * 0.85). */
const BRACE_RISE = 0.85
/** A post shorter than this is left out, metres. */
const MIN_POST_M = 0.05
const MIN_SPACING_M = 0.9
const POST_IN = 6
const PILE_IN = 10
/** Grid posts keep this far in from a shaped outline's edge, metres (legacy polyInset(poly, -0.5)). */
const GRID_EDGE_M = 0.5
const CORNER_CLEAR_M = 0.6
const SLAB_APRON_M = 0.3
const SLAB_APRON_THICK_M = 0.12
/** Mast and stilt houses sit on a plate this thick; their struts meet it just under (legacy specSupports). */
const SPEC_PLATE_M = 0.42
const SPEC_STRUT_TOP_M = 0.44
const SPEC_INSET = 0.93
const MAST_GAP_M = 4.5
const STILT_GAP_M = 3.2
const STILT_GRID_M = 4
const STILT_GRID_IN_M = 3
const STILT_GRID_END_M = 2
/** A stilt is left out where the floor is closer than this to the ground, metres. */
const MIN_STILT_DROP_M = 0.3

export interface SupportOptions {
  /** The mass outline, feet, mass-local. */
  readonly poly: readonly LocalPoint[]
  readonly support: unknown
  readonly spacingFt: number
  /** Post size, inches; when missing, 6 in for posts and 10 in for piers and pilings (legacy). */
  readonly postIn?: number
  readonly bracing?: boolean
  /** Where the mast stands, feet, mass-local (legacy o.mastAt); the outline's centre when missing. */
  readonly mastAt?: LocalPoint
  /** Ground under a mass-local point (feet), metres relative to the mass floor (negative below it). */
  readonly groundY: (x: number, z: number) => number
  /** Top of the supports relative to the mass floor, metres: 0 under walls, minus the floor depth under a deck. */
  readonly top?: number
}

/** A vertical post, pier or pile, metres: from y0 (in the ground) up to y1. */
export interface PlanPost {
  readonly x: number
  readonly z: number
  readonly y0: number
  readonly y1: number
}

/** A straight member between two points, metres. */
export interface Strut {
  readonly a: V3
  readonly b: V3
}

export interface MastCore {
  readonly x: number
  readonly z: number
  /** Core radius, metres (legacy R). */
  readonly r: number
  /** Bottom of the core, in the ground. */
  readonly bottom: number
  /** Height of the steel collar the struts spring from. */
  readonly collarY: number
}

export interface SupportPlan {
  readonly kind: SupportKind
  readonly top: number
  /** Posts, piers and pilings: their section, metres, and whether round. */
  readonly section: { readonly size: number; readonly round: boolean } | null
  readonly posts: readonly PlanPost[]
  /** Beams under the floor, metres, plan ends; each 0.28 m deep up to the top. */
  readonly beams: readonly (readonly [LocalPoint, LocalPoint])[]
  readonly braces: readonly Strut[]
  /** Mast struts or stilts. */
  readonly struts: readonly Strut[]
  /** Stilt footings: short round pads, bottom to top. */
  readonly footings: readonly Strut[]
  readonly mast: MastCore | null
  /** Bottom of the concrete skirt, metres, or null for none. */
  readonly skirtBottom: number | null
  /** A slab's thin apron round the outline. */
  readonly apron: boolean
  /** A mast or stilt house's plate under the floor. */
  readonly plate: boolean
}

type GroundM = (x: number, z: number) => number

/** What stands under a mass: the support the plan names (legacy effectiveSupport), laid out on the real ground. */
export function supportPlan(o: SupportOptions): SupportPlan {
  const top = o.top ?? 0
  const P = o.poly.map(([x, z]) => [x * FT, z * FT] as const)
  const gy: GroundM = (x, z) => o.groundY(x / FT, z / FT)
  const low = P.length ? Math.min(...P.map(([x, z]) => gy(x, z))) : 0
  const drop = top - low
  const kind = effectiveSupport(o.support, drop)
  const plan: SupportPlan = { kind, top, section: null, posts: [], beams: [], braces: [], struts: [], footings: [], mast: null, skirtBottom: null, apron: false, plate: false }
  if (kind === 'earth' || P.length < 3) return plan
  if (kind === 'skirt' || kind === 'slab') {
    // the old planner drew no foundation when the floor sat at or below the ground
    const on = drop > -0.05
    return { ...plan, skirtBottom: on ? low - SUPPORT_EMBED_M : null, apron: on && kind === 'slab' }
  }
  if (kind === 'mast') return { ...plan, ...mastPlan(P, o.mastAt, gy, top), plate: true }
  if (kind === 'stilts') return { ...plan, ...stiltPlan(P, gy, top), plate: true }
  return { ...plan, ...postPlan(P, kind, o, gy, top) }
}

// ---------- posts, piers and pilings ----------

interface PostLayout {
  readonly points: readonly LocalPoint[]
  readonly beams: readonly (readonly [LocalPoint, LocalPoint])[]
  /** Posts along each outer side of a square grid, in order, for bracing. */
  readonly sides: readonly (readonly LocalPoint[])[]
}

function postPlan(P: readonly LocalPoint[], kind: SupportKind, o: SupportOptions, gy: GroundM, top: number): Partial<SupportPlan> {
  const size = Math.max(0.1, (o.postIn ?? (kind === 'posts' ? POST_IN : PILE_IN)) * IN)
  const s = Math.max(MIN_SPACING_M, o.spacingFt * FT)
  const layout = postLayout(P, s, size, kind !== 'piers')
  const posts = layout.points.flatMap(([x, z]): PlanPost[] => {
    const g = gy(x, z)
    return top - g < MIN_POST_M ? [] : [{ x, z, y0: g - SUPPORT_EMBED_M, y1: top }]
  })
  const braces = o.bracing ? layout.sides.flatMap((row) => braceRow(row, gy, top)) : []
  return { section: { size, round: kind !== 'posts' }, posts, beams: layout.beams, braces }
}

/**
 * Post positions and beams, metres (legacy _supportsMesh0): a square grid
 * under a plain rectangle, beams along every row (and every column, unless
 * piers); corner posts and an inner grid under a shaped plan with a beam
 * round the inside of its edge; a ring and grid under a curve (curvePosts)
 * with a ring beam and row beams across it.
 */
export function postLayout(P: readonly LocalPoint[], s: number, size: number, columnBeams = true): PostLayout {
  const xs = P.map((p) => p[0])
  const zs = P.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const z0 = Math.min(...zs)
  const z1 = Math.max(...zs)
  const w = x1 - x0
  const d = z1 - z0
  const nx = Math.max(2, Math.round(w / s) + 1)
  const nz = Math.max(2, Math.round(d / s) + 1)
  const gx = Array.from({ length: nx }, (_, i) => x0 + size / 2 + ((w - size) * i) / (nx - 1))
  const gz = Array.from({ length: nz }, (_, j) => z0 + size / 2 + ((d - size) * j) / (nz - 1))
  const inset = size / 2 + 0.05

  if (P.length > CURVED_VERTICES) {
    const R = offsetOutline(P, -inset)
    return { points: curvePosts(P, s, inset), beams: [...ringBeams(R), ...rowBeams(R, s)], sides: [] }
  }
  if (!isAxisRect(P)) {
    const inner = offsetOutline(P, -inset)
    const keep = offsetOutline(P, -GRID_EDGE_M)
    const grid = gx.flatMap((x) => gz.map((z) => [x, z] as const)).filter(([x, z]) => pointInPolygon(keep, x, z) && !inner.some((q) => Math.hypot(q[0] - x, q[1] - z) < CORNER_CLEAR_M))
    return { points: [...inner, ...grid], beams: ringBeams(inner), sides: [] }
  }
  const points = gx.flatMap((x) => gz.map((z) => [x, z] as const))
  const rows = gz.map((z): readonly [LocalPoint, LocalPoint] => [[x0, z], [x1, z]])
  const cols = columnBeams ? gx.map((x): readonly [LocalPoint, LocalPoint] => [[x, z0], [x, z1]]) : []
  const last = (a: readonly number[]) => a[a.length - 1]
  const sides = [gx.map((x) => [x, gz[0]] as const), gx.map((x) => [x, last(gz)] as const), gz.map((z) => [gx[0], z] as const), gz.map((z) => [last(gx), z] as const)]
  return { points, beams: [...rows, ...cols], sides }
}

const isAxisRect = (P: readonly LocalPoint[]): boolean => {
  if (P.length !== 4) return false
  const xs = P.map((p) => p[0])
  const zs = P.map((p) => p[1])
  const near = (v: number, a: number) => Math.abs(v - a) < 1e-6
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  return P.every(([x, z]) => (near(x, x0) || near(x, x1)) && (near(z, z0) || near(z, z1)))
}

const ringBeams = (R: readonly LocalPoint[]): (readonly [LocalPoint, LocalPoint])[] => R.map((a, i) => [a, R[(i + 1) % R.length]] as const)

/** Beams straight across a curved floor every `s` (legacy curvedSupports row beams). */
function rowBeams(R: readonly LocalPoint[], s: number): (readonly [LocalPoint, LocalPoint])[] {
  const zs = R.map((p) => p[1])
  const z0 = Math.min(...zs)
  const z1 = Math.max(...zs)
  const nz = Math.max(1, Math.round((z1 - z0) / s))
  const out: (readonly [LocalPoint, LocalPoint])[] = []
  for (let j = 1; j < nz; j++) {
    const z = z0 + ((z1 - z0) * j) / nz
    const X = R.flatMap((a, i) => {
      const b = R[(i + 1) % R.length]
      return a[1] > z !== b[1] > z ? [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1])] : []
    }).sort((p, q) => p - q)
    for (let k = 0; k + 1 < X.length; k += 2) out.push([[X[k], z], [X[k + 1], z]])
  }
  return out
}

/** X-braces between neighbouring posts along one side, from the ground at each post up most of the way (legacy bracing). */
function braceRow(row: readonly LocalPoint[], gy: GroundM, top: number): Strut[] {
  const out: Strut[] = []
  for (let i = 0; i + 1 < row.length; i++) {
    const [ax, az] = row[i]
    const [bx, bz] = row[i + 1]
    const ga = gy(ax, az)
    const gb = gy(bx, bz)
    if (Math.min(top - ga, top - gb) <= BRACE_MIN_DROP_M) continue
    const up = (g: number) => g + (top - g) * BRACE_RISE
    out.push({ a: [ax, ga, az], b: [bx, up(gb), bz] }, { a: [bx, gb, bz], b: [ax, up(ga), az] })
  }
  return out
}

// ---------- mast and stilts ----------

/** Where mast struts and stilts meet the plate: just inside the edge, at every vertex and every few metres between (legacy specSupports tops). */
export function specTops(P: readonly LocalPoint[], kind: 'mast' | 'stilts'): LocalPoint[] {
  const cx = P.reduce((a, p) => a + p[0], 0) / P.length
  const cz = P.reduce((a, p) => a + p[1], 0) / P.length
  const inner = P.map(([x, z]) => [cx + (x - cx) * SPEC_INSET, cz + (z - cz) * SPEC_INSET] as const)
  const gap = kind === 'mast' ? MAST_GAP_M : STILT_GAP_M
  return inner.flatMap((p, i) => {
    const q = inner[(i + 1) % inner.length]
    const k = Math.floor(Math.hypot(q[0] - p[0], q[1] - p[1]) / gap)
    return [p, ...Array.from({ length: k }, (_, j) => [p[0] + ((q[0] - p[0]) * (j + 1)) / (k + 1), p[1] + ((q[1] - p[1]) * (j + 1)) / (k + 1)] as const)]
  })
}

/** One concrete core under the middle, a steel collar part way down, struts radiating up to the plate's edge. */
function mastPlan(P: readonly LocalPoint[], mastAt: LocalPoint | undefined, gy: GroundM, top: number): Partial<SupportPlan> {
  const xs = P.map((p) => p[0])
  const zs = P.map((p) => p[1])
  const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length
  const cz = zs.reduce((a, b) => a + b, 0) / zs.length
  const [mx, mz] = mastAt ? [mastAt[0] * FT, mastAt[1] * FT] : [cx, cz]
  const r = Math.max(0.45, Math.min(1.3, span * 0.08))
  const g = gy(mx, mz)
  const collarY = top - Math.min(Math.max(0, top - g) * 0.62, Math.max(2.5, span * 0.5))
  const struts = specTops(P, 'mast').map(([x, z]): Strut => {
    const dx = x - mx
    const dz = z - mz
    const l = Math.hypot(dx, dz) || 1
    return { a: [mx + (dx / l) * r * 1.2, collarY, mz + (dz / l) * r * 1.2], b: [x, top - SPEC_STRUT_TOP_M, z] }
  })
  return { mast: { x: mx, z: mz, r, bottom: g - 0.7, collarY }, struts }
}

/** Raking columns from the plate's edge out and round to footings, plus a loose grid under the middle (legacy stilts). */
function stiltPlan(P: readonly LocalPoint[], gy: GroundM, top: number): Partial<SupportPlan> {
  const cx = P.reduce((a, p) => a + p[0], 0) / P.length
  const cz = P.reduce((a, p) => a + p[1], 0) / P.length
  const struts: Strut[] = []
  const footings: Strut[] = []
  const add = ([x, z]: LocalPoint, foot: (drop: number) => LocalPoint) => {
    const drop = top - gy(x, z)
    if (drop < MIN_STILT_DROP_M) return
    const [fx, fz] = foot(drop)
    const g = gy(fx, fz)
    if (g > top - SPEC_STRUT_TOP_M - MIN_STILT_DROP_M) return
    struts.push({ a: [x, top - SPEC_STRUT_TOP_M, z], b: [fx, g - 0.25, fz] })
    footings.push({ a: [fx, g - 0.3, fz], b: [fx, g + 0.1, fz] })
  }
  specTops(P, 'stilts').forEach(([x, z], i) => {
    const l = Math.hypot(x - cx, z - cz) || 1
    const rx = (x - cx) / l
    const rz = (z - cz) / l
    const sg = i % 2 ? 1 : -1
    const k = 0.1 + 0.08 * ((i * 5) % 3)
    add([x, z], (d) => [x + rx * k * d - rz * sg * 0.17 * d, z + rz * k * d + rx * sg * 0.17 * d])
  })
  const xs = P.map((p) => p[0])
  const zs = P.map((p) => p[1])
  for (let x = Math.min(...xs) + STILT_GRID_IN_M; x < Math.max(...xs) - STILT_GRID_END_M; x += STILT_GRID_M) {
    for (let z = Math.min(...zs) + STILT_GRID_IN_M; z < Math.max(...zs) - STILT_GRID_END_M; z += STILT_GRID_M) {
      if (!pointInPolygon(P, x, z)) continue
      const j = struts.length
      add([x, z], (d) => [x + ((j % 3) - 1) * 0.09 * d, z + (((j + 1) % 3) - 1) * 0.09 * d])
    }
  }
  return { struts, footings }
}

// ---------- meshes ----------

export type SupportMaterial = 'wood' | 'concrete' | 'steel' | 'white'

/** One drawable piece: its paint part (post or foundation), its material, its triangles (mass-local metres). */
export interface SupportPiece {
  readonly part: 'post' | 'foundation'
  readonly material: SupportMaterial
  readonly mesh: MeshData
}

/** The plan as meshes, grouped by part and material so each group is one draw. */
export function supportMeshes(plan: SupportPlan, polyFt: readonly LocalPoint[]): SupportPiece[] {
  const m = {
    wood: emptyMesh(),
    pier: emptyMesh(),
    steel: emptyMesh(),
    white: emptyMesh(),
    footing: emptyMesh(),
    plateSteel: emptyMesh(),
    plateWhite: emptyMesh(),
  }
  const { top, section } = plan
  if (section) {
    // square posts as legacy boxes; piers (concrete) and pilings (wood) as ten-sided columns
    const target = plan.kind === 'piers' ? m.pier : m.wood
    for (const p of plan.posts) {
      if (section.round) addPrism(target, [p.x, p.y0, p.z], [p.x, p.y1, p.z], section.size / 2, 10, true)
      else addPrism(target, [p.x, p.y0, p.z], [p.x, p.y1, p.z], (section.size / 2) * Math.SQRT2, 4, true)
    }
  }
  for (const [a, b] of plan.beams) addBeam(m.wood, a, b, top, BEAM_H_M, BEAM_W_M)
  for (const s of plan.braces) addPrism(m.wood, s.a, s.b, BRACE_R_M, 4, true)
  if (plan.skirtBottom !== null) appendShifted(m.footing, buildWalls(polyFt, (top - plan.skirtBottom) / FT), plan.skirtBottom)
  if (plan.apron) buildSlab(offsetOutline(polyFt, SLAB_APRON_M / FT), SLAB_APRON_THICK_M, top, m.footing)
  if (plan.plate) buildSlab(polyFt, SPEC_PLATE_M, top, plan.mast ? m.plateSteel : m.plateWhite)
  if (plan.mast) {
    const { x, z, r, bottom, collarY } = plan.mast
    addPrism(m.pier, [x, bottom, z], [x, top - 0.4, z], r * MAST_FOOT_R, 28, true, r * 0.9)
    addPrism(m.pier, [x, top - 1.5, z], [x, top - 0.4, z], r * 0.95, 28, true, r * MAST_HEAD_R)
    addPrism(m.steel, [x, collarY - 0.25, z], [x, collarY + 0.25, z], r * 1.35, 28, true)
    for (const s of plan.struts) addPrism(m.steel, s.a, s.b, 0.1, 8)
  } else {
    for (const s of plan.struts) addPrism(m.white, s.a, s.b, 0.085, 8)
  }
  for (const f of plan.footings) addPrism(m.pier, f.a, f.b, FOOTING_R_M, 10, true)
  const pieces: SupportPiece[] = [
    { part: 'post', material: 'wood', mesh: m.wood },
    { part: 'post', material: 'concrete', mesh: m.pier },
    { part: 'post', material: 'steel', mesh: m.steel },
    { part: 'post', material: 'white', mesh: m.white },
    { part: 'foundation', material: 'concrete', mesh: m.footing },
    { part: 'foundation', material: 'steel', mesh: m.plateSteel },
    { part: 'foundation', material: 'white', mesh: m.plateWhite },
  ]
  return pieces.filter((p) => p.mesh.positions.length > 0)
}

function appendShifted(into: MeshData, from: MeshData, dy: number): void {
  for (let i = 0; i < from.positions.length; i += 3) into.positions.push(from.positions[i], from.positions[i + 1] + dy, from.positions[i + 2])
  into.normals.push(...from.normals)
  into.uvs.push(...from.uvs)
}

// ---------- shared solids (legacy prismGeo and BoxGeometry) ----------

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit3 = (a: V3): V3 => mul3(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1))

/**
 * Legacy prismGeo: a prism of `sides` faces round the segment a → b, corners
 * `r` from its axis (`rEnd` at b, for a tapered column), shaded smooth past
 * four sides and flat at four or fewer, with end caps when asked. Metres in;
 * UVs in feet along the member and round it.
 */
export function addPrism(mesh: MeshData, a: V3, b: V3, r: number, sides = 4, caps = false, rEnd = r): void {
  const axis = sub3(b, a)
  const L = Math.hypot(axis[0], axis[1], axis[2])
  if (L < 1e-4 || sides < 3) return
  const d = mul3(axis, 1 / L)
  const u = unit3(cross3(d, Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]))
  const v = cross3(d, u)
  const ring = Array.from({ length: sides }, (_, k): V3 => {
    const t = ((k + 0.5) / sides) * 2 * Math.PI
    return add3(mul3(u, Math.cos(t)), mul3(v, Math.sin(t)))
  })
  const lean = (n: V3): V3 => unit3(add3(n, mul3(d, (r - rEnd) / L)))
  const arc = (k: number) => ((k / sides) * 2 * Math.PI * Math.max(r, rEnd)) / FT
  for (let k = 0; k < sides; k++) {
    const n0 = ring[k]
    const n1 = ring[(k + 1) % sides]
    const flat = lean(unit3(add3(n0, n1)))
    const [m0, m1] = sides > 4 ? [lean(n0), lean(n1)] : [flat, flat]
    const p0 = add3(a, mul3(n0, r))
    const p1 = add3(b, mul3(n0, rEnd))
    const p2 = add3(b, mul3(n1, rEnd))
    const p3 = add3(a, mul3(n1, r))
    const uv0: [number, number] = [0, arc(k)]
    const uv1: [number, number] = [L / FT, arc(k)]
    const uv2: [number, number] = [L / FT, arc(k + 1)]
    const uv3: [number, number] = [0, arc(k + 1)]
    pushTri(mesh, [p0, p1, p2], [m0, m0, m1], [uv0, uv1, uv2], flat)
    pushTri(mesh, [p0, p2, p3], [m0, m1, m1], [uv0, uv2, uv3], flat)
  }
  if (caps) {
    addPolygon(mesh, ring.map((n) => add3(a, mul3(n, r))), mul3(d, -1))
    addPolygon(mesh, ring.map((n) => add3(b, mul3(n, rEnd))), d)
  }
}

/** One triangle, wound so its face points along `outward`. */
function pushTri(mesh: MeshData, p: readonly [V3, V3, V3], n: readonly [V3, V3, V3], uv: readonly [readonly [number, number], readonly [number, number], readonly [number, number]], outward: V3): void {
  const face = cross3(sub3(p[1], p[0]), sub3(p[2], p[0]))
  const order = dot3(face, outward) < 0 ? [0, 2, 1] : [0, 1, 2]
  for (const i of order) {
    mesh.positions.push(...p[i])
    mesh.normals.push(...n[i])
    mesh.uvs.push(...uv[i])
  }
}

/** A level beam `h` deep and `w` wide from plan point a to b (metres), its top at `top`. */
export function addBeam(mesh: MeshData, a: LocalPoint, b: LocalPoint, top: number, h: number, w: number): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (L < 0.05) return
  const dx = (b[0] - a[0]) / L
  const dz = (b[1] - a[1]) / L
  const sx = -dz * (w / 2)
  const sz = dx * (w / 2)
  const c = (p: LocalPoint, side: number, y: number): V3 => [p[0] + sx * side, y, p[1] + sz * side]
  const lo = top - h
  const [a0, a1, b0, b1] = [c(a, -1, lo), c(a, 1, lo), c(b, -1, lo), c(b, 1, lo)]
  const [A0, A1, B0, B1] = [c(a, -1, top), c(a, 1, top), c(b, -1, top), c(b, 1, top)]
  addPolygon(mesh, [A0, A1, B1, B0], [0, 1, 0])
  addPolygon(mesh, [a0, b0, b1, a1], [0, -1, 0])
  addPolygon(mesh, [a1, b1, B1, A1], [-dz, 0, dx])
  addPolygon(mesh, [a0, A0, B0, b0], [dz, 0, -dx])
  addPolygon(mesh, [a0, a1, A1, A0], [-dx, 0, -dz])
  addPolygon(mesh, [b0, B0, B1, b1], [dx, 0, dz])
}
