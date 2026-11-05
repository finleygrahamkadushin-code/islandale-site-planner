import { describe, expect, test } from 'vitest'
import {
  clearanceHits,
  clipToZone,
  doorAtStairTop,
  junctionOpenings,
  keepRuns,
  mergeIntervals,
  MIN_RUN_M,
  postsClearOfDoors,
  sampledRuns,
  stairTopSpan,
  wallAbutOpenings,
  type ClearItem,
  type HostEdge,
  type Landing,
  type StairTop,
} from './railOpenings'

// a 10 m deck edge along the x axis at z (surface) 1 m; outside is -n
const edge = { a: [0, 0] as const, b: [10, 0] as const, z: 1 }
const host: HostEdge = { ...edge, mi: 1, i: 0 }
// a 1.2 m stair whose top sits on the edge at x = 4, running out (-n)
const top: StairTop = { c: [4, 0], axis: [0, -1], w: 1.2 }

describe('intervals', () => {
  test('mergeIntervals joins overlaps and sorts', () => {
    expect(mergeIntervals([[5, 6], [1, 2], [1.5, 3], [3, 4]])).toEqual([[1, 4], [5, 6]])
  })
  test('keepRuns is the complement, without stubs of 15 cm or less', () => {
    expect(keepRuns([[2, 3]], 10)).toEqual([[0, 2], [3, 10]])
    expect(keepRuns([[0.1, 3], [3.1, 9.9]], 10)).toEqual([])
    expect(keepRuns([], 10)).toEqual([[0, 10]])
    expect(MIN_RUN_M).toBe(0.15)
  })
  test('sampledRuns drops blocked samples and keeps runs over 15 cm', () => {
    const runs = sampledRuns(4, (u) => u > 1 && u < 2)
    expect(runs).toHaveLength(2)
    expect(runs[0][0]).toBe(0)
    expect(runs[0][1]).toBeLessThanOrEqual(1)
    expect(runs[1][1]).toBe(4)
    expect(sampledRuns(4, (u) => u > 0.1)).toEqual([])
  })
  test('clipToZone clips a segment to a box', () => {
    expect(clipToZone([0, 0], [10, 0], [4, 0], [1, 0], [0, 1], 0, 2, -1, 1)).toEqual([0.4, 0.6])
    expect(clipToZone([0, 5], [10, 5], [4, 0], [1, 0], [0, 1], 0, 2, -1, 1)).toBeNull()
  })
})

describe('stairTopSpan', () => {
  test('a square-on stair opens exactly its width', () => {
    expect(stairTopSpan(edge, top)).toEqual([3.4, 4.6])
  })
  test('a stair set at an angle opens where its sides meet the edge', () => {
    const a = Math.PI / 6
    const span = stairTopSpan(edge, { c: [4, 0], axis: [Math.sin(a), -Math.cos(a)], w: 1.2 })!
    expect(span[1] - span[0]).toBeCloseTo(1.2 / Math.cos(a))
  })
  test('clamped to the edge, null when it misses', () => {
    expect(stairTopSpan(edge, { ...top, c: [0.2, 0] })).toEqual([0, expect.closeTo(0.8)])
    expect(stairTopSpan(edge, { ...top, c: [20, 0] })).toBeNull()
  })
})

describe('junctionOpenings (join-core, join-rails)', () => {
  const at = (x: number, d = 0.1, z = 1): Landing => ({ kind: 'piece', at: [x, -d], z, w: 1.2 })
  test('a path piece end opens its width plus 5 cm each side', () => {
    const [[u0, u1]] = junctionOpenings([host], [at(5)], { mi: 1, i: 0 })
    expect(u0).toBeCloseTo(4.35)
    expect(u1).toBeCloseTo(5.65)
  })
  test('an end further than 0.35 m, or 0.3 m above or below, passes by', () => {
    expect(junctionOpenings([host], [at(5, 0.5)], { mi: 1, i: 0 })).toEqual([])
    expect(junctionOpenings([host], [at(5, 0.1, 1.4)], { mi: 1, i: 0 })).toEqual([])
  })
  test('a stair wing opens exactly its top span', () => {
    expect(junctionOpenings([host], [{ kind: 'stair-wing', at: top.c, z: 1, w: 1.2, top }], { mi: 1, i: 0 })).toEqual([[3.4, 4.6]])
  })
  test('a landing goes to the nearest host edge only', () => {
    const near: HostEdge = { a: [0, -0.05], b: [10, -0.05], z: 1, mi: 2, i: 0 }
    expect(junctionOpenings([host, near], [at(5, 0.1)], { mi: 1, i: 0 })).toEqual([])
    expect(junctionOpenings([host, near], [at(5, 0.1)], { mi: 2, i: 0 })).toHaveLength(1)
  })
  test('a wall with a door takes a landing at its door, which then opens no deck rail', () => {
    const wall: HostEdge = { a: [0, -0.1], b: [10, -0.1], z: 1, mi: 0, i: 2, doors: [[4.5, 5.5]] }
    expect(junctionOpenings([host, wall], [at(5, 0.15)], { mi: 1, i: 0 })).toEqual([])
    const farDoor: HostEdge = { ...wall, doors: [[8, 9]] }
    expect(junctionOpenings([host, farDoor], [at(5, 0.15)], { mi: 1, i: 0 })).toHaveLength(1)
  })
  test('another deck edge lying along this one opens the stretch they share', () => {
    const abut: Landing = { kind: 'deck-abut', a: [6, -0.2], b: [14, -0.2], z: 1.1 }
    expect(junctionOpenings([host], [abut], { mi: 1, i: 0 })).toEqual([[6, 10]])
    const crossing: Landing = { kind: 'deck-abut', a: [6, -2], b: [8, 2], z: 1 }
    expect(junctionOpenings([host], [crossing], { mi: 1, i: 0 })).toEqual([])
  })
})

describe('clearanceHits (rail-clear)', () => {
  test('a stair wing at the same level opens its top span', () => {
    const hits = clearanceHits(edge, [{ type: 'wing', kind: 'stair', top, z: 1, name: 'Stair 2' }])
    expect(hits).toEqual([{ type: 'stair', name: 'Stair 2', u0: 3.4, u1: 4.6 }])
  })
  test('a stair top crossing a facet clears the zone round it', () => {
    // a steep facet of a curved deck running across the stair top
    const facet = { a: [4, 2] as const, b: [4.3, 0.5] as const, z: 1 }
    const hits = clearanceHits(facet, [{ type: 'wing', kind: 'stair', top: { ...top, c: [4, 1] }, z: 1, name: 'Stair 2' }])
    expect(hits).toHaveLength(1)
  })
  test('a path or bridge end within 0.5 m opens its width, no pad', () => {
    const items: ClearItem[] = [
      { type: 'piece', at: [2, -0.4], z: 1.5, w: 1, name: 'Path to beach' },
      { type: 'bridge', at: [8, 0.3], z: 1, w: 1.5, name: 'Bridge' },
    ]
    expect(clearanceHits(edge, items).map((h) => [h.type, h.u0, h.u1])).toEqual([
      ['path', 1.5, 2.5],
      ['bridge', 7.25, 8.75],
    ])
  })
  test('anything more than 1 m above or below the edge passes by', () => {
    expect(clearanceHits(edge, [{ type: 'piece', at: [2, -0.1], z: 2.5, w: 1, name: 'x' }])).toEqual([])
  })
  test('a door clears its width plus 15 cm each side, 0.9 m out and 0.5 m back', () => {
    // a door 0.6 m behind the edge, facing it (-n): within the 0.9 m landing
    const door: ClearItem = { type: 'door', a: [4, 0.6], b: [5, 0.6], nrm: [0, -1], z: 1, name: 'Door' }
    const [h] = clearanceHits(edge, [door])
    expect(h.type).toBe('door')
    expect(h.u0).toBeCloseTo(3.85)
    expect(h.u1).toBeCloseTo(5.15)
    expect(clearanceHits(edge, [{ ...door, a: [4, 1.2], b: [5, 1.2] }])).toEqual([])
  })
})

describe('wallAbutOpenings', () => {
  test('a parallel wall within 0.45 m opens its length along the edge', () => {
    const wall = [[2, 0.3], [6, 0.3], [6, 5], [2, 5]] as const
    expect(wallAbutOpenings(edge, [wall])).toEqual([[2, 6]])
  })
  test('a wall further off, or at an angle, does not', () => {
    expect(wallAbutOpenings(edge, [[[2, 0.6], [6, 0.6], [6, 5], [2, 5]]])).toEqual([])
    expect(wallAbutOpenings(edge, [[[2, 0], [6, 1], [6, 5], [2, 5]]])).toEqual([])
  })
})

describe('doors and posts', () => {
  const door = { c: [0, 0] as const, w: 0.9, z: 1 }
  test('a post within half the door plus 0.3 m of its centre is dropped', () => {
    expect(postsClearOfDoors([[0.7, 0], [0.8, 0], [0, 3]], [door], 1)).toEqual([true, true, true].map((_, i) => i !== 0))
    expect(postsClearOfDoors([[0.2, 0]], [door], 3)).toEqual([true])
  })
  test('a door at a stair top keeps its handrails back', () => {
    expect(doorAtStairTop(top, 1, [{ c: [4.5, 0.4], w: 0.9, z: 1 }])).toBe(true)
    expect(doorAtStairTop(top, 1, [{ c: [6, 0.4], w: 0.9, z: 1 }])).toBe(false)
    expect(doorAtStairTop(top, 1, [{ c: [4, 0.4], w: 0.9, z: 3 }])).toBe(false)
  })
})
