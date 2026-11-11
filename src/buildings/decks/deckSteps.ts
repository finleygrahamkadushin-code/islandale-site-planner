import type { LocalPoint } from '../footprint'
import type { DeckSteps } from '../masses'
import { RISER_MAX_M, TREAD_MIN_M } from '../stairs/stairs'
import { M_PER_FT as FT } from '../../site/units'

/**
 * The planner's one stair rule (stairs/stairs.ts): risers of 7 in or less,
 * treads of 11 in or more. Deliberate change: the legacy STEP_RISE_M /
 * STEP_TREAD_M were 0.195 m (7.68 in) and 0.28 m, cited as IRC R311.7.5,
 * whose minimum tread is 10 in.
 */
export const STEP_RISE_M = RISER_MAX_M
const STEP_TREAD_FT = TREAD_MIN_M / FT
/** A flight never draws more risers than this; past it the rise grows and the plan says so (ok false). */
const MAX_RISERS = 30
/** Planting well kept clear round a trunk the steps flow around, legacy TREE_WELL_M. */
export const TREE_WELL_FT = 1.2 / FT
/** How finely a tread band is cut where it meets a tree well, feet (legacy 0.12 m). */
const WELL_CUT_FT = 0.12 / FT

export interface TreeWell {
  readonly x: number
  readonly z: number
  readonly r: number
}

export interface StepBand {
  /** Tread top, metres relative to the deck floor (negative: below it). */
  readonly top: number
  /** The tread's outline pieces, feet (more than one where a tree well parts it). */
  readonly pieces: readonly LocalPoint[][]
}

export interface DeckStepsPlan {
  readonly chain: readonly LocalPoint[]
  readonly risers: number
  /** Riser height, metres. */
  readonly rise: number
  /** Tread depth, feet. */
  readonly tread: number
  /** The risers meet the 7 in rule; false only when the flight is capped at 30 risers and the rise grew past it. */
  readonly ok: boolean
  readonly bands: readonly StepBand[]
  /** Wells the flight meets, with the highest tread top each one touches (metres, floor-relative). */
  readonly wells: readonly { readonly well: TreeWell; readonly top: number }[]
}

/** The deck edges that carry steps: vertices e0 to e1 + 1 of the outline (legacy deckStepChain). */
export function deckStepChain(poly: readonly LocalPoint[], s: DeckSteps): LocalPoint[] | null {
  const n = poly.length
  const e0 = Math.max(0, s.e0)
  const e1 = Math.min(n - 1, s.e1)
  if (e1 < e0) return null
  const chain: LocalPoint[] = []
  for (let i = e0; i <= e1 + 1; i++) chain.push(poly[i % n])
  return chain
}

/** An open chain offset outward by k (outline counter-clockwise: outward is right of travel), mitred (legacy chainOffset). */
export function chainOffset(chain: readonly LocalPoint[], k: number): LocalPoint[] {
  const normals: [number, number][] = []
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = chain[i]
    const b = chain[i + 1]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    normals.push([(b[1] - a[1]) / l, -(b[0] - a[0]) / l])
  }
  return chain.map((p, i) => {
    const a = normals[Math.max(0, i - 1)]
    const b = normals[Math.min(normals.length - 1, i)]
    let x = a[0] + b[0]
    let z = a[1] + b[1]
    const l = Math.hypot(x, z) || 1
    x /= l
    z /= l
    const c = Math.max(0.5, x * b[0] + z * b[1])
    return [p[0] + (x * k) / c, p[1] + (z * k) / c] as const
  })
}

/**
 * Sitting steps down a deck edge (legacy deckStepsInfo + deckStepsMesh):
 * each tread follows the edge one more tread out, the riser count comes
 * from the ground under the middle of the flight, and treads part round
 * tree wells. `groundAt` gives the ground in metres relative to the deck floor.
 */
export function deckStepsPlan(poly: readonly LocalPoint[], s: DeckSteps, groundAt: (x: number, z: number) => number, wells: readonly TreeWell[]): DeckStepsPlan | null {
  const chain = deckStepChain(poly, s)
  if (!chain || chain.length < 2) return null
  const tread = Math.max(STEP_TREAD_FT, s.tread)
  const midAt = (k: number) => {
    const q = chainOffset(chain, k)
    const j = Math.floor((q.length - 1) / 2)
    const a = q[j]
    const b = q[Math.min(q.length - 1, j + 1)]
    return groundAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
  }
  let risers = Math.max(1, Math.ceil(-midAt(0) / STEP_RISE_M - 1e-9))
  for (let it = 0; it < 3; it++) risers = Math.max(1, Math.min(MAX_RISERS, Math.ceil(-midAt((risers - 0.5) * tread) / STEP_RISE_M - 1e-9)))
  const rise = Math.max(STEP_RISE_M, -midAt((risers - 0.5) * tread)) / risers
  const bands: StepBand[] = []
  const met: { well: TreeWell; top: number }[] = []
  for (let k = 1; k < risers; k++) {
    const inner = chainOffset(chain, (k - 1) * tread)
    const outer = chainOffset(chain, k * tread)
    const top = -k * rise
    bands.push({ top, pieces: bandPieces(inner, outer, wells) })
    for (const w of wells) {
      if ([...inner, ...outer].some((p) => Math.hypot(p[0] - w.x, p[1] - w.z) < w.r + tread)) {
        const seen = met.find((m) => m.well === w)
        if (!seen) met.push({ well: w, top })
      }
    }
  }
  return { chain, risers, rise, tread, ok: rise <= STEP_RISE_M + 1e-9, bands, wells: met }
}

/** One tread band (inner chain A, outer chain B) as outlines, with tree wells cut out (legacy stepBandPieces). */
function bandPieces(a: readonly LocalPoint[], b: readonly LocalPoint[], wells: readonly TreeWell[]): LocalPoint[][] {
  if (!wells.length) return [[...a, ...[...b].reverse()]]
  const lerp = (p: LocalPoint, q: LocalPoint, f: number): LocalPoint => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]
  const quads: LocalPoint[][] = []
  for (let i = 0; i + 1 < a.length; i++) {
    const k = Math.max(1, Math.ceil(Math.hypot(a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]) / WELL_CUT_FT))
    for (let j = 0; j < k; j++) {
      const f0 = j / k
      const f1 = (j + 1) / k
      quads.push([lerp(a[i], a[i + 1], f0), lerp(a[i], a[i + 1], f1), lerp(b[i], b[i + 1], f1), lerp(b[i], b[i + 1], f0)])
    }
  }
  const inWell = (q: LocalPoint[]) => {
    const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4
    const cz = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4
    return wells.some((w) => Math.hypot(cx - w.x, cz - w.z) < w.r)
  }
  const out: LocalPoint[][] = []
  let run: LocalPoint[][] = []
  const flush = () => {
    if (run.length) out.push([...run.map((q) => q[0]), run[run.length - 1][1], run[run.length - 1][2], ...[...run].reverse().map((q) => q[3])])
    run = []
  }
  for (const q of quads) {
    if (inWell(q)) flush()
    else run.push(q)
  }
  flush()
  return out
}
