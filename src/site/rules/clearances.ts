import { localToSite, num, siteFootprint, type LocalPoint } from '../../buildings/footprint'
import { massToBuilding } from '../../buildings/masses'
import { formatFeetInches } from '../../ui/feetInches'
import type { Site, SitePoint } from '../types'
import { FT_PER_M, ftToM } from '../units'
import { layerOf, type Layers, type Plan, type PlanObject, type Setbacks } from '../../store/types'
import { polyDistance, type Poly } from './polyGeom'
import { outlineInLot, outlineLotLine, outlineShore } from './outlineDistance'

export { polyDistance, segDistance } from './polyGeom'
import { hasMasses, ruleMasses, ruleOutline } from './ruleOutline'

/**
 * Clearances for one selected object (5E, old `refreshSel`, `rebuildClearance`
 * and `drawLabels`): how far its rule outline is from the shore, the nearest
 * side or rear lot line and the nearest other object, and the lengths of its
 * box edges. Pure: plan, site and setbacks in, metres out (site frame).
 * Measured from the rule outline's walls, edge to edge, not the old
 * bounding-box corners, so a clearance and its code-check row agree.
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
  /** Some of the outline is outside the lot, or a wall crosses the lot line. */
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

export function clearances(o: PlanObject, plan: Plan, site: Site, setbacks: Setbacks, layers?: Layers): Clearances {
  const outline = ruleOutline(o, site.terrain)
  return {
    shore: shoreClearance(outline, site, setbacks),
    lot: lotClearance(outline, site, setbacks),
    nearest: nearestObject(o, outline, plan, layers),
    dimensions: dimensionLabels(o),
  }
}

/** Measured wall to shore (R2.3), not corner to shore, so a wall closer than its corners counts. */
function shoreClearance(outline: readonly Poly[], site: Site, setbacks: Setbacks): ShoreClearance | null {
  const hit = outlineShore(site.parcel, outline, setbacks.bankFt)
  if (!hit) return null
  return { d: hit.d, past: hit.past, banked: hit.banked, from: hit.from, to: hit.to, insideBuffer: hit.past < ftToM(setbacks.shoreFt) }
}

function lotClearance(outline: readonly Poly[], site: Site, setbacks: Setbacks): LotClearance | null {
  const hit = outlineLotLine(site.parcel, outline)
  if (!hit) return null
  return { ...hit, insideSetback: hit.d < ftToM(setbacks.sideFt), crossesLot: !outlineInLot(site.parcel, outline) }
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

/** The four edges of the box to label: a cabin's main mass, anything else its footprint box. */
export function dimensionLabels(o: PlanObject): readonly DimensionLabel[] {
  const main = hasMasses(o) ? ruleMasses(o)[0] : null
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
