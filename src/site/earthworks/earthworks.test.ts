import { describe, expect, test } from 'vitest'
import {
  BANK_RUN_PER_RISE,
  cutCells,
  EARTH_CLASS,
  earthEdges,
  earthSides,
  earthSpec,
  earthTintAt,
  groundWithCuts,
  pondLevel,
  POND_FREEBOARD_M,
  sdPoly,
  signedDistance,
  SINK_MARGIN_FT,
  siteEarthworks,
  WALL_THICKNESS_M,
  type Cut,
  type SiteEarthworks,
} from './earthworks'
import { earthCuts, earthOps } from '../../scene/placement'
import type { PlanObject } from '../../store/types'
import type { Terrain } from '../types'
import { M_PER_FT as FT } from '../units'

// flat ground at 10 m over a 41 x 41 grid at 2 m, centred on the origin
const flat: Terrain = { lon0: 0, lat0: 0, spacing: 2, nx: 41, ny: 41, x0: -40, n0: -40, z: new Array(41 * 41).fill(10) }
/** Ground rising `grade` metres per metre northward from 10 m at n = 0. */
const rising = (grade: number): Terrain => ({ ...flat, z: Array.from({ length: 41 * 41 }, (_, k) => 10 + grade * (-40 + Math.floor(k / 41) * 2)) })
const square = [[-4, -4], [4, -4], [4, 4], [-4, 4]] as const
const cut: Cut = { polys: [square], floor: 10 - 4 * FT }

/** A house centred on the origin, square to the grid: back wall north, front south. */
const house = (params: Record<string, unknown>, at = { x: 0, n: 0 }, rotation = 0): PlanObject => ({
  id: 'H', type: 'house', name: 'H', position: at, rotation, params: { w: 20, d: 20, h: 9, ...params }, locked: false, hidden: false, labelVisible: true,
})
const pondObj = (params: Record<string, unknown>, at = { x: 0, n: 0 }): PlanObject => ({
  id: 'P', type: 'pond', name: 'P', position: at, rotation: 0, params: { w: 16, d: 10, h: 1.5, shape: 'rect', ...params }, locked: false, hidden: false, labelVisible: true,
})
const works = (t: Terrain, objects: readonly PlanObject[]): SiteEarthworks => siteEarthworks(t, earthOps(objects, t))
/** A house 6 m deep, so its back wall sits on a raster sample row (n = 3). */
const SIX_M_FT = 6 / FT

describe('sunk floors (plain cuts)', () => {
  test('signed distance is negative inside and positive outside', () => {
    expect(signedDistance([square], 0, 0)).toBeCloseTo(-4)
    expect(signedDistance([square], 6, 0)).toBeCloseTo(2)
    expect(sdPoly(Float64Array.from(square.flat()), 6, 0)).toBeCloseTo(2)
  })
  test('the ground is cut flat under the floor out to the margin', () => {
    const g = groundWithCuts(flat, [cut])
    expect(g(0, 0)).toBeCloseTo(cut.floor - 0.15)
    expect(g(4 + SINK_MARGIN_FT * FT - 0.01, 0)).toBeCloseTo(cut.floor - 0.15)
  })
  test('then rises in a 2:1 bank back to the survey, and never fills', () => {
    const g = groundWithCuts(flat, [cut])
    const edge = 4 + SINK_MARGIN_FT * FT
    expect(g(edge + 1, 0)).toBeCloseTo(cut.floor - 0.15 + 1 / BANK_RUN_PER_RISE)
    expect(g(30, 0)).toBe(10)
  })
  test('the patch covers every cell the cut reaches', () => {
    const r = cutCells(flat, cut)
    const g = groundWithCuts(flat, [cut])
    for (let x = -40; x <= 40; x += 0.5) {
      const col = (x + 40) / 2
      if (g(x, 0) < 10 - 1e-6) expect(col >= r.c0 && col <= r.c1).toBe(true)
    }
  })
})

describe('earth settings (legacy earthOf)', () => {
  test('a sink brings a 3 ft margin, a 10 ft downhill court and stone walls', () => {
    const e = earthSpec('house', { earth: { sink: 4 }, support: 'posts' })
    expect(e).toMatchObject({ sink: 4, margin: 3, court: 10, courtSides: 'downhill', walls: true, wallMat: 'stone', fill: false, slope: 2, crest: 2, sides: 'uphill' })
  })
  test('an earth support alone fills a bench; auto support fills under any earthworks', () => {
    expect(earthSpec('house', { support: 'earth' })).toMatchObject({ fill: true, berm: 0, sink: 0, margin: 0, court: 0 })
    expect(earthSpec('house', { earth: { berm: 6 } })?.fill).toBe(true)
    expect(earthSpec('house', { earth: { berm: 6 }, support: 'posts' })?.fill).toBe(false)
  })
  test('nothing for a building with no berm, sink or earth support, or for a pad', () => {
    expect(earthSpec('house', { earth: { slope: 3 }, support: 'posts' })).toBeNull()
    expect(earthSpec('house', {})).toBeNull()
    expect(earthSpec('pad', { support: 'earth' })).toBeNull()
  })
  test('the slope is never steeper than 0.6:1 and zero means the default 2:1', () => {
    expect(earthSpec('house', { earth: { berm: 4, slope: 0.2 } })?.slope).toBe(0.6)
    expect(earthSpec('house', { earth: { berm: 4, slope: 0 } })?.slope).toBe(2)
  })
})

describe('berm and court sides', () => {
  // a 20 ft square on ground rising to the north: its back (edge 0) faces uphill
  const t = rising(0.1)
  const main = { outline: [[-10, -10], [10, -10], [10, 10], [-10, 10]] as const, position: { x: 0, n: 0 }, rotation: 0 }
  const edges = earthEdges(t, main)
  const picked = (spec: Parameters<typeof earthSides>[1]) => earthSides(edges, spec).map((e) => e.i).sort()

  test('each wall knows the side it faces and how the ground rises beyond it', () => {
    expect(edges.map((e) => e.labels)).toEqual([['back'], ['right'], ['front'], ['left']])
    expect(edges[0].rise).toBeCloseTo(0.4)
    expect(edges[2].rise).toBeCloseTo(-0.4)
    expect(edges[0].nw[1]).toBeCloseTo(1)
  })
  test('sides by name, by edge number, and lists of both', () => {
    expect(picked('back')).toEqual([0])
    expect(picked('left+front')).toEqual([2, 3])
    expect(picked([1, 'back'])).toEqual([0, 1])
    expect(picked('2')).toEqual([2])
    expect(picked('all')).toEqual([0, 1, 2, 3])
  })
  test('uphill is every wall the ground rises beyond; downhill the one it falls away from most', () => {
    expect(picked('uphill')).toEqual([0])
    expect(picked('downhill')).toEqual([2])
    expect(picked(undefined)).toEqual([0])
  })
  test('turning the building turns its named sides with it', () => {
    const turned = earthEdges(t, { ...main, rotation: 180 })
    expect(earthSides(turned, 'back')[0].rise).toBeCloseTo(-0.4)
    expect(earthSides(turned, 'uphill').map((e) => e.labels[0])).toEqual(['front'])
  })
})

describe('berms', () => {
  // back wall at n = 3 m, the floor on the 10 m ground; a 6 ft berm at 2.5:1 with a 2 ft crest
  const o = house({ d: SIX_M_FT, support: 'posts', earth: { berm: 6, sides: 'back', slope: 2.5 } })
  const w = works(flat, [o])
  const top = 10 + 6 * FT
  const crest = 2 * FT

  test('the crest is flat at the floor plus the berm height', () => {
    expect(w.ground(0, 3.25)).toBeCloseTo(top, 3)
    expect(w.ground(0, 3.5)).toBeCloseTo(top, 3)
  })
  test('the crest rounds over a metre before the slope runs straight', () => {
    const at = (u: number) => w.ground(0, 3 + crest + u)
    expect(at(0.5)).toBeCloseTo(top - 0.25 / 2 / 2.5, 2)
    // straight run beyond the shoulder: 1 in 2.5
    expect(at(1.5) - at(2.5)).toBeCloseTo(1 / 2.5, 3)
  })
  test('the slope runs out to the ground at the crest plus rise times slope', () => {
    const run = 6 * FT * 2.5
    const toe = crest + 0.5 + run
    expect(w.ground(0, 3 + toe - 1.6)).toBeCloseTo(10 + 1.6 / 2.5, 2)
    expect(w.ground(0, 3 + toe + 2)).toBeCloseTo(10, 6)
  })
  test('only the chosen side is bermed; the berm wraps round its ends and dies away along the sides', () => {
    expect(w.ground(0, -3 - 1)).toBeCloseTo(10, 6)
    expect(w.ground(3.05 + 1, 0)).toBeGreaterThan(10.5)
    expect(w.ground(3.05 + 1, 0)).toBeLessThan(top - 0.5)
    expect(w.ground(3.05 + 1.5, -6)).toBeCloseTo(10, 6)
  })
  test('nothing is filled inside a building, even with a berm on every side', () => {
    const all = works(flat, [house({ support: 'earth', earth: { berm: 8, sides: 'all' } })])
    const floorC = 10 - 0.03
    for (let x = -2.5; x <= 2.5; x += 0.25) for (let n = -2.5; n <= 2.5; n += 0.25) expect(all.ground(x, n)).toBeLessThanOrEqual(floorC + 1e-5)
    expect(all.ground(0, 3.05 + 0.3)).toBeCloseTo(10 + 8 * FT, 2)
  })

  test('a bermed building moved off the survey does not break the ground (review fix)', () => {
    const far = works(flat, [house({ support: 'earth', earth: { berm: 6, sides: 'all' } }, { x: 140, n: 0 })])
    expect(far.ground(0, 0)).toBeCloseTo(10, 6)
  })
})

describe('fill benches (earth support)', () => {
  // ground rising 3 in 10 to the north; the floor sits on the highest corner
  const t = rising(0.3)
  const o = house({ d: SIX_M_FT, w: SIX_M_FT, support: 'earth' })
  const w = works(t, [o])
  const floorC = 10 + 0.3 * 3 - 0.03

  test('the bench is flat at the floor under the building', () => {
    for (let x = -2.5; x <= 2.5; x += 0.5) for (let n = -2.5; n <= 2.5; n += 0.5) expect(w.ground(x, n)).toBeCloseTo(floorC, 4)
  })
  test('then falls away at 2:1 on the downhill side', () => {
    expect(w.ground(0, -3 - 0.3 - 1)).toBeCloseTo(floorC - 0.5, 2)
    expect(w.ground(0, -3 - 0.3 - 2)).toBeCloseTo(floorC - 1, 2)
  })
  test('and leaves the ground uphill alone', () => {
    expect(w.ground(0, 6)).toBeCloseTo(11.8, 4)
  })
})

describe('sunk floors with courts and retaining walls', () => {
  // a 4 ft sink on flat ground: the floor 4 ft down, a 3 ft margin and a 10 ft court
  const o = house({ d: SIX_M_FT, w: SIX_M_FT, support: 'posts', earth: { sink: 4 } })
  const w = works(flat, [o])
  const floorC = 10 - 4 * FT - 0.03

  test('the cut is flat at the floor out to the margin, then stands as a wall', () => {
    expect(w.ground(0, 0)).toBeCloseTo(floorC, 4)
    expect(w.ground(-3 - 3 * FT + 0.1, 0)).toBeCloseTo(floorC, 4)
    expect(w.ground(-3 - 3 * FT - 0.75, 0)).toBeCloseTo(10, 4)
  })
  test('the court opens 10 ft beyond the downhill wall', () => {
    // flat ground: every wall ties, so downhill is the first long one, the back
    expect(w.ground(0, 3 + 3 * FT + 10 * FT - 0.1)).toBeCloseTo(floorC, 4)
    expect(w.ground(0, -3 - 3 * FT - 1)).toBeCloseTo(10, 4)
    expect(earthTintAt(w, 0, 3 + 3 * FT + 2)?.kind).toBe('court')
  })
  test('a stone wall runs round the deep cut, a wall thickness into the bank', () => {
    expect(w.walls.length).toBeGreaterThan(0)
    const wall = w.walls[0]
    expect(wall).toMatchObject({ id: 'H', material: 'stone' })
    expect(wall.floor).toBeCloseTo(floorC, 6)
    expect(wall.foot).toBeCloseTo(floorC - 0.15, 6)
    wall.tops.forEach((z) => expect(z).toBeCloseTo(10.12, 2))
    wall.pts.forEach((p, i) => expect(Math.hypot(wall.outer[i][0] - p[0], wall.outer[i][1] - p[1])).toBeCloseTo(WALL_THICKNESS_M, 6))
    // the inner face stands on the cut edge, a margin out from the walls and the court
    const walls = Float64Array.from([-3, -3, 3, -3, 3, 3, -3, 3])
    const court = Float64Array.from([-3, 3, 3, 3, 3, 3 + 10 * FT, -3, 3 + 10 * FT])
    wall.pts.forEach(([x, n]) => expect(Math.min(sdPoly(walls, x, n), sdPoly(court, x, n))).toBeCloseTo(3 * FT, 1))
  })
  test('concrete walls when asked, open 2:1 banks when walls are off', () => {
    expect(works(flat, [house({ ...o.params, earth: { sink: 4, wallMat: 'concrete' } })]).walls[0].material).toBe('concrete')
    const open = works(flat, [house({ ...o.params, earth: { sink: 4, walls: false } })])
    expect(open.walls).toHaveLength(0)
    const edge = 3 + 3 * FT
    expect(open.ground(-edge - 1, 0)).toBeCloseTo(floorC + 1 / 2, 3)
    expect(earthTintAt(open, -edge - 1, 0)?.kind).toBe('bank')
  })
  test('no retaining wall where the cut is shallow', () => {
    expect(works(flat, [house({ ...o.params, earth: { sink: 0.5 } })]).walls).toHaveLength(0)
  })
  test('on a slope the wall stands only where the bank is deep', () => {
    // 1 in 5 up to the north, a 1 ft sink: deep at the back, nothing to hold at the front
    const t = rising(0.2)
    const s = works(t, [house({ ...o.params, earth: { sink: 1, court: 0 } })])
    const pts = s.walls.flatMap((x) => x.pts)
    expect(pts.length).toBeGreaterThan(0)
    expect(Math.min(...pts.map((p) => p[1]))).toBeGreaterThan(-2)
  })
})

describe('ponds', () => {
  // a 16 x 10 ft pond on ground rising 1 in 10 to the north
  const t = rising(0.1)
  const p = pondObj({})
  const w = works(t, [p])
  const water = w.ponds.get('P')
  const southRim = -5 * FT

  test('the water lies flat at the lowest rim point, less 0.06 m', () => {
    expect(water?.level).toBeCloseTo(10 + 0.1 * southRim - POND_FREEBOARD_M, 4)
    expect(pondLevel(p, (_x, n) => 10 + 0.1 * n)).toBeCloseTo(water?.level ?? NaN, 6)
  })
  test('the bowl sits under the water, deepest in the middle', () => {
    const level = water?.level ?? NaN
    const depth = 1.5 * FT
    expect(w.ground(0, 0)).toBeLessThan(level - 0.02)
    expect(w.ground(0, 0)).toBeCloseTo(level - 0.02 - depth, 2)
    expect(w.ground(0, southRim + 0.2)).toBeLessThan(level)
    expect(w.ground(0, southRim + 0.2)).toBeGreaterThan(w.ground(0, 0))
  })
  test('a wet margin grades down to the water outside the rim', () => {
    expect(w.ground(0, -southRim + 0.5)).toBeLessThan(10 + 0.1 * (-southRim + 0.5))
    expect(earthTintAt(w, 0, -southRim + 0.5)?.kind).toBe('wet')
    expect(earthTintAt(w, 0, 0)?.kind).toBe('mud')
    expect(w.ground(0, 6)).toBeCloseTo(10.6, 4)
  })
  test('a pond beside a berm takes its level from the bermed ground', () => {
    const near = [house({ d: SIX_M_FT, support: 'posts', earth: { berm: 4, sides: 'back' } }), pondObj({ w: 6, d: 6 }, { x: 0, n: 5 })]
    const both = works(flat, near)
    expect(both.ponds.get('P')?.level).toBeGreaterThan(10)
  })
})

describe('tints', () => {
  test('a berm reads green, stronger as it rises', () => {
    const w = works(flat, [house({ d: SIX_M_FT, support: 'posts', earth: { berm: 6, sides: 'back' } })])
    const high = earthTintAt(w, 0, 3.5)
    const low = earthTintAt(w, 0, 8.2)
    expect(high).toMatchObject({ kind: 'berm', colour: '#97b96f', amount: 0.75 })
    expect(low?.kind).toBe('berm')
    expect(low?.amount).toBeLessThan(0.75)
    expect(earthTintAt(w, 0, -10)).toBeNull()
  })
})

describe('the plan as the scene draws it', () => {
  test('groundWithCuts over the earthworks cuts is the same ground', () => {
    const t = rising(0.1)
    const objects = [house({ support: 'earth', earth: { berm: 6, sides: 'uphill' } }), pondObj({}, { x: 12, n: -6 })]
    const g = groundWithCuts(t, earthCuts(objects, t))
    const w = works(t, objects)
    for (const [x, n] of [[0, 4], [0, -4], [12, -6], [20, 20]]) expect(g(x, n)).toBe(w.ground(x, n))
  })
  test('each cut reaches as far as its earthworks', () => {
    const t = rising(0.1)
    const [c] = earthCuts([house({ support: 'posts', earth: { berm: 6, sides: 'back' } })], t)
    const r = cutCells(t, c)
    const w = groundWithCuts(t, [c])
    for (let n = -30; n <= 30; n += 0.5) {
      const row = (n + 40) / 2
      if (Math.abs(w(0, n) - (10 + 0.1 * n)) > 1e-4) expect(row >= r.r0 && row <= r.r1).toBe(true)
    }
  })
  test('objects far apart get patches of their own that never overlap', () => {
    const w = works(flat, [house({ support: 'earth' }), house({ support: 'earth' }, { x: 25, n: 25 })])
    expect(w.fields).toHaveLength(2)
    const [a, b] = w.fields.map((f) => f.rect)
    expect(a.c1 <= b.c0 || b.c1 <= a.c0 || a.r1 <= b.r0 || b.r1 <= a.r0).toBe(true)
  })
  test('every patch meets the survey at its border', () => {
    const t = rising(0.1)
    const w = works(t, [house({ support: 'earth', earth: { berm: 10, sides: 'all', slope: 3 } }), pondObj({}, { x: 10, n: -10 })])
    for (const f of w.fields) {
      const W = f.ni + 1
      for (let I = 0; I <= f.ni; I++) {
        expect(f.z[I]).toBe(f.zb[I])
        expect(f.z[f.nj * W + I]).toBe(f.zb[f.nj * W + I])
      }
      expect(f.cls.some((c) => c === EARTH_CLASS.pond) || f.z.some((z, k) => z !== f.zb[k])).toBe(true)
    }
  })
})
