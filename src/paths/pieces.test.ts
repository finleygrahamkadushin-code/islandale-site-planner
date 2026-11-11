import { describe, expect, test } from 'vitest'
import type { PlanObject } from '../store/types'
import { pieceEnds, pieceProfile, railOn, stairInfo, isPathPiece, maxDrop } from './pieces'
import { refreshedEnds, snapSolve } from './snap'
import type { SnapTarget } from './targets'
import { M_PER_FT as FT } from '../site/units'

const piece = (params: Record<string, unknown>, at = { x: 0, n: 0 }, rotation = 0): PlanObject => ({
  id: 'p', type: 'pad', name: 'Piece', position: at, rotation, params, locked: false, hidden: false, labelVisible: true,
})
const flat = () => 10
/** Ground rising 1 m for every 10 m east. */
const slope = (x: number) => 10 + x / 10

describe('path pieces', () => {
  test('a ramp runs from end A at −w/2 to end B at +w/2, its levels from the ground unless pinned', () => {
    const r = piece({ kind: 'ramp', w: 20, d: 4 })
    const E = pieceEnds(r, slope)
    expect(E.A[0]).toBeCloseTo(-10 * FT, 9)
    expect(E.zA).toBeCloseTo(10 - FT, 9)
    expect(pieceEnds(piece({ kind: 'ramp', w: 20, ends: { zA: 12 } }), slope).zA).toBe(12)
  })

  test('a boardwalk sits its lift over the higher end; a landing is level at its higher end', () => {
    expect(pieceEnds(piece({ kind: 'boardwalk', w: 20, lift: 2 }), slope).zA).toBeCloseTo(10 + FT + 2 * FT, 9)
    const L = pieceEnds(piece({ kind: 'landing', w: 5, ends: { zA: 11, zB: 10 } }), flat)
    expect([L.zA, L.zB]).toEqual([11, 11])
  })

  test('a stair splits its rise into risers of 7 in or less and checks for 11 in treads', () => {
    const s = stairInfo(piece({ kind: 'stair', w: 8, ends: { zA: 10 + 30 * 0.0254, zB: 10 } }), flat)
    expect(s.risers).toBe(5)
    expect(s.riserIn).toBeCloseTo(6, 9)
    expect(s.ok).toBe(true)
    expect(stairInfo(piece({ kind: 'stair', w: 2, ends: { zA: 11, zB: 10 } }), flat).ok).toBe(false)
  })

  test('rails: a ramp rising more than 6 in, a stair of 4 risers, a boardwalk over 30 in up; on and off override', () => {
    expect(railOn(piece({ kind: 'ramp', w: 12, ends: { zA: 10.2, zB: 10 } }), flat)).toBe(true)
    expect(railOn(piece({ kind: 'ramp', w: 12, ends: { zA: 10.1, zB: 10 } }), flat)).toBe(false)
    expect(railOn(piece({ kind: 'boardwalk', w: 12, lift: 3 }), flat)).toBe(true)
    expect(maxDrop(piece({ kind: 'boardwalk', w: 12, lift: 3 }), flat)).toBeCloseTo(3 * FT, 9)
    expect(railOn(piece({ kind: 'walk', w: 12, rail: true }), flat)).toBe(true)
    expect(railOn(piece({ kind: 'ramp', w: 12, ends: { zA: 11, zB: 10 }, rail: false }), flat)).toBe(false)
  })

  test('a walk follows the ground along its centre; narrow kindless pads count as walks, parking does not', () => {
    const prof = pieceProfile(piece({ kind: 'walk', w: 20, d: 4 }), slope, 1)
    expect(prof[0].z).toBeCloseTo(slope(prof[0].x), 9)
    expect(isPathPiece({ type: 'pad', name: 'Lane · gravel', params: { d: 4 } })).toBe(true)
    expect(isPathPiece({ type: 'pad', name: 'Parking · drop-off', params: { d: 4 } })).toBe(false)
  })
})

describe('snapping', () => {
  const door: SnapTarget = { x: 10, n: 0, z: 11, dir: [1, 0], label: 'Cabin · door', kind: 'door', owner: 'c' }

  test('the end nearest a target within 3 ft lands on it, the piece turned to run on out of the door', () => {
    const r = piece({ kind: 'ramp', w: 12 }, { x: 10 + 6 * FT + 0.5, n: 0.4 }, 30)
    const s = snapSolve(r, flat, [door])!
    expect(s.end).toBe('A')
    expect(s.rotation).toBe(0)
    const E = pieceEnds({ ...r, position: s.position, rotation: s.rotation }, flat)
    expect(E.A[0]).toBeCloseTo(10, 9)
    expect(E.A[1]).toBeCloseTo(0, 9)
  })

  test('nothing within reach: no snap; an end touching a target takes its level', () => {
    expect(snapSolve(piece({ kind: 'ramp', w: 12 }, { x: 40, n: 0 }), flat, [door])).toBeNull()
    const on = piece({ kind: 'ramp', w: 12 }, { x: 10 + 6 * FT, n: 0 })
    expect(refreshedEnds(on, flat, [door])).toEqual({ zA: 11 })
  })
})
