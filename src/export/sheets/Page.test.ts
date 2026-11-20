import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { Page, scaleBarMarks } from './Page'
import { TipProvider } from '../../guide/Tip'
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

describe('title strip', () => {
  const info = { paper: 'tabloid', scale: 0.0625, planName: 'Plan', buildingName: 'Gathering prow', sheetTitle: 'Measurements' } as const
  const strip = (notToScale?: boolean) => renderToStaticMarkup(createElement(TipProvider, null, createElement(Page, { ...info, notToScale, children: null })))

  test('a drawing page names its scale and draws the scale bar beside the 1 inch check', () => {
    const html = strip()
    expect(html).toContain('Scale 1/16')
    expect(html).toContain('sheet-scalebar')
    expect(html).toContain('sheet-inch-bar')
    expect(html).not.toContain('Not to scale')
  })

  test('a page of tables says Not to scale and leaves the scale bar off, keeping the 1 inch check', () => {
    const html = strip(true)
    expect(html).toContain('Not to scale')
    expect(html).not.toContain('Scale 1/16')
    expect(html).not.toContain('sheet-scalebar')
    expect(html).toContain('sheet-inch-bar')
  })
})
