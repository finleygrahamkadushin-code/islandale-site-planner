import { describe, expect, test } from 'vitest'
import { localFootprint } from './footprint'
import { buildWalls } from './walls/walls'
import { buildRoof, ROOF_TYPES } from './roofs/roof'
import { bounds, triangleCount } from './geom'
import { layoutOpenings } from './openings/openingLayout'
import { postPositions, supportType } from './foundation/foundation'

const FT = 0.3048
const rect = localFootprint({ w: 20, d: 16 })

describe('walls', () => {
  test('span the footprint and the wall height, with UVs in feet', () => {
    const m = buildWalls(rect, 10)
    const b = bounds(m)
    expect(b.max[1]).toBeCloseTo(10 * FT, 6)
    expect(b.max[0]).toBeCloseTo(10 * FT, 6)
    const us = m.uvs.filter((_, i) => i % 2 === 0)
    // perimeter is 72 ft; the first wall runs 0..20 ft
    expect(Math.max(...us)).toBeCloseTo(72, 4)
    expect(Math.min(...us)).toBeCloseTo(0, 4)
  })
})

describe('roofs', () => {
  test.each(ROOF_TYPES.filter((t) => t !== 'none'))('%s covers the footprint plus overhang and has faces', (type) => {
    const r = buildRoof(rect, { type, pitch: 6, ridge: 'x', overhangFt: 2 })
    expect(triangleCount(r.roof)).toBeGreaterThan(0)
    const b = bounds(r.roof)
    const reach = Math.max(-b.min[0], b.max[0])
    expect(reach).toBeGreaterThanOrEqual(10 * FT - 1e-6)
    expect(reach).toBeLessThanOrEqual(12 * FT + 0.5)
    expect(r.rise).toBeGreaterThan(0)
  })

  test('a 6/12 gable over a 16 ft span rises 5 ft with 2 ft eaves', () => {
    const r = buildRoof(rect, { type: 'gable', pitch: 6, ridge: 'x', overhangFt: 2 })
    // S = 16 + 2*2 = 20 ft, rise = 0.5 * 20 / 2 = 5 ft
    expect(r.rise / FT).toBeCloseTo(5, 6)
    expect(bounds(r.roof).max[1] / FT).toBeCloseTo(5, 6)
    expect(triangleCount(r.gables)).toBeGreaterThan(0)
  })

  test('ridge z turns the gable ninety degrees', () => {
    const x = bounds(buildRoof(rect, { type: 'gable', pitch: 6, ridge: 'x', overhangFt: 0 }).roof)
    const z = bounds(buildRoof(rect, { type: 'gable', pitch: 6, ridge: 'z', overhangFt: 0 }).roof)
    expect(x.max[1]).toBeCloseTo(4 * FT, 6) // span 16 ft
    expect(z.max[1]).toBeCloseTo(5 * FT, 6) // span 20 ft
  })

  test('butterfly ends fill both wings of the V and nothing below the valley', () => {
    const r = buildRoof(rect, { type: 'butterfly', pitch: 6, ridge: 'x', overhangFt: 0 })
    const b = bounds(r.gables)
    expect(b.min[1]).toBeCloseTo(0, 6)
    // each end is two triangles (one per wing): 4 in all
    expect(triangleCount(r.gables)).toBe(4)
  })

  test('no roof means no geometry', () => {
    expect(triangleCount(buildRoof(rect, { type: 'none', pitch: 6, ridge: 'x', overhangFt: 2 }).roof)).toBe(0)
  })

  test('roof normals are unit length', () => {
    const r = buildRoof(localFootprint({ w: 18, d: 18, shape: 'oct' }), { type: 'pyramid', pitch: 12, ridge: 'x', overhangFt: 2 })
    for (let i = 0; i < r.roof.normals.length; i += 3) {
      expect(Math.hypot(r.roof.normals[i], r.roof.normals[i + 1], r.roof.normals[i + 2])).toBeCloseTo(1, 6)
    }
  })
})

describe('openings', () => {
  const place = (cut: object, h: number) => layoutOpenings(rect, [cut], { wallHeightFt: h }).openings
  test('x is measured from the left end seen from outside (the far vertex)', () => {
    // edge 0 of the rect runs (-10,-8) → (10,-8), facing -z; seen from outside its left end is x = +10
    const [o] = place({ edge: 0, kind: 'door', x: 2, w: 3, h: 7, sill: 0 }, 10)
    const [p] = o.pieces
    expect(p.centre[0]).toBeCloseTo(10 - 2 - 1.5, 9)
    expect(p.centre[2]).toBeCloseTo(-8, 9)
    expect(p.normal).toEqual([0, -1])
    expect(p.centre[1]).toBeCloseTo(3.5, 9)
  })

  test('the Scheme C gathering door lands on its edge', () => {
    const [o] = place({ edge: 0, kind: 'door', x: 12.25, w: 3.5, h: 7, sill: 0 }, 11)
    expect(o.pieces[0].centre[0]).toBeCloseTo(10 - 12.25 - 1.75, 9)
  })

  test('a perimeter cut is one opening drawn in pieces across the corner', () => {
    const out = place({ along: true, kind: 'window', x: 18, w: 4, h: 4, sill: 3 }, 10)
    expect(out).toHaveLength(1)
    expect(out[0].pieces.map((p) => p.edge)).toEqual([0, 1])
  })

  test('openings never poke above the wall', () => {
    const [o] = place({ edge: 1, kind: 'window', x: 1, w: 3, h: 9, sill: 3 }, 9)
    expect(o.sill + o.h).toBeLessThanOrEqual(9)
  })
})

describe('foundation', () => {
  test('posts sit inside the footprint on the spacing grid', () => {
    const pts = postPositions(rect, 8, 6)
    expect(pts.length).toBe(4 * 3)
    for (const [x, z] of pts) {
      expect(Math.abs(x)).toBeLessThan(10)
      expect(Math.abs(z)).toBeLessThan(8)
    }
  })

  test('support type follows the legacy rule', () => {
    expect(supportType('posts', 0.2)).toBe('posts')
    expect(supportType('earth', 3)).toBe('none')
    expect(supportType('auto', 2)).toBe('posts')
    expect(supportType(undefined, 0.5)).toBe('skirt')
  })
})
