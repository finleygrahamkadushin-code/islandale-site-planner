import { describe, expect, it } from 'vitest'
import { FADE_FAR_M, FADE_NEAR_M, farOpacity, labelRank, placeLabels, type LabelBox } from './labelPlacement'

const box = (id: string, x: number, y: number, rank: 0 | 1 | 2, distance = 50, w = 80, h = 18): LabelBox => ({ id, x, y, w, h, rank, distance })

describe('labelRank', () => {
  it('ranks the selection first, then buildings, then everything else', () => {
    expect(labelRank('house', true)).toBe(0)
    expect(labelRank('tree', true)).toBe(0)
    expect(labelRank('house', false)).toBe(1)
    expect(labelRank('shed', false)).toBe(1)
    expect(labelRank('shop', false)).toBe(1)
    expect(labelRank('tree', false)).toBe(2)
    expect(labelRank('pad', false)).toBe(2)
    expect(labelRank('deck', false)).toBe(2)
  })
})

describe('farOpacity', () => {
  it('keeps the selection and buildings at full strength however far', () => {
    expect(farOpacity(FADE_FAR_M * 3, 0)).toBe(1)
    expect(farOpacity(FADE_FAR_M * 3, 1)).toBe(1)
  })

  it('fades the rest from full near to nothing far', () => {
    expect(farOpacity(FADE_NEAR_M - 1, 2)).toBe(1)
    expect(farOpacity((FADE_NEAR_M + FADE_FAR_M) / 2, 2)).toBeCloseTo(0.5, 6)
    expect(farOpacity(FADE_FAR_M, 2)).toBe(0)
    expect(farOpacity(FADE_FAR_M + 10, 2)).toBe(0)
  })
})

describe('placeLabels', () => {
  it('shows labels that do not touch', () => {
    const shown = placeLabels([box('a', 100, 100, 2), box('b', 300, 100, 2), box('c', 100, 300, 2)])
    expect([...shown.keys()].sort()).toEqual(['a', 'b', 'c'])
  })

  it('drops the lower-ranked of two overlapping labels: the selection beats a building, a building beats a tree', () => {
    const shown = placeLabels([box('tree', 100, 100, 2), box('cabin', 110, 105, 1), box('picked', 120, 95, 0)])
    expect([...shown.keys()]).toEqual(['picked'])
    expect([...placeLabels([box('tree', 100, 100, 2), box('cabin', 110, 105, 1)]).keys()]).toEqual(['cabin'])
  })

  it('keeps the nearer of two equal-ranked labels that overlap', () => {
    const shown = placeLabels([box('far', 100, 100, 1, 90), box('near', 105, 100, 1, 40)])
    expect([...shown.keys()]).toEqual(['near'])
  })

  it('measures from the anchor at the bottom middle, as the labels hang above their objects', () => {
    // side by side, 80 wide each, centres 84 apart: clear of each other
    expect(placeLabels([box('a', 100, 100, 2), box('b', 184, 100, 2)]).size).toBe(2)
    // one exactly above the other, 18 high: clear; 10 apart: overlapping
    expect(placeLabels([box('a', 100, 100, 2), box('b', 100, 80, 2)]).size).toBe(2)
    expect(placeLabels([box('a', 100, 100, 2), box('b', 100, 90, 2)]).size).toBe(1)
  })

  it('gives each shown label its far fade, and hides one faded to nothing so it takes no room', () => {
    const shown = placeLabels([box('gone', 100, 100, 2, FADE_FAR_M + 5), box('tree', 104, 100, 2, (FADE_NEAR_M + FADE_FAR_M) / 2, 80, 18)])
    expect(shown.has('gone')).toBe(false)
    expect(shown.get('tree')).toBeCloseTo(0.5, 6)
  })

  it('always shows the selection, even over another selected label', () => {
    const shown = placeLabels([box('a', 100, 100, 0), box('b', 102, 100, 0)])
    expect(shown.size).toBe(2)
  })
})
