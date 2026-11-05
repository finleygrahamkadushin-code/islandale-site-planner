import { beforeAll, describe, expect, test } from 'vitest'
import { sheetBuildings } from '../../export/sheets/model'
import type { SheetBuilding } from '../../export/sheets/types'
import type { Terrain } from '../../site/types'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { penSizes, planLayout, type LabelledDim } from './planLayout'
import { supportChains } from './supportLayout'

/**
 * The supports' spacing chains on the plan: one per distinct row and column
 * of posts, face to face, the same at any building turn, on every footprint
 * shape and support kind, and few enough on Scheme C to stay legible.
 */

const pen = penSizes(0.25)
const opts = { gapFt: pen.gap, overshootFt: pen.overshoot, tickFt: pen.tick, textOffsetFt: pen.text * 0.75 }
const SHAPES = ['rect', 'poly', 'ellipse', 'kidney', 'teardrop', 'blob', 'ribbon'] as const
const KINDS = ['posts', 'piers', 'pilings', 'mast', 'stilts', 'skirt', 'slab', 'earth'] as const
const POLY = [[-12, -9], [10, -9], [14, 0], [10, 9], [-12, 9]]
const flat: Terrain = { lon0: 0, lat0: 0, spacing: 2, nx: 81, ny: 81, x0: -80, n0: -80, z: new Array(81 * 81).fill(10) }

const house = (params: Record<string, unknown>, rotation = 0): PlanObject => ({
  id: 'H', type: 'house', name: 'H', position: { x: 0, n: 0 }, rotation, params: { w: 30, d: 20, h: 9, roof: 'flat', lift: 6, ...params }, locked: false, hidden: false, labelVisible: true,
})
const sheetOf = (o: PlanObject): SheetBuilding => sheetBuildings([o], flat)[0]
const values = (chain: readonly LabelledDim[]) => chain.map((d) => d.text.value)
const sum = (chain: readonly LabelledDim[]) => values(chain).reduce((s, v) => s + v, 0)
const shapeParams = (shape: string) => ({ shape, w: shape === 'ribbon' ? 40 : 30, d: shape === 'ribbon' ? 8 : 20, ...(shape === 'poly' ? { pts: POLY } : {}) })

describe('spacing chains', () => {
  test('a square grid of posts takes one chain across and one down, each from face to face', () => {
    for (const rotation of [0, 37, 200]) {
      const b = sheetOf(house({ support: 'posts', postSpacing: 7 }, rotation))
      const chains = supportChains(b, opts, pen)
      expect(chains).toHaveLength(2)
      expect(sum(chains[0])).toBeCloseTo(30, 6)
      expect(sum(chains[1])).toBeCloseTo(20, 6)
      // every piece but the two from the faces is post to post, the grid's even bays
      for (const c of chains) {
        const bays = values(c).slice(1, -1)
        expect(bays.length).toBeGreaterThan(1)
        for (const v of bays) expect(v).toBeCloseTo(bays[0], 6)
      }
    }
  })

  test('the chains are the same at any building turn', () => {
    const at = (rotation: number) => supportChains(sheetOf(house({ support: 'piers', shape: 'ellipse' }, rotation)), opts, pen).map(values)
    const first = at(0)
    for (const rotation of [37, 200]) {
      const turned = at(rotation)
      expect(turned.length).toBe(first.length)
      turned.forEach((c, i) => c.forEach((v, j) => expect(v).toBeCloseTo(first[i][j], 6)))
    }
  })

  for (const shape of SHAPES) {
    test(`every support kind under a ${shape}: chains run piece to piece along a line, a mast is located across and down, nothing for a skirt, slab, bench or stilts`, () => {
      for (const support of KINDS) {
        const b = sheetOf(house({ ...shapeParams(shape), support, postSpacing: 7 }, 25))
        const s = b.supports[0]
        const chains = supportChains({ ...b, supports: [s] }, opts, pen)
        if (support === 'mast') {
          expect(chains).toHaveLength(2)
          for (const c of chains) expect(c).toHaveLength(2)
        } else if (!s.posts.length) {
          expect(chains).toEqual([])
        } else {
          expect(chains.length).toBeGreaterThan(0)
          // no more chains than the posts have rows and columns
          expect(chains.length).toBeLessThanOrEqual(s.posts.length * 2)
        }
        for (const c of chains) {
          c.forEach((d, i) => {
            expect(d.text.value).toBeGreaterThan(0)
            expect(Number.isFinite(d.text.x) && Number.isFinite(d.text.y)).toBe(true)
            if (i) expect(Math.hypot(d.line.a[0] - c[i - 1].line.b[0], d.line.a[1] - c[i - 1].line.b[1])).toBeLessThan(1e-9)
          })
        }
      }
    })
  }

  test('wings get their own chains, a deck square to its own turn', () => {
    const deck = { kind: 'deck', dx: 4, dz: 18, w: 16, d: 10, rot: 37 }
    const b = sheetOf(house({ support: 'slab', wings: [deck] }))
    const chains = supportChains(b, opts, pen)
    expect(chains.length).toBeGreaterThan(0)
    const along = chains[0][0]
    const angle = (Math.atan2(along.line.b[1] - along.line.a[1], along.line.b[0] - along.line.a[0]) * 180) / Math.PI
    expect(Math.abs(Math.abs(angle) - 37)).toBeLessThan(1e-6)
  })
})

describe('the plan with and without its supports', () => {
  test('left out, a plan has no chains and no supports note; drawn, it has both, and reaches out to the stilts', () => {
    const b = sheetOf(house({ support: 'stilts' }))
    const without = planLayout(b, 0.25)
    expect(without.supportDims).toEqual([])
    expect(without.general?.lines.some((l) => l.startsWith('Supports'))).not.toBe(true)
    const withSupports = planLayout(b, 0.25, null, true)
    expect(withSupports.general?.lines.some((l) => l.startsWith('Supports'))).toBe(true)
    const { x, y, w, h } = withSupports.extent
    for (const t of b.supports[0].struts) {
      expect(t.b[0]).toBeGreaterThan(x)
      expect(t.b[0]).toBeLessThan(x + w)
      expect(t.b[1]).toBeGreaterThan(y)
      expect(t.b[1]).toBeLessThan(y + h)
    }
  })
})

describe('Scheme C', () => {
  const store = () => usePlanStore.getState()
  beforeAll(() => store().setReadOnly(null))
  for (const scheme of ['C', 'C2', 'C3', 'C4']) {
    test(`${scheme}: no two chains of a part repeat, and their words never sit on one another`, () => {
      store().loadScheme(scheme)
      const objects = store().plan.order.map((id) => store().plan.objects[id])
      for (const b of sheetBuildings(objects, store().site.terrain)) {
        for (const s of b.supports) {
          const chains = supportChains({ ...b, supports: [s] }, opts, pen)
          const texts = chains.flat().map((d) => d.text)
          texts.forEach((t, i) => texts.slice(i + 1).forEach((u) => expect(Math.hypot(t.x - u.x, t.y - u.y)).toBeGreaterThan(pen.text * 0.5)))
        }
      }
    })
  }
})
