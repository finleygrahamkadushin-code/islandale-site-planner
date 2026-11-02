import { beforeAll, describe, expect, test } from 'vitest'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { sheetBuildings } from './model'
import type { SheetBuilding, SheetPart } from './types'

const store = () => usePlanStore.getState()
const objects = (): PlanObject[] => store().plan.order.map((id) => store().plan.objects[id])
const building = (id: string): SheetBuilding => {
  const b = sheetBuildings(objects(), store().site.terrain).find((x) => x.id === id)
  if (!b) throw new Error(`no ${id}`)
  return b
}
const pieceLength = (p: { a: readonly [number, number]; b: readonly [number, number] }) => Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1])
const edgeLength = (part: SheetPart, i: number) => part.edges[i].lengthFt

beforeAll(() => {
  store().setReadOnly(null)
})

describe('openings along a curve', () => {
  beforeAll(() => store().loadScheme('C'))

  test("C-0's curved-wall window lies on the prow curve, its pieces adding up to its width", () => {
    const main = building('C-0').parts[0]
    const curved = main.openings.filter((o) => o.arc !== null)
    expect(curved).toHaveLength(1)
    const o = curved[0]
    const arc = main.arcs[o.arc ?? -1]
    expect(o.wall).toMatch(/^Main · curved wall, edges \d+–\d+$/)
    for (const p of o.pieces) expect(main.edges[p.edge].arc).toBe(o.arc)
    expect(o.pieces.reduce((s, p) => s + pieceLength(p), 0)).toBeCloseTo(o.widthFt, 6)
    expect(o.fromLeftFt).toBeGreaterThan(0)
    expect(o.fromLeftFt).toBeLessThan(arc.lengthFt)
  })

  test('from left along the curve, the width and from the right add up to the curve', () => {
    const main = building('C-0').parts[0]
    const o = main.openings.find((x) => x.arc !== null)
    if (!o || o.arc === null) throw new Error('no curved opening')
    const arc = main.arcs[o.arc]
    const first = o.pieces[0]
    let fromRight = edgeLength(main, first.edge) - first.fromLeftFt - pieceLength(first)
    for (let i = arc.fromEdge; i !== first.edge; i = (i + 1) % main.edges.length) fromRight += edgeLength(main, i)
    expect(fromRight + o.widthFt + o.fromLeftFt).toBeCloseTo(arc.lengthFt, 6)
  })
})

describe('openings along straight walls (scheme D)', () => {
  beforeAll(() => store().loadScheme('D'))

  test("D-0's openings sit within the wall they are measured on", () => {
    const main = building('D-0').parts[0]
    expect(main.openings.length).toBeGreaterThan(0)
    for (const o of main.openings) {
      expect(o.arc).toBeNull()
      const first = o.pieces[0]
      const len = edgeLength(main, first.edge)
      expect(o.fromLeftFt).toBeGreaterThanOrEqual(0)
      expect(o.fromLeftFt).toBeLessThan(len)
      expect(o.fromLeftFt + pieceLength(first)).toBeLessThanOrEqual(len + 1e-6)
      expect(o.wall).not.toContain('curved')
      if (o.pieces.length > 1) expect(o.wall).toContain('turning onto')
    }
  })

  test('a one-piece opening is measured from the left end, vertex b of its edge', () => {
    const main = building('D-0').parts[0]
    for (const o of main.openings.filter((x) => x.pieces.length === 1)) {
      const e = main.edges[o.pieces[0].edge]
      expect(Math.hypot(o.b[0] - e.b[0], o.b[1] - e.b[1])).toBeCloseTo(o.fromLeftFt, 6)
    }
  })
})
