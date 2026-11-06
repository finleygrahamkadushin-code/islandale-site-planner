import { describe, expect, test } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { splitByFaceEdges } from './splitWalls'

/** Three triangles, x = their index, so each piece can be told apart. */
function threeTriangles(): BufferGeometry {
  const g = new BufferGeometry()
  const pos = [0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 2, 0, 0, 2, 1, 0, 2, 0, 1]
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(18).map((_, i) => i), 2))
  return g
}

describe('splitByFaceEdges', () => {
  test('gives one geometry per wall, in edge order, with every attribute', () => {
    const parts = splitByFaceEdges(threeTriangles(), [2, 0, 2])
    expect(parts.map((p) => p.edge)).toEqual([0, 2])
    const xs = (g: BufferGeometry) => Array.from(g.getAttribute('position').array).filter((_, i) => i % 3 === 0)
    expect(xs(parts[0].geometry)).toEqual([1, 1, 1])
    expect(xs(parts[1].geometry)).toEqual([0, 0, 0, 2, 2, 2])
    expect(parts[1].geometry.getAttribute('uv').count).toBe(6)
    expect(Array.from(parts[0].geometry.getAttribute('uv').array)).toEqual([6, 7, 8, 9, 10, 11])
  })

  test('leaves the source as it was', () => {
    const g = threeTriangles()
    splitByFaceEdges(g, [0, 1, 2])
    expect(g.getAttribute('position').count).toBe(9)
  })

  test('refuses a face-edge list that does not match the triangles', () => {
    expect(() => splitByFaceEdges(threeTriangles(), [0, 1])).toThrow(/3 triangles but 2/)
  })
})
