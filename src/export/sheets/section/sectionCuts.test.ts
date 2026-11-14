import { describe, expect, it } from 'vitest'
import { cutMarkPadFt, cutReachIn, padExtent } from './sectionCuts'
import { lookOf } from './sectionGeom'

describe('the cut marks on a plan', () => {
  const box = { minx: -10, maxx: 20, minz: -5, maxz: 5 }

  it('run the cut line across the plan and its dimensions, edge to edge', () => {
    expect(cutReachIn({ origin: [0, 2], dir: [1, 0], look: lookOf([1, 0]) }, box)).toEqual([-10, 20])
    const slant = cutReachIn({ origin: [0, 0], dir: [Math.SQRT1_2, Math.SQRT1_2], look: lookOf([Math.SQRT1_2, Math.SQRT1_2]) }, box)
    expect(slant?.[0]).toBeCloseTo(-5 * Math.SQRT2, 9)
    expect(slant?.[1]).toBeCloseTo(5 * Math.SQRT2, 9)
  })

  it('miss a box the line passes by', () => {
    expect(cutReachIn({ origin: [0, 9], dir: [1, 0], look: lookOf([1, 0]) }, box)).toBeNull()
  })

  it('give the page a bubble’s room on every side, the same paper size at any scale', () => {
    expect(cutMarkPadFt(0.25) * 0.25).toBeCloseTo(cutMarkPadFt(0.0625) * 0.0625, 12)
    expect(padExtent({ x: 0, y: 0, w: 10, h: 4 }, 2)).toEqual({ x: -2, y: -2, w: 14, h: 8 })
  })
})
