import { describe, expect, test } from 'vitest'
import { largestScaleThatFits, pageFeet, smallestPaper, tileDrawing } from './tiles'
import { MARGIN_IN, PAPERS, SCALE_LABEL, TITLE_IN, type PaperId, type Scale, type Tile } from './types'

const area = (ts: readonly Tile[]) => ts.reduce((s, t) => s + t.w * t.h, 0)

describe('pageFeet', () => {
  test('is the paper less margins and title strip, over the scale', () => {
    const p = pageFeet('tabloid', 0.25)
    expect(p.w).toBeCloseTo((PAPERS.tabloid.w - 2 * MARGIN_IN) / 0.25)
    expect(p.h).toBeCloseTo((PAPERS.tabloid.h - 2 * MARGIN_IN - TITLE_IN) / 0.25)
  })
})

describe('tileDrawing', () => {
  test('a drawing that fits is one tile, A1, the whole drawing', () => {
    const t = tileDrawing(30, 20, 'archD', 0.25)
    expect(t).toEqual([{ row: 0, col: 0, label: 'A1', x: 0, y: 0, w: 30, h: 20 }])
  })

  const cases: [number, number, PaperId, Scale][] = [
    [63, 68, 'letter', 0.25],
    [63, 68, 'tabloid', 0.5],
    [100, 9, 'letter', 0.125],
    [40, 28.4, 'letter', 0.25],
  ]
  test.each(cases)('%s × %s ft on %s at %s covers the drawing exactly, a page at most per tile', (w, h, paper, scale) => {
    const page = pageFeet(paper, scale)
    const tiles = tileDrawing(w, h, paper, scale)
    expect(area(tiles)).toBeCloseTo(w * h, 6)
    for (const t of tiles) {
      expect(t.w).toBeLessThanOrEqual(page.w + 1e-9)
      expect(t.h).toBeLessThanOrEqual(page.h + 1e-9)
      expect(t.w).toBeGreaterThan(0)
      expect(t.x + t.w).toBeLessThanOrEqual(w + 1e-9)
      expect(t.y + t.h).toBeLessThanOrEqual(h + 1e-9)
    }
    // no overlaps: tiles of a grid meet edge to edge
    const xs = new Set(tiles.map((t) => t.x))
    const ys = new Set(tiles.map((t) => t.y))
    expect(tiles.length).toBe(xs.size * ys.size)
  })

  test('a grid is row-major, rows lettered and columns numbered', () => {
    const page = pageFeet('letter', 0.25)
    const tiles = tileDrawing(page.w * 2.5, page.h * 1.5, 'letter', 0.25)
    expect(tiles.map((t) => t.label)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3'])
    expect(tiles[4]).toMatchObject({ row: 1, col: 1, x: page.w, y: page.h })
    expect(tiles[5].w).toBeCloseTo(page.w / 2)
  })
})

describe('smallestPaper', () => {
  test('is the first paper, smallest first, that holds the drawing on one page', () => {
    const tabloid = pageFeet('tabloid', 0.25)
    expect(smallestPaper(tabloid.w - 1, tabloid.h - 1, 0.25)).toBe('tabloid')
    expect(smallestPaper(tabloid.w + 1, tabloid.h - 1, 0.25)).toBe('archC')
    expect(smallestPaper(1, 1, 0.25)).toBe('letter')
  })

  test('is null when even the largest paper needs more than one page', () => {
    const d = pageFeet('archD', 0.5)
    expect(smallestPaper(d.w + 1, 1, 0.5)).toBeNull()
  })
})

describe('site scales', () => {
  test('a Tabloid page holds 320 × 182 ft of ground at 1" = 20\'', () => {
    const page = pageFeet('tabloid', 0.05)
    expect(page.w).toBeCloseTo(320)
    expect(page.h).toBeCloseTo(182)
  })

  test('a drawing a hair taller than the page tiles to two rows at 1/16" = 1\'-0"', () => {
    const page = pageFeet('tabloid', 0.0625)
    expect(tileDrawing(page.w - 1, page.h + 1, 'tabloid', 0.0625).map((t) => t.label)).toEqual(['A1', 'B1'])
  })
})

describe('largestScaleThatFits', () => {
  const SCALES: readonly Scale[] = [0.125, 0.25, 0.5]
  /** A plan of a fixed size in feet, whatever the scale. */
  const fixed = (w: number, h: number) => () => [{ w, h }]

  test('picks the largest scale at which every drawing fits one page', () => {
    // tabloid holds 64 × 36.4 ft at 1/4", 32 × 18.2 ft at 1/2", 128 × 72.8 ft at 1/8"
    expect(largestScaleThatFits(SCALES, 'tabloid', fixed(30, 18))).toBe(0.5)
    expect(largestScaleThatFits(SCALES, 'tabloid', fixed(60, 30))).toBe(0.25)
    expect(largestScaleThatFits(SCALES, 'tabloid', fixed(100, 50))).toBe(0.125)
  })

  test('needs every drawing to fit, not just one', () => {
    expect(largestScaleThatFits(SCALES, 'tabloid', () => [{ w: 30, h: 18 }, { w: 60, h: 30 }])).toBe(0.25)
  })

  test('takes the drawing size at each scale, as dimension strings take more feet at a smaller scale', () => {
    // 30 × 18 ft of building plus 2 in of paper for dimensions all round
    const withDims = (s: Scale) => [{ w: 30 + 4 / s / 12, h: 18 + 4 / s / 12 }]
    expect(largestScaleThatFits(SCALES, 'tabloid', withDims)).toBe(0.25)
  })

  test('falls back to the smallest scale when nothing fits, and to it with nothing to draw', () => {
    expect(largestScaleThatFits(SCALES, 'letter', fixed(500, 500))).toBe(0.125)
    expect(largestScaleThatFits(SCALES, 'tabloid', () => [])).toBe(0.5)
  })

  test('the Gathering prow (Scheme C), 83 × 101 ft with its dimensions, opens whole on Tabloid at 1/16" and at 1/8" on Arch C', () => {
    const all = Object.keys(SCALE_LABEL).map(Number) as Scale[]
    expect(largestScaleThatFits(all, 'tabloid', fixed(83, 101))).toBe(0.0625)
    expect(largestScaleThatFits(all, 'archC', fixed(83, 101))).toBe(0.125)
  })

  test('a bigger paper never gets a smaller scale', () => {
    const plan = fixed(70, 40)
    const order: PaperId[] = ['letter', 'tabloid', 'archC', 'archD']
    const picked = order.map((p) => largestScaleThatFits(SCALES, p, plan))
    expect(picked).toEqual([...picked].sort((a, b) => a - b))
  })
})
