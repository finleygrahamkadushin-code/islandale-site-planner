import { describe, expect, test } from 'vitest'
import { localToSite } from '../../../buildings/footprint'
import { earthOps } from '../../../scene/placement'
import { siteEarthworks } from '../../../site/earthworks/earthworks'
import type { Terrain } from '../../../site/types'
import { mToFt } from '../../../site/units'
import { usePlanStore } from '../../../store/planStore'
import type { PlanObject } from '../../../store/types'
import { sheetBuildings } from '../model/model'
import type { SheetBuilding } from '../types'
import { sectionCuts, type SectionCut } from './sectionCuts'
import { planAt, type Tri, type UY } from './sectionGeom'
import { planGround, sectionSource } from './sectionSource'
import { FLOOR_FT, GRADE_LABEL, ROOF_FT, sectionView, WAIST_FT, type SectionView } from './sectionView'

// flat ground at 10 m over an 81 x 81 grid at 2 m, centred on the origin
const flat: Terrain = { lon0: 0, lat0: 0, spacing: 2, nx: 81, ny: 81, x0: -80, n0: -80, z: new Array(81 * 81).fill(10) }
/** Ground rising `grade` metres per metre northward from 10 m at n = 0. */
const rising = (grade: number): Terrain => ({ ...flat, z: Array.from({ length: 81 * 81 }, (_, k) => 10 + grade * (-80 + Math.floor(k / 81) * 2)) })

const house = (id: string, params: Record<string, unknown>, rotation = 0): PlanObject => ({
  id, type: 'house', name: id, position: { x: 0, n: 0 }, rotation, params: { w: 24, d: 18, h: 9, roof: 'gable', pitch: 6, ridge: 'x', overhang: 1, ...params }, locked: false, hidden: false, labelVisible: true,
})

interface Cut {
  readonly b: SheetBuilding
  readonly a: SectionView
  readonly c: SectionView
  readonly cuts: readonly [SectionCut, SectionCut]
}

function sections(objects: readonly PlanObject[], t: Terrain, id: string): Cut {
  const b = sheetBuildings(objects, t).find((x) => x.id === id)
  const o = objects.find((x) => x.id === id)
  if (!b || !o) throw new Error(`no ${id}`)
  const cuts = sectionCuts(b)
  if (!cuts) throw new Error('no cuts')
  const src = sectionSource(o, b, planGround(objects, t))
  return { b, cuts, a: sectionView(b, src, cuts[0]), c: sectionView(b, src, cuts[1]) }
}

/** The steepest run between neighbouring points of a polyline, rise over run. */
const steepest = (line: readonly UY[]) => Math.max(0, ...line.slice(1).map((p, i) => (Math.abs(p[0] - line[i][0]) > 1e-3 ? Math.abs((p[1] - line[i][1]) / (p[0] - line[i][0])) : 0)))

describe('a straight-walled cabin with a gable roof', () => {
  const window = (edge: number, x: number) => ({ id: edge * 10 + 1, edge, kind: 'window', x, w: 3, h: 4, sill: 3 })
  const { b, a, c, cuts } = sections([house('S', { cuts: [window(2, 10.5), window(1, 7.5)] })], flat, 'S')
  const t = b.parts[0].edges[0].thicknessFt

  test('A–A runs the long way and B–B square to it, through the middle, B–B onto the front window', () => {
    expect(cuts[0].kind).toBe('long')
    expect(Math.abs(cuts[0].dir[0])).toBeCloseTo(1, 9)
    expect(Math.abs(cuts[1].dir[1])).toBeCloseTo(1, 9)
    expect(cuts[0].offsetFt).toBe(0)
    // the window's middle is 0 to 1.5 ft off the centre, whichever end its x is measured from
    expect(Math.abs(cuts[1].offsetFt)).toBeLessThanOrEqual(1.5)
  })

  test('the long section cuts the two end walls, a wall thick, outside faces 24 ft apart, floor to the gable', () => {
    expect(a.walls).toHaveLength(2)
    for (const w of a.walls) {
      expect(w.u1 - w.u0).toBeCloseTo(t, 6)
      expect(w.y0).toBe(0)
      // a gable end: the wall runs on up the gable to near the ridge, 9 ft of overall width at 6:12 over the 9 ft plate
      expect(w.y1).toBeGreaterThan(9 + 4)
    }
    expect(a.faces[a.faces.length - 1] - a.faces[0]).toBeCloseTo(24, 6)
    expect(a.floors.length).toBeGreaterThan(0)
    expect(a.floors[0].y1).toBe(0)
  })

  test('the cross section reads the roof at its pitch, with a band under it, and marks the ridge', () => {
    expect(c.roofs.length).toBeGreaterThan(0)
    const top = c.roofs.flat()
    expect(steepest(c.roofs[0])).toBeCloseTo(0.5, 2)
    const ridge = Math.max(...top.map((p) => p[1]))
    expect(ridge).toBeCloseTo(9 + (b.parts[0].roof?.riseFt ?? NaN), 2)
    expect(Math.min(...top.map((p) => p[1]))).toBeLessThan(9 - ROOF_FT + 0.01)
    expect(c.levels.map((l) => l.label).join(' | ')).toMatch(/ridge/)
    // on flat ground with no lift the grade is the floor: one mark names both
    expect(c.levels.some((l) => l.label.split(' / ').includes('Floor') && l.yFt === 0)).toBe(true)
    expect(c.levels.some((l) => l.label.includes('plate') && Math.abs(l.yFt - 9) < 1e-9)).toBe(true)
  })

  test('the cross section passes through the front window: the wall stands open from sill to head', () => {
    const open = c.walls.filter((w) => w.opening)
    expect(open).toHaveLength(1)
    expect(open[0].opening).toMatchObject({ kind: 'window', sill: 3, head: 7 })
    expect(c.walls.filter((w) => !w.opening)).toHaveLength(1)
  })

  test('the window on the right wall is seen beyond the cross section, sill to head', () => {
    const rects = c.beyond.filter((l) => l.length === 5 && Math.min(...l.map((p) => p[1])) === 3 && Math.max(...l.map((p) => p[1])) === 7)
    expect(rects).toHaveLength(1)
    const us = rects[0].map((p) => p[0])
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(3, 6)
  })
})

describe('a curved wall', () => {
  test('an elliptical cabin is cut a wall thick where its wall meets the axis', () => {
    const { b, a, c } = sections([house('E', { shape: 'ellipse', roof: 'flat' })], flat, 'E')
    const t = b.parts[0].edges[0].thicknessFt
    expect(a.walls).toHaveLength(2)
    expect(c.walls).toHaveLength(2)
    expect(a.faces[a.faces.length - 1] - a.faces[0]).toBeCloseTo(24, 1)
    expect(c.faces[c.faces.length - 1] - c.faces[0]).toBeCloseTo(18, 1)
    for (const w of [...a.walls, ...c.walls]) expect(w.u1 - w.u0).toBeCloseTo(t, 1)
  })

  test('the Gathering prow: the long section crosses its curved wall and its prow roof, both as the scene builds them', () => {
    const plan = usePlanStore.getState().plan
    const objects = plan.order.map((id) => plan.objects[id]).filter((o): o is PlanObject => !!o)
    const prow = objects.find((o) => o.name === 'Gathering prow')
    if (!prow) throw new Error('no Gathering prow in Scheme C')
    const { b, a } = sections(objects, usePlanStore.getState().site.terrain, prow.id)
    const main = b.parts[0]
    const curved = main.edges.filter((e) => e.curved)
    expect(curved.length).toBeGreaterThan(0)
    const mainWalls = a.walls.filter((w) => w.part === main.name)
    expect(mainWalls.length).toBeGreaterThanOrEqual(2)
    for (const w of mainWalls) {
      expect(w.u1 - w.u0).toBeGreaterThan(0.2)
      expect(w.y1).toBeGreaterThanOrEqual(main.wallFt - 1e-9)
    }
    expect(a.roofs.length).toBeGreaterThan(0)
    const roofTop = Math.max(...a.roofs.flat().map((p) => p[1]))
    expect(roofTop).toBeGreaterThan(main.wallFt)
    expect(roofTop).toBeLessThanOrEqual(b.levels.topFt + 1e-6)
  })
})

describe('the ground', () => {
  const t = rising(0.15)
  const o = house('G', { earth: { sink: 4 } })
  const { b, c } = sections([o], t, 'G')

  test('is the finished grade the earthworks leave, read along the cut', () => {
    const works = siteEarthworks(t, earthOps([o], t))
    const floorM = b.levels.floorNavdFt * 0.3048
    for (const [u, y] of c.grade) {
      const [x, n] = localToSite(o.position, o.rotation, planAt(c.cut, u))
      expect(y).toBeCloseTo(mToFt(works.ground(x, n) - floorM), 6)
    }
  })

  test('climbs the slope at its grade in the survey, and the cut lowers it round the walls', () => {
    // B–B runs north–south at no turn: the survey rises 0.15 ft per ft across it
    const s = c.survey
    expect(Math.abs((s[s.length - 1][1] - s[0][1]) / (s[s.length - 1][0] - s[0][0]))).toBeCloseTo(0.15, 2)
    const lowered = c.grade.filter(([, y], i) => s[i][1] - y > 1)
    expect(lowered.length).toBeGreaterThan(0)
    expect(c.levels.filter((l) => l.label === GRADE_LABEL).length).toBeGreaterThan(0)
  })

  test('the retaining wall the cut passes through is cut, a wall thick, from its footing to the bank it holds', () => {
    const w = b.earthworks?.walls[0]
    if (!w) throw new Error('no retaining wall')
    const cutWalls = c.solids.filter((s) => Math.abs(Math.min(...s.map((p) => p[1])) - w.footFt) < 1e-9)
    expect(cutWalls).toHaveLength(1)
    const us = cutWalls[0].map((p) => p[0])
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(w.thicknessFt, 1)
    const top = Math.max(...cutWalls[0].map((p) => p[1]))
    expect(top).toBeGreaterThanOrEqual(w.topLowFt - 1e-9)
    expect(top).toBeLessThanOrEqual(w.topHighFt + 1e-9)
    // the uphill wall holds the bank up well above the cut floor
    expect(top - w.bottomFt).toBeGreaterThan(2)
  })
})

describe('gable infill off the walls', () => {
  test('a gable standing at a roof’s own outline, as a prow’s does, is drawn cut where the section crosses it', () => {
    const o = house('P', {})
    const b = sheetBuildings([o], flat)[0]
    const src = sectionSource(o, b, planGround([o], flat))
    // a gable quad 1 ft outside the right wall's face, from the plate up to 12 ft
    const quad: Tri[] = [
      [[13, 9, -2], [13, 9, 2], [13, 12, 2]],
      [[13, 9, -2], [13, 12, 2], [13, 12, -2]],
    ]
    const withGable = { ...src, parts: src.parts.map((p, i) => (i === 0 ? { ...p, gables: [...p.gables, ...quad] } : p)) }
    const a = sectionView(b, withGable, sectionCuts(b)![0])
    const band = a.solids.find((s) => Math.min(...s.map((q) => q[1])) === 9 && Math.max(...s.map((q) => q[1])) === 12)
    expect(band).toBeDefined()
    const us = band!.map((q) => q[0])
    expect((Math.min(...us) + Math.max(...us)) / 2).toBeCloseTo(13, 6)
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(b.parts[0].edges[0].thicknessFt, 6)
  })
})

describe('what the far wall hides', () => {
  const o = house('H', {})
  const b0 = sheetBuildings([o], flat)[0]
  const src = sectionSource(o, b0, planGround([o], flat))
  const cut = sectionCuts(b0)![0]
  const plate = b0.parts[0].levelFt + b0.parts[0].wallFt
  /** The building with one post at u = 2 ft, this far beyond the cut, from 2 ft below the floor to 8 ft above it. */
  const withPost = (depth: number): SheetBuilding => {
    const base = b0.supports[0]
    if (!base) throw new Error('the cabin has no supports to copy')
    const post = { ...base.posts[0], at: planAt(cut, 2, depth), footFt: -2, topFt: 8, onGround: false }
    return { ...b0, supports: [{ ...base, posts: [post], skirt: null }] }
  }
  /** The points of the lines seen beyond that lie wholly at u = 2 ft, a post's width either way (the post's pieces). */
  const postPoints = (v: SectionView) => v.beyond.filter((l) => l.every(([u]) => Math.abs(u - 2) < 0.6)).flat()

  test('a post behind the far wall shows only below the floor', () => {
    const v = sectionView(withPost(30), src, cut)
    const pts = postPoints(v)
    expect(pts.length).toBeGreaterThan(0)
    expect(Math.min(...pts.map(([, y]) => y))).toBeCloseTo(-2, 6)
    expect(Math.max(...pts.map(([, y]) => y))).toBeCloseTo(-FLOOR_FT, 6)
    expect(pts.every(([, y]) => y <= -FLOOR_FT + 1e-6 || y >= plate - 1e-6)).toBe(true)
  })

  test('a post inside the walls, nearer than the far wall, is seen whole', () => {
    const v = sectionView(withPost(3), src, cut)
    const ys = postPoints(v).map(([, y]) => y)
    expect(Math.min(...ys)).toBeCloseTo(-2, 6)
    expect(Math.max(...ys)).toBeCloseTo(8, 6)
  })

  test('a post just past the far wall’s face is hidden too, as a porch post on that wall is', () => {
    // the cabin is 18 ft deep, centred on the cut: its far face is 9 ft back
    const v = sectionView(withPost(9.1), src, cut)
    expect(Math.max(...postPoints(v).map(([, y]) => y))).toBeCloseTo(-FLOOR_FT, 6)
  })

  test('the far wall’s own windows stay seen', () => {
    const window = { id: 11, edge: 2, kind: 'window', x: 10.5, w: 3, h: 4, sill: 3 }
    const { c } = sections([house('W', { cuts: [window, { ...window, id: 21, edge: 1, x: 7.5 }] })], flat, 'W')
    expect(c.beyond.some((l) => l.length === 5 && Math.min(...l.map((p) => p[1])) === 3 && Math.max(...l.map((p) => p[1])) === 7)).toBe(true)
  })
})

describe('a stair the cut passes through', () => {
  const plan = usePlanStore.getState().plan
  const objects = plan.order.map((id) => plan.objects[id]).filter((x): x is PlanObject => !!x)
  const pod = objects.find((x) => x.name === 'Family twin pod')
  if (!pod) throw new Error('no Family twin pod in Scheme C')
  const { b, c } = sections(objects, usePlanStore.getState().site.terrain, pod.id)
  const stair = b.parts.find((p) => p.stair && c.cut && p.outline.length >= 3)
  if (!stair?.stair) throw new Error('the twin pod has no stair')

  test('the twin pod’s cross section runs down its stair and draws it cut: its risers, with a waist under them', () => {
    const s = stair.stair!
    const solid = c.solids.find((poly) => {
      const ys = poly.map((p) => p[1])
      return Math.abs(Math.max(...ys) - stair.levelFt) < 1e-6 && Math.abs(Math.min(...ys) - (stair.levelFt - s.dropFt - WAIST_FT)) < 1e-6
    })
    expect(solid).toBeDefined()
    // a riser is a vertical step: two points one above the other a riser apart
    const risers = solid!.slice(1).filter((p, i) => Math.abs(p[0] - solid![i][0]) < 1e-9 && Math.abs(solid![i][1] - p[1] - s.dropFt / s.risers) < 1e-6)
    expect(risers).toHaveLength(s.risers)
  })

  test('and no longer draws it thin as if beyond', () => {
    const s = stair.stair!
    const thin = c.beyond.filter((l) => l.length === 2 * s.risers + 1)
    expect(thin).toHaveLength(0)
  })
})
