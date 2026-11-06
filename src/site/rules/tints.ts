import { Color } from 'three'
import { isShorelineEdge } from '../parcel'
import type { Parcel } from '../types'
import { ftToM } from '../units'
import type { Setbacks } from '../../store/types'
import { closestOnSeg, EAST_BANK_LAST_EDGE, pointInLot, TREE_ZONE_1_FT, TREE_ZONE_2_FT } from './setbacks'

/**
 * Site-rule ground tints (5E, old `colorTerrain`): lot green inside the lot,
 * a darker slope-shaded green outside, then the shoreline buffer, side
 * setback and tree protection zones mixed in. Pure: distances in, linear rgb
 * out (vertex colours are read in the renderer's linear working space).
 */

export const LOT_GREEN = '#a8c98a'
export const OUTSIDE_LOT = '#6f8463'
export const OUTSIDE_STEEP = '#4e6446'
export const SHORE_BAND = '#e0a86c'
export const SIDE_BAND = '#d2bd8c'
export const TREE_ZONE_1 = '#4f8a4a'
export const TREE_ZONE_2 = '#7fb36a'

const BAND_MIX = 0.5
const TREE_1_MIX = 0.45
const TREE_2_MIX = 0.22
const STEEP_GAIN = 1.2

/** Legend rows for the ground tints, in drawing order. */
export const TINT_LEGEND: readonly { readonly label: string; readonly colour: string }[] = [
  { label: 'Inside the lot', colour: LOT_GREEN },
  { label: 'Outside the lot', colour: OUTSIDE_LOT },
  { label: 'Shoreline buffer', colour: SHORE_BAND },
  { label: 'Side and rear setback', colour: SIDE_BAND },
  { label: 'Tree zone 1 (0–35 ft)', colour: TREE_ZONE_1 },
  { label: 'Tree zone 2 (35–110 ft)', colour: TREE_ZONE_2 },
]

/** What the tints need to know about a ground point, metres. */
export interface PointFacts {
  readonly inLot: boolean
  /** Plain distance to the banked east shore (Infinity when there is none). */
  readonly dBank: number
  /** Plain distance to the south-west shore, measured from the water. */
  readonly dShore: number
  /** Distance to the nearest side or rear lot line. */
  readonly dLine: number
}

export type Rgb = readonly [number, number, number]

/** How the tints read: `rules` false gives only lot and outside (the Setbacks layer off). */
export interface TintSettings {
  readonly setbacks: Setbacks
  readonly rules: boolean
}

/** Distances for one point; the bank offset is applied later, so these depend only on the parcel. */
export function pointFacts(parcel: Parcel, x: number, n: number): PointFacts {
  const ring = parcel.ring
  let dBank = Infinity
  let dShore = Infinity
  let dLine = Infinity
  for (let i = 0; i < ring.length; i++) {
    const { d } = closestOnSeg(x, n, ring[i], ring[(i + 1) % ring.length])
    if (!isShorelineEdge(parcel, i)) dLine = Math.min(dLine, d)
    else if (i <= EAST_BANK_LAST_EDGE) dBank = Math.min(dBank, d)
    else dShore = Math.min(dShore, d)
  }
  return { inLot: pointInLot(parcel, x, n), dBank, dShore, dLine }
}

/** Ground colour for one point; `slope` is 1 − the normal's up component. */
export function ruleColour(f: PointFacts, slope: number, s: TintSettings): Rgb {
  if (!f.inLot) return mixRgb(lin(OUTSIDE_LOT), lin(OUTSIDE_STEEP), Math.min(1, slope * STEEP_GAIN))
  if (!s.rules) return lin(LOT_GREEN)
  const sb = s.setbacks
  const past = Math.min(f.dBank - ftToM(sb.bankFt), f.dShore)
  const banded =
    past < ftToM(sb.shoreFt) ? mixRgb(lin(LOT_GREEN), lin(SHORE_BAND), BAND_MIX)
    : f.dLine < ftToM(sb.sideFt) ? mixRgb(lin(LOT_GREEN), lin(SIDE_BAND), BAND_MIX)
    : lin(LOT_GREEN)
  if (!sb.treeZones) return banded
  const water = Math.min(f.dBank, f.dShore)
  if (water < ftToM(TREE_ZONE_1_FT)) return mixRgb(banded, lin(TREE_ZONE_1), TREE_1_MIX)
  if (water < ftToM(TREE_ZONE_2_FT)) return mixRgb(banded, lin(TREE_ZONE_2), TREE_2_MIX)
  return banded
}

const linCache = new Map<string, Rgb>()
/** A '#rrggbb' colour in linear rgb. */
export function lin(hex: string): Rgb {
  const hit = linCache.get(hex)
  if (hit) return hit
  const c = new Color(hex)
  const rgb: Rgb = [c.r, c.g, c.b]
  linCache.set(hex, rgb)
  return rgb
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
