import { num } from '../../buildings/footprint'
import { ftToM } from '../units'

/**
 * A sunken seating fire pit (new in this app, not in the old planner), for the
 * roof deck. Pure: the params (feet, as the rest of the plan) in, boxes and
 * cylinders out, in the pit's own frame in metres (origin at the middle of its
 * floor, y up from the pit floor, z toward the gap in the ring at rotation 0).
 *
 * It is sunk by raising the seating round the fire, not by cutting below the
 * base: a raised deck ring (`riser` above the floor), two broad sitting steps
 * stepping down inside it (each half the riser), a gap on the +z side with two
 * shallow steps to walk down, the stone floor at the base, and a stone fire
 * bowl with a dark interior and a few flames. The lower step sits level with
 * the floor, and its seat cushions are a band on top of it.
 *
 * The 'lounge' shape is a sunken conversation pit, 22 ft by 14 ft: a raised
 * deck rim round the back and both ends (none across the open front, +z),
 * built-in couches on three sides (a U), and a long linear fire trough set a
 * third of the way from the back couch to the open front. See `loungeParts`.
 *
 * `standZ` (metres NAVD88, optional) is the elevation of the pit floor, e.g.
 * on a deck; else the pit sits on the ground at its centre.
 */

/** The library's fire pit: 14 ft across, round, a 1.5 ft surround, 1.75 ft seats, cushions on. */
export const FIREPIT_DEFAULTS = { w: 14, d: 14, shape: 'round', riser: 1.5, seatDepth: 1.75, cushion: true } as const

/** The library's fire lounge: 22 ft by 14 ft, a 1.5 ft rim, cushions on in the default colour. */
export const LOUNGE_DEFAULTS = { w: 22, d: 14, shape: 'lounge', riser: 1.5, cushion: true, cushionColor: '#d8c9a8' } as const
/** Cushion colour when a lounge has none set. */
export const LOUNGE_CUSHION_COLOUR = '#d8c9a8'

/** The raised ring round the outside, feet: about 2.5 ft wide, walked on. */
const RING_FT = 2.5
/** The gap in the ring on the +z side, feet wide. */
const GAP_FT = 3
/** The fire bowl: a stone ring 3 ft across (radius 1.5 ft), 1.25 ft high, its wall 0.3 ft thick. */
const BOWL_R_FT = 1.5
const BOWL_H_FT = 1.25
const BOWL_WALL_FT = 0.3
/** The dark interior sits this far below the bowl's rim, feet; the flames rise from it. */
const EMBER_DROP_FT = 0.2
const FLAME_BASE_FT = 0.6
/** Cushions stand this high on the lower step, metres, and keep this far off the bowl, feet. */
export const CUSHION_T = 0.1
const CUSHION_CLEAR_FT = 0.1
/** Thickness of the flat floor and the lower step's boards, metres. */
const FLOOR_T = 0.05
/** Ring segments round a circle (or a square's perimeter): enough that the ring reads round. */
export const RING_SEGMENTS = 24
const BOWL_SEGMENTS = 12
/** Each segment runs 8% past its neighbour so the joints close. */
const OVERLAP = 1.08

const MIN_W_FT = 8
const MIN_RISER_FT = 0.5
const MIN_SEAT_FT = 0.5

/** The lounge: its rim, couches, floor and trough, feet (see `loungeParts`). */
const LOUNGE_MIN_W_FT = 14
const LOUNGE_MIN_D_FT = 12
const LOUNGE_RIM_FT = 2
const LOUNGE_COUCH_D_FT = 2.4
const LOUNGE_BASE_H_FT = 1.4
const LOUNGE_SEAT_T_FT = 0.4
const LOUNGE_BACK_T_FT = 0.5
const LOUNGE_BACK_H_FT = 1.6
const LOUNGE_FLOOR_FT = 0.16
const LOUNGE_TROUGH_H_FT = 1.3
const LOUNGE_TROUGH_D_FT = 1.6
const LOUNGE_CHANNEL_D_FT = 0.9
const LOUNGE_CHANNEL_H_FT = 0.16
const LOUNGE_FLAME_BASE_FT = 0.5
/** The flame heights along the trough, feet, repeated in turn. */
const LOUNGE_FLAME_HEIGHTS_FT: readonly number[] = [0.9, 0.7, 1.0, 0.75, 0.95, 0.7, 0.85, 0.8]

export type FirepitShape = 'round' | 'square' | 'lounge'
/** deck: wood boards; stone: the floor, bowl and flagstones; cushion: seat fabric; ember: the dark bowl; flame: the fire. */
export type FirepitPartKind = 'deck' | 'stone' | 'cushion' | 'ember' | 'flame'
/** A box, a cylinder (`size`: diameter, height, diameter) or a cone (`size`: base diameter, height, diameter). */
export type FirepitPartForm = 'box' | 'cylinder' | 'cone'

/**
 * One piece of the pit: its centre and size in the pit's frame, metres; `yaw` turns it about the up axis, radians.
 * `colour` (optional) overrides the part's default colour: a lounge's cushions take `cushionColor`.
 */
export interface FirepitPart {
  readonly kind: FirepitPartKind
  readonly form: FirepitPartForm
  readonly centre: [number, number, number]
  readonly size: [number, number, number]
  readonly yaw: number
  readonly colour?: string
}

/** The shape asked for: 'round' unless 'square' or 'lounge' is given. */
export function firepitShape(params: Readonly<Record<string, unknown>>): FirepitShape {
  if (params.shape === 'square') return 'square'
  if (params.shape === 'lounge') return 'lounge'
  return 'round'
}

/** Whether the seats have cushions: on unless `cushion` is turned off. */
export function firepitHasCushion(params: Readonly<Record<string, unknown>>): boolean {
  return params.cushion !== false
}

/**
 * The boxes and cylinders of one fire pit: the raised deck ring (in segments),
 * two sitting steps inside it, the gap and its two steps on the +z side, the
 * stone floor, the seat cushions on the lower step, the fire bowl, its dark
 * interior and the flames.
 */
export function firepitParts(params: Readonly<Record<string, unknown>>): FirepitPart[] {
  const shape = firepitShape(params)
  if (shape === 'lounge') return loungeParts(params)
  const R =ftToM(Math.max(MIN_W_FT, num(params.w, FIREPIT_DEFAULTS.w)) / 2)
  const riser = ftToM(Math.max(MIN_RISER_FT, num(params.riser, FIREPIT_DEFAULTS.riser)))
  const seat = ftToM(Math.max(MIN_SEAT_FT, num(params.seatDepth, FIREPIT_DEFAULTS.seatDepth)))
  const ringW = ftToM(RING_FT)
  const gap = ftToM(GAP_FT)
  // the floor's radius: inside the ring and the two steps
  const floorR = Math.max(0, R - ringW - 2 * seat)
  const parts: FirepitPart[] = []

  // the raised ring round the outside: its top at the riser
  parts.push(...ring({ kind: 'deck', shape, half: R - ringW / 2, width: ringW, height: riser, y: riser / 2, outerR: R, gap }))
  // the upper sitting step, half the riser below the ring
  parts.push(...ring({ kind: 'deck', shape, half: R - ringW - seat / 2, width: seat, height: riser / 2, y: riser / 4, outerR: R, gap }))
  // the lower sitting step, level with the floor
  parts.push(...ring({ kind: 'deck', shape, half: floorR + seat / 2, width: seat, height: FLOOR_T, y: -FLOOR_T / 2, outerR: R, gap }))

  // the gap on the +z side: two shallow steps down from the ring to the floor
  const stepZ1 = R - ringW / 2
  const stepZ2 = R - ringW - seat / 2
  parts.push({ kind: 'deck', form: 'box', centre: [0, riser / 4, stepZ1], size: [gap, riser / 2, ringW], yaw: 0 })
  parts.push({ kind: 'deck', form: 'box', centre: [0, -FLOOR_T / 2, stepZ2], size: [gap, FLOOR_T, seat], yaw: 0 })

  // the stone floor, at the base
  const floorSize = 2 * floorR
  parts.push(
    shape === 'round'
      ? { kind: 'stone', form: 'cylinder', centre: [0, -FLOOR_T / 2, 0], size: [floorSize, FLOOR_T, floorSize], yaw: 0 }
      : { kind: 'stone', form: 'box', centre: [0, -FLOOR_T / 2, 0], size: [floorSize, FLOOR_T, floorSize], yaw: 0 },
  )

  // cushions on the lower step, between the bowl and the step's outer edge
  if (firepitHasCushion(params)) {
    const cIn = ftToM(BOWL_R_FT + CUSHION_CLEAR_FT)
    const cOut = R - ringW - seat - ftToM(CUSHION_CLEAR_FT)
    if (cOut > cIn) {
      parts.push(...ring({ kind: 'cushion', shape, half: (cIn + cOut) / 2, width: cOut - cIn, height: CUSHION_T, y: CUSHION_T / 2, outerR: R, gap }))
    }
  }

  // the fire bowl: a stone ring, a dark interior just under its rim, and the flames
  const bowlR = ftToM(BOWL_R_FT)
  const bowlH = ftToM(BOWL_H_FT)
  const wall = ftToM(BOWL_WALL_FT)
  parts.push(...ring({ kind: 'stone', shape: 'round', half: bowlR - wall / 2, width: wall, height: bowlH, y: bowlH / 2, outerR: bowlR, gap: 0, segments: BOWL_SEGMENTS }))
  const emberY = bowlH - ftToM(EMBER_DROP_FT)
  const emberSize = 2 * (bowlR - wall)
  parts.push({ kind: 'ember', form: 'cylinder', centre: [0, emberY - FLOOR_T / 2, 0], size: [emberSize, FLOOR_T, emberSize], yaw: 0 })
  for (const [x, z, h] of FLAMES) {
    const height = ftToM(h)
    parts.push({ kind: 'flame', form: 'cone', centre: [ftToM(x), emberY + height / 2, ftToM(z)], size: [ftToM(FLAME_BASE_FT), height, ftToM(FLAME_BASE_FT)], yaw: 0 })
  }
  return parts
}

/** Three flames in the bowl: x, z and height, feet. */
const FLAMES: readonly (readonly [number, number, number])[] = [
  [0, 0, 1.0],
  [0.35, 0.15, 0.8],
  [-0.3, -0.2, 0.7],
]

interface RingSpec {
  readonly kind: FirepitPartKind
  readonly shape: FirepitShape
  /** Half the size of the ring's centre line (a radius for round, half a side for square), metres. */
  readonly half: number
  /** Radial width of the ring, metres. */
  readonly width: number
  /** Height of its boxes, metres, and the centre height of each. */
  readonly height: number
  readonly y: number
  /** The pit's outer radius, metres: the gap's angle is measured on it. */
  readonly outerR: number
  /** Gap width, metres, on the +z side (0 for no gap). */
  readonly gap: number
  readonly segments?: number
}

/** Boxes round a ring, each turned to follow it, with the +z gap left out. Drops nothing if `half` is not positive. */
function ring(spec: RingSpec): FirepitPart[] {
  if (!(spec.half > 0)) return []
  const N = spec.segments ?? RING_SEGMENTS
  const perimeter = spec.shape === 'round' ? 2 * Math.PI * spec.half : 8 * spec.half
  const length = (perimeter / N) * OVERLAP
  const out: FirepitPart[] = []
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N
    const p = ringPoint(spec.shape, spec.half, t)
    if (inGap(spec, t, p.x, p.z)) continue
    out.push({ kind: spec.kind, form: 'box', centre: [p.x, spec.y, p.z], size: [length, spec.height, spec.width], yaw: Math.atan2(-p.dz, p.dx) })
  }
  return out
}

/** A point at fraction `t` round the ring, with the unit direction its box runs along. */
function ringPoint(shape: FirepitShape, half: number, t: number): { x: number; z: number; dx: number; dz: number } {
  if (shape === 'round') {
    const a = 2 * Math.PI * t
    return { x: half * Math.sin(a), z: half * Math.cos(a), dx: Math.cos(a), dz: -Math.sin(a) }
  }
  // a square, starting at its +z side and running round: the corners in order
  const corners: readonly (readonly [number, number])[] = [
    [half, half],
    [-half, half],
    [-half, -half],
    [half, -half],
  ]
  const s = t * 4
  const k = Math.floor(s) % 4
  const u = s - Math.floor(s)
  const [ax, az] = corners[k]
  const [bx, bz] = corners[(k + 1) % 4]
  const len = Math.hypot(bx - ax, bz - az) || 1
  return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, dx: (bx - ax) / len, dz: (bz - az) / len }
}

/** Whether a segment at fraction `t` (centre x, z) lies in the gap on the +z side. */
function inGap(spec: RingSpec, t: number, x: number, z: number): boolean {
  if (spec.gap <= 0) return false
  // square: the +z side, with x scaled out to the outer radius so every ring cuts the same width
  if (spec.shape === 'square') return z > 0 && (Math.abs(x) * spec.outerR) / spec.half < spec.gap / 2
  // round: the gap's arc, measured on the outer radius, centred on +z
  const a = 2 * Math.PI * t
  const turn = Math.atan2(Math.sin(a), Math.cos(a))
  return Math.abs(turn) * spec.outerR < spec.gap / 2
}

/**
 * The elevation of a fire pit's floor, metres NAVD88: its fixed `standZ` when
 * that is a finite number (e.g. on a deck), else the ground it stands on.
 */
export function firepitBase(params: Readonly<Record<string, unknown>>, groundM: number): number {
  const z = params.standZ
  return typeof z === 'number' && Number.isFinite(z) ? z : groundM
}

/** A range of feet along one axis, low end first. */
type Span = readonly [number, number]

const span = (a: number, b: number): Span => [Math.min(a, b), Math.max(a, b)]

/** A box over feet ranges x, y (up from the floor) and z, as a part in metres. `colour` is set only when given. */
function boxFt(kind: FirepitPartKind, x: Span, y: Span, z: Span, colour?: string): FirepitPart {
  const part: FirepitPart = {
    kind,
    form: 'box',
    centre: [ftToM((x[0] + x[1]) / 2), ftToM((y[0] + y[1]) / 2), ftToM((z[0] + z[1]) / 2)],
    size: [ftToM(x[1] - x[0]), ftToM(y[1] - y[0]), ftToM(z[1] - z[0])],
    yaw: 0,
  }
  return colour === undefined ? part : { ...part, colour }
}

/**
 * The lounge's parts, the floor at the base and the origin at the middle of it.
 * `w` and `d` are the overall width and depth (default 22 and 14 ft), `riser` the
 * rim height, `fireLen` the trough's length (default 0.45 of `w`), `cushionColor`
 * the fabric. Seen from above, +z is the open front, at the bottom of the plan:
 *
 *  - a rim 2 ft wide, up to `riser`, round the back and both ends (none across +z);
 *  - a stone floor filling the inside, at the base;
 *  - couches in a U: the back couch spans between the two end couches, and each
 *    end couch runs from the back rim to the front edge. A couch is a timber base
 *    1.4 ft high, a seat 0.4 ft thick on it, and a backrest against the rim
 *    1.6 ft above the seat. Cushions, when on, cover the seat and backrest;
 *  - a fire trough a third of the way from the back couch to the open front: a
 *    stone plinth 1.3 ft high, a dark channel along its top, and a row of flames
 *    along the channel, centred left to right.
 */
function loungeParts(params: Readonly<Record<string, unknown>>): FirepitPart[] {
  const W = Math.max(LOUNGE_MIN_W_FT, num(params.w, LOUNGE_DEFAULTS.w))
  const D = Math.max(LOUNGE_MIN_D_FT, num(params.d, LOUNGE_DEFAULTS.d))
  const riser = Math.max(MIN_RISER_FT, num(params.riser, LOUNGE_DEFAULTS.riser))
  const cushioned = firepitHasCushion(params)
  const fabric = cushioned ? (typeof params.cushionColor === 'string' ? params.cushionColor : LOUNGE_CUSHION_COLOUR) : undefined
  const innerX = W / 2 - LOUNGE_RIM_FT // inside face of each end rim
  const endIn = innerX - LOUNGE_COUCH_D_FT // inside edge of each end couch's base
  const backZ = -D / 2 + LOUNGE_RIM_FT // inside face of the back rim
  const couchFront = backZ + LOUNGE_COUCH_D_FT // front face of the back couch
  const frontZ = D / 2 // the open front edge
  const seatTop = LOUNGE_BASE_H_FT + LOUNGE_SEAT_T_FT
  const backTop = seatTop + LOUNGE_BACK_H_FT
  const parts: FirepitPart[] = []

  // the raised rim: round the back and both ends, nothing across the front
  parts.push(boxFt('deck', span(-W / 2, W / 2), span(0, riser), span(-D / 2, -D / 2 + LOUNGE_RIM_FT)))
  parts.push(boxFt('deck', span(-W / 2, -innerX), span(0, riser), span(-D / 2, D / 2)))
  parts.push(boxFt('deck', span(innerX, W / 2), span(0, riser), span(-D / 2, D / 2)))

  // the stone floor at the base, filling the inside and running out to the open front
  parts.push(boxFt('stone', span(-innerX, innerX), span(-LOUNGE_FLOOR_FT, 0), span(backZ, frontZ)))

  // the back couch: a base, its seat, and a backrest against the back rim, between the end couches
  parts.push(boxFt('deck', span(-endIn, endIn), span(0, LOUNGE_BASE_H_FT), span(backZ, couchFront)))
  // the seat cushion covers the couch's full depth; the back cushion stands on it against the rim
  parts.push(boxFt(fabric === undefined ? 'deck' : 'cushion', span(-endIn, endIn), span(LOUNGE_BASE_H_FT, seatTop), span(backZ, couchFront), fabric))
  parts.push(boxFt(fabric === undefined ? 'deck' : 'cushion', span(-endIn, endIn), span(seatTop, backTop), span(backZ, backZ + LOUNGE_BACK_T_FT), fabric))

  // the two end couches: each runs from the back rim to the front edge, its backrest on the rim side
  for (const side of [-1, 1] as const) {
    const rim = side * innerX
    const inner = side * endIn
    const back = rim - side * LOUNGE_BACK_T_FT
    parts.push(boxFt('deck', span(rim, inner), span(0, LOUNGE_BASE_H_FT), span(backZ, frontZ)))
    parts.push(boxFt(fabric === undefined ? 'deck' : 'cushion', span(rim, back), span(seatTop, backTop), span(backZ, frontZ), fabric))
    parts.push(boxFt(fabric === undefined ? 'deck' : 'cushion', span(rim, inner), span(LOUNGE_BASE_H_FT, seatTop), span(backZ, frontZ), fabric))
  }

  // the fire trough: a third of the way from the back couch to the open front, centred left to right
  const troughZ = couchFront + (frontZ - couchFront) / 3
  const fireLen = Math.min(Math.max(2, num(params.fireLen, W * 0.45)), 2 * endIn)
  parts.push(boxFt('stone', span(-fireLen / 2, fireLen / 2), span(0, LOUNGE_TROUGH_H_FT), span(troughZ - LOUNGE_TROUGH_D_FT / 2, troughZ + LOUNGE_TROUGH_D_FT / 2)))
  const channelTop = LOUNGE_TROUGH_H_FT + LOUNGE_CHANNEL_H_FT
  parts.push(boxFt('ember', span(-fireLen * 0.45, fireLen * 0.45), span(LOUNGE_TROUGH_H_FT, channelTop), span(troughZ - LOUNGE_CHANNEL_D_FT / 2, troughZ + LOUNGE_CHANNEL_D_FT / 2)))
  // a row of flames along the channel, spread over the middle 80% of the trough
  const flames = Math.max(3, Math.floor(fireLen / 1.2))
  for (let i = 0; i < flames; i++) {
    const t = i / (flames - 1)
    const h = LOUNGE_FLAME_HEIGHTS_FT[i % LOUNGE_FLAME_HEIGHTS_FT.length]
    parts.push({
      kind: 'flame',
      form: 'cone',
      centre: [ftToM(fireLen * (-0.4 + 0.8 * t)), ftToM(channelTop + h / 2), ftToM(troughZ)],
      size: [ftToM(LOUNGE_FLAME_BASE_FT), ftToM(h), ftToM(LOUNGE_FLAME_BASE_FT)],
      yaw: 0,
    })
  }
  return parts
}
