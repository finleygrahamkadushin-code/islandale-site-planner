import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { sinkFt } from './placement'
import { opensRails, type RailWorld } from './railWorld'
import { planRailWorld } from './railSite'

// every building asks for the same world; build it once per change of these objects or the terrain
let last: { objects: readonly PlanObject[]; world: RailWorld } | null = null
const sameObjects = (a: readonly PlanObject[], b: readonly PlanObject[]) => a.length === b.length && a.every((o, i) => o === b[i])

/**
 * The buildings, decks, path pads and bridges that open rails, over the
 * displayed ground (sunk buildings' cuts included), the same world the
 * store's rail resolver builds (railSite.planRailWorld).
 */
export function useRailWorld(): RailWorld {
  const terrain = usePlanStore((s) => s.site.terrain)
  const objects = usePlanStore(useShallow((s) => s.plan.order.map((id) => s.plan.objects[id]).filter((o): o is PlanObject => !!o && (opensRails(o) || (!o.hidden && sinkFt(o) > 0)))))
  return useMemo(() => {
    if (last && last.world.terrain === terrain && sameObjects(last.objects, objects)) return last.world
    last = { objects, world: planRailWorld(objects, terrain) }
    return last.world
  }, [objects, terrain])
}
