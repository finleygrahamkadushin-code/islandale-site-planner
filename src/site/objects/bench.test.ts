import { describe, expect, test } from 'vitest'
import { ftToM } from '../units'
import {
  BACK_SLATS,
  BENCH_CUSHION_COLOUR,
  BENCH_DEFAULTS,
  CUSHION_T,
  SEAT_SLATS,
  benchBase,
  benchCushionColour,
  benchFacing,
  benchHasBack,
  benchHasCushion,
  benchParts,
  benchSeatM,
  type BenchPart,
} from './bench'

const kinds = (params: Record<string, unknown>) => benchParts(params).map((p) => p.kind)
const count = (params: Record<string, unknown>, kind: string) => kinds(params).filter((k) => k === kind).length

describe('bench defaults', () => {
  test('6 ft long, 1.5 ft deep, seat 1.5 ft up, with a back and cushions', () => {
    expect(BENCH_DEFAULTS).toEqual({ w: 6, d: 1.5, h: 1.5, back: true, cushion: true })
    expect(benchHasBack({})).toBe(true)
    expect(benchHasBack({ back: false })).toBe(false)
    expect(benchSeatM({})).toBeCloseTo(ftToM(1.5), 9)
  })
})

describe('bench geometry', () => {
  test('with a back: 4 seat slats, 3 leg frames of 2 legs and a stretcher, 2 back posts, 3 back slats, 2 cushions', () => {
    expect(SEAT_SLATS).toBe(4)
    expect(BACK_SLATS).toBe(3)
    expect(count(BENCH_DEFAULTS, 'seat')).toBe(4)
    expect(count(BENCH_DEFAULTS, 'leg')).toBe(6)
    expect(count(BENCH_DEFAULTS, 'stretcher')).toBe(3)
    expect(count(BENCH_DEFAULTS, 'backPost')).toBe(2)
    expect(count(BENCH_DEFAULTS, 'backSlat')).toBe(3)
    expect(count(BENCH_DEFAULTS, 'cushion')).toBe(2)
    expect(benchParts(BENCH_DEFAULTS)).toHaveLength(20)
  })

  test('without a back: no back posts or slats', () => {
    const p = { ...BENCH_DEFAULTS, back: false, cushion: false }
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

describe('bench cushions', () => {
  const plain = { ...BENCH_DEFAULTS, cushion: false }

  test('cushions add parts only when on: a seat cushion, and a back cushion with a back', () => {
    expect(benchHasCushion(plain)).toBe(false)
    expect(benchParts(plain)).toHaveLength(18)
    expect(count(BENCH_DEFAULTS, 'cushion')).toBe(2)
    expect(count({ ...BENCH_DEFAULTS, back: false }, 'cushion')).toBe(1)
  })

  test('cushions are 3 in thick and sit on the seat (the seat cushion) and on the backrest (the back cushion)', () => {
    const H = benchSeatM(BENCH_DEFAULTS)
    const [seatCushion, backCushion] = benchParts(BENCH_DEFAULTS).filter((p) => p.kind === 'cushion')
    expect(seatCushion.size[1]).toBeCloseTo(CUSHION_T, 9)
    expect(seatCushion.centre[1] - seatCushion.size[1] / 2).toBeCloseTo(H, 9)
    expect(backCushion.size[2]).toBeCloseTo(CUSHION_T, 9)
    expect(backCushion.centre[1] - backCushion.size[1] / 2).toBeCloseTo(H + CUSHION_T, 9)
  })

  test('the cushion is inset 1 in from the seat ends and front, and stays inside the bench', () => {
    const L = ftToM(6)
    const D = ftToM(1.5)
    const seatCushion = benchParts(BENCH_DEFAULTS).filter((p) => p.kind === 'cushion')[0]
    const inch = 0.0254
    expect(seatCushion.size[0]).toBeCloseTo(L - 2 * inch, 9)
    // the front (+z, facing out) is 1 in clear of the seat's edge
    expect(seatCushion.centre[2] + seatCushion.size[2] / 2).toBeCloseTo(D / 2 - inch, 9)
    for (const p of benchParts(BENCH_DEFAULTS)) {
      expect(Math.abs(p.centre[0]) + p.size[0] / 2).toBeLessThanOrEqual(L / 2 + 1e-9)
      expect(Math.abs(p.centre[2]) + p.size[2] / 2).toBeLessThanOrEqual(D / 2 + 1e-9)
    }
  })

  test('cushionColor: a #rrggbb string is used, anything else falls back to the sand colour', () => {
    expect(benchCushionColour({})).toBe(BENCH_CUSHION_COLOUR)
    expect(benchCushionColour({ cushionColor: '#336699' })).toBe('#336699')
    expect(benchCushionColour({ cushionColor: 'blue' })).toBe(BENCH_CUSHION_COLOUR)
    expect(benchCushionColour({ cushionColor: 12 })).toBe(BENCH_CUSHION_COLOUR)
  })
})

describe('bench facing', () => {
  const byKind = (parts: BenchPart[], kind: string) => parts.filter((p) => p.kind === kind)

  test("facing 'in' moves the backrest and back cushion to +z, and changes nothing else", () => {
    const out = benchParts({ ...BENCH_DEFAULTS, facing: 'out' })
    const inward = benchParts({ ...BENCH_DEFAULTS, facing: 'in' })
    expect(inward).toHaveLength(out.length)
    const mirrored = new Set<string>(['backPost', 'backSlat', 'cushion'])
    out.forEach((p, i) => {
      const q = inward[i]
      expect(q.kind).toBe(p.kind)
      expect(q.size).toEqual(p.size)
      expect(q.centre[0]).toBeCloseTo(p.centre[0], 12)
      expect(q.centre[1]).toBeCloseTo(p.centre[1], 12)
      expect(q.centre[2]).toBeCloseTo(mirrored.has(p.kind) ? -p.centre[2] : p.centre[2], 12)
    })
    // the back posts and slats now sit at the front (+z), where people face
    for (const p of byKind(inward, 'backPost')) expect(p.centre[2]).toBeGreaterThan(0)
    for (const p of byKind(inward, 'backSlat')) expect(p.centre[2]).toBeGreaterThan(0)
    for (const p of byKind(out, 'backSlat')) expect(p.centre[2]).toBeLessThan(0)
  })

  test('the back cushion is on the backrest side in both facings', () => {
    const inward = byKind(benchParts({ ...BENCH_DEFAULTS, facing: 'in' }), 'cushion')[1]
    const slat = byKind(benchParts({ ...BENCH_DEFAULTS, facing: 'in' }), 'backSlat')[0]
    // with the back at +z, the cushion's rear face (its +z side) touches the slats' seat-facing face (their −z side)
    expect(inward.centre[2] + inward.size[2] / 2).toBeCloseTo(slat.centre[2] - slat.size[2] / 2, 9)
  })

  test("missing facing is 'out', and an unknown value is 'out' too", () => {
    expect(benchFacing({})).toBe('out')
    expect(benchFacing({ facing: 'sideways' })).toBe('out')
    expect(benchFacing({ facing: 'in' })).toBe('in')
  })
})

describe('bench params missing from older saves', () => {
  test('no cushion, out-facing, with a back: the old look (18 parts)', () => {
    const old = { w: 6, d: 1.5, h: 1.5 }
    expect(benchHasCushion(old)).toBe(false)
    expect(benchParts(old)).toHaveLength(18)
    expect(benchParts(old)).toEqual(benchParts({ ...old, facing: 'out', cushion: false, back: true }))
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
