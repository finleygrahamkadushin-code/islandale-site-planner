import { describe, expect, test } from 'vitest'
import { siteToLocal, type LocalPoint } from '../../../buildings/footprint'
import { earthOps } from '../../../scene/placement'
import { siteEarthworks } from '../../../site/earthworks/earthworks'
import type { Terrain } from '../../../site/types'
import { mToFt, M_PER_FT as FT } from '../../../site/units'
import type { PlanObject } from '../../../store/types'
import { edgeRuns, offsetPolyline } from './earthworks'
import { elevationView, sheetBuildings } from './model'
import { sheetTables } from '../tables/table'
import type { SheetBuilding } from '../types'

// flat ground at 10 m over an 81 x 81 grid at 2 m, centred on the origin
const flat: Terrain = { lon0: 0, lat0: 0, spacing: 2, nx: 81, ny: 81, x0: -80, n0: -80, z: new Array(81 * 81).fill(10) }
/** Ground rising `grade` metres per metre northward from 10 m at n = 0. */
const rising = (grade: number): Terrain => ({ ...flat, z: Array.from({ length: 81 * 81 }, (_, k) => 10 + grade * (-80 + Math.floor(k / 81) * 2)) })

const house = (id: string, params: Record<string, unknown>, rotation = 0, at = { x: 0, n: 0 }): PlanObject => ({
  id, type: 'house', name: id, position: at, rotation, params: { w: 24, d: 18, h: 9, roof: 'gable', pitch: 6, ...params }, locked: false, hidden: false, labelVisible: true,
})
const sheet = (objects: readonly PlanObject[], t: Terrain, id: string): SheetBuilding => {
  const b = sheetBuildings(objects, t).find((x) => x.id === id)
  if (!b) throw new Error(`no ${id}`)
  return b
}
const near = (a: LocalPoint, b: LocalPoint) => Math.hypot(a[0] - b[0], a[1] - b[1])
/** Distance from p to the segment ab. */
function segDist(p: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}
const inside = (poly: readonly LocalPoint[], [x, z]: LocalPoint) =>
  poly.reduce((hit, a, i) => {
    const b = poly[(i + 1) % poly.length]
    return (a[1] > z) !== (b[1] > z) && x < a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]) ? !hit : hit
  }, false)
const toLine = (p: LocalPoint, line: readonly LocalPoint[]) => Math.min(...line.slice(1).map((b, i) => segDist(p, line[i], b)))

describe('edgeRuns and offsetPolyline', () => {
  test('runs follow on round the outline, across its start, and the whole outline is one run', () => {
    expect(edgeRuns([5, 0, 1], 6)).toEqual([[5, 0, 1]])
    expect(edgeRuns([1, 3, 4], 6)).toEqual([[1], [3, 4]])
    expect(edgeRuns([0, 1, 2, 3], 4)).toEqual([[0, 1, 2, 3]])
  })
  test('an offset line stands the distance off every edge, its corner mitred', () => {
    // two sides of a clockwise square in plan (x right, z down): back then right; out is up and right
    const line: LocalPoint[] = [[0, 0], [10, 0], [10, 10]]
    const area = 100
    const off = offsetPolyline(line, 2, area)
    expect(off[0]).toEqual([0, -2])
    expect(off[1][0]).toBeCloseTo(12, 9)
    expect(off[1][1]).toBeCloseTo(-2, 9)
    expect(off[2]).toEqual([12, 10])
  })
})

describe('a sunk house', () => {
  const t = rising(0.15)
  for (const rotation of [0, 37, -120]) {
    const o = house('S', { earth: { sink: 4 } }, rotation)
    const b = sheet([o], t, 'S')
    const e = b.earthworks
    test(`at ${rotation}°: the scene's own retaining walls, in the building frame, with their heights above the floor`, () => {
      const scene = siteEarthworks(t, earthOps([o], t))
      expect(e?.sinkFt).toBe(4)
      expect(e?.walls.length).toBe(scene.walls.length)
      expect(e?.walls.length).toBeGreaterThan(0)
      const floorM = b.levels.floorNavdFt * FT
      e?.walls.forEach((w, k) => {
        const s = scene.walls[k]
        expect(w.tag).toBe(`RW${k + 1}`)
        w.face.forEach((p, i) => expect(near(p, siteToLocal(o.position, o.rotation, s.pts[i]))).toBeLessThan(1e-9))
        expect(w.back).toHaveLength(w.face.length)
        expect(w.thicknessFt).toBeCloseTo(0.5 / FT, 9)
        expect(w.topHighFt).toBeCloseTo(mToFt(Math.max(...s.tops) - floorM), 6)
        expect(w.topLowFt).toBeLessThanOrEqual(w.topHighFt)
        expect(w.bottomFt).toBeCloseTo(mToFt(s.floor - floorM), 6)
        expect(w.footFt).toBeLessThan(w.bottomFt)
        expect(w.lengthFt).toBeGreaterThan(0)
      })
    })
    test(`at ${rotation}°: a court against the downhill wall, cut to the same floor, and the levels split finished from surveyed grade`, () => {
      // the ground rises north; the downhill wall is the one facing south
      const front = { 0: 'front', 37: 'front', [-120]: 'right' }[rotation]
      expect(e?.courts.map((c) => c.side)).toEqual([front])
      const c = e?.courts[0]
      expect(c?.depthFt).toBeCloseTo(10, 6)
      expect(c?.widthFt).toBeCloseTo(front === 'front' ? 24 : 18, 6)
      expect(c?.floorFt).toBeCloseTo(e?.walls[0]?.bottomFt ?? NaN, 9)
      // cut down round the walls, so the finished grade is the cut floor where the survey stood higher
      expect(b.levels.gradeHighFt).toBeCloseTo(c?.floorFt ?? NaN, 1)
      expect(b.levels.surveyHighFt).toBeGreaterThan(b.levels.gradeHighFt + 1)
      const levels = sheetTables(b).find((x) => x.title === 'Levels')
      expect(levels?.note).toContain(`set 4'-0" into the slope`)
      expect(levels?.rows.map((r) => r[0])).toContain('Cut floor round the walls')
    })
    test(`at ${rotation}°: the top of the cut bank lies outside the walls`, () => {
      expect(e?.cutLimit.length).toBeGreaterThan(0)
      for (const [p] of e?.cutLimit ?? []) expect(Math.min(...b.parts[0].outline.map((q) => near(p, q)))).toBeGreaterThan(2)
    })
  }
})

describe('a bermed house', () => {
  const lift = 1
  const berm = 6
  const slope = 2.5
  for (const [shape, rotation] of [['rect', 0], ['rect', 63], ['kidney', -25], ['ellipse', 140]] as const) {
    const o = house('B', { shape, lift, support: 'posts', earth: { berm, sides: 'back', slope } }, rotation)
    const b = sheet([o], flat, 'B')
    const e = b.earthworks
    const main = b.parts[0]
    test(`${shape} at ${rotation}°: the crest a crest width out along the walls it is set against, at the berm's height`, () => {
      expect(e?.berms.length).toBeGreaterThan(0)
      for (const m of e?.berms ?? []) {
        expect(m.crestFt).toBeCloseTo(berm, 9)
        expect(m.crestWidthFt).toBeCloseTo(2, 9)
        expect(m.slope).toBe(slope)
        m.edges.forEach((i) => expect(main.edges[i]).toBeDefined())
        expect(m.line).toHaveLength(m.edges.length + 1)
        // straight walls are named; a run of chords round a curve by its P points
        expect(m.side).toMatch(shape === 'rect' ? /^back$/ : /^(P\d+–P\d+|[a-z ,0-9]+)$/)
        for (const p of m.crest.slice(1, -1)) expect(toLine(p, m.line)).toBeGreaterThan(2 - 0.05)
        // out from the walls, not in
        for (const p of m.crest) expect(inside(main.outline, p)).toBe(false)
        expect(toLine(m.crest[0], m.line)).toBeCloseTo(2, 3)
        expect(m.lengthFt).toBeGreaterThan(0)
      }
    })
    test(`${shape} at ${rotation}°: its toe where the scene's ground comes back to the survey`, () => {
      // on flat ground the berm stands berm + lift over the survey: crest, a half-metre shoulder, then that rise at the slope, and a soft toe within 2 m beyond
      const toe = 2 + 0.5 / FT + (berm + lift) * slope
      for (const m of e?.berms ?? []) {
        expect(m.toeOutFt?.min).toBeGreaterThan(toe)
        expect(m.toeOutFt?.min).toBeLessThan(toe + 2 / FT)
      }
      expect(e?.fillLimit.length).toBeGreaterThan(0)
      expect(e?.walls).toEqual([])
      expect(e?.courts).toEqual([])
    })
    test(`${shape} at ${rotation}°: the finished grade at the walls reaches the crest; the survey is the flat ground`, () => {
      expect(b.levels.gradeHighFt).toBeCloseTo(berm, 1)
      expect(b.levels.surveyLowFt).toBeCloseTo(-lift, 6)
      expect(b.levels.surveyHighFt).toBeCloseTo(-lift, 6)
      expect(sheetTables(b).find((x) => x.title === 'Berms')?.rows).toHaveLength(e?.berms.length ?? 0)
    })
  }
})

describe('a building that leaves the ground alone', () => {
  const t = rising(0.1)
  const o = house('P', { support: 'posts', lift: 2 }, 15)
  const b = sheet([o], t, 'P')
  test('has no earthworks, its finished grade is the survey, and the elevations draw one line', () => {
    expect(b.earthworks).toBeNull()
    expect(b.levels.gradeLowFt).toBeCloseTo(b.levels.surveyLowFt, 9)
    expect(b.levels.gradeHighFt).toBeCloseTo(b.levels.surveyHighFt, 9)
    const v = elevationView([o], t, b, 'front')
    expect(v.survey).toEqual(v.grade)
    expect(sheetTables(b).map((x) => x.title)).not.toContain('Retaining walls')
  })
  test("a neighbour's berm is left to the neighbour's sheet", () => {
    const n = house('N', { support: 'posts', earth: { berm: 6, sides: 'all' } }, 0, { x: 30, n: 0 })
    expect(sheet([o, n], t, 'P').earthworks).toBeNull()
    const e = sheet([o, n], t, 'N').earthworks
    // every limit segment is nearer N (30 m east) than P
    for (const [p] of e?.fillLimit ?? []) expect(p[0]).toBeGreaterThan(-30 / FT / 2)
  })
})

describe('a sunk house on the elevations', () => {
  const t = rising(0.15)
  const o = house('S', { earth: { sink: 4 } })
  const b = sheet([o], t, 'S')
  test('the survey stands over the cut along the uphill (back) wall, and they share their stations', () => {
    const v = elevationView([o], t, b, 'back')
    expect(v.survey.map(([u]) => u)).toEqual(v.grade.map(([u]) => u))
    expect(Math.max(...v.survey.map(([, y], i) => y - v.grade[i][1]))).toBeGreaterThan(1)
    expect(v.survey.every(([, y], i) => y >= v.grade[i][1] - 1e-6)).toBe(true)
  })
})

describe('areas', () => {
  test('overlapping walls count once; a deck counts only outside the walls', () => {
    const o = house('A', {
      w: 20,
      d: 20,
      wings: [
        { kind: 'wall', dx: 10, dz: 0, w: 10, d: 10, h: 8 },
        { kind: 'deck', dx: 0, dz: 12, w: 20, d: 8, h: 1 },
      ],
    })
    const b = sheet([o], flat, 'A')
    // a 20 x 20 room with a 10 x 10 wing half inside it: 400 + 50
    expect(b.totalAreaSqFt.enclosed).toBeCloseTo(450, 6)
    // the deck runs 2 ft under the front wall: 20 x 6 outside it
    expect(b.totalAreaSqFt.decks).toBeCloseTo(120, 6)
    expect(sheetTables(b).find((x) => x.title === 'Areas')?.rows).toEqual([
      ['Enclosed, to the outside face of the walls', '450 sq ft'],
      ['Decks and porches, outside the walls', '120 sq ft'],
    ])
  })
})
