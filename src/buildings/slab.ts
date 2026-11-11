import { ShapeUtils, Vector2 } from 'three'
import { pointInPolygon } from '../site/geom2d'
import type { LocalPoint } from './footprint'
import { addPolygon, emptyMesh, type MeshData } from './geom'
import { M_PER_FT as FT } from '../site/units'

/**
 * A flat slab over an outline (local feet), from y = top - thickness to top, in
 * local metres. The top and bottom carry plan UVs in feet along the local
 * x axis, so deck boards run straight across the whole floor; the edges
 * carry perimeter UVs like the walls.
 */
export function buildSlab(poly: readonly LocalPoint[], thicknessM: number, top = 0, into: MeshData = emptyMesh()): MeshData {
  const mesh = into
  if (poly.length < 3) return mesh
  const t = Math.max(0.01, thicknessM)
  const tris = ShapeUtils.triangulateShape(poly.map(([x, z]) => new Vector2(x, z)), [])
  for (const [i, j, k] of tris) {
    face(mesh, [poly[i], poly[j], poly[k]], top, 1)
    face(mesh, [poly[i], poly[j], poly[k]], top - t, -1)
  }
  let along = 0
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-4) return
    let nx = (b[1] - a[1]) / len
    let nz = -(b[0] - a[0]) / len
    if (pointInPolygon(poly, (a[0] + b[0]) / 2 + nx * 0.01, (a[1] + b[1]) / 2 + nz * 0.01)) {
      nx = -nx
      nz = -nz
    }
    const start = mesh.uvs.length
    addPolygon(
      mesh,
      [[a[0] * FT, top, a[1] * FT], [b[0] * FT, top, b[1] * FT], [b[0] * FT, top - t, b[1] * FT], [a[0] * FT, top - t, a[1] * FT]],
      [nx, 0, nz],
    )
    for (let k = start, vi = (start / 2) * 3; k < mesh.uvs.length; k += 2, vi += 3) {
      mesh.uvs[k] = along + Math.hypot(mesh.positions[vi] / FT - a[0], mesh.positions[vi + 2] / FT - a[1])
      mesh.uvs[k + 1] = (mesh.positions[vi + 1] - top) / FT
    }
    along += len
  })
  return mesh
}

/** One horizontal triangle at height y, wound so its normal points along ny, with plan UVs in feet. */
function face(mesh: MeshData, [a, b, c]: readonly LocalPoint[], y: number, ny: 1 | -1): void {
  // the y component of (b - a) × (c - a) in (x, y, z) is minus this 2D cross
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const tri = cross < 0 === ny > 0 ? [a, b, c] : [a, c, b]
  for (const [x, z] of tri) {
    mesh.positions.push(x * FT, y, z * FT)
    mesh.normals.push(0, ny, 0)
    mesh.uvs.push(x, z)
  }
}
