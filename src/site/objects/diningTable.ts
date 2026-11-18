import { num } from '../../buildings/footprint'
import { ftToM } from '../units'
import { CUSHION_T } from './bench'

/**
 * An outdoor dining table with seating (new in this app, not in the old
 * planner), for the roof deck. Pure: the params (feet, as the rest of the
 * plan) in, boxes out.
 *
 * The table is in its own frame, metres: the origin at the middle of its
 * ground footprint, x along its length, y up from its feet, z across its
 * width. Each seat is in its own frame too: the origin at the middle of its
 * floor footprint, y up, its front at +z, the way it faces the table. A
 * seat's `turn` (radians about y) turns that frame into the table's: a seat
 * on the −z side has turn 0 (its front faces +z, toward the table) and one
 * on the +z side has turn π.
 *
 * `standZ` (metres NAVD88, optional) is the elevation of the feet, as for the
 * bench: the table stands there, e.g. on a deck; else it sits on the ground.
 */

/** The library's table: 8 ft long, 3½ ft wide, 2½ ft high, with 8 chairs and cushions. */
export const DINING_CUSHION_COLOUR = '#d8c9a8'
export const DINING_DEFAULTS = { w: 8, d: 3.5, h: 2.5, seats: 'chairs', count: 8, cushion: true, cushionColor: DINING_CUSHION_COLOUR } as const

/** The table top is 2 in thick, metres. */
export const TOP_T = 0.0508
/** The table's legs are about 4 in square, and stand 1 ft in from each end and side, metres. */
const TABLE_LEG = 0.1
const LEG_INSET = 0.3048
/** A seat's top is 1.5 ft above its floor (the table 2.5 ft). */
const SEAT_FT = 1.5
const SLAT_T = 0.035
const SLAT_GAP = 0.02
/** A seat sits 2 in under the table's edge, metres. */
const TUCK = 0.0508
/** Seat pads are inset 1 in from the seat's edges, metres. */
const CUSHION_INSET = 0.0254

/** A chair: 1.6 ft square, three seat slats, four legs, two back posts and two back slats. */
const CHAIR_FT = 1.6
const CHAIR_SLATS = 3
const CHAIR_LEG = 0.045
/** The back rises this far above the seat, metres. */
const CHAIR_BACK_RISE = 0.4
const CHAIR_BACK_SLATS = 2
const BACK_SLAT_GAP = 0.03
const BACK_T = 0.03

/** A bench: 1¼ ft deep, three seat slats, a leg at each corner and a stretcher at each end. */
const BENCH_DEPTH_FT = 1.25
const BENCH_SLATS = 3
const BENCH_LEG = 0.06
const STRETCH_H = 0.06
const STRETCH_DROP = 0.12

/** The table has a chair at each end as well as along the long sides from this many chairs up. */
const END_CHAIRS_FROM = 10
const MAX_COUNT = 20
const DEFAULT_COUNT = 8

/** Smallest sizes the geometry is built to, feet (a smaller table is drawn at these). */
const MIN_LENGTH_FT = 3
const MIN_WIDTH_FT = 2
const MIN_HEIGHT_FT = 1.5

export type DiningPartKind = 'top' | 'leg' | 'seat' | 'stretcher' | 'backPost' | 'backSlat' | 'cushion'
export type DiningSeatKind = 'chair' | 'bench'

/** One box: its centre and size in its piece's frame, metres. */
export interface DiningPart {
  readonly kind: DiningPartKind
  readonly centre: [number, number, number]
  readonly size: [number, number, number]
}

/** One chair or bench: where its floor centre sits in the table's frame, its turn, and its boxes in its own frame. */
export interface DiningSeat {
  readonly kind: DiningSeatKind
  readonly centre: [number, number, number]
  readonly turn: number
  readonly parts: readonly DiningPart[]
}

/** The whole table: its own boxes, and every seat round it. */
export interface DiningTableParts {
  readonly table: readonly DiningPart[]
  readonly seats: readonly DiningSeat[]
}

/** Whether the seating is chairs (the default) or a bench on each long side. */
export function diningSeatKind(params: Readonly<Record<string, unknown>>): DiningSeatKind {
  return params.seats === 'benches' ? 'bench' : 'chair'
}

/** How many chairs: `count` (default 8), a whole number from 0 to 20. */
export function diningCount(params: Readonly<Record<string, unknown>>): number {
  return Math.min(MAX_COUNT, Math.max(0, Math.round(num(params.count, DEFAULT_COUNT))))
}

/** Whether the seats have cushions: on unless `cushion` is turned off. */
export function diningHasCushion(params: Readonly<Record<string, unknown>>): boolean {
  return params.cushion !== false
}

/** The cushion colour: `cushionColor` when it is a '#rrggbb' string, else the default. */
export function diningCushionColour(params: Readonly<Record<string, unknown>>): string {
  const c = params.cushionColor
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : DINING_CUSHION_COLOUR
}

/**
 * The elevation of a table's feet, metres NAVD88: its fixed `standZ` when
 * that is a finite number (a table on a deck), else the ground it stands on.
 */
export function diningBase(params: Readonly<Record<string, unknown>>, groundM: number): number {
  const z = params.standZ
  return typeof z === 'number' && Number.isFinite(z) ? z : groundM
}

const V = (x: number, y: number, z: number): [number, number, number] => [x, y, z]

/** One chair in its own frame: seat slats across the depth on four legs, back posts and back slats, and a pad. */
function chairParts(cushion: boolean): DiningPart[] {
  const W = ftToM(CHAIR_FT)
  const H = ftToM(SEAT_FT)
  const parts: DiningPart[] = []

  // seat slats run across the chair's width, spaced across its depth
  const slatW = (W - (CHAIR_SLATS - 1) * SLAT_GAP) / CHAIR_SLATS
  for (let i = 0; i < CHAIR_SLATS; i++) {
    const z = -W / 2 + slatW / 2 + i * (slatW + SLAT_GAP)
    parts.push({ kind: 'seat', centre: V(0, H - SLAT_T / 2, z), size: V(W, SLAT_T, slatW) })
  }

  // four square legs under the slats, at the corners
  const legH = H - SLAT_T
  const lx = W / 2 - CHAIR_LEG / 2
  const lz = W / 2 - CHAIR_LEG / 2
  for (const x of [-lx, lx]) {
    for (const z of [-lz, lz]) parts.push({ kind: 'leg', centre: V(x, legH / 2, z), size: V(CHAIR_LEG, legH, CHAIR_LEG) })
  }

  // the rear legs run on up as back posts, and the back slats sit in front of them, facing the table
  for (const x of [-lx, lx]) {
    const postTop = H + CHAIR_BACK_RISE
    parts.push({ kind: 'backPost', centre: V(x, (legH + postTop) / 2, -lz), size: V(CHAIR_LEG, postTop - legH, CHAIR_LEG) })
  }
  const band = CHAIR_BACK_RISE / CHAIR_BACK_SLATS
  const bz = -lz + CHAIR_LEG / 2 + BACK_T / 2
  for (let k = 0; k < CHAIR_BACK_SLATS; k++) {
    parts.push({ kind: 'backSlat', centre: V(0, H + band * k + band / 2, bz), size: V(W, band - BACK_SLAT_GAP, BACK_T) })
  }

  if (cushion) {
    // the seat pad: 3 in thick, inset 1 in from the front and ends, its back edge against the back slats
    const front = W / 2 - CUSHION_INSET
    const back = bz - BACK_T / 2
    parts.push({ kind: 'cushion', centre: V(0, H + CUSHION_T / 2, (front + back) / 2), size: V(W - 2 * CUSHION_INSET, CUSHION_T, front - back) })
  }
  return parts
}

/** One bench in its own frame, `L` metres long: seat slats on two end frames, each a leg pair and a stretcher, and a pad. */
function benchParts(L: number, cushion: boolean): DiningPart[] {
  const BD = ftToM(BENCH_DEPTH_FT)
  const H = ftToM(SEAT_FT)
  const parts: DiningPart[] = []

  const slatW = (BD - (BENCH_SLATS - 1) * SLAT_GAP) / BENCH_SLATS
  for (let i = 0; i < BENCH_SLATS; i++) {
    const z = -BD / 2 + slatW / 2 + i * (slatW + SLAT_GAP)
    parts.push({ kind: 'seat', centre: V(0, H - SLAT_T / 2, z), size: V(L, SLAT_T, slatW) })
  }

  const legH = H - SLAT_T
  const lx = L / 2 - BENCH_LEG / 2
  const lz = BD / 2 - BENCH_LEG / 2
  for (const x of [-lx, lx]) {
    for (const z of [-lz, lz]) parts.push({ kind: 'leg', centre: V(x, legH / 2, z), size: V(BENCH_LEG, legH, BENCH_LEG) })
    parts.push({ kind: 'stretcher', centre: V(x, legH - STRETCH_DROP, 0), size: V(BENCH_LEG * 0.8, STRETCH_H, BD - BENCH_LEG) })
  }

  if (cushion) {
    parts.push({ kind: 'cushion', centre: V(0, H + CUSHION_T / 2, 0), size: V(L - 2 * CUSHION_INSET, CUSHION_T, BD - 2 * CUSHION_INSET) })
  }
  return parts
}

/** The seats round a table L metres long and D wide: chairs along both long sides (and one at each end from 10 up), or a bench on each long side. */
function seatsOf(params: Readonly<Record<string, unknown>>, L: number, D: number, cushion: boolean): DiningSeat[] {
  // a seat's edge sits TUCK in from the table's edge, so its front tucks under the top
  const tuckZ = D / 2 - TUCK

  if (diningSeatKind(params) === 'bench') {
    const parts = benchParts(L, cushion)
    const z = tuckZ + ftToM(BENCH_DEPTH_FT) / 2
    return [
      { kind: 'bench', centre: V(0, 0, -z), turn: 0, parts },
      { kind: 'bench', centre: V(0, 0, z), turn: Math.PI, parts },
    ]
  }

  const C = ftToM(CHAIR_FT)
  const parts = chairParts(cushion)
  const count = diningCount(params)
  const ends = count >= END_CHAIRS_FROM ? 2 : 0
  const long = count - ends
  // each long side spreads its chairs evenly along the table
  const along = (n: number) => Array.from({ length: n }, (_, i) => -L / 2 + ((i + 0.5) * L) / n)
  const zSeat = tuckZ + C / 2
  const seats: DiningSeat[] = []
  for (const x of along(Math.ceil(long / 2))) seats.push({ kind: 'chair', centre: V(x, 0, -zSeat), turn: 0, parts })
  for (const x of along(Math.floor(long / 2))) seats.push({ kind: 'chair', centre: V(x, 0, zSeat), turn: Math.PI, parts })
  if (ends) {
    const xEnd = L / 2 - TUCK + C / 2
    seats.push({ kind: 'chair', centre: V(-xEnd, 0, 0), turn: Math.PI / 2, parts })
    seats.push({ kind: 'chair', centre: V(xEnd, 0, 0), turn: -Math.PI / 2, parts })
  }
  return seats
}

/**
 * The boxes of one dining table and its seats: a thick top on four chunky
 * legs, and the chairs or benches round it, each with its own legs, backs
 * (chairs) and cushions when those are on.
 */
export function diningTableParts(params: Readonly<Record<string, unknown>>): DiningTableParts {
  const L = ftToM(Math.max(MIN_LENGTH_FT, num(params.w, DINING_DEFAULTS.w)))
  const D = ftToM(Math.max(MIN_WIDTH_FT, num(params.d, DINING_DEFAULTS.d)))
  const H = ftToM(Math.max(MIN_HEIGHT_FT, num(params.h, DINING_DEFAULTS.h)))
  const cushion = diningHasCushion(params)

  const table: DiningPart[] = [{ kind: 'top', centre: V(0, H - TOP_T / 2, 0), size: V(L, TOP_T, D) }]
  const legTop = H - TOP_T
  const lx = L / 2 - Math.min(LEG_INSET, L / 4)
  const lz = D / 2 - Math.min(LEG_INSET, D / 4)
  for (const x of [-lx, lx]) {
    for (const z of [-lz, lz]) table.push({ kind: 'leg', centre: V(x, legTop / 2, z), size: V(TABLE_LEG, legTop, TABLE_LEG) })
  }

  return { table, seats: seatsOf(params, L, D, cushion) }
}
