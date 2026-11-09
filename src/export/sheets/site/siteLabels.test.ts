import { describe, expect, test } from 'vitest'
import type { Pt } from '../svgDims'
import { LabelPlacer, labelBox, labelsAlong, labelWidth, polysOverlap } from './siteLabels'

describe('labelWidth', () => {
  test('wider for longer and bold text, figures narrower than capitals', () => {
    expect(labelWidth('ABCD', 1)).toBeGreaterThan(labelWidth('ABC', 1))
    expect(labelWidth('ABC', 1, true)).toBeGreaterThan(labelWidth('ABC', 1))
    expect(labelWidth('1234', 1)).toBeLessThan(labelWidth('ABCD', 1))
    expect(labelWidth('ABC', 2)).toBeCloseTo(labelWidth('ABC', 1) * 2)
  })
})

describe('labelBox and polysOverlap', () => {
  test('a turned box has its corners where the turn puts them, and overlap is found', () => {
    const box = labelBox({ text: 'AB', at: [0, 0], angleDeg: 90, size: 1 }, 0)
    const xs = box.map((p) => p[0])
    // turned upright, the box is taller than it is wide
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1)
    const square: Pt[] = [
      [-0.1, -0.1],
      [0.1, -0.1],
      [0.1, 0.1],
      [-0.1, 0.1],
    ]
    expect(polysOverlap(box, square)).toBe(true)
    expect(polysOverlap(box, square.map(([x, y]) => [x + 10, y]))).toBe(false)
  })
})

describe('LabelPlacer', () => {
  test('keeps a second label off the first and off obstacles, but not off its own shape', () => {
    const own: Pt[] = [
      [-5, -5],
      [5, -5],
      [5, 5],
      [-5, 5],
    ]
    const p = new LabelPlacer([own], 0)
    const l = { text: 'NAME', at: [0, 0] as Pt, angleDeg: 0, size: 1 }
    expect(p.fits(l)).toBe(false)
    expect(p.fits(l, own)).toBe(true)
    p.take(l)
    expect(p.fits(l, own)).toBe(false)
    expect(p.place([l, { ...l, at: [20, 0] }])?.at).toEqual([20, 0])
  })
})

describe('labelsAlong', () => {
  const line: Pt[] = Array.from({ length: 101 }, (_, i) => [i, (i % 2) * 0.05])

  test('repeats along a straight line, set along it and upright, through small zig-zags', () => {
    const got = labelsAlong(line, 'LINE', new LabelPlacer([], 0), { size: 1, every: 30 })
    expect(got.length).toBeGreaterThanOrEqual(3)
    for (const l of got) expect(Math.abs(l.angleDeg)).toBeLessThan(1)
  })

  test('drawn right to left it still reads left to right, offset to the same side', () => {
    const back = [...line].reverse()
    const a = labelsAlong(line, 'LINE', new LabelPlacer([], 0), { size: 1, every: 200, offset: 1 })[0]
    const b = labelsAlong(back, 'LINE', new LabelPlacer([], 0), { size: 1, every: 200, offset: 1 })[0]
    expect(Math.abs(b.angleDeg)).toBeLessThan(1)
    expect(Math.sign(a.at[1])).toBe(Math.sign(b.at[1]))
  })

  test('skips a sharp bend and steps round an obstacle, trying the other side', () => {
    // each leg shorter than the label, so any place on it straddles the corner
    const bend: Pt[] = [
      [0, 0],
      [5, 0],
      [5, 5],
    ]
    expect(labelsAlong(bend, 'LONG LABEL', new LabelPlacer([], 0), { size: 1, every: 5 })).toHaveLength(0)
    const block: Pt[] = [
      [0, 0.2],
      [100, 0.2],
      [100, 5],
      [0, 5],
    ]
    const got = labelsAlong(line, 'LINE', new LabelPlacer([block], 0), { size: 1, every: 30, offset: -1.2 })
    expect(got.length).toBeGreaterThan(0)
    // asked for the block's side (y down the sheet), each label went to the open side instead
    for (const l of got) expect(l.at[1]).toBeLessThan(-0.5)
  })
})
