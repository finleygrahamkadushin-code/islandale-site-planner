import { ShapeUtils, Vector2 } from 'three'
import { signedArea, type LocalPoint } from './footprint'
import { addCap } from './walls'
import { addPolygon, emptyMesh, type MeshData, type V3 } from './geom'
import { polyRoof, prowRoof, SHELL_M, type ProwOptions } from './fittedRoof'
import { isSculpted, sculptedRoof } from './sculptRoof'

const FT = 0.3048
const FASCIA_M = 0.24
const FLAT_M = 0.3
/** Gambrel: the ridge stands 1.3 times a gable's, the knuckle at a quarter span 0.72 of the way up (legacy roofGeometry). */
const GAMBREL_RISE = 1.3
const GAMBREL_KNUCKLE = 0.72
/** The prow tip column stands this far in from the tip, from 0.3 m above the floor (legacy roofTipPost). */
const TIP_POST_IN_M = 0.9

export type RoofType = 'gable' | 'hip' | 'shed' | 'gambrel' | 'butterfly' | 'pyramid' | 'prow' | 'flat' | 'sod' | 'dome' | 'vault' | 'shell' | 'saddle' | 'none'

export const ROOF_TYPES: readonly RoofType[] = ['gable', 'hip', 'shed', 'gambrel', 'butterfly', 'pyramid', 'prow', 'flat', 'sod', 'dome', 'vault', 'shell', 'saddle', 'none']

export interface RoofParams {
  readonly type: string
  /** Rise per 12 of run, as the legacy planner stores it. */
  readonly pitch: number
  /** Which local axis the ridge runs along. */
  readonly ridge: 'x' | 'z'
  readonly overhangFt: number
  /** Prow roof options (legacy roofPts, gable, vault, roofDip). */
  readonly prow?: ProwOptions
  /** false: no column under a prow shell's tip (legacy roofTipPost). */
  readonly tipPost?: boolean
  /** Sculpted roofs: shell curl (0–1), finish, and whether the mass is an open porch (struts, no infill). */
  readonly curl?: number
  readonly roofMat?: string
  readonly open?: boolean
}

/** The column under a prow shell's tip: plan position and the roof's underside above it, metres from the wall top. */
export interface TipPost {
  readonly x: number
  readonly z: number
  readonly top: number
}

/** Roof surfaces, gable-end infill and trim, in local metres with y 0 at the eave. */
export interface RoofMesh {
  readonly roof: MeshData
  /** Triangles that close gable ends at the wall line: drawn in the wall material. */
  readonly gables: MeshData
  /** Fascia boards and soffits under the eaves. */
  readonly trim: MeshData
  /** Clerestory glass under a vaulted roof. */
  readonly glass: MeshData
  /** Height of the highest point above the eave, metres. */
  readonly rise: number
  /** A prow roof drawn to its own outline gets one slim column under its tip. */
  readonly tip?: TipPost
}

/** Pitched roofs that follow the outline itself on plans that are not rectangles. */
const FITTED: ReadonlySet<RoofType> = new Set(['gable', 'hip', 'shed', 'gambrel', 'butterfly'])

/**
 * Roof over a footprint (local feet), dispatched as the legacy massMesh()
 * did: prow roofs are fitted to the outline; gable, hip, shed, gambrel and
 * butterfly roofs are built over the box on rectangles and fitted to the
 * outline otherwise; pyramid and flat follow the polygon itself; dome,
 * vault, shell, saddle and sod are sculpted (sculptRoof.ts), mapped here as
 * slab top → roof, soffit, fascia and struts → trim, glass infill → glass
 * and cladding infill → gables.
 */
export function buildRoof(poly: readonly LocalPoint[], p: RoofParams): RoofMesh {
  const type = normaliseRoof(p.type)
  const out: RoofMesh = { roof: emptyMesh(), gables: emptyMesh(), trim: emptyMesh(), glass: emptyMesh(), rise: 0 }
  if (type === 'none') return out
  if (type === 'prow') {
    const r = prowRoof(poly, p.pitch, p.ridge, p.overhangFt, p.prow)
    const tip = p.tipPost === false ? null : prowTipPost(r.roof, p.prow)
    return tip ? { ...r, tip } : r
  }
  if (isSculpted(type)) {
    const s = sculptedRoof(poly, { roof: type, pitch: p.pitch, ridge: p.ridge, overhang: p.overhangFt, open: p.open ?? false, curl: p.curl, roofMat: p.roofMat })
    const glass = s.infillKind === 'glass'
    return { roof: s.slab, gables: glass ? emptyMesh() : s.infill, trim: mergeMeshes(s.soffit, s.fascia, s.struts), glass: glass ? s.infill : emptyMesh(), rise: s.rise }
  }
  if (FITTED.has(type) && !isRectangle(poly)) return polyRoof(poly, type, p.pitch, p.ridge, p.overhangFt)
  const slope = Math.max(0, p.pitch) / 12
  const o = Math.max(0, p.overhangFt) * FT
  const xs = poly.map((q) => q[0] * FT)
  const zs = poly.map((q) => q[1] * FT)
  const box = { minx: Math.min(...xs), maxx: Math.max(...xs), minz: Math.min(...zs), maxz: Math.max(...zs) }
  const cx = (box.minx + box.maxx) / 2
  const cz = (box.minz + box.maxz) / 2
  const along = p.ridge === 'z'
  // L along the ridge, S across it, both including the overhang
  const wallL = along ? box.maxz - box.minz : box.maxx - box.minx
  const wallS = along ? box.maxx - box.minx : box.maxz - box.minz
  const L = wallL + 2 * o
  const S = wallS + 2 * o
  // (u along ridge, y, v across) → local (x, y, z)
  const P = (u: number, y: number, v: number): V3 => (along ? [cx + v, y, cz + u] : [cx + u, y, cz + v])
  const centre = P(0, 0.5, 0)
  const away = (pts: readonly V3[]): V3 => {
    const m = pts.reduce((a, q) => [a[0] + q[0], a[1] + q[1], a[2] + q[2]] as V3, [0, 0, 0] as V3)
    return [m[0] / pts.length - centre[0], m[1] / pts.length - centre[1], m[2] / pts.length - centre[2]]
  }
  const face = (mesh: MeshData, pts: readonly V3[]) => addPolygon(mesh, pts, away(pts))
  const eaveRect = [P(-L / 2, 0, -S / 2), P(L / 2, 0, -S / 2), P(L / 2, 0, S / 2), P(-L / 2, 0, S / 2)]

  if (type === 'flat') {
    const ring = offsetPolygon(poly, p.overhangFt)
    addCap(out.roof, ring, FLAT_M, 1)
    addCap(out.trim, ring, 0, -1)
    addBand(out.trim, ring.map(([x, z]) => [x * FT, z * FT] as const), 0, FLAT_M)
    return { ...out, rise: FLAT_M }
  }

  if (type === 'pyramid') {
    const ring = offsetPolygon(poly, p.overhangFt)
    const c = centroid(poly)
    const inradius = Math.min(...poly.map((_, i) => distToEdge(c, poly[i], poly[(i + 1) % poly.length]))) * FT
    const H = slope * (inradius + o)
    const apex: V3 = [c[0] * FT, H, c[1] * FT]
    const apexCentre: V3 = [apex[0], H / 3, apex[2]]
    ring.forEach(([x1, z1], i) => {
      const [x2, z2] = ring[(i + 1) % ring.length]
      const tri: V3[] = [[x1 * FT, 0, z1 * FT], [x2 * FT, 0, z2 * FT], apex]
      const m = [(tri[0][0] + tri[1][0]) / 2, 0, (tri[0][2] + tri[1][2]) / 2]
      addPolygon(out.roof, tri, [m[0] - apexCentre[0], 0.3, m[2] - apexCentre[2]])
    })
    addCap(out.trim, ring, 0, -1)
    addBand(out.trim, ring.map(([x, z]) => [x * FT, z * FT] as const), -FASCIA_M, 0)
    return { ...out, rise: H }
  }

  const H = (slope * S) / 2
  let rise = H
  if (type === 'gable' || type === 'shed' || type === 'butterfly' || type === 'gambrel') {
    const prof: (readonly [number, number])[] =
      type === 'gable' ? [[-S / 2, 0], [0, H], [S / 2, 0]]
        : type === 'shed' ? [[-S / 2, slope * S], [S / 2, 0]]
          : type === 'gambrel' ? gambrelProfile(S, H)
            : [[-S / 2, H], [0, 0], [S / 2, H]]
    rise = Math.max(...prof.map((q) => q[1]))
    for (let i = 0; i + 1 < prof.length; i++) {
      const [v1, y1] = prof[i]
      const [v2, y2] = prof[i + 1]
      face(out.roof, [P(-L / 2, y1, v1), P(L / 2, y1, v1), P(L / 2, y2, v2), P(-L / 2, y2, v2)])
    }
    // gable-end infill at the wall line, up to the underside of the roof
    const inner = prof
      .map(([v]) => Math.max(-wallS / 2, Math.min(wallS / 2, v)))
      .filter((v, i, a) => a.indexOf(v) === i)
    for (const u of [-wallL / 2, wallL / 2]) {
      const outline: (readonly [number, number])[] = [[-wallS / 2, 0], ...inner.map((v) => [v, gableHeightAt(prof, v)] as const), [wallS / 2, 0]]
      addVertical(out.gables, outline, (v, y) => P(u, y, v), P(u, 0, 0).map((c, k) => c - centre[k]) as unknown as V3)
    }
    if (type === 'shed' || type === 'butterfly') {
      // close the tall eave side(s) with a vertical fascia
      for (const [v, y] of prof.filter(([, y]) => y > 0.01)) {
        face(out.trim, [P(-L / 2, 0, v), P(L / 2, 0, v), P(L / 2, y, v), P(-L / 2, y, v)])
      }
    }
  } else if (type === 'hip') {
    const r = Math.max(0, (L - S) / 2)
    face(out.roof, [P(-L / 2, 0, S / 2), P(L / 2, 0, S / 2), P(r, H, 0), P(-r, H, 0)])
    face(out.roof, [P(-L / 2, 0, -S / 2), P(L / 2, 0, -S / 2), P(r, H, 0), P(-r, H, 0)])
    face(out.roof, [P(L / 2, 0, S / 2), P(L / 2, 0, -S / 2), P(r, H, 0)])
    face(out.roof, [P(-L / 2, 0, S / 2), P(-L / 2, 0, -S / 2), P(-r, H, 0)])
  } else {
    // prow: a gable whose front (+u) end comes to a point like a boat's bow
    const r = Math.max(-L / 2, L / 2 - S / 2)
    face(out.roof, [P(-L / 2, 0, S / 2), P(L / 2, 0, S / 2), P(r, H, 0), P(-L / 2, H, 0)])
    face(out.roof, [P(-L / 2, 0, -S / 2), P(L / 2, 0, -S / 2), P(r, H, 0), P(-L / 2, H, 0)])
    face(out.roof, [P(L / 2, 0, S / 2), P(L / 2, 0, -S / 2), P(r, H, 0)])
    const u = -wallL / 2
    addPolygon(out.gables, [P(u, 0, -wallS / 2), P(u, (slope * S) / 2 - slope * o, 0), P(u, 0, wallS / 2)], [along ? 0 : -1, 0, along ? -1 : 0])
  }
  addCap(out.trim, eaveRect.map((q) => [q[0] / FT, q[2] / FT] as LocalPoint), 0, -1)
  addBand(out.trim, eaveRect.map((q) => [q[0], q[2]] as const), -FASCIA_M, 0)
  return { ...out, rise }
}

/** Legacy roofGeometry's gambrel: two pitches a side, steep below the quarter-span knuckle, shallow above it. */
function gambrelProfile(S: number, H: number): (readonly [number, number])[] {
  const Hg = H * GAMBREL_RISE
  return [[-S / 2, 0], [-S / 4, Hg * GAMBREL_KNUCKLE], [0, Hg], [S / 4, Hg * GAMBREL_KNUCKLE], [S / 2, 0]]
}

/**
 * The column under a prow shell's tip (legacy roofTipPost): only on a roof
 * drawn to its own outline (roofPts), 0.9 m in from the outline point
 * furthest forward, toward the outline's centre, up to the roof's underside.
 */
function prowTipPost(roof: MeshData, prow?: ProwOptions): TipPost | null {
  const pts = (prow?.roofPts ?? []).filter((q) => q.length >= 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]))
  if (pts.length < 3) return null
  const RO0 = pts.map(([x, z]) => [x * FT, z * FT] as const)
  const RO = signedArea(RO0) < 0 ? [...RO0].reverse() : RO0
  const c = [RO.reduce((s, q) => s + q[0], 0) / RO.length, RO.reduce((s, q) => s + q[1], 0) / RO.length]
  const t = RO.reduce((a, q) => (q[1] > a[1] ? q : a), RO[0])
  const l = Math.hypot(t[0] - c[0], t[1] - c[1]) || 1
  const x = t[0] - ((t[0] - c[0]) / l) * TIP_POST_IN_M
  const z = t[1] - ((t[1] - c[1]) / l) * TIP_POST_IN_M
  const y = meshHeightAt(roof, x, z)
  return y === null ? null : { x, z, top: y - (prow?.vault ? SHELL_M : 0) }
}

/** Highest point of a mesh straight above (x, z), or null when nothing is over it. */
function meshHeightAt(mesh: MeshData, x: number, z: number): number | null {
  const p = mesh.positions
  let best: number | null = null
  for (let i = 0; i < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = p.slice(i, i + 9)
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(det) < 1e-12) continue
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det
    const l3 = 1 - l1 - l2
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue
    const y = l1 * ay + l2 * by + l3 * cy
    if (best === null || y > best) best = y
  }
  return best
}

/** One MeshData holding all of the given ones, in order. */
function mergeMeshes(...meshes: readonly MeshData[]): MeshData {
  return {
    positions: meshes.flatMap((m) => m.positions),
    normals: meshes.flatMap((m) => m.normals),
    uvs: meshes.flatMap((m) => m.uvs),
  }
}

/** Height of a roof profile at v (metres across the span), measured from the eave line inward. */
function gableHeightAt(prof: readonly (readonly [number, number])[], v: number): number {
  for (let i = 0; i + 1 < prof.length; i++) {
    const [v1, y1] = prof[i]
    const [v2, y2] = prof[i + 1]
    if (v >= Math.min(v1, v2) && v <= Math.max(v1, v2)) return y1 + ((y2 - y1) * (v - v1)) / (v2 - v1 || 1)
  }
  return 0
}

/** A vertical outline given as (v, y) pairs, triangulated properly so concave (butterfly) ends fill right. */
function addVertical(mesh: MeshData, outline: readonly (readonly [number, number])[], to3: (v: number, y: number) => V3, outward: V3): void {
  const pts = outline.filter((p, i) => {
    const q = outline[(i + 1) % outline.length]
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5
  })
  if (pts.length < 3) return
  const tris = ShapeUtils.triangulateShape(pts.map(([v, y]) => new Vector2(v, y)), [])
  for (const [a, b, c] of tris) addPolygon(mesh, [a, b, c].map((i) => to3(pts[i][0], pts[i][1])), outward)
}

/** Vertical band (fascia) round a closed ring of (x, z) metres between y0 and y1. */
function addBand(mesh: MeshData, ring: readonly (readonly [number, number])[], y0: number, y1: number): void {
  const area = ring.reduce((a, p, i) => {
    const q = ring[(i + 1) % ring.length]
    return a + p[0] * q[1] - q[0] * p[1]
  }, 0)
  const sign = area >= 0 ? 1 : -1
  ring.forEach(([x1, z1], i) => {
    const [x2, z2] = ring[(i + 1) % ring.length]
    addPolygon(mesh, [[x1, y0, z1], [x2, y0, z2], [x2, y1, z2], [x1, y1, z1]], [sign * (z2 - z1), 0, -sign * (x2 - x1)])
  })
}

/** Four corners with axis-aligned edges. */
export function isRectangle(poly: readonly LocalPoint[]): boolean {
  if (poly.length !== 4) return false
  return poly.every((a, i) => {
    const b = poly[(i + 1) % 4]
    return Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6
  })
}

export function normaliseRoof(type: string): RoofType {
  if ((ROOF_TYPES as readonly string[]).includes(type)) return type as RoofType
  if (type === 'green') return 'sod'
  return type ? 'gable' : 'none'
}

/** Push a convex-ish polygon (local feet) outward by `d` feet with mitred corners. */
export function offsetPolygon(poly: readonly LocalPoint[], d: number): LocalPoint[] {
  if (d <= 0) return [...poly]
  const n = poly.length
  return poly.map((p, i) => {
    const prev = poly[(i - 1 + n) % n]
    const next = poly[(i + 1) % n]
    const n1 = edgeNormal(prev, p)
    const n2 = edgeNormal(p, next)
    const bx = n1[0] + n2[0]
    const bz = n1[1] + n2[1]
    const bl = Math.hypot(bx, bz) || 1
    const cos = (n1[0] * bx + n1[1] * bz) / bl
    const k = d / Math.max(0.35, cos)
    return [p[0] + (bx / bl) * k, p[1] + (bz / bl) * k] as const
  })
}

function edgeNormal(a: LocalPoint, b: LocalPoint): [number, number] {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l = Math.hypot(dx, dz) || 1
  return [dz / l, -dx / l]
}

function centroid(poly: readonly LocalPoint[]): LocalPoint {
  return [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length]
}

function distToEdge(c: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dz) / l2))
  return Math.hypot(c[0] - (a[0] + t * dx), c[1] - (a[1] + t * dz))
}
