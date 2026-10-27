import { describe, expect, test } from 'vitest'
import { BANK_RUN_PER_RISE, cutCells, groundWithCuts, signedDistance, SINK_MARGIN_FT, type Cut } from './earthworks'
import type { Terrain } from './types'

const FT = 0.3048
// flat ground at 10 m over a 41 x 41 grid at 2 m, centred on the origin
const flat: Terrain = { lon0: 0, lat0: 0, spacing: 2, nx: 41, ny: 41, x0: -40, n0: -40, z: new Array(41 * 41).fill(10) }
const square = [[-4, -4], [4, -4], [4, 4], [-4, 4]] as const
const cut: Cut = { polys: [square], floor: 10 - 4 * FT }

describe('sunk floors', () => {
  test('signed distance is negative inside and positive outside', () => {
    expect(signedDistance([square], 0, 0)).toBeCloseTo(-4)
    expect(signedDistance([square], 6, 0)).toBeCloseTo(2)
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
