import { describe, expect, test } from 'vitest'
import schemes from '../../../data/islandale/schemes.json'
import { localFootprint, type LocalPoint } from '../footprint'
import { bounds, type MeshData } from '../geom'
import { buildingMasses, massPoly } from '../masses'
import { FIT, layoutOpenings, type CutData } from '../openings/openingLayout'
import { buildWallShell, curvedToAlong, edgeMesh, GLASS_WALL_FT, joinByEdge, joinMeshes, openingHoles, railHeightsFt, wallDecor, wallDecorByEdge, wallFaces, wallPlan, wallSpecsOf, wallThicknessFt, type WallShell } from './wallShell'
import { M_PER_FT as FT } from '../../site/units'

const T = FIT.wallFt
const H = 9

type V = [number, number, number]
interface Tri {
  readonly p: readonly V[]
  readonly n: readonly V[]
}

const trisOf = (m: MeshData): Tri[] => {
  const out: Tri[] = []
  for (let i = 0; i < m.positions.length; i += 9) {
    const p = [0, 3, 6].map((k) => [m.positions[i + k] / FT, m.positions[i + k + 1] / FT, m.positions[i + k + 2] / FT] as V)
    const n = [0, 3, 6].map((k) => [m.normals[i + k], m.normals[i + k + 1], m.normals[i + k + 2]] as V)
    out.push({ p, n })
  }
  return out
}
/** Triangle area in square feet. */
const areaOf = (t: Tri) => {
  const [a, b, c] = t.p
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2
}
const area = (m: MeshData) => trisOf(m).reduce((s, t) => s + areaOf(t), 0)
const centroid = (t: Tri): V => [0, 1, 2].map((k) => (t.p[0][k] + t.p[1][k] + t.p[2][k]) / 3) as V
const all = (s: WallShell, part: 'outer' | 'inner' | 'reveals') => joinMeshes(s.edges.map((e) => e[part]))
const perimeterOf = (poly: readonly LocalPoint[]) => poly.reduce((s, a, i) => s + Math.hypot(poly[(i + 1) % poly.length][0] - a[0], poly[(i + 1) % poly.length][1] - a[1]), 0)

// 20 x 16 ft, wound like every footprint: edge 0 is the back wall (z = -8), running +x
const rect = localFootprint({ w: 20, d: 16 })
const shellOf = (poly: readonly LocalPoint[], cuts: readonly CutData[], cap = false) => {
  const openings = layoutOpenings(poly, cuts, { wallHeightFt: H }).openings
  return { openings, shell: buildWallShell(poly, H, openings, { cap }) }
}

describe('a straight wall with a window cut through', () => {
  // edge 0 runs from x -10 to 10; x = 8 from its left seen from outside puts the window at x -1..2
  const { shell } = shellOf(rect, [{ id: 1, kind: 'window', edge: 0, x: 8, w: 3, h: 4, sill: 3 }])
  const back = shell.edges[0]

  test('the hole is the window: 3 ft wide, 4 ft tall, its sill at 3 ft', () => {
    expect(shell.holes).toHaveLength(1)
    const [hole] = shell.holes
    expect(hole.u1 - hole.u0).toBeCloseTo(3, 6)
    expect([hole.v0, hole.v1]).toEqual([3, 7])
    expect(hole.u0).toBeCloseTo(9, 6)
  })

  test('no outer-face triangle lies inside the hole, and the outer face is the wall less the window', () => {
    const inside = trisOf(back.outer).filter((t) => {
      const [x, y] = centroid(t)
      return x > -1 + 1e-6 && x < 2 - 1e-6 && y > 3 + 1e-6 && y < 7 - 1e-6
    })
    expect(inside).toHaveLength(0)
    expect(area(back.outer)).toBeCloseTo(20 * H - 3 * 4, 6)
  })

  test('jambs, head and sill run through the wall thickness', () => {
    const tris = trisOf(back.reveals)
    const jambs = tris.filter((t) => Math.abs(t.n[0][0]) > 0.99)
    const flats = tris.filter((t) => Math.abs(t.n[0][1]) > 0.99 && Math.abs(centroid(t)[1] - H) > 1e-6)
    // two jambs, each 4 ft tall and the wall's thickness deep, facing into the hole
    expect(jambs.reduce((s, t) => s + areaOf(t), 0)).toBeCloseTo(2 * 4 * T, 6)
    for (const t of jambs) {
      const zs = t.p.map((p) => p[2])
      expect(Math.min(...zs)).toBeCloseTo(-8, 6)
      expect(Math.max(...zs)).toBeCloseTo(-8 + T, 6)
      expect(Math.sign(t.n[0][0])).toBe(centroid(t)[0] < 0 ? 1 : -1)
    }
    // the head faces down at 7 ft, the sill up at 3 ft, each 3 ft by the thickness
    const head = flats.filter((t) => t.n[0][1] < 0)
    const sill = flats.filter((t) => t.n[0][1] > 0)
    expect(head.every((t) => Math.abs(centroid(t)[1] - 7) < 1e-6)).toBe(true)
    expect(sill.every((t) => Math.abs(centroid(t)[1] - 3) < 1e-6)).toBe(true)
    expect(head.reduce((s, t) => s + areaOf(t), 0)).toBeCloseTo(3 * T, 6)
    expect(sill.reduce((s, t) => s + areaOf(t), 0)).toBeCloseTo(3 * T, 6)
  })

  test('the inside face is the thickness in from the outside, and faces in', () => {
    const tris = trisOf(back.inner)
    expect(tris.every((t) => Math.abs(t.p[0][2] - (-8 + T)) < 1e-6 && t.n[0][2] > 0.99)).toBe(true)
  })

  test('UVs are feet along the perimeter and up the wall', () => {
    const us = back.outer.uvs.filter((_, i) => i % 2 === 0)
    const vs = back.outer.uvs.filter((_, i) => i % 2 === 1)
    expect(Math.min(...us)).toBeCloseTo(0, 6)
    expect(Math.max(...us)).toBeCloseTo(20, 6)
    expect(Math.max(...vs)).toBeCloseTo(H, 6)
    // the right wall carries on from 20 ft
    const right = shell.edges[1].outer.uvs.filter((_, i) => i % 2 === 0)
    expect(Math.min(...right)).toBeCloseTo(20, 6)
  })

  test('a cut-out is an open hole, and a door at the floor has no sill face', () => {
    const s = shellOf(rect, [
      { id: 1, kind: 'cutout', edge: 2, x: 4, w: 4, h: 3, sill: 3 },
      { id: 2, kind: 'door', edge: 0, x: 8, w: 3, h: 7, sill: 0 },
    ]).shell
    expect(s.holes.map((o) => o.kind).sort()).toEqual(['cutout', 'door'])
    const up = trisOf(s.edges[0].reveals).filter((t) => t.n[0][1] > 0.99 && centroid(t)[1] < H - 1e-6)
    expect(up).toHaveLength(0)
  })
})

describe('area bookkeeping', () => {
  test('outer = perimeter x height - openings; inner and top follow the mitred thickness', () => {
    const cuts: CutData[] = [
      { id: 1, kind: 'window', edge: 0, x: 3, w: 4, h: 4, sill: 3 },
      { id: 2, kind: 'door', edge: 2, x: 8, w: 3.5, h: 7, sill: 0 },
      { id: 3, kind: 'slider', edge: 1, x: 3, w: 8, h: 7, sill: 0 },
    ]
    const { shell } = shellOf(rect, cuts, true)
    const holes = 4 * 4 + 3.5 * 7 + 8 * 7
    expect(area(all(shell, 'outer'))).toBeCloseTo(72 * H - holes, 6)
    // the inside runs 2t shorter on every wall
    expect(area(all(shell, 'inner'))).toBeCloseTo((72 - 8 * T) * H - holes, 6)
    const top = trisOf(all(shell, 'reveals')).filter((t) => t.n[0][1] > 0.99 && Math.abs(centroid(t)[1] - H) < 1e-6)
    expect(top.reduce((s, t) => s + areaOf(t), 0)).toBeCloseTo(20 * 16 - (20 - 2 * T) * (16 - 2 * T), 6)
    // the ceiling cap covers the inside of the walls
    expect(area(shell.cap)).toBeCloseTo((20 - 2 * T) * (16 - 2 * T), 6)
  })

  test('no cap when Roofs are off', () => {
    expect(shellOf(rect, [], false).shell.cap.positions).toHaveLength(0)
  })
})

describe('curved walls', () => {
  const ellipse = localFootprint({ w: 30, d: 20, shape: 'ellipse' })
  const L = perimeterOf(ellipse)

  test('an along-cut is measured along the real curve and split over the facets it crosses', () => {
    const { openings, shell } = shellOf(ellipse, [{ id: 7, kind: 'slider', along: true, x: 10, w: 12, h: 7, sill: 0 }])
    const holes = openingHoles(ellipse, openings, H)
    expect(holes.length).toBeGreaterThan(5)
    expect(new Set(holes.map((o) => o.edge)).size).toBe(holes.length)
    // contiguous round the curve from 10 ft to 22 ft (a sliver under 0.05 ft at an end is dropped)
    expect(holes[0].u0).toBeCloseTo(10, 1)
    holes.slice(1).forEach((o, k) => expect(o.u0).toBeCloseTo(holes[k].u1, 6))
    expect(holes[holes.length - 1].u1).toBeCloseTo(22, 1)
    const cut = holes.reduce((s, o) => s + (o.u1 - o.u0), 0)
    expect(cut).toBeGreaterThan(11.9)
    expect(cut).toBeLessThanOrEqual(12 + 1e-9)
    // and the band has exactly that hole in it
    expect(area(all(shell, 'outer'))).toBeCloseTo(L * H - cut * 7, 6)
    // no jambs where the cut turns a facet, only at its two ends
    const jambs = trisOf(all(shell, 'reveals')).filter((t) => Math.abs(t.n[0][1]) < 0.01)
    expect(jambs.reduce((s, t) => s + areaOf(t), 0)).toBeCloseTo(2 * 7 * T, 3)
  })

  test('a curved band is smooth-shaded: both walls at a vertex share its normal', () => {
    const { shell } = shellOf(ellipse, [])
    const byPoint = normalsByPoint(all(shell, 'outer'))
    expect(byPoint.size).toBe(ellipse.length * 2)
    for (const ns of byPoint.values()) expect(ns.size).toBe(1)
  })

  test('sharp corners stay creased: a D shape is smooth round its arc and creased at its two corners', () => {
    const arc = Array.from({ length: 13 }, (_, k): LocalPoint => {
      const a = -Math.PI / 2 + (Math.PI * k) / 12
      return [10 * Math.cos(a), 10 * Math.sin(a)]
    })
    // the arc runs from (0, -10) to (0, 10) round +x; the straight side closes it
    const d: LocalPoint[] = arc
    const { shell } = shellOf(d, [])
    const byPoint = normalsByPoint(all(shell, 'outer'))
    const creased = [...byPoint.entries()].filter(([, ns]) => ns.size > 1).map(([k]) => k)
    // the two ends of the straight side, top and bottom of the wall
    expect(creased.sort()).toEqual(['0.00,0.00,-10.00', '0.00,0.00,10.00', '0.00,9.00,-10.00', '0.00,9.00,10.00'])
  })

  test('the inside of a curve is offset by the thickness all round', () => {
    const { shell } = shellOf(ellipse, [])
    const inner = trisOf(all(shell, 'inner'))
    // every inside point lies about t inside the ellipse x^2/15^2 + z^2/10^2 = 1
    for (const t of inner) {
      for (const p of t.p) {
        const r = Math.hypot(p[0] / 15, p[2] / 10)
        expect(r).toBeLessThan(1 - (T / 15) * 0.9)
        expect(r).toBeGreaterThan(1 - (T / 10) * 1.1)
      }
    }
  })
})

describe('wall thickness per edge', () => {
  test('a glass wall beside a solid one: the inside corner meets both', () => {
    const shell = buildWallShell(rect, H, [], { cap: false, thicknessFt: (e) => (e === 0 ? GLASS_WALL_FT : T) })
    // vertex 1 is (10, -8): the glass back wall is thin, the right wall full thickness
    const corner = trisOf(shell.edges[0].inner).flatMap((t) => t.p).find((p) => p[0] > 9)
    expect(corner?.[0]).toBeCloseTo(10 - T, 6)
    expect(corner?.[2]).toBeCloseTo(-8 + GLASS_WALL_FT, 6)
  })

  test('a wall that folds straight back on a thinner one (a 180° turn) still has finite corners', () => {
    // vertex 4 at (-10, 12): edge 3 runs up to it, edge 4 straight back down; edge 3 is glass, edge 4 solid
    const folded: LocalPoint[] = [[-10, -8], [10, -8], [10, 8], [-10, 8], [-10, 12], [-10, 0]]
    const shell = buildWallShell(folded, H, [], { cap: true, thicknessFt: (e) => (e === 3 ? GLASS_WALL_FT : T) })
    const meshes = [...shell.edges.flatMap((e) => [e.outer, e.inner, e.reveals]), shell.cap]
    const positions = meshes.flatMap((m) => m.positions)
    expect(positions.length).toBeGreaterThan(0)
    expect(positions.every(Number.isFinite)).toBe(true)
  })

  test('buildWalls-style skins (thickness 0) have no reveal faces', () => {
    const shell = buildWallShell(rect, H, [], { cap: true, thicknessFt: 0 })
    expect(area(all(shell, 'reveals'))).toBeCloseTo(0, 9)
    expect(area(shell.cap)).toBeCloseTo(320, 6)
  })
})

describe('picking a wall out of a joined mesh', () => {
  test('every triangle knows its wall', () => {
    const { shell } = shellOf(rect, [{ id: 1, kind: 'window', edge: 1, x: 4, w: 3, h: 4, sill: 3 }])
    const { mesh, faceEdges } = joinByEdge(shell.edges.filter((e) => e.edge % 2 === 1).map(edgeMesh))
    expect(faceEdges).toHaveLength(mesh.positions.length / 9)
    expect([...new Set(faceEdges)]).toEqual([1, 3])
    // the right wall's triangles all sit at x 10 - t .. 10
    const tris = trisOf(mesh)
    faceEdges.forEach((e, k) => {
      if (e === 1) expect(centroid(tris[k])[0]).toBeGreaterThan(10 - T - 1e-6)
    })
  })
})

describe('glass curtain walls', () => {
  test('a mullion grid in the glass, clear of the door', () => {
    const openings = layoutOpenings(rect, [{ id: 1, kind: 'door', edge: 0, x: 8, w: 3.5, h: 7, sill: 0 }], { wallHeightFt: H }).openings
    const m = wallDecor(rect, H, 'glass', openings)
    expect(m.positions.length).toBeGreaterThan(0)
    const b = bounds(m)
    expect(b.max[1] / FT).toBeCloseTo(H, 1)
    // nothing in the doorway: x 8 from the back wall's left end (x 10, seen from outside) puts it at x -1.5..2, up to 7 ft
    const inDoor = trisOf(m).filter((t) => {
      const [x, y, z] = centroid(t)
      return z < -7 && x > -1.45 && x < 1.95 && y < 6.95
    })
    expect(inDoor).toHaveLength(0)
    // rails at the foot, the eave and a transom at 2.3 m over a 9 ft wall
    expect(railHeightsFt(H)).toHaveLength(3)
  })

  test('only glass walls get mullions, and the other kinds none', () => {
    expect(wallDecor(rect, H, 'cedar', []).positions).toHaveLength(0)
    expect(wallDecor(rect, H, null, []).positions).toHaveLength(0)
    const parts = wallDecorByEdge(rect, H, (e) => (e === 2 ? 'glass' : 'stone'), [])
    expect(parts.map((p) => p.edge)).toEqual([2])
  })

  test('a curved glass wall gets mullions about every 1.5 m round the curve', () => {
    const circle = localFootprint({ w: 20, d: 20, shape: 'ellipse' })
    const m = wallDecor(circle, H, 'glass', [])
    // each vertical mullion is a box: 12 triangles, and it is taller than it is wide
    const tall = trisOf(m).filter((t) => Math.abs(t.p[0][1] - t.p[1][1]) > 5 || Math.abs(t.p[1][1] - t.p[2][1]) > 5)
    const count = tall.length / 8
    expect(count).toBe(Math.round(perimeterOf(circle) / (1.5 / FT)))
  })
})

describe('the Walls editor on a curved mass', () => {
  test('a curved mass is one unrolled wall, any other one wall per edge', () => {
    const ellipse = localFootprint({ w: 30, d: 20, shape: 'ellipse' })
    expect(wallFaces(ellipse, 'ellipse')).toEqual([{ edge: 'along', lengthFt: perimeterOf(ellipse) }])
    expect(wallFaces(rect, 'rect').map((f) => f.edge)).toEqual([0, 1, 2, 3])
  })

  test('per-edge cuts on a curve become along-cuts at the same place', () => {
    const ellipse = localFootprint({ w: 30, d: 20, shape: 'ellipse' })
    const cut: CutData = { id: 3, kind: 'window', edge: 5, x: 0.2, w: 1, h: 4, sill: 3 }
    const [along] = curvedToAlong(ellipse, [cut])
    expect(along).toMatchObject({ id: 3, along: true, w: 1, h: 4, sill: 3 })
    expect('edge' in along).toBe(false)
    // seen from outside, edge 5's left end is vertex 6: x 0.2 from there is (len5 - 0.2 - w) round from vertex 5
    const cum5 = perimeterOf([...ellipse.slice(0, 6)]) - Math.hypot(ellipse[5][0] - ellipse[0][0], ellipse[5][1] - ellipse[0][1])
    const len5 = Math.hypot(ellipse[6][0] - ellipse[5][0], ellipse[6][1] - ellipse[5][1])
    expect(along.x).toBe(Math.round((cum5 + len5 - 0.2 - 1) * 2) / 2)
    // and its hole starts there round the curve
    const holes = openingHoles(ellipse, layoutOpenings(ellipse, [along], { wallHeightFt: H }).openings, H)
    expect(holes[0].u0).toBeCloseTo(along.x as number, 6)
    expect(curvedToAlong(ellipse, [along])[0]).toBe(along)
  })
})

describe("every scheme's cabins", () => {
  type Obj = { name: string; t: string } & Record<string, unknown>
  const list = (schemes as unknown as { schemes: { id: string; objects: Obj[] }[] }).schemes
  const houses = list.flatMap((s) => s.objects.filter((o) => o.t === 'house').map((o) => ({ id: s.id, o })))

  test.each(houses.map((x, k) => [`${x.id}:${k}`, x.o] as const))('%s: every enclosed mass has its holes cut and its wall area adds up', (_, o) => {
    buildingMasses(o).forEach((m) => {
      if (m.kind !== 'wall' || m.h <= 0) return
      const poly = massPoly(m)
      const openings = layoutOpenings(poly, m.cuts, { wallHeightFt: m.h }).openings
      const shell = buildWallShell(poly, m.h, openings, { cap: true, thicknessFt: m.walls === 'glass' ? GLASS_WALL_FT : T })
      // along-cuts may overlap: the hole is their union
      const cut = unionArea(shell.holes)
      expect(area(all(shell, 'outer'))).toBeCloseTo(perimeterOf(poly) * m.h - cut, 4)
      expect(shell.holes.length).toBeGreaterThanOrEqual(openings.filter((op) => !op.hidden).length)
      for (const v of shell.edges.flatMap((e) => [...e.outer.positions, ...e.inner.positions, ...e.reveals.positions])) expect(Number.isFinite(v)).toBe(true)
    })
  })
})

/** The area of a union of rectangles in the unrolled wall (coordinate compression). */
function unionArea(holes: readonly { u0: number; u1: number; v0: number; v1: number }[]): number {
  const us = [...new Set(holes.flatMap((o) => [o.u0, o.u1]))].sort((a, b) => a - b)
  const vs = [...new Set(holes.flatMap((o) => [o.v0, o.v1]))].sort((a, b) => a - b)
  let sum = 0
  for (let i = 0; i + 1 < us.length; i++) {
    for (let j = 0; j + 1 < vs.length; j++) {
      const u = (us[i] + us[i + 1]) / 2
      const v = (vs[j] + vs[j + 1]) / 2
      if (holes.some((o) => o.u0 < u && u < o.u1 && o.v0 < v && v < o.v1)) sum += (us[i + 1] - us[i]) * (vs[j + 1] - vs[j])
    }
  }
  return sum
}

/** Outer-face normals at each vertex position (rounded), to see where shading is shared or creased. */
function normalsByPoint(m: MeshData): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (let i = 0; i < m.positions.length; i += 3) {
    const key = [0, 1, 2].map((k) => (Math.round((m.positions[i + k] / FT) * 100) / 100 || 0).toFixed(2)).join(',')
    const n = [0, 1, 2].map((k) => (Math.round(m.normals[i + k] * 1e4) / 1e4 || 0).toFixed(4)).join(',')
    out.set(key, (out.get(key) ?? new Set()).add(n))
  }
  return out
}

describe('the walls in plan (wallPlan, wallSpecsOf)', () => {
  test("a rect's inside face is the outline brought in by the wall all round", () => {
    const plan = wallPlan(rect)
    expect(plan.thicknessFt).toEqual([T, T, T, T])
    expect(plan.crease).toEqual([true, true, true, true])
    plan.inner.forEach((p, i) => {
      expect(Math.abs(p[0])).toBeCloseTo(10 - T, 9)
      expect(Math.abs(p[1])).toBeCloseTo(8 - T, 9)
      expect(Math.sign(p[0])).toBe(Math.sign(rect[i][0]))
    })
  })

  test('a point through the wall is square across mid-wall and runs to the mitred corner at the ends', () => {
    const plan = wallPlan(rect)
    // edge 0 is the back wall, z = -8, running +x from x = -10: its outward normal is -z
    expect(plan.outward[0][0]).toBeCloseTo(0, 9)
    expect(plan.outward[0][1]).toBeCloseTo(-1, 9)
    const [x, z] = plan.across(0, 9, 1)
    expect(x).toBeCloseTo(-1, 9)
    expect(z).toBeCloseTo(-8 + T, 9)
    expect(plan.across(0, 9, 0.5)[1]).toBeCloseTo(-8 + T / 2, 9)
    expect(plan.across(0, 0.2, 1)).toEqual(plan.inner[0])
  })

  test('the inside face is the one the shell builds, per edge thickness and all', () => {
    const thickness = (e: number) => (e === 1 ? GLASS_WALL_FT : T)
    const plan = wallPlan(rect, thickness)
    const shell = buildWallShell(rect, H, [], { cap: false, thicknessFt: thickness })
    const floor = trisOf(all(shell, 'inner')).flatMap((t) => t.p.filter((p) => Math.abs(p[1]) < 1e-9))
    expect(floor.length).toBeGreaterThan(0)
    for (const p of floor) expect(plan.inner.some((q) => Math.hypot(q[0] - p[0], q[1] - p[2]) < 1e-6)).toBe(true)
  })

  test("each wall's kind through the exterior model, glass thin and every other kind the full wall", () => {
    const params = { w: 20, d: 16, walls: 'cedar', ext: { walls: { '0:2': { kind: 'glass' } } } }
    expect(wallSpecsOf(params, 0, 4).map((s) => s.kind)).toEqual(['cedar', 'cedar', 'glass', 'cedar'])
    expect(wallSpecsOf(params, 0, 4).map((s) => s.thicknessFt)).toEqual([T, T, GLASS_WALL_FT, T])
    expect(wallThicknessFt('glass')).toBe(GLASS_WALL_FT)
    expect(wallThicknessFt('')).toBe(FIT.wallFt)
    expect(wallThicknessFt('stone')).toBe(FIT.wallFt)
  })
})
