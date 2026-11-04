import { beforeAll, describe, expect, test } from 'vitest'
import { sheetBuildings } from '../../export/sheets/model'
import type { SheetEdge, SheetOpening } from '../../export/sheets/types'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { arcEdgeIndices, arcPoints, openingStops, pointAlong } from './planDims'
import { planLayout } from './PlanSheet'
import type { Pt } from './svgDims'

const store = () => usePlanStore.getState()
const objects = (): PlanObject[] => store().plan.order.map((id) => store().plan.objects[id])

const opening = (a: Pt, b: Pt): SheetOpening => ({
  tag: 'W1',
  kind: 'window',
  wall: 'Main · front',
  a,
  b,
  pieces: [{ edge: 0, a, b, fromLeftFt: 0 }],
  arc: null,
  widthFt: Math.hypot(b[0] - a[0], b[1] - a[1]),
  fromLeftFt: 0,
  sillFt: 3,
  headFt: 7,
})

const square: Pt[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
]
const edges: SheetEdge[] = square.map((a, i) => {
  const b = square[(i + 1) % square.length]
  return { index: i, a, b, lengthFt: 10, name: `edge ${i + 1}`, arc: null }
})

beforeAll(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
})

describe('arcEdgeIndices', () => {
  test('lists a plain run from its first edge to its last', () => {
    expect(arcEdgeIndices(10, { fromEdge: 3, toEdge: 6 })).toEqual([3, 4, 5, 6])
  })

  test('wraps through vertex 0 when the run starts after it ends', () => {
    expect(arcEdgeIndices(10, { fromEdge: 8, toEdge: 1 })).toEqual([8, 9, 0, 1])
  })

  test('arcPoints follows a wrapping run and ends at the last edge’s far vertex', () => {
    expect(arcPoints(edges, { fromEdge: 3, toEdge: 0 })).toEqual([
      [0, 10],
      [0, 0],
      [10, 0],
    ])
  })
})

describe('openingStops', () => {
  test('gives nothing for a wall with no opening on it', () => {
    expect(openingStops([0, 0], [10, 0], [opening([2, 5], [4, 5])])).toEqual([])
  })

  test('chains the wall ends and each opening’s two ends, in order along the wall', () => {
    const stops = openingStops([0, 0], [10, 0], [opening([7, 0], [8.5, 0]), opening([3, 0.01], [2, 0.01])])
    expect(stops).toEqual([0, 2, 3, 7, 8.5, 10].map((t) => expect.closeTo(t, 6)))
  })

  test('merges an opening end that meets the wall end', () => {
    const stops = openingStops([0, 0], [10, 0], [opening([0, 0], [3, 0])])
    expect(stops).toEqual([0, 3, 10].map((t) => expect.closeTo(t, 6)))
  })

  test('pointAlong walks the given distance from a toward b', () => {
    const [x, z] = pointAlong([0, 0], [3, 4], 2.5)
    expect(x).toBeCloseTo(1.5, 9)
    expect(z).toBeCloseTo(2, 9)
  })

  test('the plan layout dimensions the width of every opening on a straight wall', () => {
    for (const b of sheetBuildings(objects(), store().site.terrain)) {
      const values = planLayout(b, 0.25).dims.map((d) => d.text.value)
      const onStraight = b.parts.flatMap((p) => p.openings.filter((o) => p.edges.some((e) => e.arc === null && openingStops(e.a, e.b, [o]).length)))
      for (const o of onStraight) expect(values.some((v) => Math.abs(v - o.widthFt) < 1e-6)).toBe(true)
    }
  })

  test('every straight-wall opening of scheme C lands on exactly one edge of its part, inside it', () => {
    const buildings = sheetBuildings(objects(), store().site.terrain)
    const parts = buildings.flatMap((b) => b.parts)
    const straight = parts.flatMap((p) =>
      p.openings.map((o) => p.edges.filter((e) => e.arc === null && openingStops(e.a, e.b, [o]).length > 0).length),
    )
    expect(straight.length).toBeGreaterThan(0)
    expect(straight.every((n) => n <= 1)).toBe(true)
    expect(straight.filter((n) => n === 1).length).toBeGreaterThan(0)
    for (const p of parts) {
      for (const e of p.edges.filter((x) => x.arc === null)) {
        const stops = openingStops(e.a, e.b, p.openings)
        stops.forEach((t, i) => i > 0 && expect(t).toBeGreaterThan(stops[i - 1]))
        if (stops.length) expect(stops[stops.length - 1]).toBeLessThanOrEqual(e.lengthFt + 1e-9)
      }
    }
  })
})

describe('overall dimensions', () => {
  test("measure the parts' outlines, with the roof and steps dimensioned apart and labelled where they reach further", () => {
    type P = readonly (readonly [number, number])[]
    const span = (i: 0 | 1, pts: P) => Math.max(...pts.map((p) => p[i])) - Math.min(...pts.map((p) => p[i]))
    const same = (got: number[], want: number[]) => {
      expect(got).toHaveLength(want.length)
      expect(got).toEqual(expect.arrayContaining(want.map((v) => expect.closeTo(v, 6))))
    }
    let roofs = 0
    for (const b of sheetBuildings(objects(), store().site.terrain)) {
      const dims = planLayout(b, 0.25).dims
      const labelled = (label: string) => dims.filter((d) => d.label === label).map((d) => d.text.value)
      const o = b.outlineBounds
      const lo = [o.minx, o.minz]
      const hi = [o.maxx, o.maxz]
      const reach = (i: 0 | 1, pts: P) => pts.length > 0 && (Math.min(...pts.map((p) => p[i])) < lo[i] - 1e-6 || Math.max(...pts.map((p) => p[i])) > hi[i] + 1e-6)
      same(labelled('Overall'), [o.maxx - o.minx, o.maxz - o.minz])
      const eave = b.parts.flatMap((p) => p.roof?.eave ?? [])
      const steps = b.parts.flatMap((p) => p.stepBands.flat(2))
      same(labelled('Roof overall'), ([0, 1] as const).filter((i) => reach(i, eave)).map((i) => span(i, eave)))
      same(labelled('Steps overall'), ([0, 1] as const).filter((i) => reach(i, steps)).map((i) => span(i, steps)))
      roofs += labelled('Roof overall').length
    }
    expect(roofs).toBeGreaterThan(0)
  })

  test('chains every straight-wall piece of an opening that runs along the walls (scheme D)', () => {
    store().loadScheme('D')
    try {
      for (const b of sheetBuildings(objects(), store().site.terrain)) {
        const values = planLayout(b, 0.25).dims.map((d) => d.text.value)
        for (const o of b.parts.flatMap((p) => p.openings)) {
          for (const piece of o.pieces) {
            const w = Math.hypot(piece.b[0] - piece.a[0], piece.b[1] - piece.a[1])
            // D-0's D3 and its neighbour overlap by a quarter inch in the data, so their shared stop is one
            if (w > 1 / 48) expect(values.some((v) => Math.abs(v - w) < 0.05)).toBe(true)
          }
        }
      }
    } finally {
      store().loadScheme('C')
    }
  })
})
