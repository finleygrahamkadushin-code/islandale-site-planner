import { describe, expect, test } from 'vitest'
import { placeMenu } from './menuPlace'

const AREA = { left: 0, top: 50, right: 1000, bottom: 800 }

describe('placeMenu (legacy placePop)', () => {
  test('beside the chip on the right, centred on it, when there is room', () => {
    expect(placeMenu(400, 300, 134, 174, AREA)).toEqual({ left: 416, top: 213 })
  })

  test('flipped to the left of the chip when it would cross the right edge of the open view', () => {
    expect(placeMenu(957, 474, 134, 174, AREA)).toEqual({ left: 957 - 16 - 134, top: 387 })
  })

  test('kept inside the open view at the top, bottom and left', () => {
    expect(placeMenu(400, 60, 134, 174, AREA).top).toBe(56)
    expect(placeMenu(400, 790, 134, 174, AREA).top).toBe(800 - 174 - 6)
    expect(placeMenu(100, 300, 990, 100, AREA).left).toBe(6)
  })
})
