import { describe, expect, test } from 'vitest'
import { ftToM } from '../units'
import { FIREPIT_DEFAULTS, LOUNGE_CUSHION_COLOUR, LOUNGE_DEFAULTS, RING_SEGMENTS, firepitBase, firepitParts, firepitShape } from './firepit'

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

describe('fire lounge', () => {
  const lounge = (extra: Record<string, unknown> = {}) => ({ ...LOUNGE_DEFAULTS, ...extra })
  const W = ftToM(22)
  const D = ftToM(14)
  const top = (p: { centre: number[]; size: number[] }) => p.centre[1] + p.size[1] / 2
  const rimParts = (params: Record<string, unknown>) => parts(params).filter((p) => p.kind === 'deck' && Math.abs(top(p) - RISER) < 1e-9)
  const couchBases = (params: Record<string, unknown>) => parts(params).filter((p) => p.kind === 'deck' && Math.abs(top(p) - ftToM(1.4)) < 1e-9)

  test('22 ft by 14 ft, a 1.5 ft rim, cushions on in the default colour; shape lounge', () => {
    expect(LOUNGE_DEFAULTS).toEqual({ w: 22, d: 14, shape: 'lounge', riser: 1.5, cushion: true, cushionColor: '#d8c9a8' })
    expect(LOUNGE_CUSHION_COLOUR).toBe('#d8c9a8')
    expect(firepitShape({ shape: 'lounge' })).toBe('lounge')
  })

  test('the rim runs round the back and both ends, and not along the front', () => {
    const rim = rimParts(lounge())
    // the back rim spans the full width, behind the couches
    expect(rim.some((p) => p.centre[2] < 0 && Math.abs(p.size[0] - W) < 1e-9)).toBe(true)
    // the two end rims run out to the front edge, at the sides
    expect(rim.some((p) => p.centre[0] < 0 && Math.abs(p.centre[0] + ftToM(10)) < 1e-9)).toBe(true)
    expect(rim.some((p) => p.centre[0] > 0 && Math.abs(p.centre[0] - ftToM(10)) < 1e-9)).toBe(true)
    // no rim part reaches the open front across the middle
    const frontRim = rim.filter((p) => p.centre[2] + p.size[2] / 2 >= D / 2 - 1e-9 && Math.abs(p.centre[0]) < ftToM(9) - 1e-9)
    expect(frontRim).toHaveLength(0)
  })

  test('built-in couches on the back and both ends, and none across the front', () => {
    const bases = couchBases(lounge())
    expect(bases.some((p) => p.centre[2] < 0 && Math.abs(p.centre[0]) < ftToM(6))).toBe(true) // back
    expect(bases.some((p) => p.centre[0] < -ftToM(7))).toBe(true) // left end
    expect(bases.some((p) => p.centre[0] > ftToM(7))).toBe(true) // right end
    // no couch runs across the front: nothing wide on the +z side
    expect(bases.filter((p) => p.centre[2] > 0 && p.size[0] > ftToM(3))).toHaveLength(0)
    // the backrest sits about 1.6 ft above the seat, the seat 0.4 ft above its base
    const backTop = Math.max(...parts(lounge()).filter((p) => p.kind === 'cushion').map(top))
    expect(backTop).toBeCloseTo(ftToM(1.4 + 0.4 + 1.6), 9)
  })

  test('the fire trough is centred left to right, a third of the way to the front, and fireLen long', () => {
    const trough = (p: Record<string, unknown>) => parts(p).find((x) => x.kind === 'stone' && x.form === 'box' && Math.abs(top(x) - ftToM(1.3)) < 1e-9)
    const t = trough(lounge())
    expect(t).toBeDefined()
    expect(t?.centre[0]).toBeCloseTo(0, 9)
    expect(t?.size[0]).toBeCloseTo(ftToM(22 * 0.45), 9)
    // a third of the way from the back couch's front (-2.6 ft) to the open front (+7 ft)
    expect(t?.centre[2]).toBeCloseTo(ftToM(-2.6 + (7 + 2.6) / 3), 9)
    const short = trough(lounge({ fireLen: 6 }))
    expect(short?.size[0]).toBeCloseTo(ftToM(6), 9)
    expect(short?.centre[0]).toBeCloseTo(0, 9)
    // the flames run along the trough, centred
    const flames = parts(lounge()).filter((p) => p.kind === 'flame')
    expect(flames.length).toBeGreaterThanOrEqual(3)
    const xs = flames.map((p) => p.centre[0])
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 9)
  })

  test('cushions only when cushion is on, in cushionColor', () => {
    expect(parts(lounge({ cushion: false })).filter((p) => p.kind === 'cushion')).toHaveLength(0)
    const on = parts(lounge())
    expect(on.filter((p) => p.kind === 'cushion').length).toBeGreaterThan(0)
    expect(on.filter((p) => p.kind === 'cushion').every((p) => p.colour === '#d8c9a8')).toBe(true)
    const red = parts(lounge({ cushionColor: '#aa2222' })).filter((p) => p.kind === 'cushion')
    expect(red.every((p) => p.colour === '#aa2222')).toBe(true)
    // with cushions off the couches are still there, in timber
    expect(couchBases(lounge({ cushion: false })).length).toBeGreaterThan(0)
  })

  test('the lounge is in the floor at the base, and its rim stands at the riser', () => {
    const all = parts(lounge())
    expect(Math.max(...all.filter((p) => p.kind === 'deck').map(top))).toBeCloseTo(RISER, 9)
    expect(Math.min(...all.map((p) => p.centre[1] - p.size[1] / 2))).toBeCloseTo(-ftToM(0.16), 9)
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

describe('fire lounge cushions', () => {
  test('each seat cushion covers its couch full depth, with the back cushion standing on it', () => {
    const ps = firepitParts({ ...LOUNGE_DEFAULTS })
    const seatTop = ftToM(1.4 + 0.4)
    const seats = ps.filter((p) => p.kind === 'cushion' && Math.abs(p.centre[1] + p.size[1] / 2 - seatTop) < 1e-9)
    const backSeat = seats.find((p) => p.size[0] > ftToM(6))!
    expect(backSeat.size[2]).toBeCloseTo(ftToM(2.4), 9)
    const backs = ps.filter((p) => p.kind === 'cushion' && p.centre[1] - p.size[1] / 2 > seatTop - 1e-9)
    expect(backs.length).toBe(3)
  })
})
