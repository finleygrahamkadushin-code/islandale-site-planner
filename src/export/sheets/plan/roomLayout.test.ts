import { describe, expect, test } from 'vitest'
import type { SheetPartition, SheetRoom } from '../types'
import { penSizes } from './planLayout'
import { lineCentres, partitionBand, placeRoomLabel, roomLines } from './roomLayout'

const pen = penSizes(0.25)
const room = (w: number, d: number, name = 'Bedroom'): SheetRoom => ({
  id: 1,
  name,
  type: 'Bedroom',
  porch: false,
  outline: [[0, 0], [w, 0], [w, d], [0, d]],
  net: [[0, 0], [w, 0], [w, d], [0, d]],
  netAreaSqFt: w * d,
  widthFt: w,
  depthFt: d,
  label: [w / 2, d / 2],
})

describe('room words', () => {
  test('a room big enough gets its name, size and area; a closet its name alone, a size down when even that is tight', () => {
    expect(roomLines(room(12, 10), pen).map((l) => l.text)).toEqual(['Bedroom', `12'-0" × 10'-0"`, '120 sq ft'])
    expect(roomLines(room(4, 1.2, 'Closet'), pen).map((l) => l.text)).toEqual(['Closet', '5 sq ft'])
    expect(roomLines(room(1.8, 0.7, 'Closet'), pen).map((l) => l.text)).toEqual(['Closet'])
    const tight = roomLines(room(1.5, 1, 'Linen and coats'), pen)
    expect(tight).toHaveLength(1)
    expect(tight[0].size).toBe(pen.tiny)
  })

  test('the lines are centred on the label point, top line first', () => {
    const lines = roomLines(room(12, 10), pen)
    const at = lineCentres([6, 5], lines)
    expect(at.every((p) => p[0] === 6)).toBe(true)
    expect(at[0][1]).toBeLessThan(at[1][1])
    // each line takes 1.25 of its own height, so the block's top and bottom sit evenly about the point
    const top = at[0][1] - lines[0].size * 0.625
    const bottom = at[2][1] + lines[2].size * 0.625
    expect((top + bottom) / 2).toBeCloseTo(5, 9)
  })

  test('words that would sit on a dimension move to the nearest clear spot inside the room', () => {
    const r = room(16, 12)
    const lines = roomLines(r, pen)
    expect(placeRoomLabel(r, lines, [])).toEqual([8, 6])
    const moved = placeRoomLabel(r, lines, [{ x0: 4, y0: 5, x1: 12, y1: 7 }])
    expect(moved).not.toEqual([8, 6])
    // clear of the figure, and inside the room
    expect(Math.abs(moved[1] - 6)).toBeGreaterThan(1)
    expect(moved[0]).toBeGreaterThan(0)
    expect(moved[0]).toBeLessThan(16)
  })
})

describe('partition bands', () => {
  const p: SheetPartition = { a: [0, 0], b: [10, 0], thicknessFt: 1 / 3, aAtWall: true, bAtWall: false }
  test('a band runs the partition end to end, its thickness across', () => {
    const band = partitionBand(p, 0, 0, 0)
    const want = [[0, 1 / 6], [10, 1 / 6], [10, -1 / 6], [0, -1 / 6]]
    band.forEach((q, i) => {
      expect(q[0]).toBeCloseTo(want[i][0], 9)
      expect(q[1]).toBeCloseTo(want[i][1], 9)
    })
  })
  test('runs on past an end and stops short of one, inset from its faces', () => {
    const band = partitionBand(p, 0.1, -0.05, 0.01)
    expect(band[0][0]).toBeCloseTo(-0.1, 9)
    expect(band[1][0]).toBeCloseTo(9.95, 9)
    expect(band[0][1]).toBeCloseTo(1 / 6 - 0.01, 9)
  })
})
