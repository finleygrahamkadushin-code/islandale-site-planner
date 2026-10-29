import type { EdgeDraw } from '../buildings/railEdits'
import type { Site } from '../site/types'
import type { ObjectId, Plan } from './types'

/**
 * What the scene draws on each edge of one wing (or standalone deck), for
 * the store's first per-edge rail write (railEdits.materialise). The answer
 * comes from the rail rules (drop to the ground, covered edges, steps), so
 * it is registered here rather than imported, keeping the store free of
 * terrain sampling. With no resolver, or a null answer, the store freezes
 * the legacy flag alone, as the old planner did.
 *
 * TODO(5A stage 2): register the per-edge rule (legacy guardRule vs per-edge
 * auto, edgeFree) with setRailDrawResolver.
 */
export interface RailDrawQuery {
  readonly plan: Plan
  readonly site: Site
  readonly id: ObjectId
  readonly mass: number
}

export type RailDrawResolver = (q: RailDrawQuery) => readonly EdgeDraw[] | null

let resolver: RailDrawResolver | null = null

/** Install (or with null, remove) the rule that says what each edge draws. */
export function setRailDrawResolver(r: RailDrawResolver | null): void {
  resolver = r
}

/** Per edge, what is drawn in each regime, or null when no rule is installed. */
export function railDraws(q: RailDrawQuery): readonly EdgeDraw[] | null {
  return resolver ? resolver(q) : null
}
