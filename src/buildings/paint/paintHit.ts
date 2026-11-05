import type { Object3D, Vector3 } from 'three'
import { CURVED_SHAPES } from '../footprint'
import { buildingMasses, deckObjectMass, partName, type Mass } from '../masses'
import { elementLabel, nearestEdge, paintPartOf } from './paintPick'
import type { PaintFocus } from '../../store/paintTypes'
import type { PlanObject } from '../../store/types'
import { massOf } from '../parts/partFrame'

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
  // gable ends and dome cladding are the mass's walls as a whole
  if (part === 'wall' && group && !hit.userData.massWide) {
    const local = group.worldToLocal(point.clone())
    edge = curved ? 0 : nearestEdge(m, [local.x / FT, local.z / FT])
  }
  return { focus: { objectId: o.id, part, mass, edge }, label: elementLabel(partName(m, mass), part, curved ? null : edge) }
}

/** A ray hit as three.js reports it. */
interface RayHit {
  readonly object: Object3D
  readonly point: Vector3
}

/**
 * The nearest element of this object along the pointer's ray that has an
 * exterior finish (legacy hitElement walks the hits the same way), so
 * furniture seen through a window, handles and other untagged meshes are
 * passed over, as are overlays that belong to no object. A hit on another
 * object in front ends the search.
 */
export function firstPaintHit(o: PlanObject, hits: readonly RayHit[]): PaintHit | null {
  for (const h of hits) {
    const group = objectGroupOf(h.object)
    // overlays (outlines, handles) belong to no object: look past them; another object in front ends the search
    if (!group) continue
    if (group.userData.objectId !== o.id) return null
    const hit = paintHitOf(o, h.object, h.point)
    if (hit) return hit
  }
  return null
}
