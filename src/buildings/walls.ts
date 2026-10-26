import { ShapeUtils, Vector2 } from 'three'
import type { LocalPoint } from './footprint'
import { addPolygon, emptyMesh, type MeshData } from './geom'

const FT = 0.3048

/**
 * Exterior walls of a footprint (local feet, +z front) from the floor (y 0)
 * to the eave (`heightFt`), in local metres. UVs run in feet along the
 * perimeter and up the wall, so siding boards are true size and continuous
 * round corners. A ceiling cap closes the top for roofless or flat-roofed cabins.
 */
export function buildWalls(poly: readonly LocalPoint[], heightFt: number): MeshData {
  const mesh = emptyMesh()
  const h = heightFt * FT
  let along = 0
  poly.forEach(([x1, z1], i) => {
    const [x2, z2] = poly[(i + 1) % poly.length]
    const len = Math.hypot(x2 - x1, z2 - z1)
    if (len < 1e-4) return
    const a = [x1 * FT, 0, z1 * FT] as const
    const b = [x2 * FT, 0, z2 * FT] as const
    const quad = [a, b, [b[0], h, b[2]], [a[0], h, a[2]]] as const
    const outward = [(z2 - z1) / len, 0, -(x2 - x1) / len] as const
    const start = mesh.uvs.length
    addPolygon(mesh, quad, outward)
    // replace the per-face UVs with perimeter-continuous ones
    for (let k = start, vi = (start / 2) * 3; k < mesh.uvs.length; k += 2, vi += 3) {
      const px = mesh.positions[vi] / FT
      const pz = mesh.positions[vi + 2] / FT
      const t = Math.hypot(px - x1, pz - z1)
      mesh.uvs[k] = along + t
      mesh.uvs[k + 1] = mesh.positions[vi + 1] / FT
    }
    along += len
  })
  addCap(mesh, poly, h, 1)
  return mesh
}

/** A flat horizontal cap over the footprint at height y (metres), facing up (+1) or down (-1). */
export function addCap(mesh: MeshData, poly: readonly LocalPoint[], y: number, facing: 1 | -1): void {
  const contour = poly.map(([x, z]) => new Vector2(x, z))
  const tris = ShapeUtils.triangulateShape(contour, [])
  for (const [i, j, k] of tris) {
    addPolygon(
      mesh,
      [i, j, k].map((q) => [poly[q][0] * FT, y, poly[q][1] * FT] as const),
      [0, facing, 0],
    )
  }
}
