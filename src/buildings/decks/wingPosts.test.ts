import { describe, expect, test } from 'vitest'
import type { LocalPoint } from '../footprint'
import { pointInPolygon } from '../../site/geom2d'
import { buildingSupports, deckSupports, mastPoint } from '../foundation/supportParams'
import { deckPostPoints, deckRimOutline, insideAny, keptPorchPosts, porchPostPoints, standingPosts } from './wingPosts'

const rect: LocalPoint[] = [[-10, -6], [10, -6], [10, 6], [-10, 6]]
const circle: LocalPoint[] = Array.from({ length: 48 }, (_, i) => {
  const a = (i / 48) * 2 * Math.PI
  return [9 * Math.cos(a), 9 * Math.sin(a)] as const
})

describe('deck and porch wing posts', () => {
  test('a rectangular deck has posts at its corners, 1 ft in, and between them on every side longer than 9 ft', () => {
    const posts = deckPostPoints(rect)
    for (const c of [[-9, -5], [9, -5], [9, 5], [-9, 5]]) expect(posts.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 1e-9)).toBe(true)
    // the inset sides are 18 ft and 10 ft, both over 9 ft: one more post along each
    expect(posts.length).toBe(8)
  })
  test('a curved deck stands on a ring and grid inside its edge', () => {
    const posts = deckPostPoints(circle)
    expect(posts.length).toBeGreaterThan(8)
    expect(posts.every(([x, z]) => pointInPolygon(circle, x, z))).toBe(true)
  })
  test('the rim beam runs inside the deck edge', () => {
    const rim = deckRimOutline(rect)
    expect(Math.max(...rim.map((p) => p[0]))).toBeCloseTo(9.4)
  })
  test('porch posts inside the walls or in a doorway are left out', () => {
    const all = porchPostPoints(rect)
    const walls: LocalPoint[][] = [[[-12, -8], [0, -8], [0, 0], [-12, 0]]]
    const kept = keptPorchPosts(rect, { insideWalls: (p) => insideAny(walls, p), inDoorway: (p) => p[0] > 9 && p[1] > 5 })
    expect(kept.length).toBeLessThan(all.length)
    expect(kept.some((p) => p[0] < 0 && p[1] < 0)).toBe(false)
    expect(kept.some((p) => p[0] > 9 && p[1] > 5)).toBe(false)
  })
})

describe('standingPosts', () => {
  test('posts run from the top into the ground, and none where the ground is at the top', () => {
    const posts = standingPosts([[0, 0], [5, 0]], -0.3, (x) => (x > 1 ? -0.32 : -2), 0.3)
    expect(posts).toEqual([{ at: [0, 0], y0: -2.3, y1: -0.3 }])
  })
})

describe('support params', () => {
  test('a cabin reads its support, spacing, size, bracing and mast', () => {
    expect(buildingSupports({ support: 'piers', postSpacing: 6, postSize: 12, bracing: true, mastAt: [2, 3] })).toEqual({ support: 'piers', spacingFt: 6, postIn: 12, bracing: true, mastAt: [2, 3] })
    expect(buildingSupports({})).toEqual({ support: undefined, spacingFt: 8, postIn: undefined, bracing: false, mastAt: undefined })
    expect(mastPoint(['a', 1])).toBeUndefined()
  })
  test("a standalone deck reads 'auto' or nothing as posts", () => {
    expect(deckSupports({}).support).toBe('posts')
    expect(deckSupports({ support: 'auto' }).support).toBe('posts')
    expect(deckSupports({ support: 'pilings', postSize: Number.NaN }).postIn).toBeUndefined()
  })
})
