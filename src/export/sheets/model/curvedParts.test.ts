import { beforeAll, describe, expect, test } from 'vitest'
import type { LocalPoint } from '../../../buildings/footprint'
import { buildingMasses, buildingToMass, type Mass } from '../../../buildings/masses'
import { usePlanStore } from '../../../store/planStore'
import type { PlanObject } from '../../../store/types'
import { planLayout } from '../plan/planLayout'
import { STATION_FT } from './curves'
import { sheetBuildings } from './model'
import { sheetTables, tablesCsv } from '../tables/table'
import type { SheetBuilding, SheetPart } from '../types'

/**
 * The sheets on curved parts built in code, not taken from a scheme: every
 * curved footprint, as the main walls and as a turned wing, with openings
 * that run round the walls and one cut on a single chord.
 */

const SHAPES = ['ellipse', 'kidney', 'teardrop', 'blob', 'ribbon'] as const
const TURNS = [0, 37, 200]

const store = () => usePlanStore.getState()

/** A cabin on scheme C's twin-pod spot with the given params in place of its own. */
function cabin(params: Record<string, unknown>, rotation = 0): { b: SheetBuilding; masses: Mass[] } {
  const base = store().plan.objects['C-2']
  const o: PlanObject = { ...base, rotation, params: { ...base.params, pts: undefined, wings: [], cuts: [], ...params } }
  const b = sheetBuildings([o], store().site.terrain)[0]
  if (!b) throw new Error('no sheet building')
  return { b, masses: buildingMasses(o.params) }
}

const cuts = [
  { id: 1, along: true, kind: 'door', x: 3, w: 3, h: 7, sill: 0 },
  { id: 2, along: true, kind: 'window', x: 20, w: 6, h: 4, sill: 3 },
  { id: 3, edge: 9, kind: 'window', x: 0.2, w: 1, h: 3, sill: 3 },
]

const segDist = (p: LocalPoint, a: LocalPoint, b: LocalPoint) => {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}
const onOutline = (p: LocalPoint, outline: readonly LocalPoint[]) => Math.min(...outline.map((a, i) => segDist(p, a, outline[(i + 1) % outline.length])))

/** What every curved part must satisfy, whatever its shape or turn. */
function checkCurvedPart(b: SheetBuilding, part: SheetPart, m: Mass) {
  expect(part.curve).toBe(m.shape)
  // width and depth are the drawn outline's, along the part's own axes
  const own = part.outline.map((p) => buildingToMass(m, p))
  expect(part.wFt).toBeCloseTo(Math.max(...own.map((p) => p[0])) - Math.min(...own.map((p) => p[0])), 6)
  expect(part.dFt).toBeCloseTo(Math.max(...own.map((p) => p[1])) - Math.min(...own.map((p) => p[1])), 6)
  // most of the outline is curve; nearly all of that is drawn by arcs, each a true fit
  const curved = part.edges.filter((e) => e.curved)
  expect(curved.length).toBeGreaterThan(part.edges.length * 0.8)
  for (const a of part.arcs) expect(a.fitErrorFt).toBeLessThan(part.ellipse?.fourCentreErrorFt != null ? 0.25 : 0.1)
  // points: P1 first, every label once, in order round the outline, all on it, stations an even STATION_FT round from P1
  expect(part.points[0]).toMatchObject({ label: 'P1', vertex: 0, aroundFt: 0 })
  expect(new Set(part.points.map((p) => p.label)).size).toBe(part.points.length)
  part.points.forEach((p, i) => {
    if (i > 0) expect(p.aroundFt).toBeGreaterThan(part.points[i - 1].aroundFt)
    expect(onOutline(p.at, part.outline)).toBeLessThan(1e-6)
    if (p.vertex === null) expect((p.aroundFt / STATION_FT) % 1).toBeCloseTo(0, 9)
  })
  // far fewer labels than vertices: no P inside an arc
  expect(part.points.filter((p) => p.vertex !== null).length).toBeLessThan(part.outline.length / 2)
  // every opening is on the curve and located round from P1, with a note on the plan
  const notes = planLayout(b, 0.25).notes
  for (const o of part.openings) {
    expect(o.aroundFt).not.toBeNull()
    if (o.onCurve) {
      expect(o.wall).toMatch(/· curved wall$/)
      expect(o.fromLeftFt).toBeNull()
      expect(notes.some((n) => n.lines[0].startsWith(`${o.tag} `))).toBe(true)
    }
  }
}

beforeAll(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
})

describe('a curved main part, any building turn', () => {
  for (const shape of SHAPES) {
    for (const rotation of TURNS) {
      test(`${shape} at ${rotation}°`, () => {
        const params = { shape, w: shape === 'ribbon' ? 40 : 34, d: shape === 'ribbon' ? 7 : 22, cuts }
        const { b, masses } = cabin(params, rotation)
        const main = b.parts[0]
        expect(main.openings.length).toBeGreaterThanOrEqual(2)
        checkCurvedPart(b, main, masses[0])
        // along-cuts are placed round the walls by their own x
        expect(main.openings.filter((o) => o.onCurve).map((o) => o.aroundFt)).toEqual(expect.arrayContaining([expect.closeTo(3, 6), expect.closeTo(20, 6)]))
        // the datum is the box's corner, which no curve passes through: said so, and dashed on the plan
        expect(b.datumOnWall).toBe(false)
        const text = sheetTables(b).flatMap((t) => [t.note ?? '', ...t.rows.flat()]).join(' ')
        expect(text).toContain("main walls' bounding box")
        expect(tablesCsv(b)).not.toMatch(/drawn as|approximate/)
        // a single-part cabin's box is its overall size, so no separate box dimension
        expect(planLayout(b, 0.25).dims.filter((d) => d.label === 'Main box')).toEqual([])
      })
    }
  }
})

describe('a curved wing, turned, on a straight cabin', () => {
  for (const shape of SHAPES) {
    for (const rot of TURNS) {
      test(`${shape} wing at ${rot}°`, () => {
        const wing = { kind: 'wall', shape, dx: 6, dz: 22, w: shape === 'ribbon' ? 26 : 18, d: shape === 'ribbon' ? 6 : 11, rot, h: 9, roof: 'flat', cuts }
        const { b, masses } = cabin({ shape: 'rect', w: 30, d: 20, wings: [wing] })
        const [main, part] = b.parts
        // the main walls are straight: their corner is the datum, every corner labelled, no stations, no curve labels
        expect(b.datumOnWall).toBe(true)
        expect(main.curve).toBeNull()
        expect(main.points.map((p) => p.label)).toEqual(['P1', 'P2', 'P3', 'P4'])
        expect(main.edges.every((e) => !e.curved)).toBe(true)
        checkCurvedPart(b, part, masses[1])
        if (shape === 'ellipse') {
          expect(part.ellipse?.centre[0]).toBeCloseTo(6, 9)
          expect(part.ellipse?.centre[1]).toBeCloseTo(22, 9)
          expect(part.ellipse?.rotDeg).toBe(rot)
          expect(part.arcs).toHaveLength(4)
          expect(sheetTables(b).map((t) => t.title)).toContain('Ellipses')
        } else expect(sheetTables(b).map((t) => t.title)).not.toContain('Ellipses')
      })
    }
  }
})

describe('a straight part keeps its full corner list', () => {
  test('a rect cabin lists every corner, no stations, and nothing round from P1', () => {
    const { b } = cabin({ shape: 'rect', w: 24, d: 16, cuts: [{ id: 1, edge: 2, kind: 'door', x: 4, w: 3, h: 7, sill: 0 }] })
    const corners = sheetTables(b).find((t) => t.title === 'Corner coordinates')
    expect(corners?.rows.map((r) => r[1])).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(corners?.rows.every((r) => r[4] === '—')).toBe(true)
    const [o] = b.parts[0].openings
    expect(o.aroundFt).toBeNull()
    expect(o.fromLeftFt).toBeCloseTo(4, 9)
  })
})
