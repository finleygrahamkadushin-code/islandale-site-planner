import { describe, expect, test } from 'vitest'
import { ftToM } from '../units'
import { BACK_SLATS, BENCH_DEFAULTS, SEAT_SLATS, benchBase, benchHasBack, benchParts, benchSeatM } from './bench'

const kinds = (params: Record<string, unknown>) => benchParts(params).map((p) => p.kind)
const count = (params: Record<string, unknown>, kind: string) => kinds(params).filter((k) => k === kind).length

describe('bench defaults', () => {
  test('6 ft long, 1.5 ft deep, seat 1.5 ft up, with a back', () => {
    expect(BENCH_DEFAULTS).toEqual({ w: 6, d: 1.5, h: 1.5, back: true })
    expect(benchHasBack({})).toBe(true)
    expect(benchHasBack({ back: false })).toBe(false)
    expect(benchSeatM({})).toBeCloseTo(ftToM(1.5), 9)
  })
})

describe('bench geometry', () => {
  test('with a back: 4 seat slats, 3 leg frames of 2 legs and a stretcher, 2 back posts, 3 back slats', () => {
    expect(SEAT_SLATS).toBe(4)
    expect(BACK_SLATS).toBe(3)
    expect(count(BENCH_DEFAULTS, 'seat')).toBe(4)
    expect(count(BENCH_DEFAULTS, 'leg')).toBe(6)
    expect(count(BENCH_DEFAULTS, 'stretcher')).toBe(3)
    expect(count(BENCH_DEFAULTS, 'backPost')).toBe(2)
    expect(count(BENCH_DEFAULTS, 'backSlat')).toBe(3)
    expect(benchParts(BENCH_DEFAULTS)).toHaveLength(18)
  })

  test('without a back: no back posts or slats', () => {
    const p = { ...BENCH_DEFAULTS, back: false }
    expect(count(p, 'backPost')).toBe(0)
    expect(count(p, 'backSlat')).toBe(0)
    expect(benchParts(p)).toHaveLength(13)
  })

  test('a short bench has two leg frames, not three', () => {
    expect(count({ ...BENCH_DEFAULTS, w: 3 }, 'leg')).toBe(4)
  })

  test('the seat tops sit at the seat height, the legs stand on the feet, and the parts stay in the bench', () => {
    const H = benchSeatM(BENCH_DEFAULTS)
    const L = ftToM(6)
    const D = ftToM(1.5)
    const parts = benchParts(BENCH_DEFAULTS)
    const seat = parts.filter((p) => p.kind === 'seat')
    expect(Math.max(...seat.map((p) => p.centre[1] + p.size[1] / 2))).toBeCloseTo(H, 9)
    expect(Math.min(...parts.filter((p) => p.kind === 'leg').map((p) => p.centre[1] - p.size[1] / 2))).toBeCloseTo(0, 9)
    for (const p of parts) {
      expect(Math.abs(p.centre[0]) + p.size[0] / 2).toBeLessThanOrEqual(L / 2 + 1e-9)
      expect(Math.abs(p.centre[2]) + p.size[2] / 2).toBeLessThanOrEqual(D / 2 + 1e-9)
      expect(p.centre[1] - p.size[1] / 2).toBeGreaterThanOrEqual(-1e-9)
    }
  })
})

describe('bench standZ (metres NAVD88)', () => {
  test('a finite standZ is the base: the bench stands at that elevation', () => {
    expect(benchBase({ standZ: 3.25 }, 9)).toBe(3.25)
    expect(benchBase({ standZ: 0 }, 9)).toBe(0)
  })

  test('without a finite standZ the bench follows the ground', () => {
    expect(benchBase({}, 9)).toBe(9)
    expect(benchBase({ standZ: null }, 9)).toBe(9)
    expect(benchBase({ standZ: Number.NaN }, 9)).toBe(9)
    expect(benchBase({ standZ: Number.POSITIVE_INFINITY }, 9)).toBe(9)
  })
})
