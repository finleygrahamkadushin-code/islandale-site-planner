import { describe, expect, test } from 'vitest'
import { addPolygon, emptyMesh, type V3 } from './geom'

const tris = (pts: V3[], outward?: V3) => {
  const m = emptyMesh()
  addPolygon(m, pts, outward)
  return m.positions.length / 9
}

describe('addPolygon', () => {
  test('a quad is two triangles', () => {
    expect(tris([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]])).toBe(2)
  })

  test('a gable quad with one end at no height is kept as a triangle, not lost', () => {
    // the shape prowRoof makes for the half of a gable that starts at the eave: [q0, p0, p0, q-top]
    const q0: V3 = [0, 0, -4.72]
    const p0: V3 = [-5.03, 0, -4.72]
    const qTop: V3 = [0, 2.93, -4.72]
    expect(tris([q0, p0, p0, qTop], [0, 0, -1])).toBe(1)
  })

  test('a polygon with fewer than three distinct corners draws nothing', () => {
    expect(tris([[0, 0, 0], [0, 0, 0], [1, 0, 0]])).toBe(0)
  })
})
