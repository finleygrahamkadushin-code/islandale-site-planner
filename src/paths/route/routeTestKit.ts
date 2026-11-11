import type { Terrain } from '../../site/types'
import type { PlanObject } from '../../store/types'
import { M_PER_FT as FT } from '../../site/units'
export { FT }

/** Small fixtures for the route tests: plan objects and a flat terrain. */

export function obj(id: string, type: string, name: string, x: number, n: number, rotation: number, params: Record<string, unknown>): PlanObject {
  return { id, type, name, position: { x, n }, rotation, params, locked: false, hidden: false, labelVisible: true }
}

/** A path piece: kind, length and width in feet, centre in metres, rotation in degrees. */
export const pad = (id: string, kind: string, w: number, d: number, x: number, n: number, rotation = 0, extra: Record<string, unknown> = {}): PlanObject =>
  obj(id, 'pad', id, x, n, rotation, { kind, w, d, ...extra })

/** A level terrain at 0 m, 200 m square. */
export function flatTerrain(): Terrain {
  const nx = 201
  return { lon0: 0, lat0: 0, spacing: 1, nx, ny: nx, x0: -100, n0: -100, z: new Array<number>(nx * nx).fill(0) }
}
