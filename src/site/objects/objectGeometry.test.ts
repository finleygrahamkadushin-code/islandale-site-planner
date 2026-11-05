import { describe, expect, test } from 'vitest'
import { buildPrismGeometry } from './objectGeometry'

describe('prism geometry', () => {
  test('spans the footprint in x/z and the height in y, front toward +z', () => {
    const g = buildPrismGeometry({ w: 20, d: 10, shape: 'trap', taper: 0.5 }, 3)
    g.computeBoundingBox()
    const b = g.boundingBox!
    expect(b.min.y).toBeCloseTo(0, 6)
    expect(b.max.y).toBeCloseTo(3, 6)
    expect(b.max.x).toBeCloseTo(20 * 0.3048 / 2, 6)
    expect(b.max.z).toBeCloseTo(10 * 0.3048 / 2, 6)
    // the wide edge of a trapezoid is its front (+z)
    const pos = g.getAttribute('position')
    let frontMaxX = 0
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > 1) frontMaxX = Math.max(frontMaxX, pos.getX(i))
    expect(frontMaxX).toBeCloseTo(20 * 0.3048 / 2, 6)
  })
})
