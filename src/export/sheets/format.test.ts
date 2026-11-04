import { describe, expect, test } from 'vitest'
import { formatArch, formatArea, formatDeg, formatInches } from './format'

describe('formatArch', () => {
  test.each([
    [12.5, `12'-6"`],
    [12.5 + 0.25 / 12, `12'-6 1/4"`],
    [9.5 / 12, `0'-9 1/2"`],
    [0, `0'-0"`],
    [10 + 0.25 / 12, `10'-0 1/4"`],
    [11.999, `12'-0"`],
    [-2, `−2'-0"`],
    [-0.001, `0'-0"`],
    [3 + 11.75 / 12, `3'-11 3/4"`],
  ])('%s ft reads %s', (ft, text) => {
    expect(formatArch(ft)).toBe(text)
  })

  test('rounds to the nearest quarter inch', () => {
    expect(formatArch(1 + 0.12 / 12)).toBe(`1'-0"`)
    expect(formatArch(1 + 0.13 / 12)).toBe(`1'-0 1/4"`)
  })
})

describe('formatInches, formatArea and formatDeg', () => {
  test('inches with quarter fractions', () => {
    expect(formatInches(7.25)).toBe(`7 1/4"`)
    expect(formatInches(0.5)).toBe(`1/2"`)
    expect(formatInches(11)).toBe(`11"`)
    expect(formatInches(-1.75)).toBe(`−1 3/4"`)
  })

  test('area in whole square feet', () => {
    expect(formatArea(312.4)).toBe('312 sq ft')
    expect(formatArea(1204)).toBe('1,204 sq ft')
  })

  test('whole degrees', () => {
    expect(formatDeg(47.3)).toBe('47°')
    expect(formatDeg(89.99)).toBe('90°')
  })

  test('a value that is not a number reads as a dash', () => {
    expect(formatArch(NaN)).toBe('—')
    expect(formatInches(Infinity)).toBe('—')
  })
})
