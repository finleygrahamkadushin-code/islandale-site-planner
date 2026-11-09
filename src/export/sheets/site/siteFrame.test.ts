import { describe, expect, test } from 'vitest'
import { boxOf } from './siteGeom'
import { bestTurn, drawingExtent, frameAt, siteFrame } from './siteFrame'
import { toFt } from './siteObjects'
import { SITE } from './siteTestKit'

const lot = SITE.parcel.ring.map(toFt)

describe('site frame', () => {
  test('turns the Islandale lot about 30° to its smallest landscape box, about 202 × 116 ft', () => {
    const turn = bestTurn(lot)
    expect(Math.abs(turn - 30)).toBeLessThan(6)
    const b = boxOf(lot.map(frameAt(turn).toSheet))!
    expect(b.maxx - b.minx).toBeGreaterThan(195)
    expect(b.maxx - b.minx).toBeLessThan(210)
    expect(b.maxy - b.miny).toBeLessThan(122)
    expect(b.maxx - b.minx).toBeGreaterThan(b.maxy - b.miny)
  })

  test('north up is no turn, and the lot is then 214 × 196 ft', () => {
    const f = siteFrame(lot, true)
    expect(f.turnDeg).toBe(0)
    expect(Math.abs(f.northDeg)).toBe(0)
    const b = boxOf(lot.map(f.toSheet))!
    expect(b.maxx - b.minx).toBeCloseTo(214, -1)
    expect(b.maxy - b.miny).toBeCloseTo(196, -1)
  })

  test('north on the sheet is the turn the other way, and east stays to the right of north', () => {
    const f = frameAt(30)
    expect(f.northDeg).toBeCloseTo(-30)
    const [ux, uy] = f.toSheet([0, 1])
    // north points up and to the left by 30°
    expect(ux).toBeCloseTo(-Math.sin(Math.PI / 6))
    expect(uy).toBeCloseTo(-Math.cos(Math.PI / 6))
    const [ex, ey] = f.toSheet([1, 0])
    // east is a quarter turn clockwise from north on the sheet: perpendicular, and to its right
    expect(ex * ux + ey * uy).toBeCloseTo(0)
    expect(ex * -uy + ey * ux).toBeCloseTo(1)
  })

  test('a site point goes onto the sheet and back', () => {
    const f = frameAt(27.5)
    const p = [12.3, -45.6] as const
    const [x, y] = f.fromSheet(f.toSheet(p))
    expect(x).toBeCloseTo(p[0])
    expect(y).toBeCloseTo(p[1])
  })

  test('the extent is the turned box with its pad', () => {
    const f = frameAt(0)
    const e = drawingExtent([[0, 0], [10, 20]], f, 5)
    expect(e.x).toBeCloseTo(-5)
    expect(e.y).toBeCloseTo(-25)
    expect(e.w).toBeCloseTo(20)
    expect(e.h).toBeCloseTo(30)
  })
})
