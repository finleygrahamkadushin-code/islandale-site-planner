import { describe, expect, test } from 'vitest'
import schemes from '../../data/islandale/schemes.json'
import { buildingMasses, massPoly } from './masses'
import { polyRoof, prowRoof } from './fittedRoof'
import { buildRoof } from './roof'
import { offsetOutline } from './outline'
import { pointInPolygon } from './foundation'
import { bounds, triangleCount, type MeshData } from './geom'
import type { LocalPoint } from './footprint'

const FT = 0.3048
type Obj = { name: string; t: string } & Record<string, unknown>
const all = (schemes as unknown as { schemes?: { id: string; objects: Obj[] }[] }).schemes ?? (schemes as unknown as { id: string; objects: Obj[] }[])
const scheme = (id: string) => all.find((s) => s.id === id)!
const mainOf = (id: string, name: string) => buildingMasses(scheme(id).objects.find((o) => o.name === name)!)[0]

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

  test('buildRoof keeps the box roof on rectangles and fits other outlines', () => {
    const rect: LocalPoint[] = [[-10, -8], [10, -8], [10, 8], [-10, 8]]
    expect(buildRoof(rect, { type: 'hip', pitch: 6, ridge: 'x', overhangFt: 1 }).glass.positions).toHaveLength(0)
    const trapRoof = buildRoof([[-6, -8], [6, -8], [10, 8], [-10, 8]], { type: 'hip', pitch: 6, ridge: 'x', overhangFt: 0 })
    // a box roof over this trapezoid would reach x = ±10 at z = -8; the fitted one stays inside
    const front = vertices(trapRoof.roof).filter(([, , z]) => z < -7.9 * FT)
    expect(Math.max(...front.map(([x]) => Math.abs(x)))).toBeLessThan(6.1 * FT)
  })
})

describe('prow roofs', () => {
  test('the gathering prow rises at its pitch to the ridge and closes its back end with a gable', () => {
    const m = mainOf('C', 'Gathering prow')
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

  test('C4 builds its vaulted, dipped prow with clerestory glass', () => {
    const m = mainOf('C4', 'Gathering prow')
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
