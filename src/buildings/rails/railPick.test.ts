import { describe, expect, test } from 'vitest'
import { wingMass } from '../masses'
import { railEdgeAt } from './railPick'

describe('railEdgeAt: which rail a click picked', () => {
  // a 10 × 6 ft deck: edge 0 back (z −3), 1 right (x +5), 2 front (z +3), 3 left (x −5)
  const deck = wingMass({ kind: 'deck', w: 10, d: 6 })

  test('the listed edge nearest the clicked point', () => {
    expect(railEdgeAt(deck, [0, 1, 2, 3], [4.9, 0])).toBe(1)
    expect(railEdgeAt(deck, [0, 1, 2, 3], [0, 3.1])).toBe(2)
    expect(railEdgeAt(deck, [0, 1, 2, 3], [-5, -1])).toBe(3)
  })

  test('only edges that carry a rail count', () => {
    expect(railEdgeAt(deck, [0, 2], [4.9, 0.5])).toBe(2)
  })

  test("a stair handrail lists its one side; nothing listed, nothing picked", () => {
    expect(railEdgeAt(wingMass({ kind: 'stair', w: 4, d: 4 }), [3], [0, 0])).toBe(3)
    expect(railEdgeAt(deck, [], [0, 0])).toBeNull()
  })
})
