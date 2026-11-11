import { localToSite, siteFootprint } from '../../buildings/footprint'
import { massBuildingPoly } from '../../buildings/masses'
import { ftToM } from '../units'
import type { PlanObject } from '../../store/types'
import { named, type CheckContext, type CodeRow, type NamedObject } from './codeCheckTypes'
import { buildingHeight, HEIGHT_LIMIT_FT } from './height'
import { lotWidthCheck } from './lotWidth'
import { outlineInLot, outlineLotLine, outlineShore } from './outlineDistance'
import type { Poly } from './polyGeom'
import { countsForSide, hasMasses, isHighDeck, isHouse, isRuleStructure, ruleMasses, ruleOutline } from './ruleOutline'
import { TREE_ZONE_1_FT } from './setbacks'

/**
 * The site rows of the code check: shoreline buffer, decks in it, side and
 * rear setback, inside the lot, lot width, height and tree zone 1. Every
 * distance is from the outline's walls to the parcel line, edge to edge
 * (R2.3), and each row counts the objects `ruleOutline` says it should.
 */

/** Things that are not "built" for tree zone 1. */
const UNBUILT_TYPES = new Set(['pad', 'tree', 'meadow', 'boulder'])

const ft0 = (ft: number) => `${Math.round(ft)} ft`
const ft1 = (ft: number) => `${ft.toFixed(1)} ft`
const list = (names: readonly NamedObject[]) => names.map((n) => n.name).join(', ')

/** Whether any of the outline is inside the shoreline buffer (closer than the setback past the top of bank). */
function inBuffer(c: CheckContext, polys: readonly Poly[]): boolean {
  const hit = outlineShore(c.parcel, polys, c.setbacks.bankFt)
  return !!hit && hit.past < ftToM(c.setbacks.shoreFt)
}

export function shoreRow(c: CheckContext): CodeRow {
  const inside = c.objects.filter((o) => isRuleStructure(o) && inBuffer(c, ruleOutline(o, c.terrain))).map((o) => named(o))
  const label = 'Shoreline setback'
  if (!inside.length) return { id: 'shore', label, text: 'all buildings clear', verdict: 'pass', names: [] }
  return { id: 'shore', label, text: `inside the ${ft0(c.setbacks.shoreFt)} buffer: ${list(inside)}`, verdict: 'fail', names: inside }
}

export function decksInBufferRow(c: CheckContext): CodeRow {
  const inside = c.objects.filter((o) => isHighDeck(o, c.terrain) && inBuffer(c, [siteFootprint(o)])).map((o) => named(o))
  const label = 'Decks over 30 in in buffer'
  if (!inside.length) return { id: 'decks', label, text: 'none', verdict: 'pass', names: [] }
  return { id: 'decks', label, text: list(inside), verdict: 'fail', names: inside }
}

/** Cabins, sheds, shops, pools and standalone decks over 30 in (decision 3). */
const sideCounted = (c: CheckContext) => c.objects.filter((o) => countsForSide(o, c.terrain))

export function sideRow(c: CheckContext): CodeRow {
  const limit = ftToM(c.setbacks.sideFt)
  const inside = sideCounted(c)
    .filter((o) => (outlineLotLine(c.parcel, ruleOutline(o, c.terrain))?.d ?? Infinity) < limit)
    .map((o) => named(o))
  const label = 'Side and rear setback'
  if (!inside.length) return { id: 'side', label, text: `all buildings ${ft0(c.setbacks.sideFt)} or more from the lot lines`, verdict: 'pass', names: [] }
  return { id: 'side', label, text: `inside the ${ft0(c.setbacks.sideFt)} setback: ${list(inside)}`, verdict: 'fail', names: inside }
}

export function inLotRow(c: CheckContext): CodeRow {
  const out = sideCounted(c)
    .filter((o) => !outlineInLot(c.parcel, ruleOutline(o, c.terrain)))
    .map((o) => named(o))
  const label = 'Inside the lot'
  if (!out.length) return { id: 'in-lot', label, text: 'all buildings inside the lot line', verdict: 'pass', names: [] }
  return { id: 'in-lot', label, text: `outside or across the lot line: ${list(out)}`, verdict: 'fail', names: out }
}

export function lotWidthRow(c: CheckContext): CodeRow {
  const label = 'Lot-width rule'
  const lw = lotWidthCheck(c.parcel, c.objects.filter(isHouse).flatMap((o) => ruleOutline(o, c.terrain)))
  if (!lw) return { id: 'lot-width', label, text: 'no buildings yet', verdict: 'note', names: [] }
  const text = `${ft0(lw.usedFt)} of ${ft0(lw.allowedFt)} allowed (lot ${ft0(lw.lotFt)} wide there)`
  return { id: 'lot-width', label, text, verdict: lw.ok ? 'pass' : 'fail', names: [] }
}

export function heightRow(c: CheckContext): CodeRow {
  const label = 'Height ≤ 35 ft'
  const heights = c.objects.filter(isRuleStructure).map((o) => ({ o, ft: buildingHeight(o, c.terrain).ft }))
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
function builtPolys(o: PlanObject): readonly Poly[] {
  if (!hasMasses(o)) return [siteFootprint(o)]
  return ruleMasses(o).map((m) => massBuildingPoly(m).map((p) => localToSite(o.position, o.rotation, p)))
}

const isBuilt = (o: PlanObject) => !UNBUILT_TYPES.has(o.type) && o.params.tree !== true

/**
 * Tree zone 1 is the no-removal zone (R2.4): a cabin, shed, shop, pool or
 * deck over 30 in built in it fails; paths, boardwalks and low decks (which
 * the buffer allows) are named in a note. Measured edge to edge from the water.
 */
export function treeZoneRow(c: CheckContext): CodeRow {
  const limit = ftToM(TREE_ZONE_1_FT)
  const near = (o: PlanObject) => (outlineShore(c.parcel, builtPolys(o), 0)?.d ?? Infinity) < limit
  const inside = c.objects.filter((o) => isBuilt(o) && near(o))
  const label = `Tree zone 1 (0–${TREE_ZONE_1_FT} ft)`
  const structures = inside.filter((o) => countsForSide(o, c.terrain)).map((o) => named(o))
  const others = inside.filter((o) => !countsForSide(o, c.terrain)).map((o) => named(o))
  const also = others.length ? `; also in it: ${list(others)}` : ''
  if (structures.length) return { id: 'tree-zone', label, text: `built in the no-removal zone: ${list(structures)}${also}`, verdict: 'fail', names: [...structures, ...others] }
  if (others.length) return { id: 'tree-zone', label, text: `paths and low decks only: ${list(others)}`, verdict: 'note', names: others }
  return { id: 'tree-zone', label, text: 'nothing built in it', verdict: 'pass', names: [] }
}
