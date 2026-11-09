import { describe, expect, it } from 'vitest'
import { loadIslandale } from '../islandale'
import { shoreBufferLine, topOfBankLine } from '../buffer'
import { ftToM } from '../units'
import { nearestShore, pointInLot } from './setbacks'

const { parcel } = loadIslandale()

describe('shoreline buffer line', () => {
  it('sits shoreFt past the top of bank, inside the lot', () => {
    const segs = shoreBufferLine(parcel, 35, 45)
    expect(segs.length).toBeGreaterThan(20)
    for (const [x, n] of segs.filter((_, i) => i % 7 === 0)) {
      expect(pointInLot(parcel, x, n)).toBe(true)
      const sh = nearestShore(parcel, x, n, 45)!
      expect(Math.abs(sh.past - ftToM(35))).toBeLessThan(0.5)
      expect(sh.d).toBeCloseTo(sh.banked ? ftToM(80) : ftToM(35), 0)
    }
  })

  it('moves inland as the setback or the bank grows', () => {
    const mean = (shoreFt: number, bankFt: number) => {
      const segs = shoreBufferLine(parcel, shoreFt, bankFt)
      return segs.reduce((s, [x, n]) => s + nearestShore(parcel, x, n, 0)!.d, 0) / segs.length
    }
    expect(mean(50, 45)).toBeGreaterThan(mean(35, 45))
    expect(mean(35, 60)).toBeGreaterThan(mean(35, 45))
  })
})

describe('top of bank line', () => {
  it('sits bankFt in from the banked east shore, inside the lot', () => {
    const segs = topOfBankLine(parcel, 45)
    expect(segs.length).toBeGreaterThan(20)
    for (const [x, n] of segs) {
      expect(pointInLot(parcel, x, n)).toBe(true)
      const sh = nearestShore(parcel, x, n, 0)!
      expect(sh.banked).toBe(true)
      expect(Math.abs(sh.d - ftToM(45))).toBeLessThan(0.05)
    }
  })

  it('follows the bank setting', () => {
    const mean = (bankFt: number) => {
      const segs = topOfBankLine(parcel, bankFt)
      return segs.reduce((s, [x, n]) => s + nearestShore(parcel, x, n, 0)!.d, 0) / segs.length
    }
    expect(mean(60)).toBeGreaterThan(mean(30))
  })
})
