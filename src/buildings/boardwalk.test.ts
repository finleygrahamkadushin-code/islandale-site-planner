import { describe, expect, test } from 'vitest'
import schemes from '../../data/islandale/schemes.json'
import { boardwalkColumns, boardwalkPath } from './boardwalk'

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
})
