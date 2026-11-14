import { describe, expect, test } from 'vitest'
import schemes from '../../../data/islandale/schemes.json'
import { buildingMasses, massPoly } from '../masses'
import { polyRoof, prowRoof } from './fittedRoof'
import { buildRoof } from './roof'
import { offsetOutline } from '../outline'
import { pointInPolygon } from '../../site/geom2d'
import { bounds, triangleCount, type MeshData } from '../geom'
import type { LocalPoint } from '../footprint'
import { M_PER_FT as FT } from '../../site/units'

type Obj = { name: string; t: string } & Record<string, unknown>
const all = (schemes as unknown as { schemes?: { id: string; objects: Obj[] }[] }).schemes ?? (schemes as unknown as { id: string; objects: Obj[] }[])
const cabinOf = (name: string) => all.find((s) => s.id === 'C')!.objects.find((o) => o.name === name)!
const mainOf = (name: string) => buildingMasses(cabinOf(name))[0]

const vertices = (m: MeshData) => Array.from({ length: m.positions.length / 3 }, (_, i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]] as const)
const hex: LocalPoint[] = [0, 60, 120, 180, 240, 300].map((a) => [10 * Math.cos((a * Math.PI) / 180), 8 * Math.sin((a * Math.PI) / 180)] as const)

describe('roofs fitted to the outline', () => {
  test('every eave point of a hip roof on a hexagon lies on the walls grown by the overhang', () => {
    const r = polyRoof(hex, 'hip', 6, 'x', 2)
    const grown = offsetOutline(hex, 2).map(([x, z]) => [x * FT, z * FT] as const)
    const eaves = vertices(r.roof).filter(([, y]) => Math.abs(y) < 1e-6)
    expect(eaves.length).toBeGreaterThan(0)
    for (const [x, , z] of eaves) {
      const d = Math.min(...grown.map((g) => Math.hypot(g[0] - x, g[1] - z)))
      expect(d).toBeLessThan(0.01)
    }
  })

  test('no roof face lies outside the outline plus overhang', () => {
    const grown = offsetOutline(hex, 2.05).map(([x, z]) => [x * FT, z * FT] as const)
    for (const type of ['gable', 'hip', 'shed', 'butterfly']) {
      for (const [x, , z] of vertices(polyRoof(hex, type, 6, 'z', 2).roof)) expect(pointInPolygon(grown, x, z)).toBe(true)
    }
  })

  test('a U-shaped outline gets no roof over its courtyard', () => {
    // 30 × 24 ft, 8 ft arms round a 14 ft courtyard open to the front; the mass origin sits in the courtyard
    const u: LocalPoint[] = [[-15, -12], [15, -12], [15, 12], [7, 12], [7, -2], [-7, -2], [-7, 12], [-15, 12]]
    const grownFt = offsetOutline(u, 1)
    const grown = offsetOutline(u, 1.05).map(([x, z]) => [x * FT, z * FT] as const)
    const grownArea = Math.abs(grownFt.reduce((a, p, i) => { const q = grownFt[(i + 1) % grownFt.length]; return a + p[0] * q[1] - q[0] * p[1] }, 0) / 2) * FT * FT
    for (const type of ['gable', 'hip', 'shed', 'butterfly', 'gambrel']) {
      for (const ridge of ['x', 'z'] as const) {
        const r = polyRoof(u, type, 6, ridge, 1)
        const v = vertices(r.roof)
        let planArea = 0
        for (let i = 0; i < v.length; i += 3) {
          const [a, b, c] = [v[i], v[i + 1], v[i + 2]]
          const cx = (a[0] + b[0] + c[0]) / 3
          const cz = (a[2] + b[2] + c[2]) / 3
          expect(pointInPolygon(grown, cx, cz), `${type} ${ridge}: face centre ${cx.toFixed(2)}, ${cz.toFixed(2)}`).toBe(true)
          planArea += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2
        }
        expect(planArea / grownArea, `${type} ${ridge}`).toBeCloseTo(1, 3)
        expect(r.rise).toBeGreaterThan(0)
      }
    }
  })

  test('buildRoof keeps the box roof on rectangles and fits other outlines', () => {
    const rect: LocalPoint[] = [[-10, -8], [10, -8], [10, 8], [-10, 8]]
    expect(buildRoof(rect, { type: 'hip', pitch: 6, ridge: 'x', overhangFt: 1 }).glass.positions).toHaveLength(0)
    const trapRoof = buildRoof([[-6, -8], [6, -8], [10, 8], [-10, 8]], { type: 'hip', pitch: 6, ridge: 'x', overhangFt: 0 })
    // a box roof over this trapezoid would reach x = ±10 at z = -8; the fitted one stays inside
    const front = vertices(trapRoof.roof).filter(([, , z]) => z < -7.9 * FT)
    expect(Math.max(...front.map(([x]) => Math.abs(x)))).toBeLessThan(6.1 * FT)
  })
})

describe('fitted roofs keep their creases where an outline edge crosses them', () => {
  // the roof's points on the eave ring (the outline grown by the overhang), with the roof height there
  const ringHeights = (r: ReturnType<typeof polyRoof>, poly: readonly LocalPoint[], overhangFt = 0) => {
    const ring = offsetOutline(poly, overhangFt).map(([x, z]) => [x * FT, z * FT] as const)
    const onEdge = (x: number, z: number) => ring.some((a, i) => {
      const b = ring[(i + 1) % ring.length]
      const [dx, dz] = [b[0] - a[0], b[1] - a[1]]
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
      return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < 1e-6
    })
    return vertices(r.roof).filter(([x, , z]) => onEdge(x, z))
  }
  const trap: LocalPoint[] = [[-6, -8], [6, -8], [10, 8], [-10, 8]]

  test('a butterfly on a trapezoid dips to its valley on both slanted sides, so the ends read as a V', () => {
    const r = polyRoof(trap, 'butterfly', 6, 'x', 0)
    const valley = ringHeights(r, trap).filter(([, , z]) => Math.abs(z) < 1e-6)
    // one valley point on each slanted side, at the valley's height (0.25 m)
    expect(new Set(valley.map(([x]) => Math.sign(x)))).toEqual(new Set([-1, 1]))
    for (const [, y] of valley) expect(y).toBeCloseTo(0.25, 6)
    // the end infill follows the V: nothing above the valley where the side crosses it
    const infillAtValley = vertices(r.gables).filter(([, , z]) => Math.abs(z) < 1e-6)
    expect(Math.max(...infillAtValley.map(([, y]) => y))).toBeCloseTo(0.25, 6)
  })

  test('a gable on a trapezoid peaks at its ridge on both slanted sides', () => {
    const r = polyRoof(trap, 'gable', 6, 'x', 0)
    const ridge = ringHeights(r, trap).filter(([, , z]) => Math.abs(z) < 1e-6)
    expect(ridge.length).toBeGreaterThanOrEqual(2)
    for (const [, y] of ridge) expect(y).toBeCloseTo(r.rise, 6)
  })

  test('a hip on a half-hexagon meets its hip lines on the chamfered edges', () => {
    const half: LocalPoint[] = [[-13, -9], [13, -9], [13, 3], [6.5, 9], [-6.5, 9], [-13, 3]]
    const r = polyRoof(half, 'hip', 5, 'x', 0)
    // the outline's own six corners plus one point on each chamfer where a hip line crosses it
    expect(triangleCount(r.roof)).toBe(8)
  })

  test("a butterfly on a parallelogram or a trapezoid (C's twin pod reshaped) draws its V at both ends", () => {
    for (const shape of [{ shape: 'para', skew: 5 }, { shape: 'trap', taper: 0.6 }]) {
      const m = buildingMasses({ ...cabinOf('Family twin pod'), ...shape, ridge: 'x' })[0]
      expect(m.roof).toBe('butterfly')
      const r = polyRoof(massPoly(m), m.roof, m.pitch, m.ridge, m.overhang)
      const valley = ringHeights(r, massPoly(m), m.overhang).filter(([, , z]) => Math.abs(z) < 1e-6)
      expect(new Set(valley.map(([x]) => x.toFixed(3))).size, shape.shape).toBe(2)
      for (const [, y] of valley) expect(y).toBeCloseTo(0.25, 6)
    }
  })
})

describe('prow roofs', () => {
  test('the gathering prow rises at its pitch to the ridge and closes its back end with a gable', () => {
    const m = mainOf('Gathering prow')
    const poly = massPoly(m)
    const r = prowRoof(poly, m.pitch, m.ridge, m.overhang)
    expect(triangleCount(r.roof)).toBeGreaterThan(10)
    expect(triangleCount(r.gables)).toBeGreaterThan(0)
    // never higher than pitch × the widest half-span
    const b = bounds(r.roof)
    const halfSpan = (b.max[0] - b.min[0]) / 2
    expect(r.rise).toBeLessThanOrEqual((m.pitch / 12) * halfSpan + 1e-6)
    expect(r.rise).toBeGreaterThan(0.5)
  })

  test("a vaulted, dipped prow (C's prow with vault and a 4.5 ft dip) gets clerestory glass", () => {
    const m = buildingMasses({ ...cabinOf('Gathering prow'), vault: true, roofDip: 4.5 })[0]
    expect(m.vault).toBe(true)
    const r = prowRoof(massPoly(m), m.pitch, m.ridge, m.overhang, { roofPts: m.roofPts, vault: m.vault, dip: m.roofDip })
    expect(triangleCount(r.glass)).toBeGreaterThan(0)
    expect(triangleCount(r.trim)).toBeGreaterThan(triangleCount(r.roof) * 0.9)
  })

  test('a front gable moves the gable end to +z', () => {
    const rect: LocalPoint[] = [[-6, -5], [6, -5], [6, 5], [-6, 5]]
    const back = vertices(prowRoof(rect, 6, 'z', 0).gables)
    const front = vertices(prowRoof(rect, 6, 'z', 0, { gable: 'front' }).gables)
    expect(Math.max(...back.map(([, , z]) => z))).toBeLessThan(0)
    expect(Math.min(...front.map(([, , z]) => z))).toBeGreaterThan(0)
  })
})
