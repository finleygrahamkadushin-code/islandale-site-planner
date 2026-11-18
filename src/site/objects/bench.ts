import { num } from '../../buildings/footprint'
import { ftToM } from '../units'

/**
 * A bench (new in this app, not in the old planner): a slatted wooden seat
 * on leg frames, with a slatted backrest when `back` is on. Pure: the
 * params (feet, as the rest of the plan) in, boxes out, in the bench's own
 * frame in metres (origin at the middle of its ground footprint, x along its
 * length, y up from its feet, z the front, toward the bay at rotation 0).
 *
 * `standZ` (metres NAVD88, optional) is the elevation of the bench's feet.
 * When it is a finite number the bench stands there, e.g. on a deck; else it
 * sits on the ground at its centre like the other site objects.
 */

/** The library's bench: 6 ft long, 1.5 ft deep, seat 1.5 ft up, with a back. */
export const BENCH_DEFAULTS = { w: 6, d: 1.5, h: 1.5, back: true } as const

/** Smallest sizes the geometry is built to, feet (a bench smaller than this is drawn at these). */
const MIN_LENGTH_FT = 2
const MIN_DEPTH_FT = 0.8
const MIN_SEAT_FT = 0.5

/** Seat slats across the depth, and the gap between them, metres. */
export const SEAT_SLATS = 4
const SLAT_T = 0.035
const SLAT_GAP = 0.02
/** Leg posts are square, metres, and stand at the ends of the seat. */
const LEG = 0.06
/** A leg frame's stretcher under the seat, its depth and how far below the slats it sits, metres. */
const STRETCHER_H = 0.06
const STRETCHER_DROP = 0.12
/** Benches at least this long (feet) get a middle leg frame as well as the two at the ends. */
const MIDDLE_FRAME_FT = 4
/** Backrest: the back posts rise this far above the seat, metres, with horizontal slats in front of them. */
export const BACK_RISE = 0.45
export const BACK_SLATS = 3
const BACK_SLAT_GAP = 0.03
const BACK_T = 0.03

export type BenchPartKind = 'seat' | 'leg' | 'stretcher' | 'backPost' | 'backSlat'

/** One box of the bench: its centre and size in the bench's frame, metres. */
export interface BenchPart {
  readonly kind: BenchPartKind
  readonly centre: [number, number, number]
  readonly size: [number, number, number]
}

/** A bench's seat height above its feet, metres. */
export function benchSeatM(params: Readonly<Record<string, unknown>>): number {
  return ftToM(Math.max(MIN_SEAT_FT, num(params.h, BENCH_DEFAULTS.h)))
}

/** Whether a bench has its backrest: on unless `back` is turned off. */
export function benchHasBack(params: Readonly<Record<string, unknown>>): boolean {
  return params.back !== false
}

/**
 * The boxes of one bench: the seat's slats, a leg frame at each end (and in
 * the middle of a long bench), each frame's stretcher, and, with a back, two
 * back posts rising from the rear legs with horizontal slats in front of them.
 */
export function benchParts(params: Readonly<Record<string, unknown>>): BenchPart[] {
  const L = ftToM(Math.max(MIN_LENGTH_FT, num(params.w, BENCH_DEFAULTS.w)))
  const D = ftToM(Math.max(MIN_DEPTH_FT, num(params.d, BENCH_DEFAULTS.d)))
  const H = benchSeatM(params)
  const parts: BenchPart[] = []

  // seat slats run along the length, spaced across the depth, their tops at the seat height
  const slatW = (D - (SEAT_SLATS - 1) * SLAT_GAP) / SEAT_SLATS
  for (let i = 0; i < SEAT_SLATS; i++) {
    const z = -D / 2 + slatW / 2 + i * (slatW + SLAT_GAP)
    parts.push({ kind: 'seat', centre: [0, H - SLAT_T / 2, z], size: [L, SLAT_T, slatW] })
  }

  // leg frames: the two ends, and a middle one on a long bench; each frame is two legs and a stretcher
  const legH = H - SLAT_T
  const inset = L / 2 - LEG / 2
  const xs = num(params.w, BENCH_DEFAULTS.w) >= MIDDLE_FRAME_FT ? [-inset, 0, inset] : [-inset, inset]
  const legZ = D / 2 - LEG / 2
  for (const x of xs) {
    for (const z of [-legZ, legZ]) parts.push({ kind: 'leg', centre: [x, legH / 2, z], size: [LEG, legH, LEG] })
    parts.push({ kind: 'stretcher', centre: [x, legH - STRETCHER_DROP, 0], size: [LEG * 0.8, STRETCHER_H, D - LEG] })
  }

  if (benchHasBack(params)) {
    // back posts continue the rear legs up past the seat
    for (const x of [-inset, inset]) parts.push({ kind: 'backPost', centre: [x, H + BACK_RISE / 2, -legZ], size: [LEG, BACK_RISE, LEG] })
    // horizontal back slats in front of the posts, spanning the whole length
    const band = BACK_RISE / BACK_SLATS
    const slatH = band - BACK_SLAT_GAP
    const z = -D / 2 + LEG + BACK_T / 2
    for (let k = 0; k < BACK_SLATS; k++) {
      parts.push({ kind: 'backSlat', centre: [0, H + band * k + band / 2, z], size: [L, slatH, BACK_T] })
    }
  }
  return parts
}

/**
 * The elevation of a bench's feet, metres NAVD88: its fixed `standZ` when
 * that is a finite number (a bench on a deck), else the ground it stands on.
 */
export function benchBase(params: Readonly<Record<string, unknown>>, groundM: number): number {
  const z = params.standZ
  return typeof z === 'number' && Number.isFinite(z) ? z : groundM
}
