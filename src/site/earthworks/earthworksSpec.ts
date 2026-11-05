import { localToSite, num, type LocalPoint } from '../../buildings/footprint'
import { elevationAt } from '../terrain'
import type { SitePoint, Terrain } from '../types'

/**
 * What each earthworks object asks of the ground, before any raster is
 * built (legacy earthOf, earthEdges, earthSides, pondLevelBase): pure
 * functions of the plan data and the survey.
 */

const FT = 0.3048
/** Legacy isBuilding(): the types that can be set into the slope or bermed. */
const BUILDING_TYPES = new Set(['house', 'shop', 'shed'])

/** Sides by name (back, front, left, right, all, uphill, downhill), edge number, or a list of those. */
export type SideSpec = string | number | readonly (string | number)[]
export type WallMaterial = 'stone' | 'concrete'

/** A building's earthworks (legacy earthOf): lengths in feet, slope as run per unit rise. */
export interface EarthSpec {
  /** Berm crest height above the floor, ft. */
  readonly berm: number
  /** How far the floor is set into the slope, ft. */
  readonly sink: number
  readonly sides: SideSpec
  readonly slope: number
  /** Flat crest width before the berm falls away, ft. */
  readonly crest: number
  /** Level ground kept round the walls of a cut, ft. */
  readonly margin: number
  /** Depth of the sunken court beyond the court sides, ft. */
  readonly court: number
  readonly courtSides: SideSpec
  /** Retaining walls on the cut edges (true) or open banks at the slope (false). */
  readonly walls: boolean
  readonly wallMat: WallMaterial
  /** Fill a bench up to the floor (support 'earth', or 'auto' with earthworks). */
  readonly fill: boolean
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isSides = (v: unknown): v is SideSpec => typeof v === 'string' || typeof v === 'number' || (Array.isArray(v) && v.every((s) => typeof s === 'string' || typeof s === 'number'))

/** Legacy earthOf(o): null unless a house, shop or shed has a berm, a sink or an earth support. */
export function earthSpec(type: string, params: Readonly<Record<string, unknown>>): EarthSpec | null {
  if (!BUILDING_TYPES.has(type)) return null
  const e = isRecord(params.earth) ? params.earth : null
  const support = typeof params.support === 'string' ? params.support : 'auto'
  const sup = support === 'earth'
  if (!e && !sup) return null
  const E = e ?? {}
  const berm = Math.max(0, num(E.berm, 0))
  const sink = Math.max(0, num(E.sink, 0))
  if (!berm && !sink && !sup) return null
  const courtSides = E.courtSides ?? E.courtSide
  return {
    berm,
    sink,
    sides: isSides(E.sides) ? E.sides : 'uphill',
    // legacy `+E.slope || 2`: zero or missing is the default, and never steeper than 0.6:1
    slope: Math.max(0.6, num(E.slope, 0) || 2),
    crest: Math.max(0, num(E.crest, 2)),
    margin: Math.max(0, num(E.margin, sink ? 3 : 0)),
    court: Math.max(0, num(E.court, sink ? 10 : 0)),
    courtSides: isSides(courtSides) ? courtSides : 'downhill',
    walls: E.walls !== false,
    wallMat: E.wallMat === 'concrete' ? 'concrete' : 'stone',
    fill: sup || support === 'auto',
  }
}

/** One wall edge of a building's main mass, as the earthworks see it. */
export interface EarthEdge {
  readonly i: number
  readonly a: SitePoint
  readonly b: SitePoint
  /** Edge midpoint, site metres. */
  readonly m: SitePoint
  /** Outward unit normal in the site frame. */
  readonly nw: SitePoint
  /** The side names it faces in the building's own frame: back, front, left, right. */
  readonly labels: readonly string[]
  /** How much the survey rises 4 m out from the midpoint, metres (negative downhill). */
  readonly rise: number
  /** Edge length, metres. */
  readonly len: number
}

/** Where a building sits: its main mass outline in the building frame (feet), position and rotation. */
export interface MainOutline {
  readonly outline: readonly LocalPoint[]
  readonly position: { readonly x: number; readonly n: number }
  readonly rotation: number
}

/** Legacy earthEdges(o): the main mass's walls with their outward normals, side names and the rise beyond. */
export function earthEdges(t: Terrain, main: MainOutline): EarthEdge[] {
  const L = main.outline
  let twice = 0
  L.forEach((p, i) => {
    const q = L[(i + 1) % L.length]
    twice += p[0] * q[1] - q[0] * p[1]
  })
  const site = (x: number, z: number) => localToSite(main.position, main.rotation, [x, z])
  return L.map((p, i) => {
    const q = L[(i + 1) % L.length]
    const dx = q[0] - p[0]
    const dz = q[1] - p[1]
    const len = Math.hypot(dx, dz) || 1
    const nx = twice > 0 ? dz / len : -dz / len
    const nz = twice > 0 ? -dx / len : dx / len
    const mx = (p[0] + q[0]) / 2
    const mz = (p[1] + q[1]) / 2
    const m = site(mx, mz)
    const m1 = site(mx + nx, mz + nz)
    const wl = Math.hypot(m1[0] - m[0], m1[1] - m[1]) || 1
    const nw: SitePoint = [(m1[0] - m[0]) / wl, (m1[1] - m[1]) / wl]
    const labels = [nz < -0.5 && 'back', nz > 0.5 && 'front', nx > 0.5 && 'right', nx < -0.5 && 'left'].filter((s): s is string => !!s)
    const rise = elevationAt(t, m[0] + nw[0] * 4, m[1] + nw[1] * 4) - elevationAt(t, m[0], m[1])
    return { i, a: site(p[0], p[1]), b: site(q[0], q[1]), m, nw, labels, rise, len: len * FT }
  })
}

/** Uphill walls must rise at least this much over 4 m, and be longer than this, metres (legacy). */
const UPHILL_RISE_M = 0.12
const UPHILL_MIN_LEN_M = 0.5
const DOWNHILL_MIN_LEN_M = 1

/**
 * Legacy earthSides(edges, spec): the edges a berm or court goes against.
 * 'uphill' is every wall the ground rises beyond (or the steepest one),
 * 'downhill' the single wall the ground falls away from most.
 */
export function earthSides(edges: readonly EarthEdge[], spec: SideSpec | null | undefined): EarthEdge[] {
  const list: readonly (string | number)[] = Array.isArray(spec) ? spec : String(spec ?? 'uphill').split(/[+,\s]+/).filter(Boolean)
  const out = new Set<number>()
  for (const raw of list) {
    if (typeof raw === 'number') {
      if (edges[raw]) out.add(raw)
      continue
    }
    const s = raw.toLowerCase()
    if (s === 'all') edges.forEach((e) => out.add(e.i))
    else if (s === 'uphill') {
      const up = edges.filter((e) => e.rise > UPHILL_RISE_M && e.len > UPHILL_MIN_LEN_M)
      const steepest = [...edges].sort((p, q) => q.rise - p.rise)[0]
      ;(up.length ? up : steepest ? [steepest] : []).forEach((e) => out.add(e.i))
    } else if (s === 'downhill') {
      const e = edges.filter((x) => x.len > DOWNHILL_MIN_LEN_M).sort((p, q) => p.rise - q.rise)[0] ?? edges[0]
      if (e) out.add(e.i)
    } else if (/^\d+$/.test(s)) {
      if (edges[+s]) out.add(+s)
    } else edges.forEach((e) => e.labels.includes(s) && out.add(e.i))
  }
  return [...out].map((i) => edges[i])
}

/** Water sits this far under the lowest point of the rim, metres (legacy pondLevelBase). */
export const POND_FREEBOARD_M = 0.06
/** Rim sampling step, metres. */
const RIM_STEP_M = 0.5

/** The lowest ground round a closed outline, sampled every half metre, metres. */
export function rimLow(poly: readonly SitePoint[], ground: (x: number, n: number) => number): number {
  let low = Infinity
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / RIM_STEP_M))
    for (let s = 0; s < k; s++) low = Math.min(low, ground(a[0] + ((b[0] - a[0]) * s) / k, a[1] + ((b[1] - a[1]) * s) / k))
  })
  return low
}

/** Pond water level: the lowest rim point, less the freeboard (legacy pondLevelBase). */
export function pondLevelOf(poly: readonly SitePoint[], ground: (x: number, n: number) => number): number {
  return rimLow(poly, ground) - POND_FREEBOARD_M
}

/** A pond's bowl depth below the water, metres: its height (legacy default 1.5 ft), at least 8 cm. */
export const pondDepthM = (params: Readonly<Record<string, unknown>>): number => Math.max(0.08, num(params.h, 1.5) * FT)

/** Legacy eSS: smoothstep from a to b. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Legacy eSmax: the larger of a and b, rounded over a blend width k. */
export function smoothMax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.max(a, b) + h * h * k * 0.25
}
