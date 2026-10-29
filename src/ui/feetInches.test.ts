import { describe, expect, test } from 'vitest'
import { formatFeetInches, parseFeetInches, snapInch } from './feetInches'

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
