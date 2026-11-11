import type { LocalPoint } from './footprint'
import { massBuildingPoly, massToBuilding, type Mass } from './masses'
import { insideAny } from './decks/wingPosts'
import type { MassSite } from '../scene/buildingLook'

/** The tests of a mass's site that hang on the building's shape alone. */
export type MassShapeTests = Pick<MassSite, 'insideWalls' | 'insideOther'>

/**
 * Per mass: whether a mass-local point (feet) lies inside one of the
 * building's enclosed masses, or inside any other mass. Shape only, never
 * where the building stands, so the walls and openings built from them need
 * not change while the building is dragged or turned (R8.2).
 */
export function massShapeTests(masses: readonly Mass[]): MassShapeTests[] {
  const outlines = masses.map(massBuildingPoly)
  const closed = outlines.filter((_, i) => !masses[i].open)
  return masses.map((m, index) => {
    const others = outlines.filter((_, j) => j !== index)
    return {
      insideWalls: (p: LocalPoint) => insideAny(closed, massToBuilding(m, p)),
      insideOther: (p: LocalPoint) => insideAny(others, massToBuilding(m, p)),
    }
  })
}
