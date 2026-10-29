import type { Object3D } from 'three'
import type { AttachSite } from '../buildings/attach'
import { localToSite, num, type LocalPoint } from '../buildings/footprint'
import { buildingMasses, deckObjectMass, type Mass } from '../buildings/masses'
import type { Ground } from '../site/earthworks'
import type { Terrain } from '../site/types'
import { ftToM } from '../site/units'
import type { PlanObject } from '../store/types'
import { baseElevation } from './placement'

/**
 * A building's (or standalone deck's) masses, floor and ground, for the
 * picked-part outline, handles and chips. Everything they draw sits in a
 * group at the object's position and floor, turned with it, so a
 * building-local point (feet) is drawn at [ft(x), y, ft(z)].
 */
export interface PartFrame {
  readonly masses: readonly Mass[]
  readonly standalone: boolean
  /** Elevation of the group the overlay is drawn in: the building floor, or a standalone deck's top. */
  readonly base: number
  readonly site: AttachSite
}

/** The frame of a house or standalone deck; null for anything else. */
export function partFrame(o: PlanObject, terrain: Terrain, ground: Ground): PartFrame | null {
  if (o.type !== 'house' && o.type !== 'deck') return null
  const standalone = o.type === 'deck'
  const groundAt = (p: LocalPoint) => {
    const [x, n] = localToSite(o.position, o.rotation, p)
    return ground(x, n)
  }
  if (!standalone) return { masses: buildingMasses(o.params), standalone, base: baseElevation(terrain, o), site: { floor: baseElevation(terrain, o), groundAt } }
  const top = baseElevation(terrain, o, ground) + ftToM(Math.max(0, num(o.params.h, 0)))
  return { masses: [deckObjectMass(o.params)], standalone, base: top, site: { floor: top, groundAt, slabM: 0 } }
}

/** A building-local point (feet) at elevation z (metres), in the overlay group's frame. */
export function inGroup(frame: PartFrame, [x, z]: LocalPoint, elevation: number): [number, number, number] {
  return [ftToM(x), elevation - frame.base, ftToM(z)]
}

/** The mass index of the part a pointer hit: the first `userData.mass` going up from the hit mesh, within its object. */
export function massOf(hit: Object3D | null): number | undefined {
  for (let x: Object3D | null = hit; x; x = x.parent) {
    if (typeof x.userData.mass === 'number') return x.userData.mass
    if (x.userData.objectId !== undefined) return undefined
  }
  return undefined
}
