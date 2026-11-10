import { describe, expect, test } from 'vitest'
import { NUM_FIELD_LIMIT, readNumber } from './numInput'
import { HEIGHT_LIMIT_FT, PLACE_LIMIT_FT, SIZE_LIMIT_FT } from './numInput'

describe('readNumber (R6.1)', () => {
  test('a number in range is taken', () => {
    expect(readNumber('24', { min: 1, max: SIZE_LIMIT_FT, unit: 'ft' })).toEqual({ value: 24 })
    expect(readNumber(' -12.5 ', { unit: 'ft' })).toEqual({ value: -12.5 })
  })

  test('a width no cabin on the lot could have is refused, with a message', () => {
    expect(readNumber('99999', { min: 1, max: SIZE_LIMIT_FT, unit: 'ft' })).toEqual({ error: `At most ${SIZE_LIMIT_FT} ft` })
  })

  test('below the minimum is refused with a message, not silently', () => {
    expect(readNumber('0', { min: 1, unit: 'ft' })).toEqual({ error: 'At least 1 ft' })
  })

  test('with no bounds given, the field still refuses absurd numbers', () => {
    expect(readNumber('1e300', { unit: 'ft' })).toEqual({ error: `At most ${NUM_FIELD_LIMIT.toLocaleString('en-US')} ft` })
    expect(readNumber('-1e300', { unit: 'ft' })).toEqual({ error: `At least -${NUM_FIELD_LIMIT.toLocaleString('en-US')} ft` })
  })

  test('text that is not a number is refused with a message', () => {
    expect(readNumber('wide', { unit: 'ft' })).toEqual({ error: 'Enter a number' })
    expect(readNumber('', { unit: 'ft' })).toEqual({ error: 'Enter a number' })
    expect(readNumber('Infinity', { unit: 'ft' })).toEqual({ error: 'Enter a number' })
  })

  test('degrees read without a space', () => {
    expect(readNumber('400', { min: -360, max: 360, unit: '°' })).toEqual({ error: 'At most 360°' })
  })

  test('the limits are past anything on a half-acre lot, and still finite', () => {
    // the lot is about 214 ft by 196 ft; its diagonal is about 290 ft
    expect(SIZE_LIMIT_FT).toBeGreaterThan(290)
    expect(PLACE_LIMIT_FT).toBeGreaterThan(400)
    expect(HEIGHT_LIMIT_FT).toBeGreaterThan(250) // the tallest trees
  })
})
