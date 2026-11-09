import { describe, expect, test } from 'vitest'
import { nearestLotLine, nearestShore, pointInLot } from '../../../site/rules/setbacks'
import { ftToM } from '../../../site/units'
import { DEFAULT_SETBACKS } from '../../../store/types'
import { terrainContours } from '../../../site/contours'
import { siteContours } from '../../../site/siteContours'
import { distToSegment, insidePoly } from './siteGeom'
import type { Pt } from '../svgDims'
import { siteSheetModel } from './siteModel'
import { earthworksFor, modelInputFor, objectsOf, planOf, SITE } from './siteTestKit'

const planC = planOf('C')
const model = siteSheetModel(modelInputFor(planC))
const inLot = ([x, y]: readonly [number, number]) => pointInLot(SITE.parcel, ftToM(x), ftToM(y))

describe('site sheet model · Scheme C', () => {
  test('the lot: 131 corners, the shoreline from edge 4 to 122, the other edges as lot lines', () => {
    expect(model.ring).toHaveLength(131)
    expect(model.shoreline).toHaveLength(122 - 4 + 2)
    expect(model.lotLines).toHaveLength(131 - (122 - 4 + 1))
    expect(model.lotLines.every((l) => l.lengthFt > 0)).toBe(true)
  })

  test('every visible building is drawn once, with its walls and roofs', () => {
    const houses = objectsOf(planC).filter((o) => o.type === 'house')
    expect(model.buildings.map((b) => b.id).sort()).toEqual(houses.map((o) => o.id).sort())
    for (const b of model.buildings) {
      expect(b.parts.some((p) => p.kind === 'wall')).toBe(true)
      expect(b.roofs.length).toBeGreaterThan(0)
      expect(b.floorNavdFt).toBeGreaterThan(0)
      expect(insidePoly(b.parts.find((p) => p.kind === 'wall')!.outline, b.label)).toBe(true)
    }
  })

  test('hidden objects are left off', () => {
    const first = planC.order.find((id) => planC.objects[id].type === 'house')!
    const hidden = { ...planC, objects: { ...planC.objects, [first]: { ...planC.objects[first], hidden: true } } }
    const m = siteSheetModel(modelInputFor(hidden))
    expect(m.buildings.map((b) => b.id)).not.toContain(first)
    expect(m.buildings).toHaveLength(model.buildings.length - 1)
  })

  test('path pieces, the boardwalk, pads and trees are all there', () => {
    expect(model.paths.length).toBeGreaterThanOrEqual(2)
    expect(model.bridges).toHaveLength(1)
    expect(model.bridges[0].left.length).toBeGreaterThan(10)
    expect(model.trees).toHaveLength(4)
    expect(model.trees.every((t) => t.radiusFt >= 10)).toBe(true)
    expect(model.things.some((t) => t.kind === 'pad' && t.cars > 0)).toBe(true)
  })

  test('contours are 2 ft apart, darker every 10 ft', () => {
    const fts = model.contours.map((c) => c.ft)
    for (let i = 1; i < fts.length; i++) expect(fts[i] - fts[i - 1]).toBeCloseTo(2, 3)
    expect(model.contours.filter((c) => c.index).every((c) => Math.round(c.ft) % 10 === 0)).toBe(true)
  })

  test('the buffer and top of bank lie inside the lot, the bank 45 ft from the banked shore', () => {
    expect(model.buffer.flat().every(inLot)).toBe(true)
    expect(model.topOfBank.flat().every(inLot)).toBe(true)
    for (const [x, y] of model.topOfBank.flat().filter((_, i) => i % 5 === 0)) {
      expect(nearestShore(SITE.parcel, ftToM(x), ftToM(y), 0)!.d).toBeCloseTo(ftToM(DEFAULT_SETBACKS.bankFt), 0)
    }
  })

  test('the side setback line sits sideFt from the lot lines, outside the buffer', () => {
    expect(model.sideLine.length).toBeGreaterThan(0)
    for (const [x, y] of model.sideLine.flat()) {
      expect(inLot([x, y])).toBe(true)
      expect(Math.abs(nearestLotLine(SITE.parcel, ftToM(x), ftToM(y))!.d - ftToM(DEFAULT_SETBACKS.sideFt))).toBeLessThan(0.1)
      expect(model.bandAt([x, y])).not.toBe('shore')
    }
  })

  test('the bands are the setbacks rule: outside off the lot, clear in the middle, shore at the water', () => {
    const c = model.buildings[0].label
    expect(model.bandAt(c)).not.toBe('outside')
    expect(model.bandAt([model.bounds.minx - 50, model.bounds.miny - 50])).toBe('outside')
    const s = model.shoreline[Math.floor(model.shoreline.length / 2)]
    const r = model.ring.reduce((acc, p) => [acc[0] + p[0] / model.ring.length, acc[1] + p[1] / model.ring.length], [0, 0])
    // a step in from the water toward the lot's middle is in the buffer
    const len = Math.hypot(r[0] - s[0], r[1] - s[1])
    expect(model.bandAt([s[0] + ((r[0] - s[0]) / len) * 3, s[1] + ((r[1] - s[1]) / len) * 3])).toBe('shore')
  })

  test('the roofs cast shadows with the September 2 pm sun, away from it (to the north-east)', () => {
    expect(model.sun).toMatchObject({ season: 'sep', hour: 14, up: true, casts: true })
    expect(model.shadows.length).toBeGreaterThan(0)
    const caster = model.buildings[0].shadowCasters[0]
    const moved = model.shadows[1]
    // the swept copy sits north-east of the eave (afternoon sun in the south-west)
    const cx = (pts: readonly (readonly [number, number])[]) => pts.reduce((s, p) => s + p[0], 0) / pts.length
    const cy = (pts: readonly (readonly [number, number])[]) => pts.reduce((s, p) => s + p[1], 0) / pts.length
    expect(cx(moved)).toBeGreaterThan(cx(caster.poly))
    expect(cy(moved)).toBeGreaterThan(cy(caster.poly))
  })

  test('the sun says it is up even when nothing casts a shadow, and is down at night', () => {
    const empty = { ...planC, objects: {}, order: [] }
    expect(siteSheetModel(modelInputFor(empty)).sun).toMatchObject({ up: true, casts: true })
    expect(siteSheetModel(modelInputFor(empty)).shadows).toEqual([])
    const night = siteSheetModel({ ...modelInputFor(planC), environment: { season: 'dec', hour: 19, tideFt: 6 } })
    expect(night.sun.up).toBe(false)
    expect(night.shadows).toEqual([])
  })

  test('tree zones follow the setting', () => {
    expect(model.treeZones.map((z) => z.ft)).toEqual([35, 110])
    const off = siteSheetModel(modelInputFor(planC, { ...DEFAULT_SETBACKS, treeZones: false }))
    expect(off.treeZones).toEqual([])
  })
})

describe('the reshaped ground reaches the sheet · Scheme C', () => {
  const { works, ground } = earthworksFor(objectsOf(planC))
  const t = SITE.terrain
  const rect = works.fields[0].rect
  const inRect = (x: number, n: number) => {
    const col = (x - t.x0) / t.spacing
    const row = (n - t.n0) / t.spacing
    return col > rect.c0 && col < rect.c1 && row > rect.r0 && row < rect.r1
  }
  const ft = (m: number) => m / ftToM(1)
  // segments wholly inside the patch, as site-feet points
  const inside = (lines: ReturnType<typeof terrainContours>) =>
    lines.flatMap((l) => l.segments.filter(([x1, n1, x2, n2]) => inRect(x1, n1) && inRect(x2, n2)).map(([x1, n1, x2, n2]) => [[ft(x1), ft(n1)], [ft(x2), ft(n2)]] as [Pt, Pt]))
  const cut = inside(siteContours(t, works, ground))
  const survey = inside(terrainContours(t, ftToM(2)))
  const near = (p: Pt, segs: readonly (readonly [Pt, Pt])[], tol: number) => segs.some(([a, b]) => distToSegment(p, a, b) <= tol)

  test('inside the earthworks the contours are the cut ground’s, not the survey’s', () => {
    expect(works.fields.length).toBeGreaterThan(0)
    expect(cut.length).toBeGreaterThan(10)
    // away from the building the reshaped ground is the survey, but round it a good run of lines goes where no survey contour does
    const apart = cut.filter(([a, b]) => !near([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], survey, 0.5))
    expect(apart.length).toBeGreaterThan(30)
  })

  test('and those lines are on the sheet', () => {
    const drawn = model.contours.flatMap((c) => c.lines.flatMap((l) => l.slice(1).map((p, i) => [l[i], p] as [Pt, Pt])))
    const apart = cut.filter(([a, b]) => !near([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], survey, 0.5))
    for (const [a, b] of apart) expect(near([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], drawn, 0.1)).toBe(true)
  })
})
