import { describe, expect, it } from 'vitest'
import type { LocalPoint } from '../../../buildings/footprint'
import { centroidOf, clipBeyond, cutTriangle, lineIntervals, lookOf, silhouette, subtractIntervals, type CutLine, type Tri } from './sectionGeom'

const along = (origin: LocalPoint, dir: LocalPoint): CutLine => ({ origin, dir, look: lookOf(dir) })
const square = (h: number): LocalPoint[] => [
  [-h, -h],
  [h, -h],
  [h, h],
  [-h, h],
]

describe('the cut line through an outline', () => {
  it('crosses a square from face to face', () => {
    expect(lineIntervals(square(10), along([0, 3], [1, 0]))).toEqual([[-10, 10]])
  })

  it('leaves the wall band between the outside and inside faces', () => {
    const c = along([0, 0], [1, 0])
    const walls = subtractIntervals(lineIntervals(square(10), c), lineIntervals(square(9.5), c))
    expect(walls).toEqual([
      [-10, -9.5],
      [9.5, 10],
    ])
  })

  it('takes a curved wall as its chords, thicker where it cuts the band slantwise', () => {
    const ring = (r: number) => Array.from({ length: 64 }, (_, k): LocalPoint => [r * Math.cos((k * Math.PI) / 32), r * Math.sin((k * Math.PI) / 32)])
    const c = along([0, 6], [1, 0])
    const walls = subtractIntervals(lineIntervals(ring(10), c), lineIntervals(ring(9.5), c))
    expect(walls).toHaveLength(2)
    // a chord 6 ft off the centre: x = ±√(r² − 36), so the band reads √64 − √(9.5² − 36) wide
    const expected = 8 - Math.sqrt(9.5 * 9.5 - 36)
    expect(walls[1][1] - walls[1][0]).toBeCloseTo(expected, 1)
    expect(walls[1][1] - walls[1][0]).toBeGreaterThan(0.5)
  })

  it('misses an outline it does not reach', () => {
    expect(lineIntervals(square(10), along([0, 12], [1, 0]))).toEqual([])
  })
})

describe('the cut plane through a triangle', () => {
  it('reads a roof slope as a line at its pitch', () => {
    // a 6:12 plane from the eave at z = 10 (y 0) up to the ridge at z = 0 (y 5), cut square across it
    const tri: Tri = [
      [-5, 0, 10],
      [5, 0, 10],
      [0, 5, 0],
    ]
    const c = along([0, 0], [0, 1])
    const seg = cutTriangle(tri, c)
    expect(seg).not.toBeNull()
    const [a, b] = seg!
    const slope = Math.abs((b[1] - a[1]) / (b[0] - a[0]))
    expect(slope).toBeCloseTo(0.5, 6)
  })

  it('keeps only what lies beyond the plane', () => {
    const tri: Tri = [
      [0, 0, -4],
      [0, 0, 4],
      [0, 3, 4],
    ]
    // looking along −z (dir +x), so beyond is z < 0
    const beyond = clipBeyond(tri, along([0, 0], [1, 0]))
    expect(beyond.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...beyond.map((p) => p[2]))).toBeCloseTo(0, 9)
  })
})

describe('a silhouette', () => {
  it('splits where nothing covers the drawing', () => {
    const runs = silhouette(
      [
        [
          [0, 1],
          [2, 3],
        ],
        [
          [5, 1],
          [6, 1],
        ],
      ],
      0.5,
    )
    expect(runs).toHaveLength(2)
    expect(runs[0].top[runs[0].top.length - 1]).toEqual([2, 3])
  })
})

it('finds the centroid of an outline', () => {
  expect(centroidOf(square(4).map(([x, z]): LocalPoint => [x + 3, z]))).toEqual([3, 0])
})
