import { beforeAll, describe, expect, test } from 'vitest'
import type { LocalPoint } from '../../../buildings/footprint'
import { buildingMasses, buildingToMass, massPoly, type Mass } from '../../../buildings/masses'
import { fitMass } from '../../../buildings/openings/openingEdits'
import { FIT } from '../../../buildings/openings/openingLayout'
import { buildWallShell, GLASS_WALL_FT, joinMeshes } from '../../../buildings/walls/wallShell'
import { usePlanStore } from '../../../store/planStore'
import type { PlanObject } from '../../../store/types'
import { sheetBuildings } from './model'
import type { SheetBuilding, SheetPart } from '../types'

/**
 * The walls' thickness on the sheets, checked against the 3D shell: the
 * inside face, each wall's thickness, the jambs across it and the inside
 * radius of every curve, on parts built in code (every footprint shape, any
 * turn, glass walls) and on scheme C.
 */

const FT = 0.3048
const SHAPES = ['rect', 'poly', 'ellipse', 'kidney', 'teardrop', 'blob', 'ribbon'] as const
const TURNS = [0, 37, 200]
const store = () => usePlanStore.getState()

const cuts = [
  { id: 1, along: true, kind: 'door', x: 3, w: 3, h: 7, sill: 0 },
  { id: 2, along: true, kind: 'slider', x: 12, w: 5, h: 7, sill: 0 },
  { id: 3, along: true, kind: 'window', x: 22, w: 4, h: 4, sill: 3 },
]

const POLY = [
  [-12, -9],
  [10, -9],
  [14, 0],
  [10, 9],
  [-12, 9],
]

function cabin(params: Record<string, unknown>, rotation = 0): { b: SheetBuilding; masses: Mass[]; o: PlanObject } {
  const base = store().plan.objects['C-2']
  const o: PlanObject = { ...base, rotation, params: { ...base.params, pts: undefined, wings: [], cuts: [], ...params } }
  const b = sheetBuildings([o], store().site.terrain)[0]
  if (!b) throw new Error('no sheet building')
  return { b, masses: buildingMasses(o.params), o }
}

const segDist = (p: LocalPoint, a: LocalPoint, b: LocalPoint) => {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}
const toRing = (p: LocalPoint, ring: readonly LocalPoint[]) => Math.min(...ring.map((a, i) => segDist(p, a, ring[(i + 1) % ring.length])))
const dist = (a: LocalPoint, b: LocalPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** The 3D shell of a wall part, in its own frame, with the fitted openings WallMass cuts through it. */
function shellOf(o: PlanObject, m: Mass, part: SheetPart) {
  const openings = fitMass(o.params, part.massIndex).openings
  return buildWallShell(massPoly(m), m.h, openings, { cap: false, thicknessFt: (e) => part.edges[e].thicknessFt })
}

/** Points (feet) of a mesh at height y (feet). */
function pointsAt(positions: readonly number[], y: number): LocalPoint[] {
  const out: LocalPoint[] = []
  for (let i = 0; i < positions.length; i += 3) if (Math.abs(positions[i + 1] / FT - y) < 1e-6) out.push([positions[i] / FT, positions[i + 2] / FT])
  return out
}

/** What every wall part's sheet must agree with its 3D shell on, whatever its shape, turn or wall kinds. */
function checkWalls(o: PlanObject, part: SheetPart, m: Mass) {
  expect(part.inner).toHaveLength(part.outline.length)
  const shell = shellOf(o, m, part)
  const inner = part.inner.map((p) => buildingToMass(m, p))
  // the inside face is the shell's: every inside-face vertex of the mesh at the floor lies on the sheet's inside line
  const meshInner = shell.edges.flatMap((e) => pointsAt(e.inner.positions, 0))
  expect(meshInner.length).toBeGreaterThan(0)
  for (const p of meshInner) expect(toRing(p, inner)).toBeLessThan(1e-6)
  // and lies one wall's thickness in (to the quarter inch: a needle-sharp corner's mitre is held in, so its walls taper near it)
  part.edges.forEach((e) => {
    if (e.lengthFt < 1) return
    const mid: LocalPoint = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]
    expect(Math.abs(toRing(mid, part.inner) - e.thicknessFt)).toBeLessThan(1 / 48)
    expect(e.thicknessFt).toBe(e.glass ? GLASS_WALL_FT : FIT.wallFt)
  })
  // jambs run from the outside face to the shell's own corners at the hole's sill or head; the glass stands half the wall in
  const all = joinMeshes(shell.edges.flatMap((e) => [e.outer, e.inner, e.reveals])).positions
  for (const op of part.openings) {
    const corners = [...pointsAt(all, op.sillFt), ...pointsAt(all, op.headFt)]
    for (const p of op.pieces) {
      const t = part.edges[p.edge].thicknessFt
      for (const [out, inn, mid] of [
        [p.a, p.innerA, p.midA],
        [p.b, p.innerB, p.midB],
      ] as const) {
        expect(dist(out, inn)).toBeGreaterThanOrEqual(t - 1e-6)
        expect(dist(out, mid)).toBeCloseTo(t / 2, 9)
        expect(toRing(inn, part.inner)).toBeLessThan(1e-6)
        expect(Math.min(...corners.map((q) => dist(q, buildingToMass(m, inn))))).toBeLessThan(1e-6)
      }
    }
  }
  // every arc's inside radius is the inside face's, round the same centre
  for (const arc of part.arcs) {
    expect(arc.innerRadiusFt).not.toBeNull()
    const n = part.edges.length
    const span = (((arc.toEdge - arc.fromEdge) % n) + n) % n
    for (let k = 1; k <= span; k++) {
      const v = (arc.fromEdge + k) % n
      if (part.edges[v].thicknessFt !== part.edges[(v - 1 + n) % n].thicknessFt) continue
      expect(Math.abs(dist(part.inner[v], arc.centre) - (arc.innerRadiusFt ?? 0))).toBeLessThan(arc.fitErrorFt + 1 / 32)
    }
  }
}

beforeAll(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
})

describe('a wall part of every footprint shape, any building turn', () => {
  for (const shape of SHAPES) {
    for (const rotation of TURNS) {
      test(`${shape} at ${rotation}°`, () => {
        const params = { shape, w: shape === 'ribbon' ? 40 : 34, d: shape === 'ribbon' ? 7 : 22, cuts, ...(shape === 'poly' ? { pts: POLY } : {}) }
        const { b, masses, o } = cabin(params, rotation)
        const main = b.parts[0]
        expect(main.edges.every((e) => e.thicknessFt === FIT.wallFt && !e.glass)).toBe(true)
        expect(main.openings.length).toBeGreaterThanOrEqual(3)
        checkWalls(o, main, masses[0])
      })
    }
  }
})

describe('glass curtain walls', () => {
  test('a glass wall is the thin skin, the rest of the part keeps the full wall, and the shell agrees', () => {
    const ext = { walls: { '0:2': { kind: 'glass' } } }
    const { b, masses, o } = cabin({ shape: 'rect', w: 24, d: 16, ext, cuts: [{ id: 1, edge: 2, kind: 'slider', x: 4, w: 6, h: 7, sill: 0 }] })
    const main = b.parts[0]
    expect(main.edges.map((e) => e.glass)).toEqual([false, false, true, false])
    expect(main.edges[2].thicknessFt).toBe(GLASS_WALL_FT)
    checkWalls(o, main, masses[0])
  })

  test('a whole glass ellipse, turned, as a wing', () => {
    const wing = { kind: 'wall', shape: 'ellipse', dx: 6, dz: 22, w: 18, d: 11, rot: 37, h: 9, roof: 'flat', walls: 'glass', cuts }
    const { b, masses, o } = cabin({ shape: 'rect', w: 30, d: 20, wings: [wing] })
    const part = b.parts[1]
    expect(part.edges.every((e) => e.glass && e.thicknessFt === GLASS_WALL_FT)).toBe(true)
    checkWalls(o, part, masses[1])
    // a convex curve's inside face is the smaller circle
    for (const a of part.arcs) expect(a.innerRadiusFt).toBeCloseTo(a.radiusFt - GLASS_WALL_FT, 9)
  })
})

describe('curves hollow and full', () => {
  test("a kidney's hollow arcs are swung larger inside, its full ones smaller", () => {
    const { b } = cabin({ shape: 'kidney', w: 34, d: 22 })
    const signs = new Set(b.parts[0].arcs.map((a) => Math.sign((a.innerRadiusFt ?? 0) - a.radiusFt)))
    expect(signs).toEqual(new Set([-1, 1]))
  })
})

describe('parts with no walls', () => {
  test('decks, porches and stairs have no inside face, no thickness and no inside radius', () => {
    const b = sheetBuildings([store().plan.objects['C-0']], store().site.terrain)[0]
    for (const p of b.parts.filter((x) => x.kind !== 'wall')) {
      expect(p.inner).toEqual([])
      expect(p.edges.every((e) => e.thicknessFt === 0)).toBe(true)
      expect(p.arcs.every((a) => a.innerRadiusFt === null)).toBe(true)
    }
  })
})

describe('scheme C, C2, C3 and C4', () => {
  for (const scheme of ['C', 'C2', 'C3', 'C4']) {
    test(`every wall part of scheme ${scheme} matches its shell`, () => {
      store().loadScheme(scheme)
      const houses = store()
        .plan.order.map((id) => store().plan.objects[id])
        .filter((o) => o.type === 'house' && !o.hidden)
      expect(houses.length).toBeGreaterThan(0)
      for (const o of houses) {
        const b = sheetBuildings([o], store().site.terrain)[0]
        const masses = buildingMasses(o.params)
        const walls = b.parts.filter((p) => p.kind === 'wall')
        expect(walls.length).toBeGreaterThan(0)
        for (const part of walls) checkWalls(o, part, masses[part.massIndex])
      }
      store().loadScheme('C')
    })
  }
})
