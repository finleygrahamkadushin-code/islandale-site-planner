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

export type DisplayStyle = 'realistic' | 'white' | 'sketch' | 'diagram'

export const DISPLAY_STYLES: readonly { readonly id: DisplayStyle; readonly label: string }[] = [
  { id: 'realistic', label: 'Realistic' },
  { id: 'white', label: 'White model' },
  { id: 'sketch', label: 'Sketch' },
  { id: 'diagram', label: 'Diagram' },
]

export type SeasonId = 'jun' | 'sep' | 'dec'

/** Sun and water settings. View state: saved with the plan, never an undo step. */
export interface Environment {
  readonly season: SeasonId
  /** Local hour, 7 to 19. */
  readonly hour: number
  /** Tide level, feet NAVD88, 0 to 12 as in the legacy planner. */
  readonly tideFt: number
}

export const DEFAULT_ENVIRONMENT: Environment = { season: 'sep', hour: 14, tideFt: 6.2 }
export const HOUR_RANGE = { min: 7, max: 19 } as const
export const TIDE_RANGE_FT = { min: 0, max: 12 } as const

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
