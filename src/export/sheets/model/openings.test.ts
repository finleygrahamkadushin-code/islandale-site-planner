import { beforeAll, describe, expect, test } from 'vitest'
import type { LocalPoint } from '../../../buildings/footprint'
import { fitMass } from '../../../buildings/openings/openingEdits'
import { usePlanStore } from '../../../store/planStore'
import type { PlanObject } from '../../../store/types'
import { sheetBuildings } from './model'
import type { SheetBuilding, SheetPart } from '../types'

const store = () => usePlanStore.getState()
const objects = (): PlanObject[] => store().plan.order.map((id) => store().plan.objects[id])
const buildings = () => sheetBuildings(objects(), store().site.terrain)
const building = (id: string): SheetBuilding => {
  const b = buildings().find((x) => x.id === id)
  if (!b) throw new Error(`no ${id}`)
  return b
}
const pieceLength = (p: { a: readonly [number, number]; b: readonly [number, number] }) => Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1])
const edgeLength = (part: SheetPart, i: number) => part.edges[i].lengthFt

/** The point `s` feet round a part's outline from P1, in the P1 → P2 direction. */
function pointRound(part: SheetPart, s: number): LocalPoint {
  let left = ((s % part.perimeterFt) + part.perimeterFt) % part.perimeterFt
  for (const e of part.edges) {
    if (left <= e.lengthFt) return [e.a[0] + ((e.b[0] - e.a[0]) * left) / e.lengthFt, e.a[1] + ((e.b[1] - e.a[1]) * left) / e.lengthFt]
    left -= e.lengthFt
  }
  return part.outline[0]
}
const gap = (p: LocalPoint, q: LocalPoint) => Math.hypot(p[0] - q[0], p[1] - q[1])

beforeAll(() => {
  store().setReadOnly(null)
})

describe('openings along a curve', () => {
  beforeAll(() => store().loadScheme('C'))

  test("C-0's curved-wall window lies on the prow curve, its pieces adding up to its width", () => {
    const main = building('C-0').parts[0]
    const curved = main.openings.filter((o) => o.onCurve)
    expect(curved).toHaveLength(1)
    const o = curved[0]
    expect(o.arc).not.toBeNull()
    expect(o.wall).toBe('Main · curved wall')
    for (const p of o.pieces) expect(main.edges[p.edge].arc).toBe(o.arc)
    expect(o.pieces.reduce((s, p) => s + pieceLength(p), 0)).toBeCloseTo(o.widthFt, 6)
    expect(o.fromLeftFt).toBeNull()
  })

  test("C-0's window on the curve is located round the walls from P1 by the cut's own x, landing on its first end", () => {
    const main = building('C-0').parts[0]
    const placed = fitMass(store().plan.objects['C-0'].params, 0).openings.filter((c) => !c.hidden)
    const o = main.openings.find((x) => x.onCurve)
    const cut = placed.find((c) => c.along && c.w === o?.widthFt)
    if (!o || o.aroundFt === null || !cut) throw new Error('no curved opening')
    expect(o.aroundFt).toBeCloseTo(cut.x, 9)
    expect(gap(pointRound(main, o.aroundFt), o.a)).toBeLessThan(1e-6)
    expect(gap(pointRound(main, o.aroundFt + o.widthFt), o.b)).toBeLessThan(1e-6)
  })

  test('every opening on a part with a curve is located round its walls from P1, landing on its first end', () => {
    for (const scheme of ['C', 'D', 'E', 'F', 'G', 'I']) {
      store().loadScheme(scheme)
      for (const b of buildings()) {
        for (const p of b.parts.filter((x) => x.edges.some((e) => e.curved))) {
          for (const o of p.openings) {
            expect(o.aroundFt).not.toBeNull()
            // layoutOpenings drops a sliver of an along-cut under 0.05 ft on its first edge, so the drawn end can sit that far on
            expect(gap(pointRound(p, o.aroundFt ?? 0), o.a)).toBeLessThan(0.05)
          }
        }
      }
    }
  })
})

describe('openings on straight walls (scheme C)', () => {
  beforeAll(() => store().loadScheme('C'))
  const straightParts = () => buildings().flatMap((b) => b.parts.filter((p) => !p.edges.some((e) => e.curved) && p.openings.length))

  test('their openings sit within the wall they are measured on', () => {
    expect(straightParts().length).toBeGreaterThan(0)
    for (const part of straightParts()) {
      for (const o of part.openings) {
        expect(o.onCurve).toBe(false)
        const last = o.pieces[o.pieces.length - 1]
        const len = edgeLength(part, last.edge)
        if (o.fromLeftFt === null) throw new Error(`${o.tag} has no from-left`)
        expect(o.fromLeftFt).toBeGreaterThanOrEqual(0)
        expect(o.fromLeftFt).toBeLessThan(len)
        expect(o.fromLeftFt + pieceLength(last)).toBeLessThanOrEqual(len + 1e-6)
        expect(o.wall).not.toContain('curved')
        if (o.pieces.length > 1) expect(o.wall).toContain('turning onto')
      }
    }
  })

  test('a one-piece opening is measured from the left end, vertex b of its edge', () => {
    for (const part of straightParts()) {
      for (const o of part.openings.filter((x) => x.pieces.length === 1)) {
        const e = part.edges[o.pieces[0].edge]
        expect(gap(o.b, e.b)).toBeCloseTo(o.fromLeftFt ?? NaN, 6)
      }
    }
  })
})

describe('openings on curved walls (scheme D)', () => {
  beforeAll(() => store().loadScheme('D'))

  test("D-0's openings run round its blob, each with the curved-wall label and its place round from P1", () => {
    const main = building('D-0').parts[0]
    expect(main.curve).toBe('blob')
    expect(main.openings.length).toBeGreaterThan(0)
    const placed = fitMass(store().plan.objects['D-0'].params, 0).openings.filter((c) => !c.hidden)
    main.openings.forEach((o, k) => {
      expect(o.onCurve).toBe(true)
      expect(o.wall).toBe('Main · curved wall')
      expect(o.fromLeftFt).toBeNull()
      expect(o.aroundFt).toBeCloseTo(placed[k].x, 9)
    })
  })

  test('every opening in the scheme has a location: from the left of a straight wall or round from P1', () => {
    for (const b of buildings()) for (const p of b.parts) for (const o of p.openings) expect(o.fromLeftFt !== null || o.aroundFt !== null).toBe(true)
  })
})
