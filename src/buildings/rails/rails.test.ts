import { describe, expect, test } from 'vitest'
import schemes from '../../../data/islandale/schemes.json'
import { buildingMasses, type Mass } from '../masses'
import { GUARD_DROP_M, guardRule, joinEdgeRuns, wingDropM } from './rails'
import type { LocalPoint } from '../footprint'
import type { Interval } from './railOpenings'

const deck: LocalPoint[] = [[0, 0], [20, 0], [20, 10], [0, 10]]
const FT = 0.3048
const len = (i: number) => Math.hypot(deck[(i + 1) % 4][0] - deck[i][0], deck[(i + 1) % 4][1] - deck[i][1]) * FT
const whole = (i: number): Interval[] => [[0, len(i)]]

describe('joinEdgeRuns', () => {
  test('a guard on every whole edge is one closed ring', () => {
    const runs = joinEdgeRuns(deck, [0, 1, 2, 3].map(whole))
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(5)
    expect(runs[0][0]).toEqual(runs[0][4])
  })
  test('an edge left open splits the ring into one run that wraps round vertex 0', () => {
    const runs = joinEdgeRuns(deck, [whole(0), [], whole(2), whole(3)])
    expect(runs).toHaveLength(1)
    expect(runs[0][0]).toEqual([20, 10])
    expect(runs[0][runs[0].length - 1]).toEqual([20, 0])
  })
  test('an opening in the middle of an edge ends one run and starts the next there', () => {
    const runs = joinEdgeRuns(deck, [[[0, 2], [4, len(0)]], whole(1), whole(2), whole(3)])
    expect(runs).toHaveLength(1)
    const run = runs[0]
    expect(run[0][0]).toBeCloseTo(4 / FT)
    expect(run[run.length - 1][0]).toBeCloseTo(2 / FT)
  })
})

describe('wingDropM (legacy surfaceDropFt)', () => {
  test('flat ground: the floor height plus the 0.15 m slab', () => {
    expect(wingDropM(deck, 1, () => 0)).toBeCloseTo(1.15)
  })
  test('reads the ground 0.9 m outside the outline, where a slope falls away', () => {
    // ground falls 0.1 m per foot toward +x; the deck's far edge is at x = 20, read at about x = 23
    const drop = wingDropM(deck, 0, (x) => -0.1 * x)
    expect(drop).toBeGreaterThan(2.0 + 0.15)
    expect(drop).toBeLessThan(2.4 + 0.15)
  })
})

describe('guardRule (legacy wing rails)', () => {
  const wing = (p: Record<string, unknown>): Mass => buildingMasses({ w: 20, d: 20, wings: [{ w: 12, d: 8, open: true, ...p }] })[1]

  test('a deck is railed on every open edge whatever its height', () => {
    const skip = guardRule(wing({ kind: 'deck' }), 4, 0)!
    expect([0, 1, 2, 3].map(skip)).toEqual([false, false, false, false])
  })
  test('a deck with rail "sides" leaves its ends (odd edges) open', () => {
    const r = guardRule(wing({ kind: 'deck', rail: 'sides' }), 4, 0)!
    expect([0, 1, 2, 3].map(r)).toEqual([false, true, false, true])
  })
  test('rail "sides" is ignored on a curved deck, as in the old planner', () => {
    const r = guardRule(wing({ kind: 'deck', rail: 'sides' }), 40, 0)!
    expect(r(1)).toBe(false)
  })
  test('a deck leaves the edges with sitting steps open', () => {
    const r = guardRule(wing({ kind: 'deck', steps: { e0: 1, e1: 2 } }), 4, 0)!
    expect([0, 1, 2, 3].map(r)).toEqual([false, true, true, false])
  })
  test('a porch is railed all round past a 30 in drop, or when raised or forced', () => {
    expect(GUARD_DROP_M).toBeCloseTo(0.762)
    expect(guardRule(wing({ kind: 'porch' }), 4, 0.5)).toBeNull()
    expect(guardRule(wing({ kind: 'porch' }), 4, 0.8)!(0)).toBe(false)
    expect(guardRule(wing({ kind: 'porch', lvl: 2 }), 4, 0)).not.toBeNull()
    expect(guardRule(wing({ kind: 'porch', rail: true }), 4, 0)).not.toBeNull()
  })
  test('rail false means no rail at all', () => {
    expect(guardRule(wing({ kind: 'deck', rail: false }), 4, 9)).toBeNull()
    expect(guardRule(wing({ kind: 'porch', rail: false }), 4, 9)).toBeNull()
  })
})

describe('Scheme C wings', () => {
  type Obj = { t: string; name: string } & Record<string, unknown>
  const c = (schemes as unknown as { schemes: { id: string; objects: Obj[] }[] }).schemes.find((s) => s.id === 'C')!
  test('the Elders’ wedge deck keeps rail "sides", so its ends stay open', () => {
    const wedge = c.objects.find((o) => o.name === 'Elders’ wedge')!
    const deck = buildingMasses(wedge).find((m) => m.kind === 'deck')!
    expect(deck.rail).toBe('sides')
    expect(guardRule(deck, 4, 0)!(1)).toBe(true)
  })
})
