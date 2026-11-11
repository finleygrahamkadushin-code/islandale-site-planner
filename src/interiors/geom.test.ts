import { describe, expect, test } from 'vitest'
import {
  area,
  convexDiff,
  disjointTiles,
  distToSeg,
  intersectRegion,
  isSimple,
  labelPoint,
  nearestEdge,
  offsetPoly,
  pointInPoly,
  rectPoly,
  sarea,
  segIntersect,
  sharedSegments,
  simplify,
  snapAngle,
  snapPoint,
  splitByLine,
  subtractRegion,
  toPieces,
  triangulate,
  unionPieces,
  type Poly,
} from './geom'

const sumArea = (L: readonly Poly[]) => L.reduce((s, p) => s + area(p), 0)
const L_SHAPE: Poly = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]

describe('floor plan geometry', () => {
  test('a non-convex room is cut into triangles that cover it exactly', () => {
    const tris = triangulate(L_SHAPE)
    expect(sumArea(tris)).toBeCloseTo(area(L_SHAPE), 9)
    expect(tris.every((t) => sarea(t) > 0)).toBe(true)
  })

  test('two rooms sharing a wall merge into one outline with no seam', () => {
    const u = unionPieces([rectPoly(0, 0, 10, 10), rectPoly(10, 0, 10, 10)])
    expect(u.outer).toHaveLength(1)
    expect(u.holes).toHaveLength(0)
    expect(area(u.outer[0])).toBeCloseTo(200, 6)
    expect(u.outer[0]).toHaveLength(4)
  })

  test('a T-junction (a short room against a long one) still merges cleanly', () => {
    const u = unionPieces([rectPoly(0, 0, 20, 10), rectPoly(0, 7.5, 6, 5)])
    expect(u.outer).toHaveLength(1)
    expect(area(u.outer[0])).toBeCloseTo(230, 6)
  })

  test('a ring of rooms leaves a hole in the middle', () => {
    const ring = [rectPoly(0, -6, 16, 4), rectPoly(0, 6, 16, 4), rectPoly(-6, 0, 4, 8), rectPoly(6, 0, 4, 8)]
    const u = unionPieces(ring)
    expect(u.outer).toHaveLength(1)
    expect(u.holes).toHaveLength(1)
    expect(area(u.holes[0])).toBeCloseTo(64, 6)
  })

  test('a convex room less another leaves only what lies outside it', () => {
    const rest = convexDiff(rectPoly(0, 0, 10, 10), rectPoly(5, 0, 10, 4))
    expect(sumArea(rest)).toBeCloseTo(100 - 5 * 4, 6)
  })

  test('a room cut to the walls keeps only what is inside them, and subtracting puts the rest back', () => {
    const room = rectPoly(8, 2, 8, 8)
    const inside = intersectRegion(room, [L_SHAPE])
    const outside = subtractRegion(toPieces(room), L_SHAPE)
    expect(sumArea(inside) + sumArea(outside)).toBeCloseTo(64, 6)
    expect(sumArea(inside)).toBeCloseTo(6 * 4, 6)
  })

  test('overlapping outlines become tiles that never overlap, earlier ones winning', () => {
    const tiles = disjointTiles([rectPoly(0, 0, 10, 10), rectPoly(5, 0, 10, 10)])
    expect(sumArea(tiles)).toBeCloseTo(150, 6)
  })

  test('a split line cuts a room into two that add up to it', () => {
    const { left, right } = splitByLine(rectPoly(0, 0, 12, 8), [-2, -10], [-2, 10])
    expect(left).toHaveLength(1)
    expect(right).toHaveLength(1)
    expect(area(left[0]) + area(right[0])).toBeCloseTo(96, 6)
    expect(Math.min(area(left[0]), area(right[0]))).toBeCloseTo(4 * 8, 6)
  })

  test('two rooms back to back share the wall between them, and only that wall', () => {
    const shared = sharedSegments(rectPoly(0, 0, 10, 10), rectPoly(10, 2, 10, 6))
    expect(shared).toHaveLength(1)
    expect(shared[0].len).toBeCloseTo(6, 6)
  })

  test('a room shrunk by the wall thickness loses that much on every side, or folds to null', () => {
    const inner = offsetPoly(rectPoly(0, 0, 10, 8), 0.5)!
    expect(area(inner)).toBeCloseTo(9 * 7, 6)
    expect(offsetPoly(rectPoly(0, 0, 2, 2), 1.5)).toBeNull()
  })

  test("a label sits in the room's deepest part when its centroid falls outside", () => {
    const c = labelPoint([[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10]])!
    expect(c[0] < 1 || c[1] < 1).toBe(true)
  })

  test('snapping prefers a corner, then a wall crossing, then the wall, then the grid', () => {
    const ctx = { verts: [[0, 0]] as [number, number][], edges: [[[0, 0], [10, 0]], [[5, -5], [5, 5]]] as [[number, number], [number, number]][], grid: 0.5 }
    expect(snapPoint([0.1, 0.1], ctx, 0.3).kind).toBe('vertex')
    expect(snapPoint([5.1, 0.1], ctx, 0.3)).toEqual({ p: [5, 0], kind: 'intersection' })
    expect(snapPoint([7.2, 0.2], ctx, 0.3)).toMatchObject({ p: [7, 0], kind: 'edge' })
    expect(snapPoint([7.2, 3.3], ctx, 0.3)).toEqual({ p: [7, 3.5], kind: 'grid' })
  })

  test('an angle snaps to 15 degree steps by default', () => {
    const p = snapAngle([0, 0], [10, 1])
    expect(p[1]).toBeCloseTo(0, 9)
    expect(p[0]).toBeCloseTo(Math.hypot(10, 1), 9)
  })
})

describe('degenerate shapes', () => {
  const SQ = rectPoly(5, 5, 10, 10) // x 0–10, z 0–10

  test('three points on one line have no area, no pieces and nothing to clip', () => {
    const line: Poly = [[0, 0], [5, 0], [10, 0]]
    expect(area(line)).toBe(0)
    expect(simplify(line)).toEqual([])
    expect(toPieces(line)).toEqual([])
    expect(intersectRegion(line, [SQ])).toEqual([])
    expect(offsetPoly(line, 0.5)).toBeNull()
  })

  test('a corner standing in the middle of a straight wall is dropped, the room unchanged', () => {
    const P: Poly = [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]]
    expect(area(P)).toBeCloseTo(100, 9)
    expect(simplify(P)).toEqual(SQ)
    expect(sumArea(toPieces(P))).toBeCloseTo(100, 9)
  })

  test('a ring that folds back on itself to nothing has no area and no pieces', () => {
    const flat: Poly = [[0, 0], [10, 0], [10, 0], [0, 0]]
    expect(area(flat)).toBe(0)
    expect(simplify(flat)).toEqual([])
    expect(toPieces(flat)).toEqual([])
    expect(splitByLine(flat, [5, -1], [5, 1])).toEqual({ left: [], right: [] })
    expect(unionPieces([flat])).toEqual({ outer: [], holes: [] })
  })

  test('a bow-tie is found to cross itself; a plain or concave room is not', () => {
    expect(isSimple([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(false)
    expect(isSimple([[0, 0], [16, 0], [0, 10], [16, 10]])).toBe(false)
    expect(isSimple(SQ)).toBe(true)
    expect(isSimple(L_SHAPE)).toBe(true)
    // a corner on another edge (touching, not crossing) still counts as crossing
    expect(isSimple([[0, 0], [10, 0], [10, 10], [5, 0], [0, 10]])).toBe(false)
    expect(isSimple([[0, 0], [10, 0]])).toBe(false)
  })

  test('a symmetric bow-tie has no signed area, so it yields no pieces at all', () => {
    const bow: Poly = [[0, 0], [10, 10], [10, 0], [0, 10]]
    expect(sarea(bow)).toBeCloseTo(0, 9)
    expect(toPieces(bow)).toEqual([])
  })

  test('a point exactly on a wall: distance 0 to that wall, and the nearest edge is that wall', () => {
    expect(distToSeg([5, 0], [0, 0], [10, 0])).toEqual({ d: 0, t: 0.5, q: [5, 0] })
    expect(nearestEdge(SQ, [10, 5])).toMatchObject({ d: 0, i: 1, t: 0.5 })
    // point-in on the boundary is half-open: the low edges count as inside, the high ones as outside
    expect([pointInPoly(SQ, 0, 5), pointInPoly(SQ, 5, 0)]).toEqual([true, true])
    expect([pointInPoly(SQ, 10, 5), pointInPoly(SQ, 5, 10)]).toEqual([false, false])
  })

  test('segments meeting at an end count as touching; parallel overlapping ones do not', () => {
    expect(segIntersect([0, 0], [10, 0], [10, 0], [10, 5])).toMatchObject({ t: 1, u: 0 })
    expect(segIntersect([0, 0], [10, 0], [5, 0], [15, 0])).toBeNull()
  })

  test('a split line along a wall leaves the room whole on one side', () => {
    const s = splitByLine(SQ, [0, -5], [0, 15])
    expect(s.left).toEqual([])
    expect(s.right).toHaveLength(1)
    expect(area(s.right[0])).toBeCloseTo(100, 9)
  })

  test('a room less itself is nothing; less a room it only touches, it is whole', () => {
    expect(subtractRegion(toPieces(SQ), SQ)).toEqual([])
    expect(sumArea(subtractRegion(toPieces(SQ), rectPoly(15, 5, 10, 10)))).toBeCloseTo(100, 9)
    expect(sharedSegments(SQ, rectPoly(15, 15, 10, 10))).toEqual([])
  })
})
