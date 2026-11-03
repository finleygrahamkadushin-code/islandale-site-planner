import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { siteEarthworks, type Cut, type Ground, type SiteEarthworks } from '../site/earthworks'
import type { Terrain } from '../site/types'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { earthCuts, shapesGround } from './placement'

export interface Earthworks {
  /** One per earthworks object (sunk, bermed or earth-supported buildings, ponds), each reaching as far as its earthworks do. */
  readonly cuts: readonly Cut[]
  /** Displayed ground, metres: the survey with every object's earthworks. */
  readonly ground: Ground
  /** The same ground as the terrain mesh draws it (flat triangles), for draping paths on it. */
  readonly drawnGround: Ground
  /** The reshaped patches, pond water and retaining walls. */
  readonly works: SiteEarthworks
}

// every component asks for the same earthworks; work them out once per change of these objects or the terrain
let last: { objects: readonly PlanObject[]; terrain: Terrain; earthworks: Earthworks } | null = null
const sameObjects = (a: readonly PlanObject[], b: readonly PlanObject[]) => a.length === b.length && a.every((o, i) => o === b[i])

function earthworksOf(objects: readonly PlanObject[], terrain: Terrain): Earthworks {
  if (last && last.terrain === terrain && sameObjects(last.objects, objects)) return last.earthworks
  const cuts = earthCuts(objects, terrain)
  const works = siteEarthworks(terrain, cuts.flatMap((c) => (c.op ? [c.op] : [])))
  const earthworks = { cuts, ground: works.ground, drawnGround: works.drawnGround, works }
  last = { objects, terrain, earthworks }
  return earthworks
}

/** The ground as the plan's buildings and ponds reshape it, derived from the plan (drawing only; no plan data changes). */
export function useEarthworks(): Earthworks {
  const terrain = usePlanStore((s) => s.site.terrain)
  const objects = usePlanStore(useShallow((s) => s.plan.order.map((id) => s.plan.objects[id]).filter((o) => o && !o.hidden && shapesGround(o))))
  return useMemo(() => earthworksOf(objects, terrain), [objects, terrain])
}
