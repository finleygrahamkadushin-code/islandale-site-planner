import { ShapeUtils, Vector2 } from 'three'
import { pointInPolygon } from '../../site/geom2d'
import { signedArea, type LocalPoint } from '../footprint'
import { addPolygon, emptyMesh, type MeshData, type V3 } from '../geom'
import { offsetOutline } from '../outline'
import { M_PER_FT as FT } from '../../site/units'

const FASCIA_M = 0.24
/** Roof pieces smaller than this (m²) are slivers left by cutting along a crease. */
const MIN_PIECE_M2 = 1e-9
/** Thickness of a vaulted (shell) prow roof, legacy SHELL_T. */
export const SHELL_M = 0.2

/** Roof surfaces, end infill and trim, local metres with y 0 at the eave (the same shape as buildRoof's result). */
export interface FittedRoof {
  readonly roof: MeshData
  readonly gables: MeshData
  readonly trim: MeshData
  /** Clerestory glass between the wall tops and a vaulted roof. */
  readonly glass: MeshData
  readonly rise: number
}

type P2 = readonly [number, number]
const empty = (): FittedRoof => ({ roof: emptyMesh(), gables: emptyMesh(), trim: emptyMesh(), glass: emptyMesh(), rise: 0 })
const toM = (poly: readonly LocalPoint[]): P2[] => poly.map(([x, z]) => [x * FT, z * FT] as const)
const ccw = (poly: P2[]): P2[] => (signedArea(poly) < 0 ? [...poly].reverse() : poly)

/**
 * Port of the legacy polyRoofGeometry(): a faceted roof over any outline
 * (walls grown by the overhang) for gable, hip, shed, butterfly and gambrel
 * on plans that are not rectangles. The outline gets a point wherever an
 * edge crosses a ridge, valley or hip line, so a trapezoid's slanted side
 * still shows its gable peak or butterfly V (the legacy fan ran straight
 * from corner to corner across them). The legacy fanned from the mass
 * origin, which roofed a U's courtyard; see roofPieces for what replaces it.
 */
export function polyRoof(poly: readonly LocalPoint[], type: string, pitch: number, ridge: 'x' | 'z', overhangFt: number): FittedRoof {
  const out = empty()
  const slope = Math.max(0, pitch) / 12
  const ring = ccw(toM(offsetOutline(poly, overhangFt)))
  const xs = ring.map((p) => p[0])
  const zs = ring.map((p) => p[1])
  const hx = (Math.max(...xs) - Math.min(...xs)) / 2 || 1
  const hz = (Math.max(...zs) - Math.min(...zs)) / 2 || 1
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cz = (Math.max(...zs) + Math.min(...zs)) / 2
  const lines = creaseLines(type, ridge, cx, cz, hx, hz)
  const P = splitAtCreases(ring, lines)
  const f = (x: number, z: number): number => {
    const a = ridge === 'z' ? x - cx : z - cz
    const b = ridge === 'z' ? hx : hz
    if (type === 'hip' || type === 'pyramid') return Math.max(0, slope * Math.min(hx, hz) * (1 - Math.max(Math.abs(x - cx) / hx, Math.abs(z - cz) / hz)))
    if (type === 'shed') return slope * (b - a)
    if (type === 'butterfly') return 0.25 + slope * Math.abs(a)
    if (type === 'gambrel') return slope * b * 1.25 - slope * Math.abs(a) * 1.25
    return slope * b - slope * Math.abs(a)
  }
  let rise = 0
  for (const piece of roofPieces(P, [cx, cz], lines)) {
    const pts = piece.map(([x, z]): V3 => [x, f(x, z), z])
    rise = Math.max(rise, ...pts.map((q) => q[1]))
    addPolygon(out.roof, pts, [0, 1, 0])
  }
  // close the ends where the roof stands up off the eave line
  for (let i = 0; i < P.length; i++) {
    const a = P[i]
    const b = P[(i + 1) % P.length]
    const ya = f(a[0], a[1])
    const yb = f(b[0], b[1])
    if (ya > 0.02 || yb > 0.02) addPolygon(out.gables, [[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], yb, b[1]], [a[0], ya, a[1]]], outwardOf(P, i))
  }
  soffitAndFascia(out, P)
  return { ...out, rise }
}

/**
 * The roof plan cut into flat pieces, each inside the outline and on one
 * side of every crease. Every crease passes through the box centre `c`, so
 * where `c` sees the whole outline a fan from it is already flat piece by
 * piece. Elsewhere (a U, an L, a box centre outside the outline) the outline
 * is triangulated and each triangle cut along the creases.
 */
function roofPieces(P: readonly P2[], c: P2, lines: readonly ((p: P2) => number)[]): P2[][] {
  const fan = P.map((a, i): P2[] => [c, a, P[(i + 1) % P.length]])
  if (fan.every((t) => signedArea(t) > MIN_PIECE_M2)) return fan
  const tris = ShapeUtils.triangulateShape(P.map(([x, z]) => new Vector2(x, z)), [])
  return tris
    .flatMap(([i, j, k]) => lines.reduce<P2[][]>((pieces, g) => pieces.flatMap((q) => [clip(q, g), clip(q, (p) => -g(p))]), [[P[i], P[j], P[k]]]))
    .flatMap((q) => {
      // a cut leaves near-repeated points where a corner sits on the crease; fan each convex piece into its own triangles
      const d = q.filter((a, n) => Math.hypot(a[0] - q[(n + 1) % q.length][0], a[1] - q[(n + 1) % q.length][1]) > 1e-9)
      return d.slice(1, -1).map((a, n): P2[] => [d[0], a, d[n + 2]])
    })
    .filter((t) => Math.abs(signedArea(t)) > MIN_PIECE_M2)
}

/**
 * The lines where a fitted roof folds, each as a function that is zero on the
 * line: the ridge or valley of a gable, gambrel or butterfly, and the two hip
 * lines of a hip (corner to corner of its box). A shed has none.
 */
function creaseLines(type: string, ridge: 'x' | 'z', cx: number, cz: number, hx: number, hz: number): ((p: P2) => number)[] {
  if (type === 'shed') return []
  if (type === 'hip' || type === 'pyramid') return [(p) => (p[0] - cx) / hx - (p[1] - cz) / hz, (p) => (p[0] - cx) / hx + (p[1] - cz) / hz]
  return [(p) => (ridge === 'z' ? p[0] - cx : p[1] - cz)]
}

/** The outline with a new point wherever an edge crosses one of the lines, in order along each edge. */
function splitAtCreases(P: readonly P2[], lines: readonly ((p: P2) => number)[]): P2[] {
  return P.flatMap((a, i) => {
    const b = P[(i + 1) % P.length]
    const ts = lines
      .map((g) => [g(a), g(b)] as const)
      .filter(([ga, gb]) => (ga < 0 && gb > 0) || (ga > 0 && gb < 0))
      .map(([ga, gb]) => ga / (ga - gb))
      .sort((t1, t2) => t1 - t2)
    return [a, ...ts.map((t): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])]
  })
}

export interface ProwOptions {
  /** Eave outline in feet when the roof reaches past the walls (legacy roofPts). */
  readonly roofPts?: readonly (readonly number[])[]
  /** 'front' puts the gable on +z (a porch's house side). */
  readonly gable?: string
  /** A shell with a ceiling that follows the roof, and clerestory glass under it. */
  readonly vault?: boolean
  /** How far the tip drops, feet. */
  readonly dip?: number
}

/**
 * Port of the legacy prowRoofGeometry(): every eave at one level and every
 * slope at one pitch, so a straight wall gets a crisp hip plane and a run
 * of short chords on a curve becomes a smooth cone. Edges facing the back
 * of the ridge are gable ends: the ridge runs out to a gable there.
 */
export function prowRoof(poly: readonly LocalPoint[], pitch: number, ridge: 'x' | 'z', overhangFt: number, opt: ProwOptions = {}): FittedRoof {
  const out = empty()
  const slope = Math.max(0, pitch) / 12
  const walls = ccw(toM(poly))
  const P = prowOutline(poly, overhangFt, opt.roofPts)
  const F = prowFacets(P, ridge, opt.gable)
  const H = prowHeight(F, slope, (opt.dip ?? 0) * FT, P, opt.dip ? walls : null)
  const fine = !!(opt.vault || opt.dip)
  let rise = 0
  for (const { i, poly: facet } of F.facets) {
    const Q = [...facet].reverse()
    for (let k = 1; k + 1 < Q.length; k++) {
      subdivide(Q[0], Q[k], Q[k + 1], fine ? 3 : 0, (a, b, c) => {
        const y = (p: P2) => H.top(i, p)
        rise = Math.max(rise, y(a), y(b), y(c))
        addPolygon(out.roof, [[a[0], y(a), a[1]], [b[0], y(b), b[1]], [c[0], y(c), c[1]]], [0, 1, 0])
        if (opt.vault) addPolygon(out.trim, [[a[0], y(a) - SHELL_M, a[1]], [c[0], y(c) - SHELL_M, c[1]], [b[0], y(b) - SHELL_M, b[1]]], [0, -1, 0])
      })
    }
    // gable ends: vertical infill under the facet's edge along a gable line
    facet.forEach((p, k) => {
      const q = facet[(k + 1) % facet.length]
      for (const gi of F.gable) {
        if (Math.abs(F.d(gi, p)) > 1e-4 || Math.abs(F.d(gi, q)) > 1e-4) continue
        const yp = H.top(i, p)
        const yq = H.top(i, q)
        if (yp > 0.02 || yq > 0.02) addPolygon(out.gables, [[q[0], 0, q[1]], [p[0], 0, p[1]], [p[0], yp, p[1]], [q[0], yq, q[1]]], [-F.L[gi].nx, 0, -F.L[gi].nz])
      }
    })
  }
  if (opt.vault) {
    P.forEach((a, i) => {
      const b = P[(i + 1) % P.length]
      const ya = H.at(a)
      const yb = H.at(b)
      addPolygon(out.trim, [[a[0], ya - SHELL_M, a[1]], [b[0], yb - SHELL_M, b[1]], [b[0], yb, b[1]], [a[0], ya, a[1]]], outwardOf(P, i))
    })
    clerestory(out.glass, walls, H)
  } else soffitAndFascia(out, P)
  return { ...out, rise }
}

/** A prow roof's eave, metres, counter-clockwise: its own outline (roofPts) when it has one, else the walls grown by the overhang. */
export function prowOutline(poly: readonly LocalPoint[], overhangFt: number, roofPts?: readonly (readonly number[])[]): P2[] {
  const custom = (roofPts ?? []).filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  if (custom.length >= 3) return ccw(custom.map(([x, z]) => [x * FT, z * FT] as const))
  return ccw(toM(offsetOutline(poly, overhangFt)))
}

interface Facets {
  readonly facets: { readonly i: number; readonly poly: P2[] }[]
  readonly gable: ReadonlySet<number>
  readonly eaves: readonly number[]
  readonly L: readonly { readonly a: P2; readonly nx: number; readonly nz: number; readonly l: number }[]
  /** Inward distance from edge i's line, metres. */
  readonly d: (i: number, p: P2) => number
}

/** Legacy prowFacets(): the part of the outline nearest each eave edge, with back-facing edges as gables. */
function prowFacets(P: readonly P2[], ridge: 'x' | 'z', gableSide?: string): Facets {
  const n = P.length
  const back = gableSide === 'front' ? [0, 1] : ridge === 'x' ? [-1, 0] : [0, -1]
  const gable = new Set<number>()
  const L = P.map((a, i) => {
    const b = P[(i + 1) % n]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const nx = -(b[1] - a[1]) / l
    const nz = (b[0] - a[0]) / l
    if (-nx * back[0] - nz * back[1] > 0.94) gable.add(i)
    return { a, nx, nz, l }
  })
  const d = (i: number, p: P2) => (p[0] - L[i].a[0]) * L[i].nx + (p[1] - L[i].a[1]) * L[i].nz
  const eaves = [...Array(n).keys()].filter((i) => !gable.has(i) && L[i].l > 1e-4)
  const facets: { i: number; poly: P2[] }[] = []
  for (const i of eaves) {
    let Q: P2[] = [...P]
    for (const j of eaves) {
      if (j === i) continue
      Q = clip(Q, (p) => d(i, p) - d(j, p))
      if (Q.length < 3) break
    }
    if (Q.length >= 3 && Math.abs(signedArea(Q)) > 1e-6) facets.push({ i, poly: Q })
  }
  return { facets, gable, eaves, L, d }
}

interface Heights {
  readonly top: (i: number, p: P2) => number
  readonly at: (p: P2) => number
}

/** Legacy prowHeight(): pitch × distance to the nearest eave, less the shell dip toward the front tip. */
function prowHeight(F: Facets, slope: number, dip: number, P: readonly P2[], walls: readonly P2[] | null): Heights {
  const c: P2 = [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length]
  const tip = P.reduce((t, p) => (p[1] > t[1] ? p : t), P[0])
  const ax = [tip[0] - c[0], tip[1] - c[1]]
  const al = Math.hypot(ax[0], ax[1]) || 1
  const outside = (p: P2) => {
    if (!walls) return 1
    if (pointInPolygon(walls, p[0], p[1])) return 0
    let best = Infinity
    walls.forEach((a, i) => (best = Math.min(best, segDist(p, a, walls[(i + 1) % walls.length]))))
    return best
  }
  const outTip = Math.max(0.3, outside(tip))
  const dipAt = (p: P2) => {
    if (!dip) return 0
    const u = Math.max(0, Math.min(1, ((p[0] - c[0]) * ax[0] + (p[1] - c[1]) * ax[1]) / (al * al)))
    const s = Math.min(1, outside(p) / outTip)
    return dip * s * s * Math.min(1, u * 1.5)
  }
  return {
    top: (i, p) => slope * Math.max(0, F.d(i, p)) - dipAt(p),
    at: (p) => slope * Math.max(0, Math.min(...F.eaves.map((i) => F.d(i, p)))) - dipAt(p),
  }
}

/** Clerestory glass between the wall tops (y 0) and a vaulted roof's ceiling (legacy prowInfill). */
function clerestory(mesh: MeshData, walls: readonly P2[], H: Heights): void {
  walls.forEach((a, i) => {
    const b = walls[(i + 1) % walls.length]
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.3))
    for (let j = 0; j < k; j++) {
      const p: P2 = [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]
      const q: P2 = [a[0] + ((b[0] - a[0]) * (j + 1)) / k, a[1] + ((b[1] - a[1]) * (j + 1)) / k]
      const yp = Math.max(0, H.at(p) - SHELL_M)
      const yq = Math.max(0, H.at(q) - SHELL_M)
      if (yp < 0.02 && yq < 0.02) continue
      addPolygon(mesh, [[p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], yq, q[1]], [p[0], yp, p[1]]], outwardOf(walls, i))
    }
  })
}

/** Soffit under the eaves and a fascia board round them. */
function soffitAndFascia(out: FittedRoof, P: readonly P2[]): void {
  const c: V3 = [P.reduce((s, p) => s + p[0], 0) / P.length, 0, P.reduce((s, p) => s + p[1], 0) / P.length]
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length]
    addPolygon(out.trim, [c, [a[0], 0, a[1]], [b[0], 0, b[1]]], [0, -1, 0])
    addPolygon(out.trim, [[a[0], -FASCIA_M, a[1]], [b[0], -FASCIA_M, b[1]], [b[0], 0, b[1]], [a[0], 0, a[1]]], outwardOf(P, i))
  })
}

/** Outward normal of edge i of a counter-clockwise outline. */
function outwardOf(P: readonly P2[], i: number): V3 {
  const a = P[i]
  const b = P[(i + 1) % P.length]
  return [b[1] - a[1], 0, -(b[0] - a[0])]
}

/** Keep the part of a polygon where f ≤ 0 (Sutherland–Hodgman against one line). */
function clip(Q: readonly P2[], f: (p: P2) => number): P2[] {
  const out: P2[] = []
  for (let k = 0; k < Q.length; k++) {
    const p = Q[k]
    const q = Q[(k + 1) % Q.length]
    const fp = f(p)
    const fq = f(q)
    if (fp <= 0) out.push(p)
    if (fp < 0 !== fq < 0 && fp !== fq) {
      const t = fp / (fp - fq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}

function subdivide(a: P2, b: P2, c: P2, depth: number, emit: (a: P2, b: P2, c: P2) => void): void {
  if (!depth) return emit(a, b, c)
  const m = (p: P2, q: P2): P2 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const ab = m(a, b)
  const bc = m(b, c)
  const ca = m(c, a)
  subdivide(a, ab, ca, depth - 1, emit)
  subdivide(ab, b, bc, depth - 1, emit)
  subdivide(ca, bc, c, depth - 1, emit)
  subdivide(ab, bc, ca, depth - 1, emit)
}

/** Point to segment, written `p - (a + t d)` with `|| 1` for a zero-length one: not bit-for-bit `site/geom2d`'s pointSegmentDistance, so kept (roof.ts uses it too). */
export function segDist(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}
