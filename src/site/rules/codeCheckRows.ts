import { localToSite, siteFootprint } from '../../buildings/footprint'
import { buildingMasses, massBuildingPoly } from '../../buildings/masses'
import { baseElevation } from '../../scene/placement'
import { elevationAt } from '../terrain'
import type { SitePoint } from '../types'
import { ftToM } from '../units'
import type { PlanObject } from '../../store/types'
import { named, type CheckContext, type CodeRow, type NamedObject } from './codeCheckTypes'
import { buildingHeight, HEIGHT_LIMIT_FT } from './height'
import { lotWidthCheck } from './lotWidth'
import { isRuleBuilding, RULE_DECK_DROP_M, ruleOutline, rulePoints } from './ruleOutline'
import { nearestShore, TREE_ZONE_1_FT } from './setbacks'

/** The site rows of the code check: shoreline buffer, decks in it, lot width, height and tree zone 1. */

/** Things that are not "built" for tree zone 1. */
const UNBUILT_TYPES = new Set(['pad', 'tree', 'meadow', 'boulder'])

const ft0 = (ft: number) => `${Math.round(ft)} ft`
const ft1 = (ft: number) => `${ft.toFixed(1)} ft`
const list = (names: readonly NamedObject[]) => names.map((n) => n.name).join(', ')
const buildings = (c: CheckContext) => c.objects.filter(isRuleBuilding)

/** Whether any point is inside the shoreline buffer (closer than the setback past the top of bank). */
function inBuffer(c: CheckContext, pts: readonly SitePoint[]): boolean {
  const limit = ftToM(c.setbacks.shoreFt)
  return pts.some(([x, n]) => {
    const hit = nearestShore(c.parcel, x, n, c.setbacks.bankFt)
    return !!hit && hit.past < limit
  })
}

export function shoreRow(c: CheckContext): CodeRow {
  const inside = buildings(c).filter((o) => inBuffer(c, rulePoints(o, c.terrain))).map((o) => named(o))
  const label = 'Shoreline setback'
  if (!inside.length) return { id: 'shore', label, text: 'all buildings clear', verdict: 'pass', names: [] }
  return { id: 'shore', label, text: `inside the ${ft0(c.setbacks.shoreFt)} buffer: ${list(inside)}`, verdict: 'fail', names: inside }
}

/** A standalone deck's top above the lowest ground under it, metres. */
function deckRiseM(c: CheckContext, o: PlanObject): number {
  const low = Math.min(...siteFootprint(o).map(([x, n]) => elevationAt(c.terrain, x, n)))
  return baseElevation(c.terrain, o) - low
}

export function decksInBufferRow(c: CheckContext): CodeRow {
  const high = c.objects.filter((o) => o.type === 'deck' && deckRiseM(c, o) > RULE_DECK_DROP_M)
  const inside = high.filter((o) => inBuffer(c, siteFootprint(o))).map((o) => named(o))
  const label = 'Decks over 30 in in buffer'
  if (!inside.length) return { id: 'decks', label, text: 'none', verdict: 'pass', names: [] }
  return { id: 'decks', label, text: list(inside), verdict: 'fail', names: inside }
}

export function lotWidthRow(c: CheckContext): CodeRow {
  const label = 'Lot-width rule'
  const lw = lotWidthCheck(c.parcel, buildings(c).flatMap((o) => ruleOutline(o, c.terrain)))
  if (!lw) return { id: 'lot-width', label, text: 'no buildings yet', verdict: 'note', names: [] }
  const text = `${ft0(lw.usedFt)} of ${ft0(lw.allowedFt)} allowed (lot ${ft0(lw.lotFt)} wide there)`
  return { id: 'lot-width', label, text, verdict: lw.ok ? 'pass' : 'fail', names: [] }
}

export function heightRow(c: CheckContext): CodeRow {
  const label = 'Height ≤ 35 ft'
  const heights = buildings(c).map((o) => ({ o, ft: buildingHeight(o, c.terrain).ft }))
  if (!heights.length) return { id: 'height', label, text: 'no buildings yet', verdict: 'note', names: [] }
  const over = heights.filter((h) => h.ft > HEIGHT_LIMIT_FT)
  if (over.length) {
    const names = over.map((h) => named(h.o))
    return { id: 'height', label, text: over.map((h) => `${h.o.name} ${ft1(h.ft)}`).join(', '), verdict: 'fail', names }
  }
  const top = heights.reduce((a, b) => (b.ft > a.ft ? b : a))
  return { id: 'height', label, text: `tallest ${ft1(top.ft)} (${top.o.name})`, verdict: 'pass', names: [named(top.o)] }
}

/** Everything an object covers on the ground, site metres: every mass of a building, stairs included. */
function builtPoints(o: PlanObject): readonly SitePoint[] {
  if (o.type !== 'house') return siteFootprint(o)
  return buildingMasses(o.params).flatMap((m) => massBuildingPoly(m).map((p) => localToSite(o.position, o.rotation, p)))
}

const isBuilt = (o: PlanObject) => !UNBUILT_TYPES.has(o.type) && o.params.tree !== true

export function treeZoneRow(c: CheckContext): CodeRow {
  const limit = ftToM(TREE_ZONE_1_FT)
  const near = (o: PlanObject) => builtPoints(o).some(([x, n]) => (nearestShore(c.parcel, x, n, 0)?.d ?? Infinity) < limit)
  const inside = c.objects.filter((o) => isBuilt(o) && near(o)).map((o) => named(o))
  const text = inside.length ? `built in it: ${list(inside)}` : 'nothing built in it'
  return { id: 'tree-zone', label: `Tree zone 1 (0–${TREE_ZONE_1_FT} ft)`, text, verdict: 'note', names: inside }
}

