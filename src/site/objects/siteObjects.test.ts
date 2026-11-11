import { describe, expect, test } from 'vitest'
import { localFootprint, signedArea, type LocalPoint } from '../../buildings/footprint'
import { pointInPolygon } from '../geom2d'
import { seededRandom, treeSeed } from './treeShapes'
import {
  BOULDER_MAX_ROCKS,
  CAR,
  CAR_BAY_MIN_M,
  FLOWERS,
  MAX_CARS,
  MEADOW_MAX_FLOWERS,
  MEADOW_MAX_TUFTS,
  boulderRocks,
  carPose,
  carSlots,
  meadowMarks,
  objectSeed,
  rockSeat,
  scatterIn,
} from './siteObjects'
import { M_PER_FT as FT } from '../units'

const metres = (P: readonly LocalPoint[]): LocalPoint[] => P.map(([x, z]) => [x * FT, z * FT])

describe('objectSeed', () => {
  test('uses the object’s own seed, 0 read as 1 like the old planner, else a stable one from its id', () => {
    expect(objectSeed({ seed: 9 }, 'D-15')).toBe(9)
    expect(objectSeed({ seed: 0 }, 'D-15')).toBe(1)
    expect(objectSeed({}, 'D-13')).toBe(treeSeed('D-13'))
    expect(objectSeed({}, 'D-13')).not.toBe(objectSeed({}, 'D-14'))
  })
})

describe('scatterIn (legacy scatterIn)', () => {
  test('every point lies inside the outline', () => {
    const P = localFootprint({ w: 30, d: 20, shape: 'kidney', bend: 0.5 })
    const pts = scatterIn(P, 400, seededRandom(3))
    expect(pts).toHaveLength(400)
    for (const [x, z] of pts) expect(pointInPolygon(P, x, z)).toBe(true)
  })

  test('gives up after 8 tries a point, and gives nothing for no outline', () => {
    // a thin sliver in a big box: far fewer hits than asked for
    const sliver: LocalPoint[] = [[0, 0], [100, 0], [100, 100], [99.9, 0.1]]
    expect(scatterIn(sliver, 50, seededRandom(1)).length).toBeLessThan(50)
    expect(scatterIn([], 10, seededRandom(1))).toEqual([])
    expect(scatterIn(sliver, 0, seededRandom(1))).toEqual([])
  })
})

describe('meadowMarks (legacy meadowMarks)', () => {
  const ellipse = localFootprint({ w: 30, d: 20, shape: 'ellipse' })
  const areaM2 = Math.abs(signedArea(metres(ellipse)))

  test('tufts and flowers come from the area: 2.6 and 1.6 a square metre', () => {
    const m = meadowMarks(ellipse, 7)
    expect(m.area).toBeCloseTo(areaM2, 6)
    expect(m.tufts).toHaveLength(Math.round(areaM2 * 2.6))
    expect(m.flowers).toHaveLength(Math.round(areaM2 * 1.6))
  })

  test('the meadow’s own flowers per square metre, none at 0', () => {
    expect(meadowMarks(ellipse, 7, 3).flowers).toHaveLength(Math.round(areaM2 * 3))
    expect(meadowMarks(ellipse, 7, 0).flowers).toHaveLength(0)
    expect(meadowMarks(ellipse, 7, 'lots').flowers).toHaveLength(Math.round(areaM2 * 1.6))
  })

  test('a big meadow is capped at 1800 tufts and 1100 flowers', () => {
    const big = localFootprint({ w: 300, d: 300, shape: 'ellipse' })
    const m = meadowMarks(big, 2)
    expect(m.tufts).toHaveLength(MEADOW_MAX_TUFTS)
    expect(m.flowers).toHaveLength(MEADOW_MAX_FLOWERS)
  })

  test('every tuft and flower stands inside the blob outline, in local metres', () => {
    const blob = localFootprint({ w: 44, d: 20, shape: 'blob', pts: [[-20, -6], [-4, -10], [14, -8], [22, 1], [12, 9], [-6, 10], [-19, 6], [-22, 0]] })
    const Pm = metres(blob)
    const m = meadowMarks(blob, 11)
    expect(m.tufts.length).toBeGreaterThan(100)
    for (const k of [...m.tufts, ...m.flowers]) expect(pointInPolygon(Pm, k.x, k.z)).toBe(true)
  })

  test('is the same for the same seed and different for another', () => {
    const a = meadowMarks(ellipse, 5)
    expect(meadowMarks(ellipse, 5)).toEqual(a)
    const b = meadowMarks(ellipse, 6)
    expect(b.tufts[0]).not.toEqual(a.tufts[0])
  })

  test('tufts and flowers keep the old sizes, lifts and colours', () => {
    const m = meadowMarks(ellipse, 4)
    for (const t of m.tufts) {
      expect(t.scale[0]).toBeGreaterThanOrEqual(0.6)
      expect(t.scale[0]).toBeLessThan(1.5)
      expect(t.lift).toBeCloseTo(0.12 * t.scale[0], 9)
      expect(Math.abs(t.turn[0])).toBeLessThanOrEqual(0.2)
    }
    for (const f of m.flowers) {
      expect(FLOWERS).toContain(f.color)
      expect(f.lift).toBeGreaterThanOrEqual(0.28)
      expect(f.lift).toBeLessThan(0.42)
    }
  })
})

describe('boulderRocks (legacy boulderRocks)', () => {
  const rockTop = (r: ReturnType<typeof boulderRocks>[number]) => Math.max(...r.positions.filter((_, i) => i % 3 === 1))
  const rockBottom = (r: ReturnType<typeof boulderRocks>[number]) => Math.min(...r.positions.filter((_, i) => i % 3 === 1))

  test('a set count gives that many rocks, kept to 1–7', () => {
    expect(boulderRocks({ w: 8, d: 6, h: 4, count: 3 }, 2)).toHaveLength(3)
    expect(boulderRocks({ w: 8, d: 6, h: 4, count: 0 }, 2)).toHaveLength(1)
    expect(boulderRocks({ w: 8, d: 6, h: 4, count: 12 }, 2)).toHaveLength(BOULDER_MAX_ROCKS)
  })

  test('without a count: one to three rocks, one more for a big boulder', () => {
    for (let seed = 1; seed < 40; seed++) {
      const small = boulderRocks({ w: 6, d: 5, h: 3 }, seed).length
      expect(small).toBeGreaterThanOrEqual(1)
      expect(small).toBeLessThanOrEqual(3)
      // 15 × 12 ft is over 14 m²
      const big = boulderRocks({ w: 15, d: 12, h: 5 }, seed).length
      expect(big).toBeGreaterThanOrEqual(2)
      expect(big).toBeLessThanOrEqual(4)
    }
  })

  test('every rock fits within w, d and h; the first is the big one at the centre', () => {
    for (const seed of [2, 5, 9, 11, 31]) {
      const size = { w: 9, d: 6, h: 4.5, count: 5 }
      const [W, D, H] = [size.w * FT, size.d * FT, size.h * FT]
      const rocks = boulderRocks(size, seed)
      expect(rocks[0].cx).toBe(0)
      expect(rocks[0].cz).toBe(0)
      for (const r of rocks) {
        expect(r.sx).toBeLessThanOrEqual(W / 2)
        expect(r.sz).toBeLessThanOrEqual(D / 2)
        expect(r.sx).toBeLessThanOrEqual(rocks[0].sx * 1.4)
        // seated on flat ground, the top stays under the boulder's height and the bottom is flattened
        expect(rockTop(r) + rockSeat(r, () => 0)).toBeLessThanOrEqual(H)
        expect(rockBottom(r)).toBeGreaterThanOrEqual(-0.3 * r.sy - 1e-9)
      }
    }
  })

  test('triangles come with unit normals and a colour per corner', () => {
    const rocks = boulderRocks({ w: 8, d: 6, h: 4 }, 2)
    for (const r of rocks) {
      expect(r.positions.length % 9).toBe(0)
      expect(r.normals).toHaveLength(r.positions.length)
      expect(r.colors).toHaveLength(r.positions.length)
      for (let i = 0; i < r.normals.length; i += 3) expect(Math.hypot(r.normals[i], r.normals[i + 1], r.normals[i + 2])).toBeCloseTo(1, 6)
    }
  })

  test('is the same for the same seed and different for another', () => {
    const a = boulderRocks({ w: 8, d: 6, h: 4 }, 2)
    expect(boulderRocks({ w: 8, d: 6, h: 4 }, 2)).toEqual(a)
    expect(boulderRocks({ w: 8, d: 6, h: 4 }, 3)[0].positions).not.toEqual(a[0].positions)
  })

  test('a rock beds into the lowest ground under it, plus a fifth of its height', () => {
    const r = { cx: 1, cz: 0, sx: 1, sy: 1, sz: 1 }
    expect(rockSeat(r, () => 0)).toBeCloseTo(0.2, 9)
    // ground falling to the east: the east probe (x = 1.7) is lowest
    expect(rockSeat(r, (x) => -x)).toBeCloseTo(-1.7 + 0.2, 9)
  })
})

describe('cars on a parking pad (legacy makeMesh)', () => {
  test('cars stand in equal bays across the pad, centred', () => {
    const xs = carSlots(26, 3)
    const W = 26 * FT
    expect(xs).toHaveLength(3)
    expect(xs[1]).toBeCloseTo(0, 9)
    expect(xs[2] - xs[1]).toBeCloseTo(W / 3, 9)
    expect(xs[0]).toBeCloseTo(-xs[2], 9)
  })

  test('the count fits the pad: a 2.3 m bay each, at most 8, every car inside the width', () => {
    for (const [w, cars] of [[26, 3], [22, 2], [10, 5], [40, 20], [7.5, 1], [100, 30]] as const) {
      const W = w * FT
      const xs = carSlots(w, cars)
      expect(xs.length).toBeLessThanOrEqual(Math.min(cars, MAX_CARS))
      if (xs.length > 1) expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(CAR_BAY_MIN_M)
      for (const x of xs) expect(Math.abs(x) + CAR.body.w / 2).toBeLessThanOrEqual(W / 2)
    }
    expect(carSlots(10, 5)).toHaveLength(1)
    expect(carSlots(100, 30)).toHaveLength(MAX_CARS)
    expect(carSlots(7, 1)).toHaveLength(0)
  })

  test('no cars asked for, no cars', () => {
    expect(carSlots(26, 0)).toEqual([])
    expect(carSlots(26, undefined)).toEqual([])
    expect(carSlots(26, 'three')).toEqual([])
  })

  test('a car rests on the pad under its wheels and follows its slope', () => {
    const flat = carPose(0, () => 0.06)
    expect(flat.y).toBeCloseTo(0.06, 9)
    expect(flat.pitch).toBeCloseTo(0, 9)
    expect(flat.roll).toBeCloseTo(0, 9)
    // the pad rises to the front by 0.1 m a metre: nose up
    const up = carPose(0, (_, z) => 0.1 * z)
    expect(up.y).toBeCloseTo(0, 9)
    expect(-Math.sin(up.pitch) * CAR.wheel.z).toBeCloseTo(0.1 * CAR.wheel.z, 2)
    expect(up.roll).toBeCloseTo(0, 9)
    // and to the right by 0.05 m a metre: tilted that way
    const side = carPose(2, (x) => 0.05 * (x - 2))
    expect(Math.sin(side.roll) * CAR.wheel.x).toBeCloseTo(0.05 * CAR.wheel.x, 3)
  })
})

// Numbers read from the old planner (legacy meadowMarks / boulderRocks) with Scheme D loaded.
describe('the same scatter and rocks as the old planner, Scheme D', () => {
  test('“Meadow · camas & fescue” (seed 136): 177 tufts and 109 flowers, the same first ones', () => {
    const P = localFootprint({ w: 44, d: 20.3, shape: 'blob', pts: [[22, 0], [15, 9], [0, 10], [-15, 8], [-22, 1], [-16, -8], [0, -10], [14, -8]] })
    const m = meadowMarks(P, 136)
    expect(m.area).toBeCloseTo(67.8884577163793, 9)
    expect(m.tufts).toHaveLength(177)
    expect(m.flowers).toHaveLength(109)
    expect([m.tufts[0].x, m.tufts[0].z]).toEqual([-2.66049175285721, 2.1295704339770607])
    expect([m.tufts[5].x, m.tufts[5].z]).toEqual([-1.3629981352625418, -0.23050844985553853])
    expect([m.flowers[0].x, m.flowers[0].z, m.flowers[0].color]).toEqual([4.2803561102785155, 1.1887952796723473, '#e9c93f'])
  })

  test('“River stones” 9 × 6 × 4.5 ft (seed 9): the same two rocks', () => {
    const rocks = boulderRocks({ w: 9, d: 6, h: 4.5 }, 9)
    const legacy = [
      [0, 0, 1.0148129715120167, 0.8142986173055805, 0.708406250947997],
      [-1.1226775115116086, -0.3274260124543373, 0.41818194903819705, 0.2838327544770128, 0.29501705229081454],
    ]
    expect(rocks.map((r) => [r.cx, r.cz, r.sx, r.sy, r.sz])).toEqual(legacy)
    // the first corner of the first rock, as the old planner's Float32 geometry held it
    const v0 = rocks[0].positions.slice(0, 3)
    expect(v0[0]).toBeCloseTo(0.5296990871429443, 6)
    expect(v0[1]).toBeCloseTo(0.4622015655040741, 6)
    expect(v0[2]).toBeCloseTo(0.841687798500061, 6)
  })

  test('the other river stones have the old planner’s rock counts', () => {
    const counts = [
      [{ w: 8, d: 6, h: 4 }, 2, 1],
      [{ w: 6, d: 5, h: 3 }, 5, 2],
      [{ w: 5, d: 4, h: 2.5 }, 4, 1],
      [{ w: 7, d: 5, h: 3 }, 11, 1],
    ] as const
    for (const [size, seed, n] of counts) expect(boulderRocks(size, seed)).toHaveLength(n)
  })
})
