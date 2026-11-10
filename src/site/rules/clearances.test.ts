import { describe, expect, test } from 'vitest'
import { loadIslandale } from '../islandale'
import { loadSchemes, schemeById } from '../schemes'
import { FT_PER_M, ftToM } from '../units'
import { planFromScheme } from '../../store/fromLegacy'
import { DEFAULT_LAYERS, DEFAULT_SETBACKS, type Plan, type PlanObject } from '../../store/types'
import { clearances, dimensionLabels, dimensionText, ftIn, lotText, nearestText, polyDistance, segDistance, shoreText } from './clearances'
import { pointInLot } from './setbacks'

const site = loadIslandale()
const schemeC = planFromScheme(schemeById(loadSchemes(), 'C'))
const cabin = (id: string, x: number, n: number, params: Record<string, unknown> = { w: 20, d: 16, h: 9 }, rotation = 0): PlanObject => ({
  id, type: 'house', name: id, position: { x, n }, rotation, params, locked: false, hidden: false, labelVisible: true,
})
const planOf = (...objects: PlanObject[]): Plan => ({
  name: 'test', siteId: 'islandale', schemeId: null,
  objects: Object.fromEntries(objects.map((o) => [o.id, o])), order: objects.map((o) => o.id),
})
const textsOf = (id: string) => {
  const c = clearances(schemeC.objects[id], schemeC, site, DEFAULT_SETBACKS, DEFAULT_LAYERS)
  return [c.shore && shoreText(c.shore, DEFAULT_SETBACKS), c.lot && lotText(c.lot), c.nearest && nearestText(c.nearest)]
}

describe('clearance geometry (5E)', () => {
  test('two parallel segments 3 m apart are 3 m apart; crossing ones are 0 at the crossing', () => {
    expect(segDistance([0, 0], [10, 0], [2, 3], [8, 3]).d).toBeCloseTo(3, 9)
    const x = segDistance([0, 0], [10, 0], [5, -5], [5, 5])
    expect(x.d).toBe(0)
    expect(x.from[0]).toBeCloseTo(5, 9)
  })

  test('boxes side by side measure edge to edge, and a box inside another is 0', () => {
    const box = (x0: number, n0: number, s: number) => [[x0, n0], [x0 + s, n0], [x0 + s, n0 + s], [x0, n0 + s]] as const
    expect(polyDistance(box(0, 0, 2), box(5, 0, 2)).d).toBeCloseTo(3, 9)
    expect(polyDistance(box(0, 0, 10), box(2, 2, 1)).d).toBe(0)
  })
})

describe('clearances for one object (5E)', () => {
  test('nearest object: two 20 ft cabins 10 ft apart edge to edge, named; hidden ones are skipped', () => {
    const a = cabin('A', 0, 0)
    const b = cabin('B', ftToM(30), 0)
    const near = clearances(a, planOf(a, b), site, DEFAULT_SETBACKS)
    expect(near.nearest?.otherName).toBe('B')
    expect((near.nearest?.d ?? 0) * FT_PER_M).toBeCloseTo(10, 6)
    expect(clearances(a, planOf(a, { ...b, hidden: true }), site, DEFAULT_SETBACKS).nearest).toBeNull()
    const layers = { ...DEFAULT_LAYERS, buildings: { visible: false, locked: false } }
    expect(clearances(a, planOf(a, b), site, DEFAULT_SETBACKS, layers).nearest).toBeNull()
  })

  test('shore: the past-bank figure is the plain distance less the bank offset, and a wider setback puts the cabin inside the buffer', () => {
    const o = schemeC.objects['C-0']
    const c = clearances(o, schemeC, site, DEFAULT_SETBACKS)
    expect(c.shore?.banked).toBe(true)
    expect(((c.shore?.d ?? 0) - (c.shore?.past ?? 0)) * FT_PER_M).toBeCloseTo(45, 6)
    expect(c.shore?.insideBuffer).toBe(false)
    const strict = { ...DEFAULT_SETBACKS, shoreFt: 50 }
    expect(clearances(o, schemeC, site, strict).shore?.insideBuffer).toBe(true)
    expect(shoreText(clearances(o, schemeC, site, strict).shore!, strict)).toMatch(/ · inside buffer$/)
  })

  test('lot line: inside the side setback when closer than it, and a cabin half off the lot crosses the lot line', () => {
    const o = schemeC.objects['C-3']
    const wide = { ...DEFAULT_SETBACKS, sideFt: 20 }
    const c = clearances(o, schemeC, site, wide)
    expect(c.lot?.insideSetback).toBe(true)
    expect(lotText(c.lot!)).toMatch(/to lot line · inside setback$/)
    const edge = clearances(o, schemeC, site, DEFAULT_SETBACKS).lot!
    const off = cabin('Off', edge.to[0], edge.to[1])
    const offC = clearances(off, planOf(off), site, DEFAULT_SETBACKS).lot!
    expect(offC.crossesLot).toBe(true)
    expect(lotText(offC)).toBe('crosses the lot line')
    expect(pointInLot(site.parcel, edge.from[0], edge.from[1])).toBe(true)
  })

  test('each Scheme C cabin reads its three clearances in feet and inches', () => {
    expect(textsOf('C-0')).toEqual([`80'-1" to shore · 35'-1" past bank`, `21'-6" to lot line`, `1'-9" to Madrone · keep`])
    expect(textsOf('C-1')).toEqual([`84'-8" to shore`, `11'-5" to lot line`, `3'-2" to Family twin pod`])
    expect(textsOf('C-2')).toEqual([`82'-1" to shore`, `11' to lot line`, `1'-4" to Family lantern`])
    // measured from the walls (R2.3): the Elders' cabin's walls come 2 in nearer than its corners did (50'-11", 10'-8")
    expect(textsOf('C-3')).toEqual([`50'-9" to shore`, `10'-6" to lot line`, `3' to Madrone · keep`])
  })

  test('no bank offset: the past-bank part is dropped', () => {
    const none = { ...DEFAULT_SETBACKS, bankFt: 0 }
    const c = clearances(schemeC.objects['C-0'], schemeC, site, none)
    expect(shoreText(c.shore!, none)).not.toMatch(/past bank/)
  })
})

describe('dimension labels (5E)', () => {
  test("a 20 x 16 cabin's main box edges read 20' and 16', at the edge midpoints", () => {
    const labels = dimensionLabels(cabin('A', 0, 0))
    expect(labels.map(dimensionText)).toEqual([`20'`, `16'`, `20'`, `16'`])
    expect(labels[0].at[1]).toBeCloseTo(ftToM(8), 9)
    expect(labels[1].at[0]).toBeCloseTo(ftToM(10), 9)
  })

  test("a cabin labels its main mass, not its wings; anything else its footprint box", () => {
    const winged = cabin('W', 0, 0, { w: 24, d: 12.5, h: 9, wings: [{ w: 10, d: 10, dx: 17, dz: 0 }] })
    expect(dimensionLabels(winged).map(dimensionText)).toEqual([`24'`, `12'-6"`, `24'`, `12'-6"`])
    const pad = { ...cabin('P', 0, 0, { w: 9.5, d: 7 }), type: 'pad' }
    expect(dimensionLabels(pad).map(dimensionText)).toEqual([`9'-6"`, `7'`, `9'-6"`, `7'`])
  })

  test('feet and inches with the dash', () => {
    expect(ftIn(ftToM(32.5))).toBe(`32'-6"`)
    expect(ftIn(ftToM(0.5))).toBe(`6"`)
  })
})
