import { describe, expect, test } from 'vitest'
import schemes from '../../../data/islandale/schemes.json'
import { loadIslandaleTerrain } from '../../site/islandale'
import { surfaceElevationAt } from '../../site/terrain'
import { boardwalkPath } from './boardwalk'
import { bridgeDims, bridgeLayout, bridgeStyle, buildBridge, mainCable, mastHeight, trussNodes } from './bridges'

const FT = 0.3048
const SPAN_M = 30
const DECK_E = 5
const level = boardwalkPath([[0, 0, DECK_E], [SPAN_M, 0, DECK_E]])!
const low = () => 0
const step = level.length / (level.samples.length - 1)

describe('bridge style', () => {
  test('a bridge without a style is a truss, as in the old planner', () => {
    expect(bridgeStyle(undefined)).toBe('truss')
    expect(bridgeStyle('cable')).toBe('cable')
    expect(bridgeStyle('rope')).toBe('truss')
  })
})

describe('spans (legacy bridgeLayout)', () => {
  test('a ribbon stands on a column about every 7 m, a truss every 12 m, a cable bridge only at its ends', () => {
    const ribbon = bridgeLayout(level, 2, 'ribbon', low)
    const truss = bridgeLayout(level, 2, 'truss', low)
    const cable = bridgeLayout(level, 2, 'cable', low)
    expect(ribbon.columns).toHaveLength(Math.ceil(SPAN_M / 7) + 1)
    expect(truss.columns).toHaveLength(Math.ceil(SPAN_M / 12) + 1)
    expect(cable.columns).toEqual([0, level.samples.length - 1])
    for (const cols of [ribbon.columns, truss.columns]) for (let k = 1; k < cols.length; k++) expect((cols[k] - cols[k - 1]) * step).toBeLessThanOrEqual(12)
  })
  test('deck depth by style; no columns where the deck is near the ground or over a building', () => {
    expect(bridgeLayout(level, 2, 'truss', low).depth).toBeCloseTo(0.32)
    expect(bridgeLayout(level, 2, 'cable', low).depth).toBeCloseTo(0.26)
    expect(bridgeLayout(level, 2, 'ribbon', () => DECK_E - 0.5).columns).toEqual([])
    expect(bridgeLayout(level, 2, 'truss', low, () => true).columns).toEqual([])
  })
  test('only a cable bridge has a mast, at mid-span', () => {
    expect(bridgeLayout(level, 2, 'cable', low).mast).toBe((level.samples.length - 1) / 2)
    expect(bridgeLayout(level, 2, 'truss', low).mast).toBeNull()
  })
  test('length and height in whole feet (legacy bridgeDims)', () => {
    expect(bridgeDims(level)).toEqual({ lengthFt: Math.round(SPAN_M / FT), heightFt: 4 })
    const ramp = boardwalkPath([[0, 0, 0], [20, 0, 1]])!
    expect(bridgeDims(ramp).heightFt).toBe(Math.round(1 / FT + 4))
  })
})

describe('truss', () => {
  test('panels about 2.4 m long from end to end', () => {
    const nodes = trussNodes(level)
    expect(nodes[0]).toBe(0)
    expect(nodes[nodes.length - 1]).toBe(level.samples.length - 1)
    expect(nodes.length - 1).toBe(Math.round(SPAN_M / 2.4) - 1)
    for (let k = 1; k + 1 < nodes.length; k++) expect((nodes[k] - nodes[k - 1]) * step).toBeCloseTo(2.5)
  })
  test('two side frames 1.7 m high, legs where it stands, no glass', () => {
    const m = buildBridge(bridgeLayout(level, 2, 'truss', low), low)
    const ys = m.frame.positions.filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys)).toBeGreaterThan(DECK_E + 1.7)
    expect(m.glass.positions).toHaveLength(0)
    expect(m.posts.positions.length).toBeGreaterThan(0)
    expect(m.cable.positions).toHaveLength(0)
  })
})

describe('cable', () => {
  const layout = bridgeLayout(level, 2, 'cable', low)
  const H = mastHeight(level)
  test('the mast is a quarter of the span high, at least 5 m', () => {
    expect(H).toBeCloseTo(Math.max(5, SPAN_M * 0.26))
  })
  test('each main cable sags below its chord by 16% of its rise at mid-run', () => {
    for (const side of [1, -1] as const) {
      for (const end of ['A', 'B'] as const) {
        const c = mainCable(layout, side, end)
        const y0 = c[0][1]
        const y1 = c[c.length - 1][1]
        expect(y0).toBeCloseTo(DECK_E + 1.2)
        expect(y1).toBeCloseTo(DECK_E + H - 0.25)
        const mid = c[(c.length - 1) / 2][1]
        expect((y0 + y1) / 2 - mid).toBeCloseTo(0.16 * (y1 - y0), 5)
      }
    }
  })
  test('the cables draw in from the deck edges to 0.2 m either side of the mast', () => {
    const c = mainCable(layout, 1, 'A')
    expect(Math.abs(c[0][2])).toBeCloseTo(1)
    expect(Math.abs(c[c.length - 1][2])).toBeCloseTo(0.2)
  })
  test('end piers, a mast, dark cables and hangers', () => {
    const m = buildBridge(layout, low)
    expect(m.piers.positions.length).toBeGreaterThan(0)
    expect(m.cable.positions.length).toBeGreaterThan(0)
    expect(m.rail.positions.length).toBeGreaterThan(0)
    expect(m.frame.positions).toHaveLength(0)
  })
})

describe('ribbon', () => {
  test('glass both sides on Y columns', () => {
    const m = buildBridge(bridgeLayout(level, 2, 'ribbon', low), low)
    expect(m.glass.positions.length).toBeGreaterThan(0)
    expect(m.posts.positions.length).toBeGreaterThan(0)
    expect(m.frame.positions).toHaveLength(0)
  })
})

describe('Scheme F (Sky Datum): three bridges, one of each style', () => {
  type Obj = { name: string; t: string; style?: string; d: number; w: number; pts?: number[][] }
  const all = (schemes as unknown as { schemes: { id: string; objects: Obj[] }[] }).schemes
  const bridges = all.find((s) => s.id === 'F')!.objects.filter((o) => o.t === 'bridge')
  const t = loadIslandaleTerrain()
  const ground = (x: number, n: number) => surfaceElevationAt(t, x, n)
  test('cable, truss and ribbon', () => {
    expect(bridges.map((b) => bridgeStyle(b.style))).toEqual(['cable', 'truss', 'ribbon'])
  })
  test.each(bridges.map((b) => [b.name, b] as const))('%s spans at least its stored plan length and builds', (_, b) => {
    const path = boardwalkPath(b.pts!.map(([x, n, e]) => [x, n, e * FT] as const))!
    // the stored d is the plan length through the points; the curve also climbs, so it is never shorter
    const level = b.pts!.every((p) => p[2] === b.pts![0][2])
    if (level) expect(Math.abs(bridgeDims(path).lengthFt - b.d)).toBeLessThan(b.d * 0.03)
    else expect(bridgeDims(path).lengthFt).toBeGreaterThan(b.d)
    const m = buildBridge(bridgeLayout(path, b.w * FT, bridgeStyle(b.style), ground), ground)
    expect(m.deck.positions.length).toBeGreaterThan(0)
    expect(m.posts.positions.length + m.piers.positions.length).toBeGreaterThan(0)
  })
})
