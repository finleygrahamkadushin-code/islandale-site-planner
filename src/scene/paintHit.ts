import type { Object3D, Vector3 } from 'three'
import { CURVED_SHAPES } from '../buildings/footprint'
import { buildingMasses, deckObjectMass, partName, type Mass } from '../buildings/masses'
import { elementLabel, nearestEdge, paintPartOf } from '../buildings/paintPick'
import type { PaintFocus } from '../store/paintTypes'
import type { PlanObject } from '../store/types'
import { massOf } from './partFrame'

const FT = 0.3048

/** The part tag nearest the hit mesh (userData.part), stopping at the object's own group. */
function partTagOf(hit: Object3D | null): unknown {
  for (let x: Object3D | null = hit; x; x = x.parent) {
    if (x.userData.part !== undefined) return x.userData.part
    if (x.userData.objectId !== undefined) return undefined
  }
  return undefined
}

function objectGroupOf(hit: Object3D | null): Object3D | null {
  for (let x: Object3D | null = hit; x; x = x.parent) if (x.userData.objectId !== undefined) return x
  return null
}

export const isPaintable = (o: PlanObject): boolean => o.type === 'house' || o.type === 'deck'

export interface PaintHit {
  readonly focus: PaintFocus
  readonly label: string
}

/**
 * The element under a Paint-mode click or hover (legacy hitElement): its
 * part from the mesh's tag, its mass from the enclosing group, and for a
 * wall the edge nearest the hit point. Null when the mesh has no finish.
 */
export function paintHitOf(o: PlanObject, hit: Object3D, point: Vector3): PaintHit | null {
  const part = paintPartOf(partTagOf(hit))
  if (!part) return null
  const masses: readonly Mass[] = o.type === 'deck' ? [deckObjectMass(o.params)] : buildingMasses(o.params)
  const mass = o.type === 'deck' ? 0 : massOf(hit) ?? 0
  const m = masses[mass]
  if (!m) return null
  let edge: number | null = null
  // a curved mass is one unrolled wall
  const curved = (CURVED_SHAPES as readonly string[]).includes(m.shape)
  const group = objectGroupOf(hit)
  if (part === 'wall' && group) {
    const local = group.worldToLocal(point.clone())
    edge = curved ? 0 : nearestEdge(m, [local.x / FT, local.z / FT])
  }
  return { focus: { objectId: o.id, part, mass, edge }, label: elementLabel(partName(m, mass), part, curved ? null : edge) }
}
