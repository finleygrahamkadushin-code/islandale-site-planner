import { floorAtLevel } from '../../../interiors/envelope'
import { STOREY_FT } from '../../../interiors/scene3d/interior3d'
import { boundsOf } from '../model/model'
import { partPoints } from '../model/parts'
import type { SheetBuilding, SheetFloor, SheetPart } from '../types'

/**
 * One floor plan per floor of a cabin with more than one: each draws the
 * parts on that floor (the walls that enclose it, as the interior editor
 * reads them, and the decks, porches and stairs at its level) with the
 * openings whose sills are in that storey. A cabin of one floor has the one
 * plan of every part, as before.
 */

export interface FloorPlan {
  /** The building as this plan draws it. */
  readonly building: SheetBuilding
  /** The floor's rooms, or null for a building with none drawn in. */
  readonly floor: SheetFloor | null
  /** "Floor plan", or the floor's name when there are several. */
  readonly title: string
}

/** The storey a sill at this height above the main floor is in, among `count` floors. */
const storeyOf = (sillFt: number, count: number) => Math.max(0, Math.min(count - 1, Math.floor(sillFt / STOREY_FT + 1e-6)))

function onFloor(part: SheetPart, floor: SheetFloor, count: number): SheetPart | null {
  const enclosing = floor.enclosedParts.includes(part.massIndex)
  if (!enclosing && (part.kind === 'wall' || floorAtLevel(part.levelFt) !== floor.index)) return null
  return { ...part, openings: part.openings.filter((o) => storeyOf(part.levelFt + o.sillFt, count) === floor.index) }
}

export function floorPlans(b: SheetBuilding): FloorPlan[] {
  if (b.floors.length <= 1) return [{ building: b, floor: b.floors[0] ?? null, title: 'Floor plan' }]
  return b.floors.map((floor) => {
    const parts = b.parts.flatMap((p) => onFloor(p, floor, b.floors.length) ?? [])
    const building: SheetBuilding = {
      ...b,
      parts,
      bounds: boundsOf(parts.flatMap(partPoints)),
      outlineBounds: boundsOf(parts.flatMap((p) => p.outline)),
      datumOnWall: b.datumOnWall && parts.some((p) => p.massIndex === b.parts[0]?.massIndex),
      earthworks: floor.index === 0 ? b.earthworks : null,
      // each part's supports on the plan of the floor its own floor is on, not under every storey its walls enclose
      supports: b.supports.filter((s) => parts.some((p) => p.massIndex === s.massIndex && floorAtLevel(p.levelFt) === floor.index)),
    }
    return { building, floor, title: `Floor plan, ${floor.name}` }
  })
}
