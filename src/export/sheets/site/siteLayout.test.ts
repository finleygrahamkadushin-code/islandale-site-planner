import { describe, expect, test } from 'vitest'
import { DEFAULT_SETBACKS } from '../../../store/types'
import { siteLayout, sitePens, turnModel } from './siteLayout'
import { siteSheetModel } from './siteModel'
import { modelInputFor, planOf } from './siteTestKit'

const model = siteSheetModel(modelInputFor(planOf('C')))

describe('site layout · Scheme C', () => {
  test('at 1" = 20\' on Tabloid, turned to fit: one page, the notes beside the drawing', () => {
    const l = siteLayout(model, 'tabloid', 0.05, false)
    expect(l.mode).toBe('beside')
    expect(l.pages).toBe(1)
    expect(l.extent.w * 0.05).toBeLessThan(17 - 1 - 4.1 - 0.25)
    expect(l.extent.h * 0.05).toBeLessThan(11 - 1 - 0.9)
    expect(Math.abs(l.frame.northDeg)).toBeGreaterThan(10)
  })

  test('at 1/16" = 1\'-0" on Tabloid the drawing fills the page and the notes take a second', () => {
    const l = siteLayout(model, 'tabloid', 0.0625, false)
    expect(l.mode).toBe('notesPage')
    expect(l.pages).toBe(2)
    expect(l.onePagePaper).toBe('archC')
  })

  test('north up at 1" = 20\' on Tabloid tiles, and names the paper that holds it on one page', () => {
    const l = siteLayout(model, 'tabloid', 0.05, true)
    expect(l.frame.northDeg === 0 || Object.is(l.frame.northDeg, -0)).toBe(true)
    expect(l.mode).toBe('tiled')
    expect(l.drawingPages).toBe(2)
    expect(l.pages).toBe(3)
    expect(l.onePagePaper).toBe('archC')
  })

  test('the turned model keeps the rule: a band read on the sheet is the band read on the site', () => {
    const l = siteLayout(model, 'tabloid', 0.05, false)
    const turned = turnModel(model, l.frame)
    // points off every boundary, where the turn's rounding can't move them across one
    const mid = model.ring.reduce((acc, p) => [acc[0] + p[0] / model.ring.length, acc[1] + p[1] / model.ring.length] as const, [0, 0] as const)
    const s = model.shoreline[40]
    const len = Math.hypot(mid[0] - s[0], mid[1] - s[1])
    const nearShore = [s[0] + ((mid[0] - s[0]) / len) * 4, s[1] + ((mid[1] - s[1]) / len) * 4] as const
    for (const p of [model.buildings[0].label, mid, nearShore, [model.bounds.minx - 30, model.bounds.miny - 30] as const]) {
      expect(turned.bandAt(l.frame.toSheet(p))).toBe(model.bandAt(p))
    }
    expect(turned.ring[10][0]).toBeCloseTo(l.frame.toSheet(model.ring[10])[0])
  })

  test('pens are printed sizes: a 1 pt line is 1/72 in at the scale', () => {
    const p = sitePens(0.05)
    expect(p.medium * 0.05 * 72).toBeCloseTo(0.6)
    expect(p.hatchShore * 0.05).toBeCloseTo(0.095)
  })

  test('the setbacks change the model, not the frame', () => {
    const wide = siteSheetModel(modelInputFor(planOf('C'), { ...DEFAULT_SETBACKS, shoreFt: 50 }))
    expect(siteLayout(wide, 'tabloid', 0.05, false).frame.turnDeg).toBe(siteLayout(model, 'tabloid', 0.05, false).frame.turnDeg)
  })
})
