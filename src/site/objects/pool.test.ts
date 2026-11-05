import { describe, expect, test } from 'vitest'
import { localFootprint, signedArea, type LocalPoint } from '../../buildings/footprint'
import { pointInPolygon } from '../../buildings/foundation/foundation'
import { bounds, triangleCount } from '../../buildings/geom'
import { POOL_COPING_FT, poolInfinityEdges, poolLayout, poolLevel, poolMeshes, poolShellDepth, prism } from './pool'

const area = (P: readonly LocalPoint[]) => Math.abs(signedArea(P))

/** Distance from a point to the nearest edge of an outline. */
function distToOutline(P: readonly LocalPoint[], [x, z]: LocalPoint): number {
  let best = Infinity
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)))
    best = Math.min(best, Math.hypot(a[0] + t * dx - x, a[1] + t * dz - z))
  })
  return best
}

describe('pool layout (legacy poolPlanPoly)', () => {
  test('a rectangle’s water is inset by the coping on every side', () => {
    const P = localFootprint({ w: 42, d: 9, shape: 'rect' })
    const L = poolLayout(P, {})
    expect(area(L.water)).toBeCloseTo((42 - 2 * POOL_COPING_FT) * (9 - 2 * POOL_COPING_FT), 6)
    const L2 = poolLayout(P, { coping: 2 })
    expect(area(L2.water)).toBeCloseTo(38 * 5, 6)
  })

  test('a kidney’s water lies inside the coping, a coping width in from its edge', () => {
    const P = localFootprint({ w: 22, d: 11, shape: 'kidney', bend: 0.45 })
    const L = poolLayout(P, {})
    expect(L.outer).toBe(P)
    for (const q of L.water) {
      expect(pointInPolygon(P, q[0], q[1])).toBe(true)
      expect(distToOutline(P, q)).toBeGreaterThan(POOL_COPING_FT * 0.9)
      expect(distToOutline(P, q)).toBeLessThan(POOL_COPING_FT * 1.6)
    }
  })
})

describe('infinity edges (legacy poolInfEdges)', () => {
  const rect = localFootprint({ w: 20, d: 10, shape: 'rect' })

  test('the edges that face the front spill over', () => {
    // rect: back, right, front, left; only the front one faces +z
    expect(poolInfinityEdges(rect, undefined)).toEqual([2])
  })

  test('Scheme D’s kidney tide pool spills over edges 11 to 25, as in the old planner', () => {
    const P = localFootprint({ w: 22, d: 11, shape: 'kidney', bend: 0.45 })
    expect(P).toHaveLength(37)
    expect(poolInfinityEdges(P, undefined)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25])
  })

  test('none when turned off, just the listed ones when listed', () => {
    expect(poolInfinityEdges(rect, false)).toEqual([])
    expect(poolInfinityEdges(rect, [0, 3])).toEqual([0, 3])
  })

  test('on a curve, the front run of short edges, each facing the front', () => {
    const P = localFootprint({ w: 44, d: 30, shape: 'ellipse' })
    const edges = poolInfinityEdges(P, undefined)
    expect(edges.length).toBeGreaterThan(5)
    expect(edges.length).toBeLessThan(P.length / 2)
    for (const i of edges) {
      const a = P[i]
      const b = P[(i + 1) % P.length]
      expect((a[1] + b[1]) / 2).toBeGreaterThan(0)
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      expect(Math.abs((b[0] - a[0]) / L)).toBeGreaterThan(0.45)
    }
  })
})

describe('pool level and depth (legacy poolLevel, poolMesh)', () => {
  test('a fixed elev (feet) sets the level; else just above the highest ground round it', () => {
    expect(poolLevel({ elev: 5 }, [1, 2])).toBeCloseTo(1.524, 9)
    expect(poolLevel({}, [1, 2.5, 2])).toBeCloseTo(2.55, 9)
  })

  test('the shell runs past the lowest ground, and at least 1.6 m', () => {
    expect(poolShellDepth(2.55, [1, 2.5])).toBeCloseTo(1.95, 9)
    expect(poolShellDepth(2.55, [2.5])).toBe(1.6)
  })
})

describe('pool meshes (legacy poolMesh)', () => {
  const P = localFootprint({ w: 20, d: 10, shape: 'rect' })
  const L = poolLayout(P, {})
  const m = poolMeshes(L, 2)

  test('coping on top, water 4 cm under it, floor and lining 1.4 m down, the shell to its depth', () => {
    expect(bounds(m.coping).max[1]).toBeCloseTo(0.14, 9)
    expect(bounds(m.water).max[1]).toBeCloseTo(-0.04, 9)
    expect(bounds(m.floor).min[1]).toBeCloseTo(-1.4, 9)
    expect(bounds(m.lining).min[1]).toBeCloseTo(-1.4, 9)
    expect(bounds(m.shell).min[1]).toBeCloseTo(-1.98, 9)
  })

  test('the water fills the inset, the coping spans the outline', () => {
    const FT = 0.3048
    expect(bounds(m.water).max[0]).toBeCloseTo((10 - POOL_COPING_FT) * FT, 6)
    expect(bounds(m.coping).max[0]).toBeCloseTo(10 * FT, 6)
    expect(bounds(m.coping).max[2]).toBeCloseTo(5 * FT, 6)
  })

  test('one sheet of spilling water per infinity edge, hanging outside it', () => {
    expect(triangleCount(m.spill)).toBe(2)
    expect(bounds(m.spill).min[2]).toBeGreaterThan(5 * 0.3048)
    expect(triangleCount(poolMeshes(poolLayout(P, { infinity: false }), 2).spill)).toBe(0)
  })

  test('a holed prism faces its top up, its outer sides out and its hole’s sides in', () => {
    const outer: LocalPoint[] = [[-2, -2], [2, -2], [2, 2], [-2, 2]]
    const hole: LocalPoint[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    const r = prism(outer, hole, 0, 1)
    // ring area 12 m² top and bottom: count the up faces' area
    let up = 0
    for (let i = 0; i < r.positions.length; i += 9) {
      const n = r.normals[i + 1]
      if (n > 0.99) {
        const [ax, az, bx, bz, cx, cz] = [r.positions[i], r.positions[i + 2], r.positions[i + 3], r.positions[i + 5], r.positions[i + 6], r.positions[i + 8]]
        up += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2
      }
      // side faces: on the outer square they point away from the centre, on the hole toward it
      const nx = r.normals[i]
      const x = (r.positions[i] + r.positions[i + 3] + r.positions[i + 6]) / 3
      if (Math.abs(nx) > 0.99) expect(Math.sign(nx)).toBe(Math.abs(x) > 1.5 ? Math.sign(x) : -Math.sign(x))
    }
    expect(up).toBeCloseTo(12, 9)
  })
})
