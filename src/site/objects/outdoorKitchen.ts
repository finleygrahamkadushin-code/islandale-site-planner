import { num } from '../../buildings/footprint'
import { ftToM } from '../units'
import { seededRandom } from './treeShapes'

/**
 * An outdoor kitchen built into rock (new in this app, not in the old
 * planner), for the roof deck: a run of stone carved out of a rock outcrop,
 * a thick stone countertop with a sink and a stainless grill set into it,
 * and two dark storage openings in the front. Pure: the params (feet, as the
 * rest of the plan) in, boxes out, in the kitchen's own frame in metres
 * (origin at the middle of its ground footprint, x along its length, y up
 * from its feet, z the front, toward the bay at rotation 0).
 *
 * `shape` 'L' adds a return leg of `ret` feet at the +x end, running toward
 * +z. The stone is seeded from the params, so it never changes between
 * renders.
 *
 * `standZ` (metres NAVD88, optional) is the elevation of the kitchen's feet.
 * When it is a finite number the kitchen stands there, e.g. on a roof deck;
 * else it sits on the ground at its centre like the other site objects.
 */

/** The library's outdoor kitchen: a 12 ft straight run, 2.5 ft deep, 3 ft to the top. */
export const OUTDOOR_KITCHEN_DEFAULTS = { w: 12, d: 2.5, h: 3, shape: 'straight', ret: 6 } as const

/** Smallest sizes the geometry is built to, feet (a kitchen smaller than this is drawn at these). */
const MIN_LENGTH_FT = 4
const MIN_DEPTH_FT = 1.5
const MIN_HEIGHT_FT = 2
const MIN_RETURN_FT = 2

/** The countertop slab: 6 in thick, overhanging the front (local +z) by 1.5 in, metres. */
export const TOP_T = ftToM(0.5)
export const OVERHANG = ftToM(1.5 / 12)
/** How far the boulder-like end blocks bulge past the ends of the run, metres. */
export const BULGE = 0.3
/** The sink and grill openings: width in feet, depth front to back in feet (at most half the counter's depth), and how deep the basin and grill sit, metres. */
const SINK_W_FT = 1.5
const OPEN_D_FT = 1.25
const BASIN_M = 0.12
/** The tap's post stands this high above the top, metres. */
const TAP_RISE = 0.25
/** Storage openings on the front: width and height, metres, and their height above the ground. */
const RECESS_W = 0.6
const RECESS_H = 0.4
const RECESS_Y = 0.2

const EPS = 1e-9

export type OutdoorKitchenPartKind = 'stone' | 'boulder' | 'counter' | 'basin' | 'steel' | 'tap' | 'recess'

/** One box of the kitchen: its centre and size in the kitchen's frame, metres. */
export interface OutdoorKitchenPart {
  readonly kind: OutdoorKitchenPartKind
  readonly centre: [number, number, number]
  readonly size: [number, number, number]
}

interface Rect {
  readonly x0: number
  readonly x1: number
  readonly z0: number
  readonly z1: number
}

interface Box {
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
  readonly z0: number
  readonly z1: number
}

/** The elevation of a kitchen's feet, metres NAVD88: its fixed `standZ` when finite (a roof deck), else the ground. */
export function outdoorKitchenBase(params: Readonly<Record<string, unknown>>, groundM: number): number {
  const z = params.standZ
  return typeof z === 'number' && Number.isFinite(z) ? z : groundM
}

/** Whether the kitchen's shape is the L (a return leg at the +x end); anything else is straight. */
export function outdoorKitchenIsL(params: Readonly<Record<string, unknown>>): boolean {
  return params.shape === 'L'
}

/**
 * The boxes of one outdoor kitchen: the stone body in blocks (two courses
 * for each stretch of the run, with the boulder-like blocks at the ends),
 * the countertop with its sink and grill openings cut out, the sink's
 * basin and tap, the grill's body and lid, and two storage openings in the
 * front.
 */
export function outdoorKitchenParts(params: Readonly<Record<string, unknown>>): OutdoorKitchenPart[] {
  const wFt = Math.max(MIN_LENGTH_FT, num(params.w, OUTDOOR_KITCHEN_DEFAULTS.w))
  const dFt = Math.max(MIN_DEPTH_FT, num(params.d, OUTDOOR_KITCHEN_DEFAULTS.d))
  const hFt = Math.max(MIN_HEIGHT_FT, num(params.h, OUTDOOR_KITCHEN_DEFAULTS.h))
  const isL = outdoorKitchenIsL(params)
  const retFt = isL ? Math.max(MIN_RETURN_FT, num(params.ret, OUTDOOR_KITCHEN_DEFAULTS.ret)) : 0

  const L = ftToM(wFt)
  const D = ftToM(dFt)
  const H = ftToM(hFt)
  const R = ftToM(retFt)
  const hx = L / 2
  const hz = D / 2
  const hb = H - TOP_T // the stone body's top, under the countertop
  const rnd = seededRandom(paramSeed([wFt, dFt, hFt, retFt, isL ? 1 : 0]))
  const parts: OutdoorKitchenPart[] = []

  // the stone body: the main run, and the return leg on the L
  const mainX1 = isL ? hx - D : hx
  parts.push(...stoneRun(rnd, { lo: -hx, hi: mainX1 }, { lo: -hz, hi: hz }, 'x', 3, hb))
  if (isL) parts.push(...stoneRun(rnd, { lo: -hz, hi: -hz + R }, { lo: hx - D, hi: hx }, 'z', 2, hb))

  // boulder-like blocks bulging out past the outer ends
  const jitterZ = (k: number) => (rnd() - 0.5) * k
  parts.push(cbox('boulder', -hx + 0.1, hb * 0.48, jitterZ(0.1 * D), 0.8, hb * 0.96, D * 1.1))
  if (isL) parts.push(cbox('boulder', hx - D / 2, hb * 0.48, -hz + R - 0.1, D * 1.1, hb * 0.96, 0.8))
  else parts.push(cbox('boulder', hx - 0.1, hb * 0.48, jitterZ(0.1 * D), 0.8, hb * 0.96, D * 1.1))

  // the countertop, with the sink and grill cut out of the main run's top
  const sinkW = Math.min(ftToM(SINK_W_FT), L / 4)
  const grillW = sinkW
  const openD = Math.min(ftToM(OPEN_D_FT), D * 0.5)
  const sinkX = -L / 6 // a third of the way along from the west end
  const grillX = L / 6 // a third of the way along from the east end
  const sink = rect(sinkX, sinkW, openD)
  const grill = rect(grillX, grillW, openD)
  parts.push(...slabParts('counter', { x0: -hx, x1: mainX1, z0: -hz, z1: hz + OVERHANG }, hb, H, [sink, grill]))
  if (isL) parts.push(...slabParts('counter', { x0: hx - D, x1: hx, z0: -hz, z1: -hz + R + OVERHANG }, hb, H, []))

  // sink: a steel basin floor down in the opening, and a tap at its back
  parts.push(cbox('basin', sinkX, H - BASIN_M - 0.01, 0, sinkW, 0.02, openD))
  const tapZ = -hz + 0.08
  parts.push(cbox('tap', sinkX, H + TAP_RISE / 2, tapZ, 0.04, TAP_RISE, 0.04))
  parts.push(cbox('tap', sinkX, H + TAP_RISE - 0.02, tapZ + 0.08, 0.04, 0.04, 0.16))

  // grill: a steel body in its opening, with a lid flush with the top
  parts.push(cbox('steel', grillX, H - 0.06, 0, grillW, 0.1, openD))
  parts.push(cbox('steel', grillX, H, 0, grillW, 0.02, openD))

  // two storage openings in the front of the run, dark and inset into the face
  for (const x of [-L / 3, 0]) parts.push(cbox('recess', x, RECESS_Y + RECESS_H / 2, hz, RECESS_W, RECESS_H, 0.02))
  return parts
}

/** A rectangle centred on x = `x` and z = 0, `w` wide and `d` deep. */
function rect(x: number, w: number, d: number): Rect {
  return { x0: x - w / 2, x1: x + w / 2, z0: -d / 2, z1: d / 2 }
}

/** A box centred on (x, y, z) with its size, dropped if it is empty. */
function cbox(kind: OutdoorKitchenPartKind, x: number, y: number, z: number, sx: number, sy: number, sz: number): OutdoorKitchenPart {
  return { kind, centre: [x, y, z], size: [sx, sy, sz] }
}

/** A box from its corners, or null when it has no volume. */
function boxPart(kind: OutdoorKitchenPartKind, b: Box): OutdoorKitchenPart | null {
  const sx = b.x1 - b.x0
  const sy = b.y1 - b.y0
  const sz = b.z1 - b.z0
  if (sx <= EPS || sy <= EPS || sz <= EPS) return null
  return { kind, centre: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2], size: [sx, sy, sz] }
}

/**
 * A slab over `slab` from y0 to y1, with the `holes` (inside the slab) left
 * open: the slab is cut into a grid by the slab's and the holes' edges, and
 * every cell that is not in a hole is a box.
 */
function slabParts(kind: OutdoorKitchenPartKind, slab: Rect, y0: number, y1: number, holes: readonly Rect[]): OutdoorKitchenPart[] {
  const xs = edges(slab.x0, slab.x1, holes.flatMap((h) => [h.x0, h.x1]))
  const zs = edges(slab.z0, slab.z1, holes.flatMap((h) => [h.z0, h.z1]))
  const out: OutdoorKitchenPart[] = []
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2
      const cz = (zs[j] + zs[j + 1]) / 2
      if (holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)) continue
      const p = boxPart(kind, { x0: xs[i], x1: xs[i + 1], y0, y1, z0: zs[j], z1: zs[j + 1] })
      if (p) out.push(p)
    }
  }
  return out
}

/** The sorted, unique edges of [lo, hi] and the given cut points that fall inside it. */
function edges(lo: number, hi: number, cuts: readonly number[]): number[] {
  const inside = cuts.filter((c) => c > lo + EPS && c < hi - EPS)
  return [...new Set([lo, hi, ...inside])].sort((a, b) => a - b)
}

/**
 * One stretch of stone body: `segs` blocks along the run (their joints
 * nudged a little), each in two courses, with its back face set a little
 * in from `lo` and its front face on `hi`. `axis` is the run's long way:
 * 'x' along the main run, 'z' along the return leg.
 */
function stoneRun(
  rnd: () => number,
  along: { readonly lo: number; readonly hi: number },
  across: { readonly lo: number; readonly hi: number },
  axis: 'x' | 'z',
  segs: number,
  hb: number,
): OutdoorKitchenPart[] {
  const len = along.hi - along.lo
  const joints = [along.lo]
  for (let i = 1; i < segs; i++) joints.push(along.lo + (len * i) / segs + (rnd() - 0.5) * (0.06 * len) / segs)
  joints.push(along.hi)
  const out: OutdoorKitchenPart[] = []
  for (let i = 0; i < segs; i++) {
    const a0 = joints[i]
    const a1 = joints[i + 1]
    const back = across.lo + rnd() * 0.05 * (across.hi - across.lo)
    const course = hb * (0.42 + 0.16 * rnd())
    for (const [y0, y1] of [[0, course], [course, hb]] as const) {
      const b: Box = axis === 'x'
        ? { x0: a0, x1: a1, y0, y1, z0: back, z1: across.hi }
        : { x0: back, x1: across.hi, y0, y1, z0: a0, z1: a1 }
      const p = boxPart('stone', b)
      if (p) out.push(p)
    }
  }
  return out
}

/** A seed from the shape's own sizes, so the same params always give the same stone. */
function paramSeed(values: readonly number[]): number {
  let h = 2166136261
  for (const v of values) h = Math.imul(h ^ Math.round(v * 1000), 16777619)
  return (h >>> 0) || 1
}
