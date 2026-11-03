import type { LocalPoint } from './footprint'
import type { MeshData } from './geom'
import { addCap, buildWallShell, joinMeshes } from './wallShell'

export { addCap }

/**
 * A zero-thickness outer skin round a footprint (local feet, +z front) from
 * the floor (y 0) up `heightFt`, in local metres: foundation skirts and deck
 * rims. It is the outside face of the wall shell, so curves are smooth-shaded
 * and corners creased like the walls above. UVs run in feet along the
 * perimeter and up the wall, so siding boards are true size and continuous
 * round corners. A cap closes the top unless `cap` is false. Enclosed walls
 * with thickness and openings are buildWallShell.
 */
export function buildWalls(poly: readonly LocalPoint[], heightFt: number, cap = true): MeshData {
  const shell = buildWallShell(poly, heightFt, [], { cap, thicknessFt: 0 })
  return joinMeshes([...shell.edges.map((e) => e.outer), shell.cap])
}
