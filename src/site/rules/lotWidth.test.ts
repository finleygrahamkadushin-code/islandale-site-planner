import { describe, expect, it } from 'vitest'
import type { Parcel, SitePoint } from '../types'
import { ftToM, mToFt } from '../units'
import { allowedWidthFt, chordM, lotWidthCheck, usedWidthM } from './lotWidth'

/** A rectangular lot `wFt` wide (east–west) and 200 ft deep, its north edge (edge 2) the shore. */
function lot(wFt: number): Parcel {
  const w = ftToM(wFt)
  const d = ftToM(200)
  const ring: SitePoint[] = [[0, 0], [w, 0], [w, d], [0, d]]
  return { ring, lotSqFt: wFt * 200, shorelineEdges: { first: 2, last: 2 } }
}

/** A square building `sFt` on a side with its south-west corner at (xFt, nFt). */
function square(xFt: number, nFt: number, sFt: number): SitePoint[] {
  const [x, n, s] = [ftToM(xFt), ftToM(nFt), ftToM(sFt)]
  return [[x, n], [x + s, n], [x + s, n + s], [x, n + s]]
}

describe('lot-width rule', () => {
  it('allows 40 ft under an 80 ft lot, and half the width from 80 ft', () => {
    expect(allowedWidthFt(60)).toBe(40)
    expect(allowedWidthFt(79.9)).toBe(40)
    expect(allowedWidthFt(80)).toBe(40)
    expect(allowedWidthFt(120)).toBe(60)
  })

  it('measures a chord across the lot through a point', () => {
    const p = lot(60)
    expect(mToFt(chordM(p, [ftToM(30), ftToM(100)], [1, 0])!)).toBeCloseTo(60, 6)
    expect(mToFt(chordM(p, [ftToM(30), ftToM(100)], [0, 1])!)).toBeCloseTo(200, 6)
  })

  it('merges overlapping shadows and counts gaps out', () => {
    const a = square(0, 0, 20)
    const b = square(10, 40, 20)
    const c = square(50, 0, 10)
    expect(mToFt(usedWidthM([a, b], [1, 0]))).toBeCloseTo(30, 6)
    expect(mToFt(usedWidthM([a, b, c], [1, 0]))).toBeCloseTo(40, 6)
  })

  it('passes a narrow lot within 40 ft and fails past it', () => {
    const p = lot(60)
    const near = square(5, 90, 20)
    const ok = lotWidthCheck(p, [near, square(30, 60, 15)])!
    expect(ok.lotFt).toBeCloseTo(60, 1)
    expect(ok.allowedFt).toBe(40)
    expect(ok.usedFt).toBeCloseTo(35, 1)
    expect(ok.ok).toBe(true)
    const bad = lotWidthCheck(p, [near, square(30, 60, 25)])!
    expect(bad.usedFt).toBeCloseTo(45, 1)
    expect(bad.ok).toBe(false)
  })

  it('uses half the width on a wide lot', () => {
    const r = lotWidthCheck(lot(120), [square(10, 90, 30), square(70, 60, 25)])!
    expect(r.lotFt).toBeCloseTo(120, 1)
    expect(r.allowedFt).toBeCloseTo(60, 1)
    expect(r.usedFt).toBeCloseTo(55, 1)
    expect(r.ok).toBe(true)
  })

  it('gives nothing with no buildings', () => {
    expect(lotWidthCheck(lot(60), [])).toBeNull()
  })
  it('measures from the first to the last crossing, as the old planner did', () => {
    // a U-shaped lot: a line across both arms crosses four times and spans the whole lot
    const u: Parcel = { ring: [[0, 0], [30, 0], [30, 20], [20, 20], [20, 5], [10, 5], [10, 20], [0, 20]], lotSqFt: 0, shorelineEdges: { first: 0, last: 0 } }
    expect(chordM(u, [5, 10], [1, 0])).toBeCloseTo(30, 6)
  })

  it('gives nothing when the seaward point is past the lot line', () => {
    const p = lot(60)
    const outside: SitePoint[] = [[-1000, -1000], [-999, -1000], [-999, -999]]
    expect(lotWidthCheck(p, [outside])).toBeNull()
  })
})
