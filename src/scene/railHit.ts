import type { ThreeEvent } from '@react-three/fiber'
import type { Object3D } from 'three'
import { buildingMasses } from '../buildings/masses'
import { railEdgeAt } from '../buildings/rails/railPick'
import type { PlanObject } from '../store/types'

const FT = 0.3048

/** The group a mass is drawn in (userData.mass), above a hit mesh. */
function massGroup(hit: Object3D): Object3D | null {
  for (let x: Object3D | null = hit; x; x = x.parent) if (typeof x.userData.mass === 'number') return x
  return null
}

/**
 * The rail edge a click on a cabin's part landed on, or undefined when the
 * click was not on a rail (or on rail glass, which lists no edges). The
 * hit point goes into the mass's own frame, feet, for railEdgeAt.
 */
export function railHit(o: PlanObject, mass: number, e: ThreeEvent<MouseEvent>): number | undefined {
  // the nearest thing under the pointer, whichever of the cabin's meshes this handler call is for (a click can reach the floor behind a rail too)
  const first = e.intersections[0]
  if (!first) return undefined
  const hit = first.object
  const edges = hit.userData.edges
  if (hit.userData.part !== 'rail' || !Array.isArray(edges)) return undefined
  const m = buildingMasses(o.params)[mass]
  const g = massGroup(hit)
  if (!m || !g) return undefined
  const p = g.worldToLocal(first.point.clone())
  return railEdgeAt(m, edges as number[], [p.x / FT, p.z / FT]) ?? undefined
}
