import { describe, expect, test } from 'vitest'
import { ftToM } from '../units'
import { CUSHION_T } from './bench'
import {
  DINING_CUSHION_COLOUR,
  DINING_DEFAULTS,
  TOP_T,
  diningBase,
  diningCount,
  diningCushionColour,
  diningHasCushion,
  diningTableParts,
  type DiningPart,
  type DiningSeat,
  type DiningTableParts,
} from './diningTable'

const chairs = (p: Record<string, unknown>) => diningTableParts(p).seats.filter((s) => s.kind === 'chair')
const benches = (p: Record<string, unknown>) => diningTableParts(p).seats.filter((s) => s.kind === 'bench')
const allParts = (m: DiningTableParts) => [...m.table, ...m.seats.flatMap((s) => s.parts)]
const count = (p: Record<string, unknown>, kind: string) => allParts(diningTableParts(p)).filter((x) => x.kind === kind).length
const seatParts = (s: DiningSeat, kind: string) => s.parts.filter((p) => p.kind === kind)

describe('dining table defaults', () => {
  test('8 ft long, 3.5 ft wide, 2.5 ft high, 8 chairs, cushions in the sand colour', () => {
    expect(DINING_DEFAULTS).toEqual({ w: 8, d: 3.5, h: 2.5, seats: 'chairs', count: 8, cushion: true, cushionColor: '#d8c9a8' })
    expect(DINING_CUSHION_COLOUR).toBe('#d8c9a8')
    expect(diningCount({})).toBe(8)
    expect(diningCount({ count: 2.6 })).toBe(3)
    expect(diningCount({ count: 99 })).toBe(20)
    expect(diningCount({ count: -4 })).toBe(0)
    expect(diningHasCushion({})).toBe(true)
    expect(diningHasCushion({ cushion: false })).toBe(false)
  })
})

describe('dining table top and legs', () => {
  test('a 2 in top on four chunky legs, its top at the table height', () => {
    const { table } = diningTableParts({})
    const top = table.filter((p) => p.kind === 'top')
    const legs = table.filter((p) => p.kind === 'leg')
    expect(top).toHaveLength(1)
    expect(top[0].size[1]).toBeCloseTo(TOP_T, 9)
    expect(TOP_T).toBeCloseTo(0.0508, 4)
    expect(top[0].centre[1] + top[0].size[1] / 2).toBeCloseTo(ftToM(2.5), 9)
    expect(top[0].size[0]).toBeCloseTo(ftToM(8), 9)
    expect(top[0].size[2]).toBeCloseTo(ftToM(3.5), 9)
    expect(legs).toHaveLength(4)
    for (const leg of legs) {
      expect(leg.centre[1] - leg.size[1] / 2).toBeCloseTo(0, 9)
      expect(leg.centre[1] + leg.size[1] / 2).toBeCloseTo(ftToM(2.5) - TOP_T, 9)
    }
  })

  test('the legs stand inside the top, not beyond it', () => {
    const top = diningTableParts({}).table.find((p) => p.kind === 'top') as DiningPart
    for (const leg of diningTableParts({}).table.filter((p) => p.kind === 'leg')) {
      expect(Math.abs(leg.centre[0]) + leg.size[0] / 2).toBeLessThanOrEqual(top.size[0] / 2 + 1e-9)
      expect(Math.abs(leg.centre[2]) + leg.size[2] / 2).toBeLessThanOrEqual(top.size[2] / 2 + 1e-9)
    }
  })
})

describe('dining table chairs', () => {
  test('8 chairs by default: four on each long side and no chairs at the ends', () => {
    const seats = chairs({})
    expect(seats).toHaveLength(8)
    expect(seats.filter((s) => s.centre[2] < 0)).toHaveLength(4)
    expect(seats.filter((s) => s.centre[2] > 0)).toHaveLength(4)
    expect(seats.every((s) => Math.abs(s.centre[0]) < ftToM(8) / 2)).toBe(true)
  })

  test('10 chairs: two more, one at each end of the table', () => {
    const seats = chairs({ count: 10 })
    expect(seats).toHaveLength(10)
    const ends = seats.filter((s) => Math.abs(s.centre[0]) > ftToM(8) / 2)
    expect(ends).toHaveLength(2)
    expect(Math.sign(ends[0].centre[0])).not.toBe(Math.sign(ends[1].centre[0]))
  })

  test('count 0 gives a bare table', () => {
    expect(chairs({ count: 0 })).toHaveLength(0)
  })

  test('each chair has its seat slats, four legs, two back posts and two back slats', () => {
    const seat = chairs({})[0]
    expect(seatParts(seat, 'seat')).toHaveLength(3)
    expect(seatParts(seat, 'leg')).toHaveLength(4)
    expect(seatParts(seat, 'backPost')).toHaveLength(2)
    expect(seatParts(seat, 'backSlat')).toHaveLength(2)
  })

  test('the chairs sit on both long sides, each facing the table', () => {
    for (const s of chairs({ count: 10 })) {
      const facing = [Math.sin(s.turn), Math.cos(s.turn)] as const
      // from the chair toward the table's centre
      const toTable = [-s.centre[0], -s.centre[2]] as const
      const dot = facing[0] * toTable[0] + facing[1] * toTable[1]
      expect(dot).toBeGreaterThan(0)
    }
  })

  test("a side chair's seat front tucks 2 in under the table's edge", () => {
    const D = ftToM(3.5)
    const C = ftToM(1.6)
    for (const s of chairs({})) {
      expect(Math.abs(s.centre[2]) - C / 2).toBeCloseTo(D / 2 - 0.0508, 4)
    }
  })

  test('no chair seat runs into a table leg', () => {
    const { table, seats } = diningTableParts({ count: 10 })
    const legs = table.filter((p) => p.kind === 'leg')
    const C = ftToM(1.6)
    for (const s of seats.filter((x) => x.kind === 'chair')) {
      for (const leg of legs) {
        const overlapX = Math.abs(s.centre[0] - leg.centre[0]) < C / 2 + leg.size[0] / 2
        const overlapZ = Math.abs(s.centre[2] - leg.centre[2]) < C / 2 + leg.size[2] / 2
        expect(overlapX && overlapZ).toBe(false)
      }
    }
  })

  test('the chair seat sits under the table top, with the cushion clear of it', () => {
    const seat = chairs({})[0]
    const slatTop = Math.max(...seatParts(seat, 'seat').map((p) => p.centre[1] + p.size[1] / 2))
    expect(slatTop).toBeCloseTo(ftToM(1.5), 9)
    expect(ftToM(1.5) + CUSHION_T).toBeLessThan(ftToM(2.5) - TOP_T)
  })
})

describe('dining table benches', () => {
  test('seats: benches makes one bench on each long side and no chairs', () => {
    const p = { seats: 'benches' }
    expect(benches(p)).toHaveLength(2)
    expect(chairs(p)).toHaveLength(0)
    expect(benches(p).map((b) => Math.sign(b.centre[2])).sort()).toEqual([-1, 1])
    expect(benches(p).every((b) => b.centre[0] === 0)).toBe(true)
  })

  test('a bench is as long as the table and has no backrest', () => {
    const b = benches({ seats: 'benches' })[0]
    expect(seatParts(b, 'seat')[0].size[0]).toBeCloseTo(ftToM(8), 9)
    expect(seatParts(b, 'backPost')).toHaveLength(0)
    expect(seatParts(b, 'backSlat')).toHaveLength(0)
  })
})

describe('dining table cushions', () => {
  test('cushion parts only when on: one pad per chair, two for benches, none when off', () => {
    expect(count({}, 'cushion')).toBe(8)
    expect(count({ cushion: false }, 'cushion')).toBe(0)
    expect(count({ seats: 'benches' }, 'cushion')).toBe(2)
    expect(count({ seats: 'benches', cushion: false }, 'cushion')).toBe(0)
  })

  test('a seat pad is 3 in thick and sits on the seat', () => {
    const pad = seatParts(chairs({})[0], 'cushion')[0]
    expect(pad.size[1]).toBeCloseTo(CUSHION_T, 9)
    expect(pad.centre[1] - pad.size[1] / 2).toBeCloseTo(ftToM(1.5), 9)
  })

  test('cushionColor: a #rrggbb string is used, anything else falls back to the sand colour', () => {
    expect(diningCushionColour({})).toBe(DINING_CUSHION_COLOUR)
    expect(diningCushionColour({ cushionColor: '#336699' })).toBe('#336699')
    expect(diningCushionColour({ cushionColor: 'blue' })).toBe(DINING_CUSHION_COLOUR)
    expect(diningCushionColour({ cushionColor: 12 })).toBe(DINING_CUSHION_COLOUR)
  })
})

describe('dining table base', () => {
  test('standZ sets the feet, metres NAVD88', () => {
    expect(diningBase({ standZ: 3.1 }, 1.5)).toBe(3.1)
  })

  test('without standZ the table stands on the ground', () => {
    expect(diningBase({}, 1.5)).toBe(1.5)
    expect(diningBase({ standZ: Number.NaN }, 1.5)).toBe(1.5)
  })
})
