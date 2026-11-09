import { describe, expect, test } from 'vitest'
import { boxOf, chainSegments, insidePoly, isClosed, lineLength, pointAlongLine, simplifyLine, smoothPath } from './siteGeom'

describe('chainSegments', () => {
  test('joins segments that meet end to end into one line, whichever way round they come', () => {
    const lines = chainSegments([
      [1, 0, 2, 0],
      [0, 0, 1, 0],
      [3, 0, 2, 0],
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ])
  })

  test('a loop comes back closed, and apart lines stay apart', () => {
    const lines = chainSegments([
      [0, 0, 1, 0],
      [1, 0, 1, 1],
      [1, 1, 0, 0],
      [5, 5, 6, 6],
    ])
    expect(lines).toHaveLength(2)
    expect(lines.some(isClosed)).toBe(true)
    expect(lines.flat()).toHaveLength(4 + 2)
  })
})

describe('simplifyLine', () => {
  test('drops points on a straight run and keeps the corners', () => {
    const l = simplifyLine(
      [
        [0, 0],
        [1, 0.001],
        [2, 0],
        [2, 1],
        [2, 2],
      ],
      0.01,
    )
    expect(l).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
    ])
  })
})

describe('smoothPath', () => {
  test('passes through every point it is given', () => {
    const pts = [
      [0, 0],
      [3, 1],
      [6, 0],
      [9, 2],
    ] as const
    const d = smoothPath(pts)
    expect(d.startsWith('M0 0')).toBe(true)
    for (const [x, y] of pts.slice(1)) expect(d).toContain(` ${x} ${y}`)
    expect(d.match(/C/g)).toHaveLength(3)
  })

  test('a closed line closes', () => {
    expect(
      smoothPath([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ]).endsWith('Z'),
    ).toBe(true)
  })
})

describe('measures', () => {
  test('length, a point along, bounds and inside', () => {
    const l = [
      [0, 0],
      [3, 0],
      [3, 4],
    ] as const
    expect(lineLength(l)).toBe(7)
    expect(pointAlongLine(l, 5)).toEqual({ at: [3, 2], dir: [0, 1] })
    expect(boxOf(l)).toEqual({ minx: 0, miny: 0, maxx: 3, maxy: 4 })
    expect(insidePoly(l, [2, 1])).toBe(true)
    expect(insidePoly(l, [-1, 1])).toBe(false)
  })
})
