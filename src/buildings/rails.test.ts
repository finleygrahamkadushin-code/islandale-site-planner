import { describe, expect, test } from 'vitest'
import schemes from '../../data/islandale/schemes.json'
import { buildingMasses, type Mass } from './masses'
import { buildRail, GUARD_DROP_M, guardRule, railRuns, stairHasHandrails, wingDropM } from './rails'
import type { LocalPoint } from './footprint'

const deck: LocalPoint[] = [[0, 0], [20, 0], [20, 10], [0, 10]]
const keepAll = { skipEdge: () => false, blocked: () => false }

describe('railRuns', () => {
  test('an open outline gets one continuous rail round every edge', () => {
    const runs = railRuns(deck, keepAll)
    expect(runs).toHaveLength(1)
    expect(runs[0][0]).toEqual(runs[0][runs[0].length - 1])
  })
  test('edges with steps stay open', () => {
    const runs = railRuns(deck, { ...keepAll, skipEdge: (i) => i === 1 })
    expect(runs).toHaveLength(1)
    expect(runs[0].some(([x, z]) => x === 20 && z > 1 && z < 9)).toBe(false)
  })
  test('pieces against a wall are left out, leaving one open run', () => {
    // the far edge (z = 10) runs along a wall
    const runs = railRuns(deck, { ...keepAll, blocked: ([, z]) => z > 9.5 })
    expect(runs).toHaveLength(1)
    const run = runs[0]
    expect(run[0]).not.toEqual(run[run.length - 1])
    const onWall = run.slice(0, -1).map((p, i) => [(p[0] + run[i + 1][0]) / 2, (p[1] + run[i + 1][1]) / 2]).filter(([, z]) => z > 9.5)
    expect(onWall).toEqual([])
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

describe('buildRail', () => {
  test('the top rail sits at 36 in above the floor', () => {
    const m = buildRail([[[0, 0], [10, 0]]])
    let top = -Infinity
    for (let i = 1; i < m.positions.length; i += 3) top = Math.max(top, m.positions[i])
    expect(top).toBeCloseTo(36 * 0.0254, 2)
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

describe('stairHasHandrails', () => {
  const stair = (rail?: boolean): Mass => buildingMasses({ w: 20, d: 20, wings: [{ kind: 'stair', open: true, w: 4, d: 4, rail }] })[1]
  test('every stair gets handrails unless its rail is off, as in the old planner', () => {
    expect(stairHasHandrails(stair())).toBe(true)
    expect(stairHasHandrails(stair(false))).toBe(false)
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
