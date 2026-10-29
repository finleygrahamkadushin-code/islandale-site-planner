import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { groundWithCuts, type Cut, type Ground } from '../site/earthworks'
import { surfaceElevationAt } from '../site/terrain'
import { usePlanStore } from '../store/planStore'
import { sinkFt, sunkCuts } from './placement'

export interface Earthworks {
  readonly cuts: readonly Cut[]
  /** Displayed ground, metres: the survey with every sunk floor's cut. */
  readonly ground: Ground
  /** The same ground as the terrain mesh draws it (flat triangles between survey points), for draping paths on it. */
  readonly drawnGround: Ground
}

/** The cuts made by buildings set into the slope, derived from the plan (drawing only; no plan data changes). */
export function useEarthworks(): Earthworks {
  const terrain = usePlanStore((s) => s.site.terrain)
  const sunk = usePlanStore(useShallow((s) => s.plan.order.map((id) => s.plan.objects[id]).filter((o) => o && !o.hidden && sinkFt(o) > 0)))
  return useMemo(() => {
    const cuts = sunkCuts(sunk, terrain)
    return { cuts, ground: groundWithCuts(terrain, cuts), drawnGround: groundWithCuts(terrain, cuts, surfaceElevationAt) }
  }, [sunk, terrain])
}
