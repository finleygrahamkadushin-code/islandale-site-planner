import { routePoints } from '../../buildings/decks/boardwalk'
import { localToSite, siteFootprint } from '../../buildings/footprint'
import { buildingMasses, deckObjectMass, massBuildingPoly } from '../../buildings/masses'
import { DEFAULT_SETBACKS, type PlanObject } from '../../store/types'
import { shoreBufferLine } from '../buffer'
import type { IsoSegment } from '../contours'
import type { Scheme } from '../schemes'
import type { Site, SitePoint } from '../types'
import { ftToM } from '../units'
import { schemeObjects } from './schemeSummary'

/**
 * A plan-view picture of a scheme (5F) as SVG path data: the parcel, the
 * shoreline buffer at the default setbacks, every wall and wing, the
 * grounds (pads, walks, meadows, ponds) and trees as dots. Metres, north
 * up (SVG y = -n), rounded to 0.1. The view box fits the parcel, grown
 * for anything past it (a piece on the shore). Pure; colours are the card's CSS.
 */

export interface ThumbTree {
  readonly cx: number
  readonly cy: number
  readonly r: number
}

export interface SchemeThumb {
  readonly viewBox: string
  /** The parcel ring, closed. */
  readonly lot: string
  /** The shoreline buffer line, open runs. */
  readonly buffer: string
  /** One closed outline per cabin mass, standalone deck and pool. */
  readonly buildings: readonly string[]
  /** One closed outline per pad, walk, meadow and pond. */
  readonly grounds: readonly string[]
  readonly trees: readonly ThumbTree[]
}

/** Margin round the parcel, metres. */
export const THUMB_MARGIN_M = 3
const GROUND_TYPES: readonly string[] = ['pad', 'meadow', 'pond']
const STANDALONE_TYPES: readonly string[] = ['deck', 'pool', 'shed', 'shop']

const r1 = (v: number): number => Math.round(v * 10) / 10 || 0
const svgX = (x: number): number => r1(x)
const svgY = (n: number): number => r1(-n)
const pt = ([x, n]: SitePoint): string => `${svgX(x)} ${svgY(n)}`

/** A closed SVG path through the ring. */
export function ringPath(ring: readonly SitePoint[]): string {
  return ring.length ? `M${ring.map(pt).join('L')}Z` : ''
}

/** Buffer segments as one path, joining a segment to the last when they meet. */
export function segmentsPath(segs: readonly IsoSegment[]): string {
  return segs
    .map(([x1, n1, x2, n2], i) => {
      const prev = segs[i - 1]
      const joins = !!prev && pt([prev[2], prev[3]]) === pt([x1, n1])
      return `${joins ? '' : `M${pt([x1, n1])}`}L${pt([x2, n2])}`
    })
    .join('')
}

function cabinOutlines(o: PlanObject): readonly (readonly SitePoint[])[] {
  return buildingMasses(o.params).map((m) => massBuildingPoly(m).map((p) => localToSite(o.position, o.rotation, p)))
}

function standaloneOutline(o: PlanObject): readonly SitePoint[] {
  if (o.type !== 'deck') return siteFootprint(o)
  return massBuildingPoly(deckObjectMass(o.params)).map((p) => localToSite(o.position, o.rotation, p))
}

/** A bridge or boardwalk as a ribbon of its width along its route; its footprint when it has no route. */
function ribbonOutline(o: PlanObject): readonly SitePoint[] {
  const route = routePoints(o).map(([x, n]) => [x, n] as const)
  if (route.length < 2) return siteFootprint(o)
  const half = ftToM(typeof o.params.w === 'number' ? o.params.w : 5) / 2
  const normals = route.map((_, i) => normalAt(route, i))
  const left = route.map(([x, n], i) => [x + normals[i][0] * half, n + normals[i][1] * half] as const)
  const right = route.map(([x, n], i) => [x - normals[i][0] * half, n - normals[i][1] * half] as const)
  return [...left, ...[...right].reverse()]
}

function normalAt(route: readonly SitePoint[], i: number): SitePoint {
  const [ax, an] = route[Math.max(0, i - 1)]
  const [bx, bn] = route[Math.min(route.length - 1, i + 1)]
  const len = Math.hypot(bx - ax, bn - an) || 1
  return [-(bn - an) / len, (bx - ax) / len]
}

function treeDot(o: PlanObject): ThumbTree {
  const w = typeof o.params.w === 'number' ? o.params.w : 20
  return { cx: svgX(o.position.x), cy: svgY(o.position.n), r: r1(ftToM(w) / 2) }
}

const isTree = (o: PlanObject): boolean => o.type === 'tree' || o.params.tree === true

/** The parcel's box with a margin, grown to take in anything that reaches past it. */
function fittedViewBox(points: readonly SitePoint[]): string {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, n]) => -n)
  const x0 = Math.floor(Math.min(...xs) - THUMB_MARGIN_M)
  const y0 = Math.floor(Math.min(...ys) - THUMB_MARGIN_M)
  const w = Math.ceil(Math.max(...xs) + THUMB_MARGIN_M) - x0
  const h = Math.ceil(Math.max(...ys) + THUMB_MARGIN_M) - y0
  return `${x0} ${y0} ${w} ${h}`
}

export function schemeThumb(scheme: Scheme, site: Site): SchemeThumb {
  const objects = schemeObjects(scheme).filter((o) => !o.hidden)
  const buildings = [
    ...objects.filter((o) => o.type === 'house').flatMap(cabinOutlines),
    ...objects.filter((o) => STANDALONE_TYPES.includes(o.type)).map(standaloneOutline),
  ]
  const grounds = [
    ...objects.filter((o) => GROUND_TYPES.includes(o.type) && !isTree(o)).map(siteFootprint),
    ...objects.filter((o) => o.type === 'bridge').map(ribbonOutline),
  ]
  const trees = objects.filter(isTree)
  const { shoreFt, bankFt } = DEFAULT_SETBACKS
  return {
    viewBox: fittedViewBox([...site.parcel.ring, ...buildings.flat(), ...grounds.flat(), ...trees.map((o) => [o.position.x, o.position.n] as const)]),
    lot: ringPath(site.parcel.ring),
    buffer: segmentsPath(shoreBufferLine(site.parcel, shoreFt, bankFt)),
    buildings: buildings.map(ringPath),
    grounds: grounds.map(ringPath),
    trees: trees.map(treeDot),
  }
}
