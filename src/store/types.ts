/**
 * The plan is data; the scene, inspector, drawings and saving all read from it.
 * Every placed thing is a PlanObject. Feature-specific settings live in `params`
 * so no feature has to know another feature's shape.
 */
export type ObjectId = string

export interface PlanObject {
  readonly id: ObjectId
  /** Legacy type for now: house, pad, tree, bridge, deck, ... */
  readonly type: string
  readonly name: string
  /** Site frame, metres: x east, n north. */
  readonly position: { readonly x: number; readonly n: number }
  /** Degrees, counter-clockwise from north, as the legacy planner stored it. */
  readonly rotation: number
  readonly params: Readonly<Record<string, unknown>>
  readonly locked: boolean
  readonly hidden: boolean
  readonly labelVisible: boolean
}

export interface Plan {
  readonly name: string
  readonly siteId: 'islandale'
  /** Scheme the objects were loaded from, if any. */
  readonly schemeId: string | null
  readonly objects: Readonly<Record<ObjectId, PlanObject>>
  /** Draw / list order. */
  readonly order: readonly ObjectId[]
}

export type LabelMode = 'all' | 'selected' | 'none'
