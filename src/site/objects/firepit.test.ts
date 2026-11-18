import { describe, expect, test } from 'vitest'
import { ftToM } from '../units'
import { FIREPIT_DEFAULTS, RING_SEGMENTS, firepitBase, firepitParts, firepitShape } from './firepit'

const parts = (params: Record<string, unknown>) => firepitParts(params)
const count = (params: Record<string, unknown>, kind: string) => parts(params).filter((p) => p.kind === kind).length
const RISER = ftToM(FIREPIT_DEFAULTS.riser)
const GAP = ftToM(3)

describe('fire pit defaults', () => {
  test('14 ft round, a 1.5 ft surround, 1.75 ft seats, cushions on', () => {
    expect(FIREPIT_DEFAULTS).toEqual({ w: 14, d: 14, shape: 'round', riser: 1.5, seatDepth: 1.75, cushion: true })
    expect(firepitShape({})).toBe('round')
    expect(firepitShape({ shape: 'square' })).toBe('square')
  })
})

describe('fire pit geometry', () => {
  test('round default: the ring, two sitting steps and the gap steps, the floor, cushions, the bowl and flames', () => {
    // 22 of 24 segments per ring survive the gap, in the ring, both steps and the cushion band
    expect(RING_SEGMENTS).toBe(24)
    expect(count(FIREPIT_DEFAULTS, 'deck')).toBe(22 * 3 + 2)
    expect(count(FIREPIT_DEFAULTS, 'cushion')).toBe(22)
    expect(count(FIREPIT_DEFAULTS, 'stone')).toBe(12 + 1)
    expect(count(FIREPIT_DEFAULTS, 'ember')).toBe(1)
    expect(count(FIREPIT_DEFAULTS, 'flame')).toBe(3)
    expect(parts(FIREPIT_DEFAULTS)).toHaveLength(107)
  })

  test('square default has the same ring count and boxes on the square edge', () => {
    const p = { ...FIREPIT_DEFAULTS, shape: 'square' }
    expect(count(p, 'deck')).toBe(count(FIREPIT_DEFAULTS, 'deck'))
    expect(parts(p).find((x) => x.kind === 'stone' && x.form === 'box')).toBeDefined()
    expect(parts(FIREPIT_DEFAULTS).find((x) => x.kind === 'stone' && x.form === 'cylinder')).toBeDefined()
  })

  test('without cushions there are no cushion parts', () => {
    expect(count({ ...FIREPIT_DEFAULTS, cushion: false }, 'cushion')).toBe(0)
    expect(count({ ...FIREPIT_DEFAULTS, cushion: true }, 'cushion')).toBeGreaterThan(0)
    expect(parts({ ...FIREPIT_DEFAULTS, cushion: false })).toHaveLength(107 - 22)
  })

  test('the raised ring stands at the riser, and no wood sits above it', () => {
    const wood = parts(FIREPIT_DEFAULTS).filter((p) => p.kind === 'deck')
    expect(Math.max(...wood.map((p) => p.centre[1] + p.size[1] / 2))).toBeCloseTo(RISER, 9)
    for (const p of wood) {
      expect(p.centre[1] + p.size[1] / 2).toBeLessThanOrEqual(RISER + 1e-9)
    }
  })

  test('the ring has a gap on +z: no full-height ring segment there, but one on -z', () => {
    const full = (p: { centre: number[]; size: number[]; kind: string }) => p.kind === 'deck' && Math.abs(p.size[1] - RISER) < 1e-9
    const front = parts(FIREPIT_DEFAULTS).filter(full).filter((p) => p.centre[2] > 0 && Math.abs(p.centre[0]) < GAP / 2)
    const back = parts(FIREPIT_DEFAULTS).filter(full).filter((p) => p.centre[2] < 0 && Math.abs(p.centre[0]) < GAP / 2)
    expect(front).toHaveLength(0)
    expect(back.length).toBeGreaterThan(0)
  })

  test('the gap has two shallow steps on +z, one at half the riser and one at the floor', () => {
    const tread1 = parts(FIREPIT_DEFAULTS).find((p) => p.kind === 'deck' && p.size[0] === GAP && Math.abs(p.size[1] - RISER / 2) < 1e-9)
    const tread2 = parts(FIREPIT_DEFAULTS).find((p) => p.kind === 'deck' && p.size[0] === GAP && Math.abs(p.centre[1] + p.size[1] / 2) < 1e-9)
    expect(tread1?.centre[2]).toBeGreaterThan(0)
    expect(tread2?.centre[2]).toBeGreaterThan(0)
  })

  test('the floor and lower step are at the base; cushions stand on the lower step', () => {
    for (const p of parts(FIREPIT_DEFAULTS).filter((x) => x.kind === 'cushion')) {
      expect(p.centre[1] - p.size[1] / 2).toBeCloseTo(0, 9)
    }
  })

  test('the bowl is a stone ring 1.25 ft high, with flames rising above its rim', () => {
    const bowl = parts(FIREPIT_DEFAULTS).filter((p) => p.kind === 'stone' && p.form === 'box')
    expect(Math.max(...bowl.map((p) => p.centre[1] + p.size[1] / 2))).toBeCloseTo(ftToM(1.25), 9)
    const flameTop = Math.max(...parts(FIREPIT_DEFAULTS).filter((p) => p.kind === 'flame').map((p) => p.centre[1] + p.size[1] / 2))
    expect(flameTop).toBeGreaterThan(ftToM(1.25))
  })
})

describe('fire pit standZ (metres NAVD88)', () => {
  test('a finite standZ is the floor: the pit stands at that elevation', () => {
    expect(firepitBase({ standZ: 3.25 }, 9)).toBe(3.25)
    expect(firepitBase({ standZ: 0 }, 9)).toBe(0)
  })

  test('without a finite standZ the pit follows the ground', () => {
    expect(firepitBase({}, 9)).toBe(9)
    expect(firepitBase({ standZ: null }, 9)).toBe(9)
    expect(firepitBase({ standZ: Number.NaN }, 9)).toBe(9)
    expect(firepitBase({ standZ: Number.POSITIVE_INFINITY }, 9)).toBe(9)
  })
})
