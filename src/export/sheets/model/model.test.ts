import { beforeAll, describe, expect, test } from 'vitest'
import type { LocalPoint } from '../../../buildings/footprint'
import { buildingMasses } from '../../../buildings/masses'
import { baseElevation } from '../../../scene/placement'
import { mToFt } from '../../../site/units'
import { usePlanStore } from '../../../store/planStore'
import type { PlanObject } from '../../../store/types'
import { fromSide } from '../elevation/elevation'
import { elevationView, sheetBuildings } from './model'
import { partPoints } from './parts'
import { SIDES, sideDepth, sideU } from '../elevation/sides'
import type { SheetBuilding } from '../types'

const store = () => usePlanStore.getState()
const objects = (): PlanObject[] => store().plan.order.map((id) => store().plan.objects[id])
const buildings = () => sheetBuildings(objects(), store().site.terrain)
const prow = (): SheetBuilding => {
  const b = buildings().find((x) => x.id === 'C-0')
  if (!b) throw new Error('no C-0')
  return b
}
const part = (b: SheetBuilding, name: string) => {
  const p = b.parts.find((x) => x.name === name)
  if (!p) throw new Error(`no ${name}`)
  return p
}

/** Distance from a point to segment ab. */
function segDist(p: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}
const toOutline = (q: LocalPoint, outline: readonly LocalPoint[]) => Math.min(...outline.map((a, i) => segDist(q, a, outline[(i + 1) % outline.length])))

beforeAll(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
})

describe('sheetBuildings', () => {
  test('lists every visible cabin in plan order, and leaves hidden ones out', () => {
    expect(buildings().map((b) => b.id)).toEqual(['C-0', 'C-1', 'C-2', 'C-3'])
    const hidden = objects().map((o) => (o.id === 'C-1' ? { ...o, hidden: true } : o))
    expect(sheetBuildings(hidden, store().site.terrain).map((b) => b.id)).toEqual(['C-0', 'C-2', 'C-3'])
  })

  test('the prow has its five parts, named and kinded as the part inspector shows them', () => {
    const b = prow()
    expect(b.parts.map((p) => [p.name, p.kind])).toEqual([
      ['Main', 'wall'],
      ['Porch 1', 'porch'],
      ['Stair 2', 'stair'],
      ['Deck 3', 'deck'],
      ['Porch 4', 'porch'],
    ])
    expect(b.parts.map((p) => p.massIndex)).toEqual([0, 1, 2, 3, 4])
  })

  test("a rect part's edges are its width and depth", () => {
    for (const name of ['Stair 2', 'Porch 4']) {
      const p = part(prow(), name)
      expect(p.edges.map((e) => e.name)).toEqual(['back', 'right', 'front', 'left'])
      expect(p.edges[0].lengthFt).toBeCloseTo(p.wFt, 6)
      expect(p.edges[2].lengthFt).toBeCloseTo(p.wFt, 6)
      expect(p.edges[1].lengthFt).toBeCloseTo(p.dFt, 6)
      expect(p.edges[3].lengthFt).toBeCloseTo(p.dFt, 6)
      expect(p.areaSqFt).toBeCloseTo(p.wFt * p.dFt, 6)
    }
  })

  test('curved edges point at their arc', () => {
    const main = part(prow(), 'Main')
    expect(main.arcs).toHaveLength(1)
    expect(main.edges.filter((e) => e.arc === 0).map((e) => e.index)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(main.edges[3].arc).toBeNull()
    expect(part(prow(), 'Deck 3').arcs.map((a) => [a.fromEdge, a.toEdge])).toEqual([[3, 14], [18, 29]])
  })

  test('the stair has risers, a nosing line for each tread, and a riser and tread in inches', () => {
    const s = part(prow(), 'Stair 2').stair
    expect(s).not.toBeNull()
    expect(s?.kind).toBe('stair')
    expect(s?.risers).toBeGreaterThan(0)
    expect(s?.nosings).toHaveLength(Math.max(0, (s?.risers ?? 0) - 1))
    expect(s?.riserIn).toBeGreaterThan(0)
    expect(s?.treadIn).toBeGreaterThan(0)
    expect(s?.widthFt).toBeCloseTo(5, 6)
  })

  test('openings are tagged once each, D, W or C, and sit on their wall line', () => {
    const b = prow()
    const openings = b.parts.flatMap((p) => p.openings.map((o) => ({ o, outline: p.outline })))
    expect(openings.length).toBeGreaterThan(0)
    const tags = openings.map(({ o }) => o.tag)
    expect(new Set(tags).size).toBe(tags.length)
    for (const { o, outline } of openings) {
      expect(o.tag).toMatch(/^[DWC]\d+$/)
      expect(o.tag[0]).toBe(o.kind === 'window' ? 'W' : o.kind === 'cutout' ? 'C' : 'D')
      expect(toOutline(o.a, outline)).toBeLessThan(0.01)
      expect(toOutline(o.b, outline)).toBeLessThan(0.01)
      expect(o.headFt).toBeGreaterThan(o.sillFt)
    }
    // a per-edge opening's ends are its width apart
    const straight = openings.find(({ o }) => !o.wall.endsWith('curved wall'))?.o
    expect(straight && Math.hypot(straight.b[0] - straight.a[0], straight.b[1] - straight.a[1])).toBeCloseTo(straight?.widthFt ?? 0, 6)
  })

  test("bounds hold every outline, eave and step, and the datum is the main walls' back-left corner", () => {
    for (const b of buildings()) {
      for (const p of b.parts) {
        for (const [x, z] of partPoints(p)) {
          expect(x).toBeGreaterThanOrEqual(b.bounds.minx - 1e-9)
          expect(x).toBeLessThanOrEqual(b.bounds.maxx + 1e-9)
          expect(z).toBeGreaterThanOrEqual(b.bounds.minz - 1e-9)
          expect(z).toBeLessThanOrEqual(b.bounds.maxz + 1e-9)
        }
      }
      const main = b.parts[0].outline
      expect(b.datum).toEqual([Math.min(...main.map((p) => p[0])), Math.min(...main.map((p) => p[1]))])
      expect(b.outlineBounds.minx).toBeGreaterThanOrEqual(b.bounds.minx)
      expect(b.outlineBounds.maxz).toBeLessThanOrEqual(b.bounds.maxz)
    }
  })

  test('roofs, steps, levels and areas', () => {
    const b = prow()
    const main = part(b, 'Main')
    expect(main.roof?.type).toBe('prow')
    expect(main.roof?.riseFt).toBeGreaterThan(0)
    expect(part(b, 'Stair 2').roof).toBeNull()
    expect(part(b, 'Deck 3').stepBands.length).toBeGreaterThan(0)
    const o = store().plan.objects['C-0']
    expect(b.levels.floorNavdFt).toBeCloseTo(mToFt(baseElevation(store().site.terrain, o)), 9)
    expect(b.levels.gradeLowFt).toBeLessThanOrEqual(b.levels.gradeHighFt)
    expect(b.levels.topFt).toBeCloseTo(main.wallFt + (main.roof?.riseFt ?? 0), 9)
    expect(b.totalAreaSqFt.enclosed).toBeCloseTo(main.areaSqFt, 9)
    // Porch 4 is a roof over the deck with no floor of its own, so its area is the deck's
    expect(buildingMasses(o.params)[4].slab).toBe(false)
    expect(b.totalAreaSqFt.decks).toBeCloseTo(['Porch 1', 'Deck 3'].reduce((s, n) => s + part(b, n).areaSqFt, 0), 9)
  })
})

describe('earthworks on the sheets', () => {
  test("the sunk prow: the scene's one stone retaining wall and its court, cut to a floor just under the main floor", () => {
    const e = prow().earthworks
    expect(e?.sinkFt).toBe(4)
    expect(e?.walls.map((w) => [w.tag, w.material])).toEqual([['RW1', 'stone']])
    const w = e?.walls[0]
    expect(w?.lengthFt).toBeGreaterThan(30)
    // it holds back up to about 3 ft of bank over the cut floor, 1 1/4" under the main floor
    expect((w?.topHighFt ?? 0) - (w?.bottomFt ?? 0)).toBeGreaterThan(2.5)
    expect(w?.bottomFt).toBeCloseTo(-0.03 / 0.3048, 6)
    expect(e?.courts).toHaveLength(1)
    expect(e?.courts[0].depthFt).toBeCloseTo(10, 6)
    expect(e?.berms).toEqual([])
  })

  test('the prow reads finished grade at its walls as the cut floor where the survey stood higher; the unsunk cabins as the survey', () => {
    const b = prow()
    expect(b.levels.gradeHighFt).toBeCloseTo(b.earthworks?.walls[0].bottomFt ?? NaN, 1)
    expect(b.levels.surveyHighFt).toBeGreaterThan(1)
    for (const c of buildings().filter((x) => x.id !== 'C-0')) {
      expect(c.earthworks).toBeNull()
      // the prow's patch reaches some of them, where its raster gives back the survey to a hair
      expect(c.levels.gradeLowFt).toBeCloseTo(c.levels.surveyLowFt, 4)
      expect(c.levels.gradeHighFt).toBeCloseTo(c.levels.surveyHighFt, 4)
    }
  })
})

describe('elevationView', () => {
  test('fromSide undoes sideU and sideDepth', () => {
    for (const side of SIDES) {
      const q = fromSide(side, 3, -7)
      expect(sideU(side, q)).toBeCloseTo(3, 12)
      expect(sideDepth(side, q)).toBeCloseTo(-7, 12)
    }
  })

  test("the front view spans the plan's x bounds, eaves and steps included; the right view its z bounds", () => {
    const b = prow()
    const front = elevationView(objects(), store().site.terrain, b, 'front')
    expect(front.uMin).toBeCloseTo(b.bounds.minx, 9)
    expect(front.uMax).toBeCloseTo(b.bounds.maxx, 9)
    const right = elevationView(objects(), store().site.terrain, b, 'right')
    expect(right.uMin).toBeCloseTo(-b.bounds.maxz, 9)
    expect(right.uMax).toBeCloseTo(-b.bounds.minz, 9)
  })

  test('levels run low to high, at least an inch apart, with the floor, eaves, ridges and low grade', () => {
    for (const side of SIDES) {
      const v = elevationView(objects(), store().site.terrain, prow(), side)
      v.levels.slice(1).forEach((l, i) => expect(l.yFt - v.levels[i].yFt).toBeGreaterThanOrEqual(1 / 12 - 1e-9))
      const labels = v.levels.map((l) => l.label).join(' / ')
      for (const want of ['Floor', 'Main eave', 'Main ridge', 'Grade, lowest in this view']) expect(labels).toContain(want)
      expect(v.levels.find((l) => l.label.includes('Floor'))?.yFt).toBe(0)
    }
  })

  test('grade is sampled every foot across the view, and parts give their spans', () => {
    const v = elevationView(objects(), store().site.terrain, prow(), 'front')
    expect(v.grade[0][0]).toBeCloseTo(v.uMin, 9)
    expect(v.grade[v.grade.length - 1][0]).toBeCloseTo(v.uMax, 9)
    v.grade.slice(1).forEach((g, i) => expect(g[0] - v.grade[i][0]).toBeLessThanOrEqual(1 + 1e-9))
    expect(Math.min(...v.grade.map((g) => g[1]))).toBe(v.levels[0].yFt)
    expect(v.spans.map((s) => s.name)).toEqual(['Main', 'Porch 1', 'Stair 2', 'Deck 3', 'Porch 4'])
    expect(v.spans[0]).toMatchObject({ u0: -14, u1: 14 })
  })
})
