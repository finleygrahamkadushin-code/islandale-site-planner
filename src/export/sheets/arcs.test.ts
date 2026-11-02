import { beforeAll, describe, expect, test } from 'vitest'
import type { LocalPoint } from '../../buildings/footprint'
import { buildingMasses, massBuildingPoly, massPoly } from '../../buildings/masses'
import { usePlanStore } from '../../store/planStore'
import { fitArcs } from './arcs'

/** Points round a circle from a0 to a1 degrees, in k equal edges. */
const arcPts = (cx: number, cz: number, r: number, a0: number, a1: number, k: number): LocalPoint[] =>
  Array.from({ length: k + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / k) * Math.PI) / 180
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)]
  })

describe('fitArcs on drawn shapes', () => {
  test('finds a quarter circle between two straight edges, with its centre, radius and sweep', () => {
    const outline: LocalPoint[] = [[0, 10], ...arcPts(0, 0, 10, 90, 180, 12).slice(1), [-10, -20], [0, -20]]
    const arcs = fitArcs(outline, true)
    expect(arcs).toHaveLength(1)
    const [a] = arcs
    expect([a.fromEdge, a.toEdge]).toEqual([0, 11])
    expect(a.centre[0]).toBeCloseTo(0, 6)
    expect(a.centre[1]).toBeCloseTo(0, 6)
    expect(a.radiusFt).toBeCloseTo(10, 6)
    expect(a.sweepDeg).toBeCloseTo(90, 6)
    expect(a.chordFt).toBeCloseTo(10 * Math.SQRT2, 6)
    expect(a.lengthFt).toBeLessThan((Math.PI * 10) / 2)
    expect(a.fitErrorFt).toBeLessThan(1e-6)
  })

  test('an open chain bending the other way is found too, sweep positive', () => {
    const arcs = fitArcs(arcPts(5, 5, 6, 0, -120, 10), false)
    expect(arcs).toHaveLength(1)
    expect(arcs[0].sweepDeg).toBeCloseTo(120, 6)
    expect(arcs[0].radiusFt).toBeCloseTo(6, 6)
  })

  test('a ring of short edges is one whole-circle arc', () => {
    const ring = arcPts(0, 0, 5, 0, 360, 24).slice(0, 24)
    const arcs = fitArcs(ring, true)
    expect(arcs).toHaveLength(1)
    expect(arcs[0].sweepDeg).toBeCloseTo(360, 6)
  })

  test('an arc through vertex 0 of a closed outline stays one arc', () => {
    const outline: LocalPoint[] = [...arcPts(0, 0, 10, 135, 180, 6), [-10, -20], [0, -20], ...arcPts(0, 0, 10, 90, 135, 6).slice(0, -1)]
    const arcs = fitArcs(outline, true)
    expect(arcs).toHaveLength(1)
    expect(arcs[0].fromEdge).toBeGreaterThan(arcs[0].toEdge)
    expect(arcs[0].sweepDeg).toBeCloseTo(90, 6)
  })

  test('no arcs on rectangles, hexagons, octagons, or a long straight edge cut in pieces', () => {
    const shape = (shape: string, w = 20, d = 14) => massPoly(buildingMasses({ w, d, shape })[0])
    expect(fitArcs(shape('rect'), true)).toEqual([])
    expect(fitArcs(shape('hex'), true)).toEqual([])
    expect(fitArcs(shape('oct'), true)).toEqual([])
    expect(fitArcs(shape('oct', 6, 6), true)).toEqual([])
    const straight: LocalPoint[] = Array.from({ length: 10 }, (_, i) => [i * 2, 0])
    expect(fitArcs(straight, false)).toEqual([])
  })

  test('a zig-zag of short edges is not a curve', () => {
    const zig: LocalPoint[] = Array.from({ length: 10 }, (_, i) => [i * 2, i % 2 ? 0.3 : 0])
    expect(fitArcs(zig, false)).toEqual([])
  })
})

describe('fitArcs on scheme C', () => {
  beforeAll(() => {
    usePlanStore.getState().setReadOnly(null)
    usePlanStore.getState().loadScheme('C')
  })
  const prow = () => buildingMasses(usePlanStore.getState().plan.objects['C-0'].params)

  test("the prow's main walls curve once, edges 4–15, a quarter circle", () => {
    const main = massBuildingPoly(prow()[0])
    expect(main).toHaveLength(17)
    const arcs = fitArcs(main, true)
    expect(arcs).toHaveLength(1)
    expect([arcs[0].fromEdge, arcs[0].toEdge]).toEqual([4, 15])
    expect(arcs[0].sweepDeg).toBeCloseTo(90, 0)
    expect(arcs[0].fitErrorFt).toBeLessThan(0.1)
  })

  test("the prow deck's outer edge is an arc on the same centre (edges 3–14)", () => {
    const main = fitArcs(massBuildingPoly(prow()[0]), true)[0]
    const arcs = fitArcs(massBuildingPoly(prow()[3]), true)
    const outer = arcs.find((a) => a.fromEdge === 3)
    expect(outer?.toEdge).toBe(14)
    expect(outer?.centre[0]).toBeCloseTo(main.centre[0], 1)
    expect(outer?.centre[1]).toBeCloseTo(main.centre[1], 1)
    expect(outer?.radiusFt).toBeGreaterThan(main.radiusFt)
  })
})
