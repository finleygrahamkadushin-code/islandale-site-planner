import { describe, expect, test } from 'vitest'
import { buildRail, GUARD_DROP_M, railRuns } from './rails'
import type { LocalPoint } from './footprint'

const deck: LocalPoint[] = [[0, 0], [20, 0], [20, 10], [0, 10]]
const high = () => 4 * 0.3048
const keepAll = { skipEdge: () => false, blocked: () => false }

describe('railRuns', () => {
  test('a deck 4 ft up gets one continuous rail round every edge', () => {
    const runs = railRuns(deck, { ...keepAll, dropAt: high })
    expect(runs).toHaveLength(1)
    expect(runs[0][0]).toEqual(runs[0][runs[0].length - 1])
  })
  test('a deck 1 ft up gets none (legacy GUARD_FT 2.5)', () => {
    expect(GUARD_DROP_M).toBeCloseTo(0.762)
    expect(railRuns(deck, { ...keepAll, dropAt: () => 0.3048 })).toEqual([])
  })
  test('edges with steps stay open', () => {
    const runs = railRuns(deck, { ...keepAll, dropAt: high, skipEdge: (i) => i === 1 })
    expect(runs).toHaveLength(1)
    expect(runs[0].some(([x, z]) => x === 20 && z > 1 && z < 9)).toBe(false)
  })
  test('pieces against a wall are left out, leaving one open run', () => {
    // the far edge (z = 10) runs along a wall
    const runs = railRuns(deck, { ...keepAll, dropAt: high, blocked: ([, z]) => z > 9.5 })
    expect(runs).toHaveLength(1)
    const run = runs[0]
    expect(run[0]).not.toEqual(run[run.length - 1])
    const onWall = run.slice(0, -1).map((p, i) => [(p[0] + run[i + 1][0]) / 2, (p[1] + run[i + 1][1]) / 2]).filter(([, z]) => z > 9.5)
    expect(onWall).toEqual([])
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
