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
  /** Degrees, counter-clockwise seen from above, as the legacy planner stored it. */
  readonly rotation: number
  /** Legacy fields: w, d, h and lift in feet, color, shape, pts, wings, ... */
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

export type LayerId = 'buildings' | 'paths' | 'trees' | 'labels'

export interface LayerState {
  readonly visible: boolean
  readonly locked: boolean
}

export type Layers = Readonly<Record<LayerId, LayerState>>

export const LAYER_IDS: readonly LayerId[] = ['buildings', 'paths', 'trees', 'labels']

export const LAYER_NAMES: Readonly<Record<LayerId, string>> = {
  buildings: 'Buildings',
  paths: 'Decks and paths',
  trees: 'Trees',
  labels: 'Labels',
}

/** Which layer a plan object belongs to, from its legacy type. */
export function layerOf(o: Pick<PlanObject, 'type' | 'params'>): Exclude<LayerId, 'labels'> {
  if (o.type === 'tree' || o.params.tree === true) return 'trees'
  if (o.type === 'house') return 'buildings'
  return 'paths'
}

export const DEFAULT_LAYERS: Layers = {
  buildings: { visible: true, locked: false },
  paths: { visible: true, locked: false },
  trees: { visible: true, locked: false },
  labels: { visible: true, locked: false },
}
