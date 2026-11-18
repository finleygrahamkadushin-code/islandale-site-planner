import { describe, expect, test } from 'vitest'
import { ftToM } from '../units'
import { BULGE, OUTDOOR_KITCHEN_DEFAULTS, OVERHANG, TOP_T, outdoorKitchenBase, outdoorKitchenParts, type OutdoorKitchenPart } from './outdoorKitchen'

const parts = (params: Record<string, unknown>) => outdoorKitchenParts(params)
const count = (ps: readonly OutdoorKitchenPart[], kind: string) => ps.filter((p) => p.kind === kind).length
const lo = (p: OutdoorKitchenPart, axis: 0 | 1 | 2) => p.centre[axis] - p.size[axis] / 2
const hi = (p: OutdoorKitchenPart, axis: 0 | 1 | 2) => p.centre[axis] + p.size[axis] / 2

describe('outdoor kitchen defaults', () => {
  test('12 ft straight run, 2.5 ft deep, 3 ft to the top, with a 6 ft return for an L', () => {
    expect(OUTDOOR_KITCHEN_DEFAULTS).toEqual({ w: 12, d: 2.5, h: 3, shape: 'straight', ret: 6 })
  })

  test('the countertop overhang is 1.5 in and the slab 6 in thick', () => {
    expect(OVERHANG).toBeCloseTo(ftToM(1.5 / 12), 9)
    expect(TOP_T).toBeCloseTo(ftToM(0.5), 9)
  })
})

describe('outdoor kitchen geometry', () => {
  test('a straight kitchen has stone, a stone countertop, a sink, a grill and two storage openings', () => {
    const ps = parts(OUTDOOR_KITCHEN_DEFAULTS)
    expect(count(ps, 'stone')).toBeGreaterThan(0)
    expect(count(ps, 'boulder')).toBe(2)
    expect(count(ps, 'counter')).toBeGreaterThan(0)
    expect(count(ps, 'basin')).toBe(1)
    expect(count(ps, 'tap')).toBe(2)
    expect(count(ps, 'steel')).toBe(2) // grill body and lid
    expect(count(ps, 'recess')).toBe(2)
  })

  test('the countertop sits on top of the stone, and the top is at the kitchen height', () => {
    const H = ftToM(3)
    const ps = parts(OUTDOOR_KITCHEN_DEFAULTS)
    const counters = ps.filter((p) => p.kind === 'counter')
    expect(Math.max(...counters.map((p) => hi(p, 1)))).toBeCloseTo(H, 9)
    expect(Math.min(...counters.map((p) => lo(p, 1)))).toBeCloseTo(H - TOP_T, 9)
  })

  test('the L adds a return leg: more stone and more countertop, and a longer front', () => {
    const straight = parts(OUTDOOR_KITCHEN_DEFAULTS)
    const L = parts({ ...OUTDOOR_KITCHEN_DEFAULTS, shape: 'L' })
    expect(count(L, 'stone')).toBeGreaterThan(count(straight, 'stone'))
    expect(count(L, 'counter')).toBeGreaterThan(0)
    const zMax = (ps: readonly OutdoorKitchenPart[]) => Math.max(...ps.filter((p) => p.kind === 'counter').map((p) => hi(p, 2)))
    expect(zMax(straight)).toBeCloseTo(ftToM(2.5 / 2) + OVERHANG, 6)
    expect(zMax(L)).toBeCloseTo(-ftToM(2.5 / 2) + ftToM(6) + OVERHANG, 6)
    expect(zMax(L)).toBeGreaterThan(zMax(straight))
  })

  test('every part stays in the expected bounding box (the end blocks bulge by BULGE only)', () => {
    for (const params of [OUTDOOR_KITCHEN_DEFAULTS, { ...OUTDOOR_KITCHEN_DEFAULTS, shape: 'L' }] as const) {
      const L = ftToM(params.w)
      const D = ftToM(params.d)
      const H = ftToM(params.h)
      const zFront = params.shape === 'L' ? -D / 2 + ftToM(params.ret) + OVERHANG : D / 2 + OVERHANG
      for (const p of parts(params)) {
        expect(lo(p, 0)).toBeGreaterThanOrEqual(-L / 2 - BULGE - 1e-9)
        expect(hi(p, 0)).toBeLessThanOrEqual(L / 2 + BULGE + 1e-9)
        expect(lo(p, 2)).toBeGreaterThanOrEqual(-D / 2 - BULGE - 1e-9)
        expect(hi(p, 2)).toBeLessThanOrEqual(zFront + BULGE + 1e-9)
        expect(lo(p, 1)).toBeGreaterThanOrEqual(-1e-9)
        expect(hi(p, 1)).toBeLessThanOrEqual(H + 0.3)
      }
    }
  })

  test('the sink sits a third of the way along from the west end, the grill a third from the east', () => {
    const L = ftToM(12)
    const ps = parts(OUTDOOR_KITCHEN_DEFAULTS)
    const basin = ps.find((p) => p.kind === 'basin')!
    const lid = ps.filter((p) => p.kind === 'steel').find((p) => p.size[1] < 0.03)!
    expect(basin.centre[0]).toBeCloseTo(-L / 6, 9)
    expect(lid.centre[0]).toBeCloseTo(L / 6, 9)
  })

  test('the stone is deterministic: the same params give identical parts', () => {
    expect(parts(OUTDOOR_KITCHEN_DEFAULTS)).toEqual(parts({ ...OUTDOOR_KITCHEN_DEFAULTS }))
    expect(parts({ ...OUTDOOR_KITCHEN_DEFAULTS, shape: 'L' })).toEqual(parts({ ...OUTDOOR_KITCHEN_DEFAULTS, shape: 'L' }))
  })

  test('a different size gives different stone', () => {
    expect(parts({ ...OUTDOOR_KITCHEN_DEFAULTS, w: 10 })).not.toEqual(parts(OUTDOOR_KITCHEN_DEFAULTS))
  })
})

describe('outdoor kitchen standZ (metres NAVD88)', () => {
  test('a finite standZ is the base: the kitchen stands at that elevation', () => {
    expect(outdoorKitchenBase({ standZ: 3.25 }, 9)).toBe(3.25)
    expect(outdoorKitchenBase({ standZ: 0 }, 9)).toBe(0)
  })

  test('without a finite standZ the kitchen follows the ground', () => {
    expect(outdoorKitchenBase({}, 9)).toBe(9)
    expect(outdoorKitchenBase({ standZ: null }, 9)).toBe(9)
    expect(outdoorKitchenBase({ standZ: Number.NaN }, 9)).toBe(9)
    expect(outdoorKitchenBase({ standZ: Number.POSITIVE_INFINITY }, 9)).toBe(9)
  })
})
