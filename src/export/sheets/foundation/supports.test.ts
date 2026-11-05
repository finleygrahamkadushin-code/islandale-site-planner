import { beforeAll, describe, expect, test } from 'vitest'
import type { LocalPoint } from '../../../buildings/footprint'
import { pointInPolygon } from '../../../buildings/foundation/foundation'
import { buildingMasses, massBuildingPoly, massPoly, massToBuilding } from '../../../buildings/masses'
import { supportPlan } from '../../../buildings/foundation/supports'
import { deckPostPoints } from '../../../buildings/decks/wingPosts'
import type { Terrain } from '../../../site/types'
import { usePlanStore } from '../../../store/planStore'
import type { PlanObject } from '../../../store/types'
import { sheetBuildings } from '../model/model'
import { sheetTables } from '../tables/table'
import type { SheetBuilding, SheetSupport } from '../types'

/**
 * What the parts stand on, on the sheets, checked against the support
 * layout the 3D scene builds (supportPlan and the wing post helpers, fed the
 * ground by hand here): every footprint shape, every support kind, any turn,
 * deck and porch wings, a standalone deck, and schemes C to C4.
 */

const FT = 0.3048
const SHAPES = ['rect', 'poly', 'ellipse', 'kidney', 'teardrop', 'blob', 'ribbon'] as const
const KINDS = ['posts', 'piers', 'pilings', 'mast', 'stilts', 'skirt', 'slab', 'earth'] as const
const TURNS = [0, 37, 200]
const LIFT_FT = 6
const POLY = [[-12, -9], [10, -9], [14, 0], [10, 9], [-12, 9]]
// flat ground at 10 m over an 81 x 81 grid at 2 m, centred on the origin
const flat: Terrain = { lon0: 0, lat0: 0, spacing: 2, nx: 81, ny: 81, x0: -80, n0: -80, z: new Array(81 * 81).fill(10) }

const house = (params: Record<string, unknown>, rotation = 0): PlanObject => ({
  id: 'H', type: 'house', name: 'H', position: { x: 0, n: 0 }, rotation, params: { w: 30, d: 20, h: 9, roof: 'flat', lift: LIFT_FT, ...params }, locked: false, hidden: false, labelVisible: true,
})
const sheetOf = (o: PlanObject, t: Terrain = flat): SheetBuilding => {
  const b = sheetBuildings([o], t)[0]
  if (!b) throw new Error('no sheet building')
  return b
}
const supportOf = (b: SheetBuilding, mi: number): SheetSupport => {
  const s = b.supports.find((x) => x.massIndex === mi)
  if (!s) throw new Error(`no supports under mass ${mi}`)
  return s
}
const close = (a: LocalPoint, b: LocalPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6
const shapeParams = (shape: string) => ({ shape, w: shape === 'ribbon' ? 40 : 30, d: shape === 'ribbon' ? 8 : 20, ...(shape === 'poly' ? { pts: POLY } : {}) })

describe('the main walls on every support kind, every footprint shape, any building turn', () => {
  for (const shape of SHAPES) {
    for (const support of KINDS) {
      test(`${support} under a ${shape}`, () => {
        const params = { ...shapeParams(shape), support, postSpacing: 7 }
        const m = buildingMasses(house(params).params)[0]
        // the scene's layout on this flat ground, where every point is LIFT_FT under the floor
        const scene = supportPlan({ poly: massPoly(m), support, spacingFt: 7, groundY: () => -LIFT_FT * FT })
        const outline = massBuildingPoly(m)
        const first = supportOf(sheetOf(house(params)), 0)
        for (const rotation of TURNS) {
          const s = supportOf(sheetOf(house(params, rotation)), 0)
          expect(s.kind).toBe(support)
          // the building frame turns with the building: the same supports at every turn
          expect(s.posts).toEqual(first.posts)
          expect(s.struts.length).toBe(scene.struts.length)
        }
        expect(first.posts.length).toBe(scene.posts.length)
        first.posts.forEach((p, i) => {
          expect(close(p.at, massToBuilding(m, [scene.posts[i].x / FT, scene.posts[i].z / FT]))).toBe(true)
          expect(pointInPolygon(outline, p.at[0], p.at[1])).toBe(true)
          expect(p.topFt).toBeCloseTo(0, 9)
          expect(p.footFt).toBeCloseTo(-LIFT_FT, 6)
        })
        expect(first.beams.length).toBe(scene.beams.length)
        expect(first.section?.sizeFt ?? null).toBe(scene.section ? scene.section.size / FT : null)
        if (scene.skirtBottom === null) expect(first.skirt).toBeNull()
        else expect(first.skirt?.bottomFt).toBeCloseTo(scene.skirtBottom / FT, 9)
        if (support === 'mast') {
          expect(first.mast).not.toBeNull()
          expect(pointInPolygon(outline, first.mast?.at[0] ?? NaN, first.mast?.at[1] ?? NaN)).toBe(true)
          expect(first.mast?.footDiameterFt).toBeGreaterThan(2)
        }
        if (support === 'stilts') {
          expect(first.struts.length).toBeGreaterThan(4)
          expect(first.footingDiameterFt).toBeCloseTo(0.52 / FT, 9)
          // every stilt runs down from the plate to a footing in the ground
          for (const t of first.struts) expect(t.bFt).toBeLessThan(-LIFT_FT)
        }
      })
    }
  }
})

describe('wings and decks', () => {
  const deck = { kind: 'deck', dx: 4, dz: 18, w: 16, d: 10, rot: 37 }
  const porch = { kind: 'porch', dx: -10, dz: 12, w: 12, d: 8, rot: 0, h: 8, roof: 'shed', slab: true }
  const roofOnly = { ...porch, dx: 12, dz: -12, slab: false }
  const b = sheetOf(house({ wings: [deck, porch, roofOnly] }, 37))
  const masses = buildingMasses(house({ wings: [deck, porch, roofOnly] }).params)

  test('a deck wing stands on its rim beam and posts, square to the wing', () => {
    const s = supportOf(b, 1)
    const m = masses[1]
    const expected = deckPostPoints(massPoly(m)).map((p) => massToBuilding(m, p))
    expect(s.kind).toBe('deck posts')
    expect(s.posts.map((p) => p.at)).toEqual(expected)
    expect(s.axisDeg).toBeCloseTo(-37, 9)
    // under the 0.3 m boards and the 0.28 m rim
    for (const p of s.posts) expect(p.topFt).toBeCloseTo(-0.58 / FT, 9)
    expect(s.beams.length).toBe(massPoly(m).length)
  })
  test('porch posts never stand inside the walls; with a floor they run down to the ground, without one they stand on it', () => {
    const main = b.parts[0].outline
    for (const mi of [2, 3]) {
      const s = supportOf(b, mi)
      expect(s.kind).toBe('porch posts')
      expect(s.posts.length).toBeGreaterThan(1)
      for (const p of s.posts) {
        expect(pointInPolygon(main, p.at[0], p.at[1])).toBe(false)
        expect(p.topFt).toBe(8)
      }
    }
    expect(supportOf(b, 2).posts.every((p) => p.onGround && Math.abs(p.footFt + LIFT_FT) < 1e-6)).toBe(true)
    expect(supportOf(b, 3).posts.every((p) => !p.onGround && p.footFt === 0)).toBe(true)
  })
  test('a standalone deck stands on posts by default, under its boards', () => {
    const o: PlanObject = { id: 'K', type: 'deck', name: 'K', position: { x: 0, n: 0 }, rotation: 20, params: { w: 16, d: 12, h: 5 }, locked: false, hidden: false, labelVisible: true }
    const s = sheetOf(o).supports
    expect(s.map((x) => x.kind)).toEqual(['posts'])
    expect(s[0].posts.length).toBeGreaterThan(3)
    for (const p of s[0].posts) {
      expect(p.topFt).toBeCloseTo(-0.3 / FT, 9)
      expect(p.footFt).toBeCloseTo(-5, 6)
    }
  })
  test('the Supports table lists every part that stands on something, with its count and size', () => {
    const t = sheetTables(b).find((x) => x.title === 'Supports')
    expect(t?.rows.map((r) => r[0])).toEqual(['Main', 'Deck 1', 'Porch 2', 'Porch 3'])
    expect(t?.rows[1][3]).toBe(String(supportOf(b, 1).posts.length))
  })
})

describe('schemes C to C4', () => {
  const store = () => usePlanStore.getState()
  beforeAll(() => store().setReadOnly(null))
  for (const scheme of ['C', 'C2', 'C3', 'C4']) {
    test(`${scheme}: every post stands under its own part, porch posts clear of the walls`, () => {
      store().loadScheme(scheme)
      const objects = store().plan.order.map((id) => store().plan.objects[id])
      const buildings = sheetBuildings(objects, store().site.terrain)
      expect(buildings.length).toBeGreaterThan(0)
      for (const b of buildings) {
        const closed = b.parts.filter((p) => p.kind === 'wall').map((p) => p.outline)
        for (const s of b.supports) {
          const part = b.parts[s.massIndex]
          expect(s.part).toBe(part.name)
          for (const p of s.posts) {
            expect(pointInPolygon(part.outline, p.at[0], p.at[1])).toBe(true)
            expect(p.topFt).toBeGreaterThanOrEqual(p.footFt)
            if (s.kind === 'porch posts') expect(closed.some((c) => pointInPolygon(c, p.at[0], p.at[1]))).toBe(false)
          }
        }
      }
    })
  }
  test("C-0's main walls stand on 8 in posts on beams", () => {
    store().loadScheme('C')
    const objects = store().plan.order.map((id) => store().plan.objects[id])
    const b = sheetBuildings(objects, store().site.terrain).find((x) => x.id === 'C-0')
    const s = b?.supports[0]
    expect(s?.kind).toBe('posts')
    expect(s?.section?.sizeFt).toBeCloseTo(8 / 12, 9)
    expect(s?.posts.length).toBe(20)
    expect(s?.beams.length).toBe(17)
  })
})
