import { describe, expect, test } from 'vitest'
import schemes from '../../../data/islandale/schemes.json'
import { buildingMasses, massPoly, massToBuilding } from '../../buildings/masses'
import * as G from '../geom'
import type { Pt } from '../geom'
import { interior3d } from './interior3d'
import { innerOutlines, prismArea, shapesOf, type Prism } from './interiorShell'

type Obj = { name: string } & Record<string, unknown>
const all = (schemes as unknown as { schemes: { id: string; objects: Obj[] }[] }).schemes
const cabin = (name: string) => all.find((s) => s.id === 'C')!.objects.find((o) => o.name === name)!

const outlines = (params: Record<string, unknown>): Pt[][] =>
  buildingMasses(params)
    .filter((m) => !m.open && massPoly(m).length >= 3)
    .map((m) => massPoly(m).map((p) => massToBuilding(m, p) as Pt))

/** How far inside the exterior walls' outer face a plan point is (negative: outside every enclosed part). */
function depthInside(params: Record<string, unknown>, p: Pt): number {
  let best = -Infinity
  for (const P of outlines(params)) {
    const d = G.distToBoundary(P, p)
    best = Math.max(best, G.pointInPoly(P, p[0], p[1]) ? d : -d)
  }
  return best
}

const partitions = (m: { prisms: readonly Prism[] }) => m.prisms.filter((p) => p.part !== 'floor')

/** Plan area shared by two prisms' outlines, feet² (touching edges share none). */
function overlap(a: Prism, b: Prism): number {
  const A = G.bbox([a.outer as Pt[]])
  const B = G.bbox([b.outer as Pt[]])
  if (A.x2 < B.x1 || B.x2 < A.x1 || A.z2 < B.z1 || B.z2 < A.z1) return 0
  return G.intersectRegion(a.outer as Pt[], G.toPieces(b.outer as Pt[])).reduce((s, x) => s + G.area(x), 0)
}

/** Scheme C's cabins with a curved main wall. */
const CURVED = ['Gathering prow']

describe('interior shell (6K · K1)', () => {
  test.each(CURVED)(
    'C %s: no partition reaches the outer face of a curved wall',
    (name) => {
      const o = cabin(name)
      for (const p of partitions(interior3d(o)))
        for (const q of [p.outer, ...p.holes].flat()) expect(depthInside(o, q as Pt)).toBeGreaterThan(0.2)
    },
    30_000,
  )

  test.each([...CURVED, 'Family lantern', 'Family twin pod', 'Elders’ wedge'])(
    'C %s: partitions that share a height never overlap in plan',
    (name) => {
      const ps = partitions(interior3d(cabin(name)))
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          if (ps[i].y1 <= ps[j].y0 + 1e-6 || ps[j].y1 <= ps[i].y0 + 1e-6) continue
          expect(overlap(ps[i], ps[j])).toBeLessThan(0.01)
        }
    },
    30_000,
  )

  test("C's gathering cabin has a floor over everything inside its walls, and none past them", () => {
    const o = cabin('Gathering prow')
    const floors = interior3d(o).prisms.filter((p) => p.part === 'floor')
    const inside = shapesOf(innerOutlines(o, 0).flatMap((P) => G.toPieces(P))).reduce((s, x) => s + prismArea(x), 0)
    const covered = floors.reduce((s, p) => s + prismArea(p), 0)
    expect(covered).toBeGreaterThan(inside * 0.99)
    expect(covered).toBeLessThan(inside * 1.01)
    for (const p of floors) for (const q of p.outer) expect(depthInside(o, q as Pt)).toBeGreaterThan(0.2)
  })

  test('an L corner of two partitions is one closed shape, with no notch at the outside corner', () => {
    const params = {
      w: 20,
      d: 20,
      h: 9,
      floors: [
        {
          name: 'Main floor',
          rooms: [
            { id: 1, type: 'bedroom', name: 'Bed', pts: [[0, 0], [10, 0], [10, 10], [0, 10]] },
            { id: 2, type: 'living', name: 'Living', pts: [[-10, -10], [10, -10], [10, 0], [0, 0], [0, 10], [-10, 10]] },
          ],
          openings: [],
          furniture: [],
        },
      ],
    }
    const walls = interior3d(params).prisms.filter((p) => p.part === 'wall')
    expect(walls).toHaveLength(1)
    const t = 1 / 3
    expect(G.pointInPoly(walls[0].outer, -t / 2 + 0.02, -t / 2 + 0.02)).toBe(true)
    // the far ends stop inside the walls, past their inner face (10 - 0.66)
    const xs = walls[0].outer.map((p) => p[0])
    expect(Math.max(...xs)).toBeGreaterThan(10 - 0.66)
    expect(Math.max(...xs)).toBeLessThan(10 - 0.2)
  })

  test('rooms get a floor each: wood in a bedroom, tile in a bath', () => {
    const params = {
      w: 20,
      d: 20,
      h: 9,
      floors: [
        {
          name: 'Main floor',
          rooms: [
            { id: 1, type: 'bedroom', name: 'Bed', pts: [[-10, -10], [0, -10], [0, 10], [-10, 10]] },
            { id: 2, type: 'bath', name: 'Bath', pts: [[0, -10], [10, -10], [10, 10], [0, 10]] },
          ],
          openings: [],
          furniture: [],
        },
      ],
    }
    const floors = interior3d(params).prisms.filter((p) => p.part === 'floor')
    expect(new Set(floors.map((f) => f.color)).size).toBe(2)
    expect(floors.every((f) => f.y0 === 0 && f.y1 > 0)).toBe(true)
  })
})
