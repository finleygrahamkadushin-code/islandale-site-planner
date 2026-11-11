import { useMemo } from 'react'
import type { PlanObject } from '../../store/types'
import { BuildingMesh } from '../../buildings/BuildingMesh'
import { withShedDefaults } from './shedLibrary'

/**
 * A shed or shop. The old planner built them exactly as it built a house
 * (isBuilding: walls, roof, wings, foundation, openings), so they are drawn
 * by the same BuildingMesh, with the library's shed or shop filling in any
 * field they lack.
 */
export function ShedMesh({ o }: { readonly o: PlanObject }) {
  const filled = useMemo(() => withShedDefaults(o), [o])
  return <BuildingMesh o={filled} />
}
