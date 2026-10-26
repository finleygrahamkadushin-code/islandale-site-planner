import { ShapeUtils, Vector2 } from 'three'
import type { LocalPoint } from './footprint'
import { addCap } from './walls'
import { addPolygon, emptyMesh, type MeshData, type V3 } from './geom'

const FT = 0.3048
const FASCIA_M = 0.24
const FLAT_M = 0.3
const SOD_M = 0.45

export type RoofType = 'gable' | 'hip' | 'shed' | 'butterfly' | 'pyramid' | 'prow' | 'flat' | 'sod' | 'dome' | 'shell' | 'none'

export const ROOF_TYPES: readonly RoofType[] = ['gable', 'hip', 'shed', 'butterfly', 'pyramid', 'prow', 'flat', 'sod', 'dome', 'shell', 'none']

export interface RoofParams {
  readonly type: string
  /** Rise per 12 of run, as the legacy planner stores it. */
  readonly pitch: number
  /** Which local axis the ridge runs along. */
  readonly ridge: 'x' | 'z'
  readonly overhangFt: number
}

/** Roof surfaces, gable-end infill and trim, in local metres with y 0 at the eave. */
export interface RoofMesh {
  readonly roof: MeshData
  /** Triangles that close gable ends at the wall line: drawn in the wall material. */
  readonly gables: MeshData
  /** Fascia boards and soffits under the eaves. */
  readonly trim: MeshData
  /** Height of the highest point above the eave, metres. */
  readonly rise: number
}

/**
 * Roof over a footprint (local feet). Pitched roofs are built over the
 * footprint's bounding box, as the legacy roofGeometry() did; pyramid,
 * flat and sod follow the footprint polygon itself.
 */
export function buildRoof(poly: readonly LocalPoint[], p: RoofParams): RoofMesh {
  const type = normaliseRoof(p.type)
  const out: RoofMesh = { roof: emptyMesh(), gables: emptyMesh(), trim: emptyMesh(), rise: 0 }
  if (type === 'none') return out
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

  if (type === 'flat' || type === 'sod') {
    const t = type === 'sod' ? SOD_M : FLAT_M
    const ring = offsetPolygon(poly, p.overhangFt)
    addCap(out.roof, ring, t, 1)
    addCap(out.trim, ring, 0, -1)
    addBand(out.trim, ring.map(([x, z]) => [x * FT, z * FT] as const), 0, t)
    return { ...out, rise: t }
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

  if (type === 'dome' || type === 'shell') {
    const H = Math.max(slope * S / 2, 1)
    const ring = 24
    const rows = 8
    for (let j = 0; j < rows; j++) {
      const a0 = (j / rows) * (Math.PI / 2)
      const a1 = ((j + 1) / rows) * (Math.PI / 2)
      for (let i = 0; i < ring; i++) {
        const b0 = (i / ring) * Math.PI * 2
        const b1 = ((i + 1) / ring) * Math.PI * 2
        const q = (a: number, b: number): V3 => P((Math.cos(b) * Math.cos(a) * L) / 2, Math.sin(a) * H, (Math.sin(b) * Math.cos(a) * S) / 2)
        const pts = j === rows - 1 ? [q(a0, b0), q(a0, b1), q(a1, b0)] : [q(a0, b0), q(a0, b1), q(a1, b1), q(a1, b0)]
        face(out.roof, pts)
      }
    }
    return { ...out, rise: H }
  }

  const H = (slope * S) / 2
  let rise = H
  if (type === 'gable' || type === 'shed' || type === 'butterfly') {
    const prof: (readonly [number, number])[] =
      type === 'gable' ? [[-S / 2, 0], [0, H], [S / 2, 0]]
        : type === 'shed' ? [[-S / 2, slope * S], [S / 2, 0]]
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

export function normaliseRoof(type: string): RoofType {
  if ((ROOF_TYPES as readonly string[]).includes(type)) return type as RoofType
  if (type === 'gambrel') return 'gable'
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
