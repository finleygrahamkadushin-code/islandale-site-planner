import type { RailWorld } from '../../buildings/rails/railWorld'
import type { Ground } from '../earthworks/earthworks'
import type { Parcel, Terrain } from '../types'
import type { ObjectId, PlanObject, Setbacks } from '../../store/types'

/** The code check's row shape and the context every row reads (5E). */

export type CodeVerdict = 'pass' | 'fail' | 'note'

export interface NamedObject {
  readonly id: ObjectId
  readonly name: string
}

export interface CodeRow {
  readonly id: string
  readonly label: string
  readonly text: string
  readonly verdict: CodeVerdict
  readonly names: readonly NamedObject[]
}

/** What every row reads: the visible objects and the ground, rails and setbacks worked out once. */
export interface CheckContext {
  readonly objects: readonly PlanObject[]
  readonly terrain: Terrain
  readonly parcel: Parcel
  readonly setbacks: Setbacks
  /** Sunk-cut ground, the one the rails stand on (useRailWorld's). */
  readonly ground: Ground
  /** The displayed ground with every earthwork, the one the route and levels panels use. */
  readonly routeGround: Ground
  readonly world: RailWorld
}

export const named = (o: PlanObject, suffix?: string): NamedObject => ({ id: o.id, name: suffix ? `${o.name} · ${suffix}` : o.name })
