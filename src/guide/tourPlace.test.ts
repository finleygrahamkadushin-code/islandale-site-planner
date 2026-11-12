import { describe, expect, it } from 'vitest'
import { clearSpot, type Box } from './tourPlace'

const AREA: Box = { left: 100, top: 80, right: 1100, bottom: 780 }
const CARD = { width: 300, height: 160 }
const MARGIN = 16

describe('clearSpot', () => {
  it('puts the card in the top-left corner of the free area when nothing is in the way', () => {
    expect(clearSpot(AREA, CARD, [])).toEqual({ left: AREA.left + MARGIN, top: AREA.top + MARGIN })
  })

  it('moves to a corner the buildings do not cover', () => {
    // buildings in the middle and the top-left of the view
    const buildings: Box[] = [
      { left: 120, top: 90, right: 420, bottom: 260 },
      { left: 450, top: 300, right: 750, bottom: 500 },
    ]
    const spot = clearSpot(AREA, CARD, buildings)
    const card = { left: spot.left, top: spot.top, right: spot.left + CARD.width, bottom: spot.top + CARD.height }
    for (const b of buildings) expect(card.right <= b.left || card.left >= b.right || card.bottom <= b.top || card.top >= b.bottom).toBe(true)
  })

  it('picks the corner with the least covered area when every corner has something', () => {
    const smallTopRight: Box = { left: 1000, top: 100, right: 1010, bottom: 110 }
    const bigElsewhere: Box[] = [
      { left: 100, top: 80, right: 500, bottom: 300 },
      { left: 100, top: 560, right: 500, bottom: 780 },
      { left: 700, top: 560, right: 1100, bottom: 780 },
    ]
    expect(clearSpot(AREA, CARD, [smallTopRight, ...bigElsewhere])).toEqual({ left: AREA.right - MARGIN - CARD.width, top: AREA.top + MARGIN })
  })

  it('stays inside a free area smaller than the card, from its top-left', () => {
    expect(clearSpot({ left: 10, top: 10, right: 200, bottom: 100 }, CARD, [])).toEqual({ left: 10, top: 10 })
  })
})
