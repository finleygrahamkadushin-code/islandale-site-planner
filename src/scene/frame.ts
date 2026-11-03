import type { Terrain } from '../site/types'
import { elevationAt } from '../site/terrain'

/**
 * Site frame → three.js scene frame. three is y-up, so east stays x,
 * elevation becomes y, and north becomes -z.
 */
export const toScene = (x: number, n: number, z: number): [number, number, number] => [x, z, -n]

/** Scene position of a site point sitting `lift` metres above the ground. */
export function onGround(t: Terrain, x: number, n: number, lift = 0): [number, number, number] {
  return toScene(x, n, elevationAt(t, x, n) + lift)
}
