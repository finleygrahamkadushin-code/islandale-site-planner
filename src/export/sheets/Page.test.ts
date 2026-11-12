import { describe, expect, test } from 'vitest'
import { scaleBarMarks } from './Page'
import { isSiteScale, scaleLabel } from './types'

describe('scale bar and label', () => {
  test('building scales keep their marks; site scales run to 80 ft', () => {
    expect(scaleBarMarks(0.5)).toEqual([0, 2, 4, 8])
    expect(scaleBarMarks(0.25)).toEqual([0, 4, 8, 16])
    expect(scaleBarMarks(0.125)).toEqual([0, 4, 8, 16])
    expect(scaleBarMarks(0.09375)).toEqual([0, 8, 16, 32])
    expect(scaleBarMarks(0.05)).toEqual([0, 10, 20, 40, 80])
    expect(scaleBarMarks(0.0625)).toEqual([0, 10, 20, 40, 80])
  })

  test('a sheet is the site plan’s by its scale set, not by a threshold', () => {
    expect(isSiteScale(0.05)).toBe(true)
    expect(isSiteScale(0.0625)).toBe(true)
    expect(isSiteScale(0.125)).toBe(false)
    expect(isSiteScale(0.25)).toBe(false)
    expect(isSiteScale(0.1)).toBe(false)
  })

  test('labels read as an architect writes them', () => {
    expect(scaleLabel(0.25)).toBe('1/4" = 1\'-0"')
    expect(scaleLabel(0.05)).toBe('1" = 20\'-0"')
    expect(scaleLabel(0.0625)).toBe('1/16" = 1\'-0"')
  })
})
