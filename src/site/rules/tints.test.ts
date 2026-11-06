import { describe, expect, it } from 'vitest'
import { loadIslandale } from '../islandale'
import { ftToM } from '../units'
import { DEFAULT_SETBACKS } from '../../store/types'
import { setbackBand, treeZone } from './setbacks'
import {
  lin, LOT_GREEN, OUTSIDE_LOT, OUTSIDE_STEEP, pointFacts, ruleColour, SHORE_BAND, SIDE_BAND, TINT_LEGEND, TREE_ZONE_1, TREE_ZONE_2, type PointFacts, type Rgb,
} from './tints'

const on = { setbacks: DEFAULT_SETBACKS, rules: true }
const noTrees = { setbacks: { ...DEFAULT_SETBACKS, treeZones: false }, rules: true }
const facts = (p: Partial<PointFacts>): PointFacts => ({ inLot: true, dBank: 1000, dShore: 1000, dLine: 1000, ...p })
const mixed = (a: string, b: string, t: number): Rgb => lin(a).map((v, i) => v + (lin(b)[i] - v) * t) as unknown as Rgb
const close = (a: Rgb, b: Rgb) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))

describe('site-rule ground tints', () => {
  it('is lot green inside the lot, clear of every band', () => {
    close(ruleColour(facts({}), 0, on), lin(LOT_GREEN))
  })

  it('darkens outside the lot toward the steep colour by slope', () => {
    close(ruleColour(facts({ inLot: false }), 0, on), lin(OUTSIDE_LOT))
    close(ruleColour(facts({ inLot: false }), 0.9, on), lin(OUTSIDE_STEEP))
    close(ruleColour(facts({ inLot: false }), 0.25, on), mixed(OUTSIDE_LOT, OUTSIDE_STEEP, 0.3))
  })

  it('measures the buffer from the top of bank on the east shore and from the water on the south-west', () => {
    // 60 ft from the east water is 15 ft past a 45 ft bank: inside a 35 ft buffer
    close(ruleColour(facts({ dBank: ftToM(60) }), 0, noTrees), mixed(LOT_GREEN, SHORE_BAND, 0.5))
    close(ruleColour(facts({ dBank: ftToM(85) }), 0, noTrees), lin(LOT_GREEN))
    close(ruleColour(facts({ dShore: ftToM(30) }), 0, noTrees), mixed(LOT_GREEN, SHORE_BAND, 0.5))
    close(ruleColour(facts({ dShore: ftToM(40) }), 0, noTrees), lin(LOT_GREEN))
  })

  it('tints the side setback, with the shore band winning where they overlap', () => {
    close(ruleColour(facts({ dLine: ftToM(5) }), 0, noTrees), mixed(LOT_GREEN, SIDE_BAND, 0.5))
    close(ruleColour(facts({ dLine: ftToM(5), dShore: ftToM(5) }), 0, noTrees), mixed(LOT_GREEN, SHORE_BAND, 0.5))
  })

  it('adds the tree zones from the water, with no bank offset', () => {
    const band = mixed(LOT_GREEN, SHORE_BAND, 0.5)
    close(ruleColour(facts({ dBank: ftToM(20) }), 0, on), band.map((v, i) => v + (lin(TREE_ZONE_1)[i] - v) * 0.45) as unknown as Rgb)
    close(ruleColour(facts({ dShore: ftToM(100) }), 0, on), mixed(LOT_GREEN, TREE_ZONE_2, 0.22))
    close(ruleColour(facts({ dShore: ftToM(120) }), 0, on), lin(LOT_GREEN))
  })

  it('shows only the lot when the Setbacks layer is off', () => {
    close(ruleColour(facts({ dShore: ftToM(5), dLine: ftToM(2) }), 0, { ...on, rules: false }), lin(LOT_GREEN))
  })

  it('agrees with setbackBand and treeZone on the real lot', () => {
    const { parcel } = loadIslandale()
    const xs = parcel.ring.map((p) => p[0])
    const ns = parcel.ring.map((p) => p[1])
    const [x0, x1, n0, n1] = [Math.min(...xs), Math.max(...xs), Math.min(...ns), Math.max(...ns)]
    for (let k = 0; k < 400; k++) {
      const x = x0 + ((k * 37) % 400) / 400 * (x1 - x0)
      const n = n0 + ((k * 91) % 400) / 400 * (n1 - n0)
      const f = pointFacts(parcel, x, n)
      const band = setbackBand(parcel, DEFAULT_SETBACKS, x, n)
      const expected = band === 'outside' ? null : band === 'shore' ? mixed(LOT_GREEN, SHORE_BAND, 0.5) : band === 'side' ? mixed(LOT_GREEN, SIDE_BAND, 0.5) : lin(LOT_GREEN)
      if (!expected) {
        expect(f.inLot).toBe(false)
        continue
      }
      close(ruleColour(f, 0, noTrees), expected)
      const water = Math.min(f.dBank, f.dShore)
      expect(water < ftToM(35) ? 1 : water < ftToM(110) ? 2 : 0).toBe(treeZone(parcel, x, n))
    }
  })

  it('has a legend row per tint colour', () => {
    expect(TINT_LEGEND.map((r) => r.colour)).toEqual([LOT_GREEN, OUTSIDE_LOT, SHORE_BAND, SIDE_BAND, TREE_ZONE_1, TREE_ZONE_2])
  })
})
