import { beforeAll, describe, expect, test } from 'vitest'
import { sheetBuildings } from '../model/model'
import type { Scale, SheetBuilding } from '../types'
import type { Terrain } from '../../../site/types'
import { usePlanStore } from '../../../store/planStore'
import type { PlanObject } from '../../../store/types'
import { penSizes, planLayout, supportNotes, type LabelledDim } from '../plan/planLayout'
import { spacingBox, spacingNote, spacingObstacles, spacingWords, supportChains, type SpacingDim } from './supportLayout'
import { boxCorners, boxesOverlap, type Box } from './textBoxes'
import { tileDrawing } from '../tiles'
import { textWidthFt } from '../svgDims'
import type { Plan } from '../../../store/types'
import defaultPlan from '../../../../data/plans/islandale.default.json'

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
  test('no two chains of a part repeat, and their words never sit on one another', () => {
    store().loadScheme('C')
    const objects = store().plan.order.map((id) => store().plan.objects[id])
    for (const b of sheetBuildings(objects, store().site.terrain)) {
      for (const s of b.supports) {
        const chains = supportChains({ ...b, supports: [s] }, opts, pen)
        const texts = chains.flat().map((d) => d.text)
        texts.forEach((t, i) => texts.slice(i + 1).forEach((u) => expect(Math.hypot(t.x - u.x, t.y - u.y)).toBeGreaterThan(pen.text * 0.5)))
      }
    }
  })
})

/**
 * The foundation plans as they print: the default plan, each building at the
 * scale its plans fit one Tabloid page at. A figure is only written where it
 * has clear paper; the drawing itself is never rescaled.
 */
describe('the default plan at the scales it prints at', () => {
  const store = () => usePlanStore.getState()
  const PROW_SCALE: Scale = 0.0625
  const CABIN_SCALE: Scale = 0.125
  const sheets = () => {
    store().setReadOnly(null)
    store().loadScheme('C')
    store().replacePlan(defaultPlan.plan as unknown as Plan)
    const objects = store().plan.order.map((id) => store().plan.objects[id])
    return sheetBuildings(objects, store().site.terrain)
      .filter((b) => b.supports.some((s) => s.posts.length))
      .map((b) => {
        const scale = b.name === 'Gathering prow' ? PROW_SCALE : CABIN_SCALE
        const pen = penSizes(scale)
        const layout = planLayout({ ...b, earthworks: null }, scale, null, true)
        const dims: readonly SpacingDim[] = layout.supportDims
        const written = dims.filter((d) => !d.wordless)
        return { b, scale, pen, layout, dims, written, boxes: written.map((d) => spacingBox(d, pen)) }
      })
  }
  const clashes = (boxes: readonly Box[], others: readonly Box[]) => boxes.flatMap((a, i) => others.filter((o, j) => (others !== boxes || j > i) && boxesOverlap(a, o)).map(() => i))

  test('the prow and the three cabins all have a foundation plan with spacing chains', () => {
    const all = sheets()
    expect(all.map((s) => s.b.name)).toContain('Gathering prow')
    expect(all.length).toBeGreaterThanOrEqual(4)
    for (const s of all) expect(s.dims.length).toBeGreaterThan(0)
  })

  test('no two spacing figures overprint', () => {
    for (const s of sheets()) expect(clashes(s.boxes, s.boxes), s.b.name).toEqual([])
  })

  test('no spacing figure sits on a post symbol or on the datum mark', () => {
    for (const s of sheets()) expect(clashes(s.boxes, spacingObstacles(s.b, s.pen)), s.b.name).toEqual([])
  })

  test('a spacing shorter than its own figure never has the figure between its ticks', () => {
    for (const s of sheets()) {
      for (const d of s.written.filter((w) => !w.leader)) {
        const mid = [(d.line.a[0] + d.line.b[0]) / 2, (d.line.a[1] + d.line.b[1]) / 2]
        const fromLine = Math.hypot(d.text.x - mid[0], d.text.y - mid[1])
        const box = spacingBox(d, s.pen)
        if (d.text.value < textWidthFt(spacingWords(d), box.halfAcross * 2)) expect(fromLine, `${s.b.name} ${spacingWords(d)}`).toBeGreaterThan(box.halfAcross * 2)
      }
    }
  })

  test('chains that run the same way never share a line: near rows are merged into one chain or set apart', () => {
    for (const s of sheets()) {
      const chains = supportChains(s.b, { gapFt: s.pen.gap, overshootFt: s.pen.overshoot, tickFt: s.pen.tick, textOffsetFt: s.pen.text * 0.75 }, s.pen)
      const lines = chains.map((c) => ({ a: c[0].line.a, b: c[c.length - 1].line.b }))
      const size = spacingBox(chains[0][0], s.pen).halfAcross * 2
      lines.forEach((p, i) =>
        lines.slice(i + 1).forEach((q) => {
          const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1])
          const u = [(p.b[0] - p.a[0]) / len, (p.b[1] - p.a[1]) / len]
          const along = (pt: readonly number[]) => (pt[0] - p.a[0]) * u[0] + (pt[1] - p.a[1]) * u[1]
          const off = (pt: readonly number[]) => Math.abs(-(pt[0] - p.a[0]) * u[1] + (pt[1] - p.a[1]) * u[0])
          const parallel = Math.abs(off(q.a) - off(q.b)) < 1e-6
          const [lo, hi] = [Math.min(along(q.a), along(q.b)), Math.max(along(q.a), along(q.b))]
          const overlap = Math.min(hi, len) - Math.max(lo, 0)
          if (parallel && overlap > 0) expect(off(q.a), s.b.name).toBeGreaterThan(size * 0.5)
        }),
      )
    }
  })

  test('every spacing of the cabins is written, and at 1/16 all but one in six of the prow\'s', () => {
    for (const s of sheets()) expect(s.dims.length - s.written.length, s.b.name).toBeLessThanOrEqual(s.scale === PROW_SCALE ? s.dims.length / 6 : 0)
  })

  test('a figure with no clear place beside its spacing stands off on a leader that starts on its spacing and ends at the figure', () => {
    const led = sheets().flatMap((s) => s.written.filter((d) => d.leader).map((d) => ({ d, box: spacingBox(d, s.pen), pen: s.pen })))
    expect(led.length).toBeGreaterThan(0)
    for (const { d, box, pen: p } of led) {
      const { a, b } = d.leader as NonNullable<SpacingDim['leader']>
      const along = ((a[0] - d.line.a[0]) * (d.line.b[0] - d.line.a[0]) + (a[1] - d.line.a[1]) * (d.line.b[1] - d.line.a[1])) / d.text.value ** 2
      expect(along).toBeGreaterThan(0)
      expect(along).toBeLessThan(1)
      expect(Math.hypot(b[0] - d.text.x, b[1] - d.text.y)).toBeLessThanOrEqual(box.halfAlong + p.small)
    }
  })

  test('the last note says how to read a leader or bare ticks, in one line no longer than the supports\' own notes', () => {
    for (const s of sheets()) {
      const longest = Math.max(...supportNotes(s.b, true).map((l) => l.length))
      const note = spacingNote(s.dims)
      expect(note.length, s.b.name).toBeLessThanOrEqual(longest)
      expect(note.includes('leader'), s.b.name).toBe(s.dims.some((d) => d.leader))
      expect(note.includes('ticked only'), s.b.name).toBe(s.dims.some((d) => d.wordless))
    }
  })

  test('every figure is inside the drawing, which still fits one Tabloid page at its scale', () => {
    for (const s of sheets()) {
      const { x, y, w, h } = s.layout.extent
      for (const p of s.boxes.flatMap(boxCorners)) {
        expect(p[0], s.b.name).toBeGreaterThanOrEqual(x)
        expect(p[0], s.b.name).toBeLessThanOrEqual(x + w)
        expect(p[1], s.b.name).toBeGreaterThanOrEqual(y)
        expect(p[1], s.b.name).toBeLessThanOrEqual(y + h)
      }
      expect(tileDrawing(w, h, 'tabloid', s.scale), s.b.name).toHaveLength(1)
    }
  })
})

describe('near rows of different parts', () => {
  test("a porch whose posts stand on the line of the cabin's row shares its chain, from the outermost face to the outermost face", () => {
    // the porch runs on from the cabin's east wall, its back posts on the line of the cabin's back row (z = -9.75)
    const porch = { kind: 'porch', dx: 20, dz: -7.55, w: 10, d: 6 }
    const b = sheetOf(house({ support: 'posts', postSpacing: 7, wings: [porch] }))
    const alongX = supportChains(b, opts, pen).filter((c) => Math.abs(c[0].line.a[1] - c[0].line.b[1]) < 1e-9)
    const reach = (c: readonly LabelledDim[]) => [c[0].line.a[0], c[c.length - 1].line.b[0]]
    const shared = alongX.filter((c) => Math.abs(sum(c) - 40) < 1e-6)
    expect(shared).toHaveLength(1)
    expect(reach(shared[0])[0]).toBeCloseTo(-15, 6)
    expect(reach(shared[0])[1]).toBeCloseTo(25, 6)
    // the cabin's five posts and the porch's two, between the two outer faces: eight pieces, and no chain of the porch's own on that line
    expect(shared[0]).toHaveLength(8)
    expect(alongX.filter((c) => Math.abs(sum(c) - 10) < 1e-6 && Math.abs(c[0].line.a[1] - shared[0][0].line.a[1]) < 3)).toEqual([])
  })
})
