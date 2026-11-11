import { M_PER_FT as FT } from '../site/units'
/**
 * Tiny geometry accumulator: polygons in, flat-shaded triangles with
 * per-face UVs (in feet) out. Every building part is built with it so the
 * pure geometry can be tested without three.js.
 */
export type V3 = readonly [number, number, number]

export interface MeshData {
  readonly positions: number[]
  readonly normals: number[]
  readonly uvs: number[]
}

export const emptyMesh = (): MeshData => ({ positions: [], normals: [], uvs: [] })

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/**
 * Add a planar convex polygon (metres), fan-triangulated, wound so its normal
 * points along `outward` when given. UVs: u along the first edge, v across it,
 * both in feet, so textures drawn per foot come out true size.
 */
export function addPolygon(mesh: MeshData, pts: readonly V3[], outward?: V3): void {
  if (pts.length < 3) return
  let poly = pts
  let n = norm(cross(sub(poly[1], poly[0]), sub(poly[2], poly[0])))
  if (outward && dot(n, outward) < 0) {
    poly = [...poly].reverse()
    n = [-n[0], -n[1], -n[2]]
  }
  if (!Number.isFinite(n[0]) || Math.hypot(...n) < 0.5) return
  // u axis: horizontal direction of the polygon when it has one, else its first edge
  let u = norm(cross([0, 1, 0], n))
  if (Math.hypot(...cross([0, 1, 0], n)) < 1e-6) u = norm(sub(poly[1], poly[0]))
  const v = cross(n, u)
  const o = poly[0]
  const uv = (p: V3): [number, number] => [dot(sub(p, o), u) / FT, dot(sub(p, o), v) / FT]
  for (let i = 1; i + 1 < poly.length; i++) {
    for (const p of [poly[0], poly[i], poly[i + 1]]) {
      mesh.positions.push(p[0], p[1], p[2])
      mesh.normals.push(n[0], n[1], n[2])
      mesh.uvs.push(...uv(p))
    }
  }
}

export function bounds(mesh: MeshData): { min: V3; max: V3 } {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], mesh.positions[i + k])
      max[k] = Math.max(max[k], mesh.positions[i + k])
    }
  }
  return { min: min as unknown as V3, max: max as unknown as V3 }
}

export const triangleCount = (mesh: MeshData): number => mesh.positions.length / 9
