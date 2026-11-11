import { describe, expect, test } from 'vitest'
import { loadIslandale } from '../islandale'
import { FT_PER_M, ftToM } from '../units'
import { DEFAULT_LAYERS, DEFAULT_SETBACKS, type Plan, type PlanObject } from '../../store/types'
import { clearances } from './clearances'
import { codeCheck, type CodeRow } from './codeCheck'

/**
 * The review's probe cases for the site rules (R2.1–R2.4): what the code
 * check and the clearances must catch that they used to miss.
 */

const site = loadIslandale()

const obj = (id: string, type: string, x: number, n: number, params: Record<string, unknown>, rotation = 0): PlanObject => ({
  id, type, name: id, position: { x, n }, rotation, params, locked: false, hidden: false, labelVisible: true,
})
const cabin = (id: string, x: number, n: number, params: Record<string, unknown> = { w: 20, d: 16, h: 9 }, rotation = 0) => obj(id, 'house', x, n, params, rotation)

const rowsOf = (...objects: PlanObject[]) =>
  codeCheck({ objects, terrain: site.terrain, parcel: site.parcel, setbacks: DEFAULT_SETBACKS, schemeId: null }).rows
const row = (rows: readonly CodeRow[], id: string): CodeRow => {
  const r = rows.find((x) => x.id === id)
  if (!r) throw new Error(`no row ${id}`)
  return r
}
const planOf = (...objects: PlanObject[]): Plan => ({
  name: 'probe', siteId: 'islandale', schemeId: null,
  objects: Object.fromEntries(objects.map((o) => [o.id, o])), order: objects.map((o) => o.id),
})

/** A box laid along the north side lot line (ring edge 0), `gapFt` in from it, its long side parallel to the line. */
function alongSideLine(id: string, type: string, gapFt: number, params: Record<string, unknown> = { w: 20, d: 16, h: 9 }): PlanObject {
  const [a, b] = [site.parcel.ring[0], site.parcel.ring[1]]
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  // local +z (the box's front) points (u.n, -u.x): into the lot on this edge
  const inward = [u[1], -u[0]]
  const half = ftToM((params.d as number) / 2 + gapFt)
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const rotation = (Math.atan2(u[1], u[0]) * 180) / Math.PI
  return obj(id, type, mid[0] + inward[0] * half, mid[1] + inward[1] * half, params, rotation)
}

describe('R2.3 setbacks are measured from the walls, not only the corners', () => {
  // every corner is 35.24 ft past the bank, but the wall between two of them is 32.0 ft
  const probe = cabin('Probe', -17, -3, { w: 40, d: 20, h: 9 }, 165)

  test('a 40 × 20 ft cabin whose wall is 3 ft inside the 35 ft buffer fails the shoreline row', () => {
    const shore = row(rowsOf(probe), 'shore')
    expect(shore.verdict).toBe('fail')
    expect(shore.names.map((n) => n.id)).toEqual(['Probe'])
  })

  test('its shore clearance is the wall’s 32 ft past the bank, inside the buffer', () => {
    const c = clearances(probe, planOf(probe), site, DEFAULT_SETBACKS, DEFAULT_LAYERS)
    expect(c.shore!.past * FT_PER_M).toBeCloseTo(32.0, 0)
    expect(c.shore!.insideBuffer).toBe(true)
  })
})

describe('R2.2 side setback and inside-the-lot rows', () => {
  test('a cabin 0.07 ft from a side lot line fails the side-setback row; 10.5 ft in, it passes', () => {
    const near = row(rowsOf(alongSideLine('Near', 'house', 0.07)), 'side')
    expect(near.verdict).toBe('fail')
    expect(near.names.map((n) => n.id)).toEqual(['Near'])
    expect(row(rowsOf(alongSideLine('Far', 'house', 10.5)), 'side').verdict).toBe('pass')
  })

  test('a cabin off the lot at (60, 60) m fails the inside-the-lot row and is named', () => {
    const off = cabin('Off', 60, 60)
    const lot = row(rowsOf(off), 'in-lot')
    expect(lot.verdict).toBe('fail')
    expect(lot.names.map((n) => n.id)).toEqual(['Off'])
    expect(clearances(off, planOf(off), site, DEFAULT_SETBACKS).lot!.crossesLot).toBe(true)
  })

  test('a standalone deck over 30 in up counts for the side setback', () => {
    const deck = alongSideLine('Deck', 'deck', 2, { w: 16, d: 10, lift: 4 })
    expect(row(rowsOf(deck), 'side')).toMatchObject({ verdict: 'fail', names: [{ id: 'Deck', name: 'Deck' }] })
  })
})

describe('R2.1 sheds, shops and pools count for the shoreline buffer and the height limit', () => {
  test('a 30 ft shed in the buffer fails the shoreline row and is the tallest building', () => {
    const shed = obj('Shed', 'shed', -10, -10, { w: 10, d: 12, h: 30, roof: 'gable', pitch: 6, ridge: 'z', overhang: 1 })
    const rows = rowsOf(shed)
    expect(row(rows, 'shore')).toMatchObject({ verdict: 'fail', names: [{ id: 'Shed', name: 'Shed' }] })
    expect(row(rows, 'height').text).toMatch(/^tallest \d+\.\d ft \(Shed\)$/)
  })

  test('a 40 ft shop fails the height row', () => {
    const shop = obj('Shop', 'shop', 0, 10, { w: 24, d: 24, h: 40, roof: 'gable', pitch: 4, ridge: 'x', overhang: 1 })
    expect(row(rowsOf(shop), 'height')).toMatchObject({ verdict: 'fail', names: [{ id: 'Shop', name: 'Shop' }] })
  })

  test('a library shed with only its size still gets the library’s height', () => {
    const shed = obj('Shed', 'shed', 0, 10, { w: 10, d: 12 })
    expect(row(rowsOf(shed), 'height')).toMatchObject({ verdict: 'pass', names: [{ id: 'Shed', name: 'Shed' }] })
  })

  test('a pool in the buffer fails the shoreline row', () => {
    const pool = obj('Pool', 'pool', -10, -12, { w: 12, d: 20 })
    expect(row(rowsOf(pool), 'shore')).toMatchObject({ verdict: 'fail', names: [{ id: 'Pool', name: 'Pool' }] })
  })
})

describe('R2.4 the tree-zone row', () => {
  test('a cabin in the no-removal zone fails it', () => {
    const tz = row(rowsOf(cabin('Low', -10, -19, { w: 16, d: 12, h: 9 })), 'tree-zone')
    expect(tz.verdict).toBe('fail')
    expect(tz.names.map((n) => n.id)).toEqual(['Low'])
  })

  test('a cabin well back from the water leaves it passing', () => {
    expect(row(rowsOf(cabin('Back', 0, 10)), 'tree-zone').verdict).toBe('pass')
  })
})
