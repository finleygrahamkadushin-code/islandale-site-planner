import type { Pt } from './geom'

/**
 * A cabin's floor plans, stored on the cabin as `params.floors` the way the
 * old planner stores them (int2/model.js), in building-local feet (+z front).
 */
export type RoomType =
  | 'living' | 'kitchen' | 'dining' | 'bedroom' | 'bath' | 'office' | 'laundry' | 'mudroom'
  | 'pantry' | 'closet' | 'hall' | 'entry' | 'stairs' | 'garage' | 'porch' | 'utility'

/** Room fill colours, the old ROOM_TYPES. */
export const ROOM_COLORS: Readonly<Record<RoomType, string>> = {
  living: '#f3e2c6', kitchen: '#f8d9b0', dining: '#f6e7c2', bedroom: '#d9e6f2', bath: '#d4ecec', office: '#e3dcf0',
  laundry: '#e0e8ea', mudroom: '#e6e3d6', pantry: '#efe4c8', closet: '#ececec', hall: '#f4f4ef', entry: '#efe9dc',
  stairs: '#e8e0d0', garage: '#dcdcd4', porch: '#e9efe0', utility: '#e6e6e0',
}

export const ROOM_TYPES = Object.keys(ROOM_COLORS) as RoomType[]

export const TYPE_LABELS: Readonly<Record<RoomType, string>> = {
  living: 'Living', kitchen: 'Kitchen', dining: 'Dining', bedroom: 'Bedroom', bath: 'Bath', office: 'Office',
  laundry: 'Laundry', mudroom: 'Mudroom', pantry: 'Pantry', closet: 'Closet', hall: 'Hall', entry: 'Entry',
  stairs: 'Stairs', garage: 'Garage', porch: 'Porch', utility: 'Utility',
}

/** Rooms counted as circulation in the floor stats. */
export const CIRCULATION: readonly RoomType[] = ['hall', 'entry', 'stairs']

export type OpeningKind = 'door' | 'window' | 'slider' | 'open'
export const OPENING_KINDS: readonly OpeningKind[] = ['door', 'window', 'slider', 'open']
/** Default widths, feet. */
export const OPENING_DEFAULTS: Readonly<Record<OpeningKind, number>> = { door: 3, window: 4, slider: 6, open: 6 }
export const OPENING_LABELS: Readonly<Record<OpeningKind, string>> = { door: 'Door', window: 'Window', slider: 'Slider', open: 'Cased opening' }

/** Wall thicknesses on the plan, feet: exterior and interior. */
export const WALL = { ext: 0.5, int: 1 / 3 } as const

export interface Room {
  readonly id: number
  readonly name: string
  readonly type: RoomType
  /** Positive outline, starting at its back-left corner. */
  readonly pts: readonly Pt[]
}

/** A door, window, slider or cased opening on one edge of a room. */
export interface Opening {
  readonly id: number
  readonly room: number
  readonly edge: number
  /** Centre along the edge, 0–1. */
  readonly pos: number
  readonly width: number
  readonly kind: OpeningKind
  /** Hinge at the edge's far end instead of its near end. */
  readonly flip: boolean
  /** Swings out of the room instead of into it. */
  readonly out: boolean
}

/** A piece of furniture before it has an id. */
export interface FurnitureBase {
  readonly type: string
  /** Centre, feet. */
  readonly x: number
  readonly z: number
  /** Degrees, 0 to 360. */
  readonly rot: number
  readonly w: number
  readonly d: number
  readonly mirror: boolean
  /** Height, feet, when it differs from the catalogue's. */
  readonly h?: number
  /** Fixture options (shower curb, drain, door, bench and the like), kept as stored. */
  readonly [extra: string]: unknown
}

export interface Furniture extends FurnitureBase {
  readonly id: number
}

export interface Floor {
  readonly name: string
  readonly rooms: readonly Room[]
  readonly openings: readonly Opening[]
  readonly furniture: readonly Furniture[]
  /** Points where a curved wall is kept as one straight chord for a door (set by the old auto planner). */
  readonly flats?: readonly Pt[]
}
