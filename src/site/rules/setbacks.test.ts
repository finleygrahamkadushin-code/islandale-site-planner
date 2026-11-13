import { describe, expect, it } from 'vitest'
import { loadIslandale } from '../islandale'
import { ftToM } from '../units'
import { clampSetbacks } from '../../store/planStore'
import { DEFAULT_SETBACKS } from '../../store/types'
import { EAST_BANK_LAST_EDGE, isBankedEdge, nearestLotLine, nearestShore, pointInLot, setbackBand, treeZone } from './setbacks'

const { parcel } = loadIslandale()
const ring = parcel.ring

/** A point `ft` inland from the middle of ring edge i (the ring winds so inland is found by testing both sides). */
function inland(i: number, ft: number): [number, number] {
  const a = ring[i]
  const b = ring[(i + 1) % ring.length]
  const mx = (a[0] + b[0]) / 2
  const mn = (a[1] + b[1]) / 2
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const nx = -(b[1] - a[1]) / len
  const nn = (b[0] - a[0]) / len
  const s = pointInLot(parcel, mx + nx * 0.5, mn + nn * 0.5) ? 1 : -1
  return [mx + s * nx * ftToM(ft), mn + s * nn * ftToM(ft)]
}

describe('setbacks', () => {
  it('names the east bank edges inside the shoreline run', () => {
    expect(parcel.shorelineEdges).toEqual({ first: 4, last: 122 })
    expect(ring.length).toBe(131)
    expect(isBankedEdge(parcel, 4)).toBe(true)
    expect(isBankedEdge(parcel, EAST_BANK_LAST_EDGE)).toBe(true)
    expect(isBankedEdge(parcel, 121)).toBe(false)
    expect(isBankedEdge(parcel, 3)).toBe(false)
  })

  it('takes the bank off on the east shore only', () => {
    const [x, n] = inland(60, 20)
    const east = nearestShore(parcel, x, n, 45)!
    expect(east.banked).toBe(true)
    expect(east.past).toBeCloseTo(east.d - ftToM(45), 6)
    const [x2, n2] = inland(122, 10)
    const sw = nearestShore(parcel, x2, n2, 45)!
    expect(sw.banked).toBe(false)
    expect(sw.past).toBeCloseTo(sw.d, 6)
  })

  it('puts ground in the right band', () => {
    expect(setbackBand(parcel, DEFAULT_SETBACKS, 500, 500)).toBe('outside')
    const [x, n] = inland(60, 60) // 60 ft from the east water: inside 35 + 45
    expect(setbackBand(parcel, DEFAULT_SETBACKS, x, n)).toBe('shore')
    expect(setbackBand(parcel, { ...DEFAULT_SETBACKS, bankFt: 0 }, x, n)).not.toBe('shore')
    const [sx, sn] = inland(0, 5) // 5 ft inside the north-west lot line
    expect(nearestLotLine(parcel, sx, sn)!.d).toBeCloseTo(ftToM(5), 1)
  })

  it('measures from the approximate high-water line: one buffer distance before and after (item 11)', () => {
    const lotOnly = { ...parcel, highWater: undefined }
    // 20 ft in from the lot line on the east shore (edge 60): the water's edge is about 10 ft nearer now
    // (and a point below high water is at it: 0)
    const [wx, wn] = inland(60, 2)
    expect(nearestShore(parcel, wx, wn, 45)!.d).toBe(0)
    const [x, n] = inland(60, 20)
    const before = nearestShore(lotOnly, x, n, 45)!
    const after = nearestShore(parcel, x, n, 45)!
    // 19.8 ft to the lot line before, 9.7 ft to the high-water line after; the top of bank moves in with it (25.2 ft over it, then 35.3 ft)
    expect(before.d / 0.3048).toBeCloseTo(19.78, 1)
    expect(after.d / 0.3048).toBeCloseTo(9.71, 1)
    expect(before.past / 0.3048).toBeCloseTo(-25.22, 1)
    expect(after.past / 0.3048).toBeCloseTo(-35.29, 1)
    // 10 ft in on the south-west beach (edge 122), where the lot line stands above 8 ft: unchanged
    const [sx, sn] = inland(122, 10)
    expect(nearestShore(parcel, sx, sn, 45)!.d).toBeCloseTo(nearestShore(lotOnly, sx, sn, 45)!.d, 6)
  })

  it('finds the tree zones from the water', () => {
    expect(treeZone(parcel, ...inland(60, 20))).toBe(1)
    expect(treeZone(parcel, ...inland(60, 60))).toBe(2)
  })

  it('clamps and snaps the settings', () => {
    expect(clampSetbacks({ ...DEFAULT_SETBACKS, shoreFt: 47, bankFt: 200, sideFt: -3 })).toMatchObject({ shoreFt: 45, bankFt: 80, sideFt: 0 })
    expect(clampSetbacks({ ...DEFAULT_SETBACKS, shoreFt: Number.NaN }).shoreFt).toBe(35)
  })
})
