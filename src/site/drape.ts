import { ShapeUtils, Vector2 } from 'three'
import { pointInPolygon } from '../buildings/foundation/foundation'
import { signedArea, type LocalPoint } from '../buildings/footprint'
import { emptyMesh, type MeshData, type V3 } from '../buildings/geom'

const FT = 0.3048
/** Draped surfaces are cut into cells this wide, feet (0.3 m, so a crease in the ground is never cut across by more than that). */
export const DRAPE_CELL_FT = 1
/** The top floats this far over its ground so the terrain never shows through, metres. */
export const DRAPE_LIFT_M = 0.01
/** The skirt runs this far below the ground at the edges, metres. */
const SKIRT_M = 0.12
/** Ground slope is read over this distance either side of a vertex, feet. */
const SLOPE_PROBE_FT = 0.5

/**
 * Port of the legacy drapeGeom() clipping: an outline (local feet) cut into
 * grid cells `cellFt` wide. Each cell is the outline clipped to that square;
 * a concave outline can leave a cell with a sliver outside it, which
 * buildDrapedPad drops by testing each triangle's centroid.
 */
export function drapeCells(poly: readonly LocalPoint[], cellFt = DRAPE_CELL_FT): LocalPoint[][] {
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const z0 = Math.min(...zs)
  const z1 = Math.max(...zs)
  const nx = Math.max(1, Math.ceil((x1 - x0) / cellFt - 1e-9))
  const nz = Math.max(1, Math.ceil((z1 - z0) / cellFt - 1e-9))
  const cells: LocalPoint[][] = []
  for (let i = 0; i < nx; i++) {
    const xa = x0 + i * cellFt
    const xb = Math.min(x1, xa + cellFt)
    const strip = clip(clip(poly, 0, xa, false), 0, xb, true)
    if (strip.length < 3) continue
    for (let j = 0; j < nz; j++) {
      const za = z0 + j * cellFt
      const zb = Math.min(z1, za + cellFt)
      const q = clip(clip(strip, 1, za, false), 1, zb, true)
      if (q.length >= 3 && Math.abs(signedArea(q)) > 1e-9) cells.push(q)
    }
  }
  return cells
}

/** Sutherland–Hodgman against one axis-aligned line: keep the side below (`keepLess`) or above `v`. */
function clip(poly: readonly LocalPoint[], axis: 0 | 1, v: number, keepLess: boolean): LocalPoint[] {
  const out: LocalPoint[] = []
  const inside = (p: LocalPoint) => (keepLess ? p[axis] <= v : p[axis] >= v)
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const ia = inside(a)
    if (ia) out.push(a)
    if (ia !== inside(b)) {
      const t = (v - a[axis]) / (b[axis] - a[axis])
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  })
  return out
}

/**
 * A pad draped over the ground, in the object's scene-local frame (x and z
 * metres from the local feet, y up): a top `thicknessM` above the ground
 * at every vertex, normals from the ground's slope so it shades smoothly,
 * and a skirt down each edge to just below the ground. `groundAt` gives the
 * ground at a local point, metres, relative to the object's base. UVs are
 * plan metres, so a per-metre texture runs on unbroken across cells.
 */
export function buildDrapedPad(poly: readonly LocalPoint[], groundAt: (p: LocalPoint) => number, thicknessM: number, cellFt = DRAPE_CELL_FT): MeshData {
  const mesh = emptyMesh()
  const topY = (p: LocalPoint) => groundAt(p) + thicknessM + DRAPE_LIFT_M
  const normalAt = ([x, z]: LocalPoint): V3 => {
    const d = SLOPE_PROBE_FT
    const sx = (groundAt([x + d, z]) - groundAt([x - d, z])) / (2 * d * FT)
    const sz = (groundAt([x, z + d]) - groundAt([x, z - d])) / (2 * d * FT)
    const l = Math.hypot(sx, 1, sz)
    return [-sx / l, 1 / l, -sz / l]
  }
  for (const cell of drapeCells(poly, cellFt)) {
    for (const tri of triangulate(cell)) {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3
      const cz = (tri[0][1] + tri[1][1] + tri[2][1]) / 3
      if (!pointInPolygon(poly, cx, cz)) continue
      // front face up: with y up and z toward the viewer, that is clockwise in (x, z)
      const cross = (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[2][0] - tri[0][0]) * (tri[1][1] - tri[0][1])
      const ordered = cross > 0 ? [tri[0], tri[2], tri[1]] : tri
      for (const p of ordered) push(mesh, [p[0] * FT, topY(p), p[1] * FT], normalAt(p), [p[0] * FT, p[1] * FT])
    }
  }
  addSkirt(mesh, poly, groundAt, topY, cellFt)
  return mesh
}

/** A clipped cell as triangles; ear clipping, since a cell at a concave corner is not convex. */
function triangulate(cell: readonly LocalPoint[]): LocalPoint[][] {
  const faces = ShapeUtils.triangulateShape(cell.map(([x, z]) => new Vector2(x, z)), [])
  return faces.map((f) => f.map((k) => cell[k]))
}

/** Vertical faces round the outline from the top down to below the ground. */
function addSkirt(mesh: MeshData, poly: readonly LocalPoint[], groundAt: (p: LocalPoint) => number, topY: (p: LocalPoint) => number, cellFt: number): void {
  const s = signedArea(poly) > 0 ? 1 : -1
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-6) return
    // outward in plan, from the outline's winding
    const n: V3 = [(s * (b[1] - a[1])) / len, 0, (-s * (b[0] - a[0])) / len]
    const k = Math.max(1, Math.ceil(len / cellFt))
    for (let j = 0; j < k; j++) {
      const p: LocalPoint = [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]
      const q: LocalPoint = [a[0] + ((b[0] - a[0]) * (j + 1)) / k, a[1] + ((b[1] - a[1]) * (j + 1)) / k]
      const pt: V3 = [p[0] * FT, topY(p), p[1] * FT]
      const qt: V3 = [q[0] * FT, topY(q), q[1] * FT]
      const pb: V3 = [pt[0], groundAt(p) - SKIRT_M, pt[2]]
      const qb: V3 = [qt[0], groundAt(q) - SKIRT_M, qt[2]]
      const u0 = ((j * len) / k) * FT
      const u1 = (((j + 1) * len) / k) * FT
      const quad: readonly (readonly [V3, readonly [number, number]])[] = [[pt, [u0, pt[1]]], [pb, [u0, pb[1]]], [qb, [u1, qb[1]]], [qt, [u1, qt[1]]]]
      const order = facesAlong(pt, pb, qb, n) ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
      for (const idx of order) push(mesh, quad[idx][0], n, quad[idx][1])
    }
  })
}

/** Whether triangle a, b, c (counter-clockwise front face) faces along the horizontal n. */
function facesAlong(a: V3, b: V3, c: V3, n: V3): boolean {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const cx = u[1] * v[2] - u[2] * v[1]
  const cz = u[0] * v[1] - u[1] * v[0]
  return cx * n[0] + cz * n[2] > 0
}

function push(mesh: MeshData, p: V3, n: V3, uv: readonly [number, number]): void {
  mesh.positions.push(p[0], p[1], p[2])
  mesh.normals.push(n[0], n[1], n[2])
  mesh.uvs.push(uv[0], uv[1])
}
