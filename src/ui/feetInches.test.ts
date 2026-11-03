import { describe, expect, test } from 'vitest'
import { formatFeetInches, parseFeetInches, readLength, snapInch } from './feetInches'

describe('feet and inches', () => {
  test.each([
    [`2' 9"`, 2.75],
    [`2'9`, 2.75],
    ['33in', 2.75],
    ['33"', 2.75],
    ['2.75', 2.75],
    [`2'`, 2],
    ['2 ft 9 in', 2.75],
    ['2-9', 2.75],
    ['  7 FT ', 7],
    [`6’ 8”`, 6 + 8 / 12],
    [`-2' 6"`, -2.5],
    ['-18 in', -1.5],
  ])('%s is %d ft', (text, ft) => {
    const r = parseFeetInches(text)
    expect('ft' in r && r.ft).toBeCloseTo(ft, 9)
  })

  test.each(['', 'wide', `2' 9" 3`, '--1'])('"%s" is rejected with a message', (text) => {
    const r = parseFeetInches(text)
    expect('error' in r && r.error.length).toBeGreaterThan(5)
  })

  test('formats to the inch', () => {
    expect(formatFeetInches(2.75)).toBe(`2' 9"`)
    expect(formatFeetInches(7)).toBe(`7'`)
    expect(formatFeetInches(0.5)).toBe(`6"`)
    expect(formatFeetInches(3.5 / 12)).toBe(`3.5"`)
    expect(snapInch(2.76)).toBeCloseTo(2.75, 9)
  })
})

describe('readLength', () => {
  test('checks min and max on the length snapped to the inch', () => {
    expect(readLength(`30' 0.4"`, 0, 30)).toEqual({ ft: 30 })
    expect(readLength(`2' 11.6"`, 3, 30)).toEqual({ ft: 3 })
    expect(readLength(`30' 1"`, 0, 30)).toEqual({ error: "At most 30'" })
    expect(readLength(`2' 11"`, 3, 30)).toEqual({ error: "At least 3'" })
    expect(readLength('12.3', 0, Infinity)).toEqual({ ft: snapInch(12.3) })
  })

  test('passes a parse error through', () => {
    expect(readLength('abc', 0, 30)).toEqual(parseFeetInches('abc'))
  })
})
