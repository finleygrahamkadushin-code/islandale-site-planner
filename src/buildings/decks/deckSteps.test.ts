import { describe, expect, test } from 'vitest'
import { chainOffset, deckStepChain, deckStepsPlan, STEP_RISE_M } from './deckSteps'
import { RISER_MAX_M, TREAD_MIN_M } from '../stairs/stairs'
import type { LocalPoint } from '../footprint'

const FT = 0.3048
// a 20 x 10 ft deck, counter-clockwise; edge 0 runs along z = -5
const deck: LocalPoint[] = [[-10, -5], [10, -5], [10, 5], [-10, 5]]

describe('deckStepChain', () => {
  test('takes vertices e0 to e1 + 1 of the outline', () => {
    expect(deckStepChain(deck, { e0: 1, e1: 2, tread: 1.75 })).toEqual([[10, -5], [10, 5], [-10, 5]])
  })
  test('rejects a reversed range', () => {
    expect(deckStepChain(deck, { e0: 3, e1: 1, tread: 1.75 })).toBeNull()
  })
})

describe('chainOffset', () => {
  test('moves the chain outward, away from the deck', () => {
    const out = chainOffset([[10, -5], [10, 5]], 2)
    expect(out[0][0]).toBeCloseTo(12)
    expect(out[1][0]).toBeCloseTo(12)
  })
})

describe('deckStepsPlan', () => {
  const flat = (dropM: number) => () => -dropM
  test("sitting steps use the planner's one stair rule, 7 in risers and 11 in treads (R3.5)", () => {
    expect(STEP_RISE_M).toBe(RISER_MAX_M)
    const short = deckStepsPlan(deck, { e0: 1, e1: 1, tread: 0.5 }, flat(3 * FT), [])!
    expect(short.tread * FT).toBeGreaterThanOrEqual(TREAD_MIN_M - 1e-9)
  })
  test('a deck 3 ft up steps down in risers of at most 7 in', () => {
    const p = deckStepsPlan(deck, { e0: 1, e1: 1, tread: 1.75 }, flat(3 * FT), [])!
    expect(p.risers).toBe(6)
    expect(p.rise).toBeLessThanOrEqual(STEP_RISE_M + 1e-9)
    expect(p.ok).toBe(true)
    expect(p.bands).toHaveLength(5)
    expect(p.bands[0].top).toBeCloseTo(-p.rise)
  })
  test('each tread is one more tread width out from the deck edge', () => {
    const p = deckStepsPlan(deck, { e0: 1, e1: 1, tread: 2 }, flat(3 * FT), [])!
    const xs = p.bands.map((b) => Math.max(...b.pieces[0].map((q) => q[0])))
    expect(xs[0]).toBeCloseTo(12)
    expect(xs[2]).toBeCloseTo(16)
  })
  test('treads part round a tree well', () => {
    const well = { x: 12, z: 0, r: 1.2 / FT }
    const p = deckStepsPlan(deck, { e0: 1, e1: 1, tread: 2 }, flat(3 * FT), [well])!
    expect(p.bands[0].pieces.length).toBe(2)
    expect(p.wells).toHaveLength(1)
  })
  test('past 30 risers the rise is flagged, not grown silently', () => {
    const p = deckStepsPlan(deck, { e0: 1, e1: 1, tread: 1.75 }, flat(20 * FT), [])!
    expect(p.risers).toBe(30)
    expect(p.rise).toBeGreaterThan(STEP_RISE_M)
    expect(p.ok).toBe(false)
  })
  test('the gathering prow deck steps only along edges 3 to 14', () => {
    const pts: LocalPoint[] = Array.from({ length: 33 }, (_, i) => [20 * Math.cos((-i / 33) * 2 * Math.PI), 15 * Math.sin((-i / 33) * 2 * Math.PI)] as const).reverse()
    const p = deckStepsPlan(pts, { e0: 3, e1: 14, tread: 1.75 }, flat(4 * FT), [])!
    expect(p.chain).toHaveLength(13)
  })
})
