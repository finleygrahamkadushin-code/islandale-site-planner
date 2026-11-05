import { railOwner } from '../buildings/rails/railWorld'
import type { Ground } from '../site/earthworks'
import type { Terrain } from '../site/types'
import type { PlanObject } from '../store/types'

/**
 * A small synthetic site for the junction and level tests: flat ground at
 * 2 m, a 20 × 16 ft cabin at the origin with one front door, and helpers
 * to stand a path piece's end on that door.
 */

export const GROUND_Z = 2
export const flatTerrain: Terrain = { lon0: 0, lat0: 0, spacing: 100, nx: 3, ny: 3, x0: -100, n0: -100, z: Array(9).fill(GROUND_Z) }
export const flatGround: Ground = () => GROUND_Z
const FT = 0.3048
export const SIX_IN_M = 6 * 0.0254

export const obj = (id: string, type: string, params: Record<string, unknown>, x = 0, n = 0, rotation = 0, name = id): PlanObject => ({
  id,
  type,
  name,
  position: { x, n },
  rotation,
  params,
  locked: false,
  hidden: false,
  labelVisible: true,
})

export const cabin = (wings: Record<string, unknown>[] = []): PlanObject =>
  obj('H', 'house', { w: 20, d: 16, h: 9, shape: 'rect', cuts: [{ edge: 2, kind: 'door', x: 8, w: 3 }], wings }, 0, 0, 0, 'Cabin')

/** The cabin's door centre and floor surface, site metres. */
export function doorOf(house: PlanObject): { c: readonly [number, number]; z: number } {
  const d = railOwner(house, flatTerrain, flatGround)!.doors[0]
  return { c: d.c, z: d.z }
}

/** A 5 ft landing running south from the door, its end B on the sill, both ends pinned at z. */
export function landingAtDoor(house: PlanObject, z: number, id = 'P'): PlanObject {
  const { c } = doorOf(house)
  return obj(id, 'pad', { kind: 'landing', w: 5, d: 4, ends: { zA: z, zB: z } }, c[0], c[1] - (5 * FT) / 2, 90, 'Landing')
}
