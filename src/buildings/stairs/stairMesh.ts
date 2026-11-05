import { ShapeUtils, Vector2 } from 'three'
import type { MeshData, V3 } from '../geom'
import { area, clean, type XZ } from './stairCurve'

/**
 * The old stair-geom builders on MeshData, in the stair frame (metres):
 * flat-shaded triangles with UVs in feet, plan UVs on level faces so deck
 * boards run across the treads.
 */

const FT = 0.3048
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** One triangle wound to face `dir`. */
function tri(mesh: MeshData, a: V3, b: V3, c: V3, dir: V3): void {
  let n = cross(sub(b, a), sub(c, a))
  if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) {
    ;[b, c] = [c, b]
    n = [-n[0], -n[1], -n[2]]
  }
  const l = Math.hypot(n[0], n[1], n[2])
  if (!(l > 1e-12)) return
  const nn: V3 = [n[0] / l, n[1] / l, n[2] / l]
  // level faces: plan UVs; others: along the horizontal of the face and up
  const level = Math.abs(nn[1]) > 0.7
  const hl = Math.hypot(nn[0], nn[2]) || 1
  const uAxis: V3 = level ? [1, 0, 0] : [-nn[2] / hl, 0, nn[0] / hl]
  for (const p of [a, b, c]) {
    mesh.positions.push(p[0], p[1], p[2])
    mesh.normals.push(nn[0], nn[1], nn[2])
    if (level) mesh.uvs.push(p[0] / FT, p[2] / FT)
    else mesh.uvs.push((p[0] * uAxis[0] + p[2] * uAxis[2]) / FT, p[1] / FT)
  }
}

function quad(mesh: MeshData, a: V3, b: V3, c: V3, d: V3, dir: V3): void {
  tri(mesh, a, b, c, dir)
  tri(mesh, a, c, d, dir)
}

const triangulate = (P: readonly XZ[]): number[][] => ShapeUtils.triangulateShape(P.map(([u, v]) => new Vector2(u, v)), [])

/** A slab over a polygon in (x, z), its top at yTop(x, z), th deep. */
export function slab(mesh: MeshData, poly: readonly XZ[], yTop: (x: number, z: number) => number, th: number): MeshData {
  const P = clean(poly)
  if (P.length < 3) return mesh
  const sg = area(P) > 0 ? 1 : -1
  const top = (p: XZ): V3 => [p[0], yTop(p[0], p[1]), p[1]]
  const bot = (p: XZ): V3 => [p[0], yTop(p[0], p[1]) - th, p[1]]
  for (const [i, j, k] of triangulate(P)) {
    tri(mesh, top(P[i]), top(P[j]), top(P[k]), [0, 1, 0])
    tri(mesh, bot(P[i]), bot(P[j]), bot(P[k]), [0, -1, 0])
  }
  P.forEach((p, i) => {
    const q = P[(i + 1) % P.length]
    quad(mesh, top(p), top(q), bot(q), bot(p), [(q[1] - p[1]) * sg, 0, -(q[0] - p[0]) * sg])
  })
  return mesh
}

/** A board extruded across x from x0 to x1: its profile is a polygon in (z, y). */
export function prismX(mesh: MeshData, poly: readonly XZ[], x0: number, x1: number): MeshData {
  const P = clean(poly)
  if (P.length < 3 || !(x1 > x0)) return mesh
  const sg = area(P) > 0 ? 1 : -1
  const at = (x: number, p: XZ): V3 => [x, p[1], p[0]]
  for (const [i, j, k] of triangulate(P)) {
    tri(mesh, at(x1, P[i]), at(x1, P[j]), at(x1, P[k]), [1, 0, 0])
    tri(mesh, at(x0, P[i]), at(x0, P[j]), at(x0, P[k]), [-1, 0, 0])
  }
  P.forEach((p, i) => {
    const q = P[(i + 1) % P.length]
    quad(mesh, at(x0, p), at(x0, q), at(x1, q), at(x1, p), [0, -(q[0] - p[0]) * sg, (q[1] - p[1]) * sg])
  })
  return mesh
}

/** An axis-aligned box. */
export function box(mesh: MeshData, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): MeshData {
  if (!(x1 > x0 && y1 > y0 && z1 > z0)) return mesh
  quad(mesh, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0])
  quad(mesh, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0])
  quad(mesh, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1])
  quad(mesh, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1])
  quad(mesh, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0])
  quad(mesh, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0])
  return mesh
}

/** A sloped rail with plumb-cut ends: centre line (za, ya) → (zb, yb) at x, wid across and hgt high. */
export function beam(mesh: MeshData, x: number, za: number, ya: number, zb: number, yb: number, wid: number, hgt: number): MeshData {
  if (!(zb - za > 1e-4)) return mesh
  return prismX(
    mesh,
    [
      [za, ya - hgt / 2],
      [zb, yb - hgt / 2],
      [zb, yb + hgt / 2],
      [za, ya + hgt / 2],
    ],
    x - wid / 2,
    x + wid / 2,
  )
}
