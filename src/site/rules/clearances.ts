import { localToSite, num, siteFootprint, type LocalPoint } from '../../buildings/footprint'
import { buildingMasses, massToBuilding } from '../../buildings/masses'
import { pointInPolygon } from '../../buildings/foundation/foundation'
import { formatFeetInches } from '../../ui/feetInches'
import type { Site, SitePoint } from '../types'
import { FT_PER_M, ftToM } from '../units'
import { layerOf, type Layers, type Plan, type PlanObject, type Setbacks } from '../../store/types'
import { closestOnSeg, nearestLotLine, nearestShore, pointInLot } from './setbacks'
import { isRuleBuilding, ruleOutline } from './ruleOutline'

/**
 * Clearances for one selected object (5E, old `refreshSel`, `rebuildClearance`
 * and `drawLabels`): how far its rule outline is from the shore, the nearest
 * side or rear lot line and the nearest other object, and the lengths of its
 * box edges. Pure: plan, site and setbacks in, metres out (site frame).
 * Measured from the rule outline, not the old bounding-box corners, so a
 * clearance and its code-check row agree.
 */

export interface ShoreClearance {
  /** Plain distance to the water, metres. */
  readonly d: number
  /** Distance past the top of bank on the banked east shore (d otherwise), metres; negative when over it. */
  readonly past: number
  readonly banked: boolean
  readonly from: SitePoint
  readonly to: SitePoint
  readonly insideBuffer: boolean
}

export interface LotClearance {
  readonly d: number
  readonly from: SitePoint
  readonly to: SitePoint
  readonly insideSetback: boolean
  /** Some outline point is outside the lot. */
  readonly crossesLot: boolean
}

export interface ObjectClearance {
  readonly d: number
  readonly from: SitePoint
  readonly to: SitePoint
  readonly otherId: string
  readonly otherName: string
}

export interface DimensionLabel {
  /** Edge midpoint, site metres. */
  readonly at: SitePoint
  /** Edge length, metres. */
  readonly lengthM: number
}

export interface Clearances {
  readonly shore: ShoreClearance | null
  readonly lot: LotClearance | null
  readonly nearest: ObjectClearance | null
  readonly dimensions: readonly DimensionLabel[]
}

type Poly = readonly SitePoint[]

export function clearances(o: PlanObject, plan: Plan, site: Site, setbacks: Setbacks, layers?: Layers): Clearances {
  const outline = ruleOutline(o, site.terrain)
  const points = outline.flat()
  return {
    shore: shoreClearance(points, site, setbacks),
    lot: lotClearance(points, site, setbacks),
    nearest: nearestObject(o, outline, plan, layers),
    dimensions: dimensionLabels(o),
  }
}

function shoreClearance(points: Poly, site: Site, setbacks: Setbacks): ShoreClearance | null {
  let best: ShoreClearance | null = null
  for (const [x, n] of points) {
    const hit = nearestShore(site.parcel, x, n, setbacks.bankFt)
    if (!hit || (best && hit.past >= best.past)) continue
    best = { d: hit.d, past: hit.past, banked: hit.banked, from: [x, n], to: hit.at, insideBuffer: hit.past < ftToM(setbacks.shoreFt) }
  }
  return best
}

function lotClearance(points: Poly, site: Site, setbacks: Setbacks): LotClearance | null {
  const crossesLot = points.some(([x, n]) => !pointInLot(site.parcel, x, n))
  let best: { d: number; from: SitePoint; to: SitePoint } | null = null
  for (const [x, n] of points) {
    const hit = nearestLotLine(site.parcel, x, n)
    if (hit && (!best || hit.d < best.d)) best = { d: hit.d, from: [x, n], to: hit.at }
  }
  return best && { ...best, insideSetback: best.d < ftToM(setbacks.sideFt), crossesLot }
}

const visible = (o: PlanObject, layers?: Layers): boolean => !o.hidden && (!layers || layers[layerOf(o)].visible)

/** Lanes, walks, boardwalks, patios and meadows: a cabin meets its own walk by design, so these aren't clearances. */
const GROUND_TYPES = new Set(['pad', 'meadow', 'bridge'])

function nearestObject(o: PlanObject, outline: readonly Poly[], plan: Plan, layers?: Layers): ObjectClearance | null {
  let best: ObjectClearance | null = null
  for (const id of plan.order) {
    const other = plan.objects[id]
    if (!other || other.id === o.id || !visible(other, layers) || GROUND_TYPES.has(other.type)) continue
    const footprint = siteFootprint(other)
    for (const poly of outline) {
      const hit = polyDistance(poly, footprint)
      if (!best || hit.d < best.d) best = { ...hit, otherId: other.id, otherName: other.name }
    }
  }
  return best
}

/** Shortest distance between two polygons' edges; 0 where they cross or one sits inside the other. */
export function polyDistance(a: Poly, b: Poly): { d: number; from: SitePoint; to: SitePoint } {
  const inside = a.find(([x, n]) => pointInPolygon(b, x, n)) ?? b.find(([x, n]) => pointInPolygon(a, x, n))
  if (inside) return { d: 0, from: inside, to: inside }
  let best = { d: Infinity, from: a[0], to: b[0] }
  forEdges(a, (a0, a1) =>
    forEdges(b, (b0, b1) => {
      const hit = segDistance(a0, a1, b0, b1)
      if (hit.d < best.d) best = hit
    }),
  )
  return best
}

/** Shortest distance between segments a0–a1 and b0–b1, with the nearest point on each. */
export function segDistance(a0: SitePoint, a1: SitePoint, b0: SitePoint, b1: SitePoint): { d: number; from: SitePoint; to: SitePoint } {
  const cross = crossing(a0, a1, b0, b1)
  if (cross) return { d: 0, from: cross, to: cross }
  const onB0 = closestOnSeg(a0[0], a0[1], b0, b1)
  const onB1 = closestOnSeg(a1[0], a1[1], b0, b1)
  const onA0 = closestOnSeg(b0[0], b0[1], a0, a1)
  const onA1 = closestOnSeg(b1[0], b1[1], a0, a1)
  const options = [
    { d: onB0.d, from: a0, to: onB0.at },
    { d: onB1.d, from: a1, to: onB1.at },
    { d: onA0.d, from: onA0.at, to: b0 },
    { d: onA1.d, from: onA1.at, to: b1 },
  ]
  return options.reduce((m, c) => (c.d < m.d ? c : m))
}

function crossing(a0: SitePoint, a1: SitePoint, b0: SitePoint, b1: SitePoint): SitePoint | null {
  const rx = a1[0] - a0[0]
  const rn = a1[1] - a0[1]
  const sx = b1[0] - b0[0]
  const sn = b1[1] - b0[1]
  const den = rx * sn - rn * sx
  if (Math.abs(den) < 1e-12) return null
  const qx = b0[0] - a0[0]
  const qn = b0[1] - a0[1]
  const t = (qx * sn - qn * sx) / den
  const u = (qx * rn - qn * rx) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return [a0[0] + t * rx, a0[1] + t * rn]
}

function forEdges(poly: Poly, f: (p: SitePoint, q: SitePoint) => void): void {
  for (let i = 0; i < poly.length; i++) f(poly[i], poly[(i + 1) % poly.length])
}

/** The four edges of the box to label: a cabin's main mass, anything else its footprint box. */
export function dimensionLabels(o: PlanObject): readonly DimensionLabel[] {
  const main = isRuleBuilding(o) ? buildingMasses(o.params)[0] : null
  const w = main ? main.w : num(o.params.w, 10)
  const d = main ? main.d : num(o.params.d, 10)
  const toBuilding = (p: LocalPoint): LocalPoint => (main ? massToBuilding(main, p) : p)
  const corners = ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const).map((p) =>
    localToSite(o.position, o.rotation, toBuilding(p)),
  )
  return corners.map((p, i) => {
    const q = corners[(i + 1) % corners.length]
    return { at: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as SitePoint, lengthM: ftToM(i % 2 === 0 ? w : d) }
  })
}

// --- text: feet and inches, as the old planner's selection rows read ----------

/** Metres as 32'-6" (the inspector's feet-and-inches formatter, with the builder's dash). */
export const ftIn = (m: number): string => formatFeetInches(m * FT_PER_M).replace("' ", "'-")

export function shoreText(c: ShoreClearance, setbacks: Setbacks): string {
  const bank = c.banked && setbacks.bankFt > 0 ? ` · ${ftIn(c.past)} past bank` : ''
  return `${ftIn(c.d)} to shore${bank}${c.insideBuffer ? ' · inside buffer' : ''}`
}

export function lotText(c: LotClearance): string {
  if (c.crossesLot) return 'crosses the lot line'
  return `${ftIn(c.d)} to lot line${c.insideSetback ? ' · inside setback' : ''}`
}

export const nearestText = (c: ObjectClearance): string => `${ftIn(c.d)} to ${c.otherName}`

export const dimensionText = (l: DimensionLabel): string => ftIn(l.lengthM)
