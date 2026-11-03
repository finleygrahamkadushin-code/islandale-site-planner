import { describe, expect, test } from 'vitest'
import schemes from '../../data/islandale/schemes.json'
import * as G from './geom'
import { interior3d, segmentPieces, stairPieces, STOREY_FT, wallHeight } from './interior3d'

type Obj = { name: string } & Record<string, unknown>
const prow = (schemes as unknown as { schemes: { id: string; objects: Obj[] }[] }).schemes.find((s) => s.id === 'C')!.objects.find((o) => o.name === 'Gathering prow')!

describe('interior in 3D', () => {
  test('a partition with a door keeps a header over it; a window keeps a header and a sill', () => {
    const pieces = segmentPieces({ L: 12, gaps: [{ s0: 2, s1: 5, kind: 'door' }, { s0: 7, s1: 10, kind: 'window' }] }, 8)
    expect(pieces).toEqual([
      { s0: 0, s1: 2, y0: 0, y1: 8 },
      { s0: 2, s1: 5, y0: 6.75, y1: 8 },
      { s0: 5, s1: 7, y0: 0, y1: 8 },
      { s0: 7, s1: 10, y0: 7, y1: 8 },
      { s0: 7, s1: 10, y0: 0, y1: 3 },
      { s0: 10, s1: 12, y0: 0, y1: 8 },
    ])
  })

  test('walls are 8\'-3" under another floor, and the top floor reaches up to half a foot under the eaves (6\'-6" to 8\')', () => {
    expect(wallHeight({ h: 18 }, 0, 2)).toBe(8.25)
    expect(wallHeight({ h: 18 }, 1, 2)).toBe(8)
    expect(wallHeight({ h: 9 }, 0, 1)).toBe(8)
    expect(wallHeight({ h: 6 }, 0, 1)).toBe(6.5)
  })

  test("C's gathering cabin gets its partitions and every piece of furniture, and no slab on one floor", () => {
    const m = interior3d(prow)
    const boxes = m.clusters.flatMap((c) => c.boxes)
    expect(boxes.filter((b) => b.part === 'wall').length).toBeGreaterThan(4)
    expect(boxes.filter((b) => b.part === 'header').length).toBeGreaterThan(0)
    expect(boxes.filter((b) => b.part === 'furniture')).toHaveLength((prow.floors as { furniture: unknown[] }[])[0].furniture.length)
    expect(m.slabs).toEqual([])
  })

  test('an upper floor gets a slab at 9 ft with a hole over the stair below', () => {
    const box = { w: 20, d: 20, h: 18 }
    const stair = { id: 1, type: 'stair', x: 0, z: 0, rot: 0, w: 3.5, d: 10, mirror: false }
    const m = interior3d({ ...box, floors: [{ name: 'Main floor', rooms: [], openings: [], furniture: [stair] }, { name: 'Upper floor', rooms: [], openings: [], furniture: [] }] })
    expect(m.slabs.every((s) => s.top === STOREY_FT)).toBe(true)
    expect(m.slabs.reduce((a, s) => a + G.area(s.pts), 0)).toBeCloseTo(400 - 35, 6)
  })

  test('a straight stair has a tread per riser and handrails both sides; a spiral has a column, 11 treads and a landing', () => {
    const straight = stairPieces({ type: 'stair', w: 3.5, d: 10 })
    expect(straight.boxes.filter((b) => b.part === 'stair')).toHaveLength(14 - 1 + 2)
    expect(straight.boxes.filter((b) => b.part === 'rail')).toHaveLength(2)
    const spiral = stairPieces({ type: 'spiral', w: 5, d: 5 })
    expect(spiral.cylinders).toHaveLength(1)
    expect(spiral.wedges).toHaveLength(12)
    expect(spiral.bars.length).toBeGreaterThan(10)
  })
})
