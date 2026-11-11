import { describe, expect, test } from 'vitest'
import schemes from '../../data/islandale/schemes.json'
import { buildingMasses } from '../buildings/masses'
import { enclosedOn, envelopeOf, floorAtLevel, landings, planPoly, PLAN_TOL } from './envelope'
import * as G from './geom'

type Obj = { name: string } & Record<string, unknown>
const all = (schemes as unknown as { schemes: { id: string; objects: Obj[] }[] }).schemes
const cabin = (scheme: string, name: string) => all.find((s) => s.id === scheme)!.objects.find((o) => o.name === name)!

/** 30 × 20 ft: x −15…15, z −10…10. */
const box = { w: 30, d: 20, h: 9 }
const sum = (L: readonly G.Poly[]) => L.reduce((s, P) => s + G.area(P), 0)

describe('the envelope of a floor', () => {
  test('a plain box is one tile and one outline of its own area and size', () => {
    const env = envelopeOf(box, 0)
    expect(env.area).toBeCloseTo(600, 9)
    expect(env.tiles).toHaveLength(1)
    expect(env.loops).toHaveLength(1)
    expect(env.edges).toHaveLength(4)
    expect(env.bbox).toMatchObject({ x1: -15, x2: 15, z1: -10, z2: 10 })
    expect(env.smooth).toBeNull()
    expect(env.smoothArea).toBeCloseTo(600, 9)
    expect(env.open).toEqual([])
    expect(env.access).toEqual([])
  })

  test('a walled wing joins the floor; a porch wing is open floor a porch room may fill', () => {
    const p = { ...box, wings: [{ dx: 20, dz: 0, w: 10, d: 10 }, { kind: 'porch', dx: 0, dz: 15, w: 30, d: 10 }] }
    const env = envelopeOf(p, 0)
    expect(env.area).toBeCloseTo(600 + 100, 9)
    expect(env.loops).toHaveLength(1)
    expect(sum(env.openTiles)).toBeCloseTo(300, 9)
    // the open bbox reaches the porch, the walled one does not
    expect(env.bbox.z2).toBeCloseTo(10, 9)
    expect(env.bboxAll.z2).toBeCloseTo(20, 9)
  })

  test('a porch overlapping the walls only counts where it lies outside them', () => {
    const p = { ...box, wings: [{ kind: 'porch', dx: 0, dz: 8, w: 30, d: 10 }] }
    expect(sum(envelopeOf(p, 0).openTiles)).toBeCloseTo(30 * 3, 9)
  })

  test('a wing on the second level belongs to floor 1, not floor 0', () => {
    expect(floorAtLevel(0)).toBe(0)
    expect(floorAtLevel(9)).toBe(1)
    expect(floorAtLevel(4)).toBe(0)
    const p = { ...box, wings: [{ kind: 'porch', dx: 0, dz: 15, w: 30, d: 10, lvl: 9 }] }
    expect(envelopeOf(p, 0).open).toEqual([])
    expect(envelopeOf(p, 1).open).toHaveLength(1)
  })

  test('upper floors are enclosed by the tall parts, or by the main part when none is tall', () => {
    const low = { ...box, wings: [{ dx: 20, dz: 0, w: 10, d: 10, h: 9 }] }
    const list = (p: Record<string, unknown>) => buildingMasses(p).map((m, i) => ({ m, i }))
    expect(enclosedOn(list(low), 0).map((e) => e.i)).toEqual([0, 1])
    expect(enclosedOn(list(low), 1).map((e) => e.i)).toEqual([0])
    const tallWing = { ...box, wings: [{ dx: 20, dz: 0, w: 10, d: 10, h: 18 }] }
    expect(enclosedOn(list(tallWing), 1).map((e) => e.i)).toEqual([1])
  })

  test('a stair wing is access, not floor, and its top is a landing', () => {
    const p = { ...box, wings: [{ kind: 'stair', dx: 0, dz: 14, w: 4, d: 8, rot: 0 }] }
    const env = envelopeOf(p, 0)
    expect(env.access).toHaveLength(1)
    expect(env.area).toBeCloseTo(600, 9)
    const [l] = landings(p)
    expect(l[0]).toBeCloseTo(0, 9)
    expect(l[1]).toBeCloseTo(10, 9)
  })

  test('the same cabin gives back the same envelope (cached), a changed one a new one', () => {
    expect(envelopeOf(box, 0)).toBe(envelopeOf({ ...box }, 0))
    expect(envelopeOf({ ...box, w: 32 }, 0).area).toBeCloseTo(640, 9)
  })

  test('a cabin with no size still gives a 1 × 1 ft floor, never NaN', () => {
    const env = envelopeOf({}, 0)
    expect(Number.isFinite(env.area)).toBe(true)
    expect(env.area).toBeGreaterThan(0)
  })
})

describe('curved cabins', () => {
  const prow = cabin('C', 'Gathering prow')

  test('a curved outline is drawn smooth but planned on chords that stay inside the wall band', () => {
    const env = envelopeOf(prow, 0)
    expect(env.smooth).not.toBeNull()
    const main = buildingMasses(prow)[0]
    const chords = planPoly(prow, main)
    // fewer corners than the curve, and never further than PLAN_TOL inside it
    expect(chords.length).toBeLessThan(env.smooth![0].length)
    for (const p of chords) expect(Math.min(...env.smooth!.map((L) => G.distToBoundary(L, p)))).toBeLessThanOrEqual(PLAN_TOL + 1e-6)
  })

  test('inside the smooth walls is a little more than inside the chords', () => {
    const env = envelopeOf(prow, 0)
    expect(env.smoothArea).toBeGreaterThan(env.area)
    expect(env.smoothArea - env.area).toBeLessThan(5)
  })
})
