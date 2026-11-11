import { describe, expect, test } from 'vitest'
import * as G from '../geom'
import { roomLabel } from './labelFit'

const details = ["10'-0\" × 12'-0\"", '120 sf']

describe('room labels on the plan', () => {
  test('a roomy room shows its name, size and area at the full font', () => {
    expect(roomLabel(G.rectPoly(0, 0, 10, 12), [0, 0], 20, 10, 'Bedroom', details)).toEqual({ lines: ['Bedroom', ...details], fs: 12 })
  })

  test('a closet keeps its name and drops the size lines before shrinking', () => {
    const l = roomLabel(G.rectPoly(0, 0, 4, 2.5), [0, 0], 20, 2.5, 'Closet', details)
    expect(l?.lines).toEqual(['Closet'])
  })

  test('a long name in a small room shrinks to fit, then is left off rather than spill into the next room', () => {
    const narrow = G.rectPoly(0, 0, 3, 3)
    const l = roomLabel(narrow, [0, 0], 20, 3, 'Linen', [])
    expect(l).not.toBeNull()
    expect(l!.fs * 0.6 * 5).toBeLessThanOrEqual(3 * 20 - 8)
    expect(roomLabel(narrow, [0, 0], 20, 3, 'Mechanical and storage', [])).toBeNull()
  })

  test('two small rooms side by side: each label stays inside its own room, so they cannot overlap', () => {
    const S = 15
    for (const [x, name] of [[-2, 'Bath 2'], [2, 'Laundry']] as const) {
      const l = roomLabel(G.rectPoly(x, 0, 4, 8), [x, 0], S, 4, name, details)
      if (l) expect(Math.max(...l.lines.map((t) => t.length * 0.6 * l.fs))).toBeLessThanOrEqual(4 * S)
    }
  })

  test('the width that counts is the room across the label point, not its widest part', () => {
    // an L: wide at the bottom, 2 ft wide where the label sits in the upright
    const L: G.Pt[] = [[0, 0], [12, 0], [12, 2], [2, 2], [2, 12], [0, 12]]
    expect(roomLabel(L, [1, 8], 20, 2, 'Pantry corridor', [])).toBeNull()
    expect(roomLabel(L, [6, 1], 20, 2, 'Pantry', [])).not.toBeNull()
  })
})
