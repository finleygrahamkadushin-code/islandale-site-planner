import { describe, expect, test } from 'vitest'
import { loadIslandale } from './islandale'
import { ringEdges } from './parcel'
import { FT_PER_M } from './units'
import { coverOf, coverageOf, coveredSqFt, lotFacts } from './lotFacts'
import { planFromScheme } from '../store/fromLegacy'
import { loadSchemes, schemeById } from './schemes'
import type { PlanObject } from '../store/types'

const site = loadIslandale()
const schemeC = planFromScheme(schemeById(loadSchemes(), 'C'))
const objectsC = schemeC.order.map((id) => schemeC.objects[id])
const cabin = (w: number, d: number): PlanObject => ({ id: 'x', type: 'house', name: 'X', position: { x: 0, n: 0 }, rotation: 0, params: { w, d, h: 9 }, locked: false, hidden: false, labelVisible: true })

describe('lot facts (4B)', () => {
  test('lot area comes from the assessor figure', () => {
    expect(lotFacts(site.parcel, []).lotSqFt).toBe(20847)
  })

  test('shoreline length is the parcel edges along the water, in feet', () => {
    const { first, last } = site.parcel.shorelineEdges
    const expected = ringEdges(site.parcel.ring)
      .slice(first, last + 1)
      .reduce((sum, [[x1, n1], [x2, n2]]) => sum + Math.hypot(x2 - x1, n2 - n1), 0) * FT_PER_M
    const facts = lotFacts(site.parcel, [])
    expect(facts.shorelineFt).toBeCloseTo(expected, 6)
    expect(facts.shorelineFt).toBeGreaterThan(50)
  })

  test('covered area counts each building and deck footprint once, and nothing else', () => {
    expect(coveredSqFt([cabin(20, 16)])).toBeCloseTo(320, 6)
    const tree: PlanObject = { ...cabin(18, 18), type: 'tree', params: { w: 18, d: 18, tree: true } }
    expect(coveredSqFt([cabin(20, 16), tree])).toBeCloseTo(320, 6)
    expect(coveredSqFt([{ ...cabin(20, 16), hidden: true }])).toBe(0)
  })

  test('Scheme C covers part of the lot, and a new 20 x 16 cabin adds 320 sq ft', () => {
    const base = lotFacts(site.parcel, objectsC)
    expect(base.coveredSqFt).toBeGreaterThan(500)
    expect(base.coveredSqFt).toBeLessThan(base.lotSqFt)
    expect(base.coveragePct).toBeCloseTo((base.coveredSqFt / base.lotSqFt) * 100, 6)
    expect(lotFacts(site.parcel, [...objectsC, cabin(20, 16)]).coveredSqFt).toBeCloseTo(base.coveredSqFt + 320, 6)
  })

  test('coverage counts closed masses of a cabin, not porches, deck wings, stairs or upper floors', () => {
    const wings = [
      { kind: 'wall', w: 10, d: 10, dx: 15, dz: 0 },
      { kind: 'porch', w: 8, d: 6, dx: 0, dz: 13 },
      { kind: 'deck', w: 12, d: 8, dx: -16, dz: 0 },
      { kind: 'stair', w: 4, d: 6, dx: 0, dz: -13 },
    ]
    const house: PlanObject = { ...cabin(20, 20), params: { w: 20, d: 20, h: 9, wings, floors: [{}, {}] } }
    expect(coverageOf(house)).toBeCloseTo(500, 6)
    expect(coverOf(house)).toBeCloseTo(500 + 48 + 96 + 24, 6)
  })

  test('standalone decks, sheds and shops still count in full', () => {
    const deck: PlanObject = { ...cabin(12, 10), type: 'deck', params: { w: 12, d: 10 } }
    const shed: PlanObject = { ...cabin(8, 10), type: 'shed', params: { w: 8, d: 10 } }
    expect(coveredSqFt([deck, shed])).toBeCloseTo(200, 6)
  })

  test('Scheme C coverage leaves out its open wings', () => {
    const before = objectsC.filter((o) => !o.hidden).reduce((sum, o) => sum + coverOf(o), 0)
    const after = lotFacts(site.parcel, objectsC).coveredSqFt
    expect(after).toBeLessThan(before)
  })
})
