import { describe, expect, test } from 'vitest'
import { boxCorners, boxesOverlap, wordsBox, type Box } from './textBoxes'

const box = (x: number, y: number, halfAlong: number, halfAcross: number, deg = 0): Box => {
  const a = (deg * Math.PI) / 180
  return { c: [x, y], along: [Math.cos(a), Math.sin(a)], halfAlong, halfAcross }
}

describe('boxes on the sheet', () => {
  test('two boxes side by side overlap only when they reach each other', () => {
    expect(boxesOverlap(box(0, 0, 2, 1), box(3.9, 0, 2, 1))).toBe(true)
    expect(boxesOverlap(box(0, 0, 2, 1), box(4.1, 0, 2, 1))).toBe(false)
    expect(boxesOverlap(box(0, 0, 2, 1), box(0, 2.1, 2, 1))).toBe(false)
  })

  test('a turned box is tested along its own sides, not its bounding square', () => {
    // a long thin box on the diagonal passes the corner of a square its bounding box would cover
    expect(boxesOverlap(box(0, 0, 5, 0.2, 45), box(3, -3, 1, 1))).toBe(false)
    expect(boxesOverlap(box(0, 0, 5, 0.2, 45), box(3, 3, 1, 1))).toBe(true)
  })

  test("words take a box as wide as their letters and as tall as their size, turned with them", () => {
    const b = wordsBox([10, 5], 90, `8'-9 1/4"`, 2)
    expect(b.halfAcross).toBeCloseTo(1, 9)
    expect(b.halfAlong).toBeCloseTo((9 * 0.55 * 2) / 2, 9)
    const ys = boxCorners(b).map((p) => p[1])
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(9 * 0.55 * 2, 9)
  })
})
