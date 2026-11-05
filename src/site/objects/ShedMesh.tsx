import { useMemo } from 'react'
import type { PlanObject } from '../../store/types'
import { BuildingMesh } from '../../buildings/BuildingMesh'

/**
 * The old library's shed and shop (legacy LIB): what one placed from it
 * carries, used for any field the object does not have.
 */
const LIBRARY: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  shed: { w: 10, d: 12, h: 7, color: '#7d8a6a', roof: 'gable', pitch: 6, ridge: 'z', overhang: 1 },
  shop: { w: 24, d: 24, h: 12, color: '#6f7f94', roof: 'gable', pitch: 4, ridge: 'x', overhang: 1 },
}

/**
 * A shed or shop. The old planner built them exactly as it built a house
 * (isBuilding: walls, roof, wings, foundation, openings), so they are drawn
 * by the same BuildingMesh, with the library's shed or shop filling in any
 * field they lack.
 */
export function ShedMesh({ o }: { readonly o: PlanObject }) {
  const filled = useMemo(() => {
    const defaults = LIBRARY[o.type]
    if (!defaults || Object.keys(defaults).every((k) => k in o.params)) return o
    return { ...o, params: { ...defaults, ...o.params } }
  }, [o])
  return <BuildingMesh o={filled} />
}
