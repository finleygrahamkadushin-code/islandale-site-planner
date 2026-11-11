import { describe, expect, test } from 'vitest'
import { formatFeetInches, formatLengthField, parseFeetInches, readLength, snapInch, snapQuarterInch } from './feetInches'

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
  test('checks min and max on the length snapped to the quarter inch', () => {
    expect(readLength(`30' 0.1"`, 0, 30)).toEqual({ ft: 30 })
    expect(readLength(`2' 11.9"`, 3, 30)).toEqual({ ft: 3 })
    expect(readLength(`30' 1/4"`, 0, 30)).toEqual({ error: "At most 30'" })
    expect(readLength(`2' 11 3/4"`, 3, 30)).toEqual({ error: "At least 3'" })
    expect(readLength('12.3', 0, Infinity)).toEqual({ ft: snapQuarterInch(12.3) })
  })

  test('passes a parse error through', () => {
    expect(readLength('abc', 0, 30)).toEqual(parseFeetInches('abc'))
  })
})

describe('quarter inches and fractions (R6.2)', () => {
  test.each([
    [`1/2"`, 0.5 / 12],
    [`9 1/2"`, 9.5 / 12],
    [`2' 9 1/2"`, 2 + 9.5 / 12],
    [`2'-9 1/2"`, 2 + 9.5 / 12],
    [`2' 9-1/2"`, 2 + 9.5 / 12],
    [`2' 3/4"`, 2 + 0.75 / 12],
    [`2 1/2'`, 2.5],
    ['5 ft. 6 in.', 5.5],
    ['5ft 6in', 5.5],
    [`3.5"`, 3.5 / 12],
    [`-1/4"`, -0.25 / 12],
  ])('%s is read', (text, ft) => {
    const r = parseFeetInches(text)
    expect('ft' in r && r.ft).toBeCloseTo(ft, 9)
  })

  test.each([`1/0"`, '9'.repeat(400), `2' 1//2"`, '1/2/3'])('"%s" is refused with a message', (text) => {
    const r = parseFeetInches(text)
    expect('error' in r && r.error.length).toBeGreaterThan(5)
  })

  test('the field keeps the quarter inch it shows', () => {
    expect(readLength(`3.5"`, 0, 30)).toEqual({ ft: 3.5 / 12 })
    expect(readLength(`2' 9 1/2"`, 0, 30)).toEqual({ ft: 2 + 9.5 / 12 })
    expect(readLength(`2' 9.3"`, 0, 30)).toEqual({ ft: 2 + 9.25 / 12 })
  })

  test('the field shows quarter inches as fractions, at any length', () => {
    expect(formatLengthField(2 + 9.5 / 12)).toBe(`2' 9 1/2"`)
    expect(formatLengthField(3.25 / 12)).toBe(`3 1/4"`)
    expect(formatLengthField(0.75 / 12)).toBe(`3/4"`)
    expect(formatLengthField(7)).toBe(`7'`)
    expect(formatLengthField(-2.5)).toBe(`-2' 6"`)
    expect(formatLengthField(0)).toBe(`0"`)
  })

  test('what the field shows reads back as the same length', () => {
    for (const ft of [0, 0.02, 0.5, 2.7917, 3.1, 12.345, -4.6, 29.99]) {
      const shown = formatLengthField(ft)
      const back = readLength(shown, -100, 100)
      expect('ft' in back && formatLengthField(back.ft), shown).toBe(shown)
    }
  })

  test('the formatter never shows NaN or a minus zero', () => {
    expect(formatFeetInches(NaN)).toBe('—')
    expect(formatFeetInches(Infinity)).toBe('—')
    expect(formatFeetInches(-0.001)).toBe(`0"`)
    expect(formatLengthField(NaN)).toBe('—')
    expect(formatLengthField(-0.001)).toBe(`0"`)
  })
})
