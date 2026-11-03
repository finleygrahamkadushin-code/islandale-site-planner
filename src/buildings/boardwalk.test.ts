import { describe, expect, test } from 'vitest'
import schemes from '../../data/islandale/schemes.json'
import { loadIslandaleTerrain } from '../site/islandale'
import { surfaceElevationAt } from '../site/terrain'
import { boardwalkColumns, boardwalkPath, RIBBON_DEPTH_M } from './boardwalk'

type Obj = { name: string; t: string; pts?: number[][] } & Record<string, unknown>
const all = (schemes as unknown as { schemes?: { id: string; objects: Obj[] }[] }).schemes ?? (schemes as unknown as { id: string; objects: Obj[] }[])
const walk = all.find((s) => s.id === 'C')!.objects.find((o) => o.t === 'bridge')!
const FT = 0.3048
// legacy route points are [x m, n m, elevation ft]
const route = walk.pts!.map(([x, n, e]) => [x, n, e * FT] as const)

describe('boardwalkPath', () => {
  test('its length matches the legacy curve within 2%', () => {
    // measured in the legacy planner with bridgeCurve(o).L; the scheme's stored d (81) is stale and legacy rewrites it to 77
    const LEGACY_FT = 77.42
    const p = boardwalkPath(route)!
    expect(Math.abs(p.length / FT - LEGACY_FT)).toBeLessThan(LEGACY_FT * 0.02)
  })
  test('the smoothed walk passes through every route point', () => {
    const p = boardwalkPath(route)!
    for (const [x, n, e] of route) {
      const near = Math.min(...p.samples.map((s) => Math.hypot(s.x - x, s.n - n, s.e - e)))
      expect(near).toBeLessThan(0.3)
    }
  })
  test('samples are about half a metre apart with unit side vectors', () => {
    const p = boardwalkPath(route)!
    expect(p.samples.length).toBeGreaterThan(p.length / 0.6)
    for (const s of p.samples) expect(Math.hypot(s.px, s.pn)).toBeCloseTo(1)
  })
  test('two points make a straight walk; fewer make none', () => {
    expect(boardwalkPath([[0, 0, 1], [10, 0, 1]])!.length).toBeCloseTo(10)
    expect(boardwalkPath([[0, 0, 1]])).toBeNull()
  })
})

describe('boardwalkColumns', () => {
  test('stand about every 7 m, only where the deck is well off the ground', () => {
    const p = boardwalkPath([[0, 0, 3], [30, 0, 3]])!
    const high = boardwalkColumns(p, () => 0)
    expect(high.length).toBeGreaterThanOrEqual(5)
    expect(boardwalkColumns(p, () => 2.9)).toEqual([])
  })
  test('take a wider spacing and a deeper deck when a style asks (legacy truss: 12 m, 0.32 m)', () => {
    const p = boardwalkPath([[0, 0, 3], [30, 0, 3]])!
    expect(boardwalkColumns(p, () => 0, undefined, { spacingM: 12 })).toHaveLength(4)
    expect(boardwalkColumns(p, () => 2.35)).not.toEqual([])
    expect(boardwalkColumns(p, () => 2.35, undefined, { depthM: 0.32 })).toEqual([])
  })
})

describe('the Elders’ walk on the Islandale terrain (C and C2–C4)', () => {
  const t = loadIslandaleTerrain()
  const ground = (x: number, n: number) => surfaceElevationAt(t, x, n)
  const variants = all.filter((s) => /^C\d?$/.test(s.id))
  const walks = variants.map((s) => {
    const o = s.objects.find((b) => b.t === 'bridge')!
    return [s.id, boardwalkPath(o.pts!.map(([x, n, e]) => [x, n, e * FT] as const))!] as const
  })

  test('there are four variants, each with its boardwalk', () => {
    expect(walks.map(([id]) => id)).toEqual(['C', 'C2', 'C3', 'C4'])
  })
  test.each(walks)('%s never dips into the ground', (_, p) => {
    for (const s of p.samples) expect(s.e - RIBBON_DEPTH_M).toBeGreaterThan(ground(s.x, s.n))
  })
  test.each(walks)('%s keeps its stated 1:21 slope, never steeper than 1:20', (_, p) => {
    const a = p.samples[0]
    const b = p.samples[p.samples.length - 1]
    expect(p.length / Math.abs(a.e - b.e)).toBeCloseTo(21, -0.5)
    for (let i = 1; i < p.samples.length; i++) {
      const q = p.samples[i - 1]
      const s = p.samples[i]
      expect(Math.abs(s.e - q.e) / Math.hypot(s.x - q.x, s.n - q.n)).toBeLessThanOrEqual(1 / 20)
    }
  })
  test.each(walks)('%s stands on posts no more than 7 m apart wherever the ground falls away', (_, p) => {
    const cols = boardwalkColumns(p, ground)
    const step = p.length / (p.samples.length - 1)
    // the deck is well off the ground along its whole length here, so posts run end to end
    expect(cols[0] * step).toBeLessThan(1.5)
    expect((p.samples.length - 1 - cols[cols.length - 1]) * step).toBeLessThan(1.5)
    for (let k = 1; k < cols.length; k++) expect((cols[k] - cols[k - 1]) * step).toBeLessThanOrEqual(7)
  })
})
