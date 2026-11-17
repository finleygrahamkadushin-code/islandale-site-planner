import { describe, expect, test } from 'vitest'
import { accessibleRoom, applyPreset, fixtureDefaults, fixtureNotes, heightOf, presetOf, resetToStandard, rollIn, showerOpts } from './fixtures'
import { FURNITURE, FURNITURE_ORDER, makeFurniture, symbol } from './furniture'
import { furnitureBoxes } from '../scene3d/furniture3d'
import type { FurnitureBase } from '../types'

const piece = (type: string, w: number, d: number, extra: Partial<FurnitureBase> = {}): FurnitureBase => ({ type, x: 0, z: 0, rot: 0, w, d, mirror: false, ...extra })

describe('bathroom fixtures', () => {
  test('a shower placed in an accessible room is a 60×60 curbless roll-in with a bench; elsewhere a 36×36 curbed one', () => {
    expect(fixtureDefaults('shower', true)).toMatchObject({ w: 5, d: 5, fx: { curb: 'curbless', drain: 'linear', bench: true } })
    expect(fixtureDefaults('shower', false)).toMatchObject({ w: 3, d: 3, fx: { curb: 'curbed', door: 'screen' } })
    expect(fixtureDefaults('tub', true)).toEqual({})
  })

  test("the elders' cabin and rooms named for access are accessible", () => {
    expect(accessibleRoom('Bath', 'elders', 'Elders’ wedge')).toBe(true)
    expect(accessibleRoom('Accessible bath', 'family', 'Lantern')).toBe(true)
    expect(accessibleRoom('Bath', 'family', 'Family lantern')).toBe(false)
  })

  test('a shower saved before options existed reads curbless; a 60×30 curbless one is a roll-in, 36×36 a transfer', () => {
    expect(showerOpts(piece('shower', 5, 5)).curb).toBe('curbless')
    expect(rollIn(piece('shower', 5, 2.5)).ok).toBe(true)
    expect(rollIn(piece('shower', 3, 3)).transfer).toBe(true)
    expect(rollIn(piece('shower', 5, 5, { fx: { curb: 'curbed' } })).ok).toBe(false)
  })

  test('a curbed shower, a tub or a 36 in vanity in an accessible room is flagged; a 34 in roll-under vanity passes', () => {
    expect(fixtureNotes(piece('shower', 3, 3, { fx: { curb: 'curbed' } }), true).some((n) => n.ok === false)).toBe(true)
    expect(fixtureNotes(piece('tub', 5, 2.5), true)[0].ok).toBe(false)
    expect(fixtureNotes(piece('vanity', 2.5, 1.75), true)[0].ok).toBe(false)
    expect(fixtureNotes(applyPreset(piece('vanity', 2.5, 1.75), '30x20-34h'), true)[0].ok).toBe(true)
  })

  test('a preset sets the size (and the roll-in its curb) keeping the back on the wall; Reset to standard undoes it', () => {
    const big = applyPreset(piece('shower', 3, 3, { fx: { curb: 'curbed' } }), '60x60')
    expect(big).toMatchObject({ w: 5, d: 5, fx: { curb: 'curbless', drain: 'linear' } })
    expect(big.z).toBeCloseTo(1, 6)
    expect(presetOf(big)?.key).toBe('60x60')
    const back = resetToStandard({ ...big, h: 7 })
    expect(back).toMatchObject({ w: 5, d: 5 })
    expect(heightOf(back)).toBe(6.5)
    expect(resetToStandard(piece('tub', 6, 3)).w).toBe(5)
  })
})

describe('nightstand, dishwasher and kitchen sink', () => {
  test('catalogue sizes and library order', () => {
    expect(FURNITURE.nightstand).toMatchObject({ label: 'Nightstand / side table', w: 1.75, d: 1.5, h: 2.17 })
    expect(FURNITURE.dishwasher).toMatchObject({ label: 'Dishwasher', w: 2, d: 2, h: FURNITURE.counter.h })
    expect(FURNITURE.sink).toMatchObject({ label: 'Kitchen sink', w: 3, d: 2, h: FURNITURE.counter.h })
    for (const t of ['nightstand', 'dishwasher', 'sink']) expect(FURNITURE_ORDER).toContain(t)
  })

  test('plan symbols are not empty and are not the unknown-type crossed box', () => {
    for (const t of ['nightstand', 'dishwasher', 'sink']) {
      const s = symbol(t, FURNITURE[t].w, FURNITURE[t].d)
      expect(s.length).toBeGreaterThan(0)
      expect(s).not.toBe(symbol('nothing', FURNITURE[t].w, FURNITURE[t].d))
      expect(symbol(t, 0, 0)).toBe(s)
    }
  })

  test('makeFurniture places each at its catalogue size', () => {
    expect(makeFurniture('nightstand', 3, 4, 90)).toMatchObject({ type: 'nightstand', x: 3, z: 4, rot: 90, w: 1.75, d: 1.5 })
    expect(makeFurniture('dishwasher', 0, 0)).toMatchObject({ w: 2, d: 2 })
    expect(makeFurniture('sink', 0, 0)).toMatchObject({ w: 3, d: 2 })
    expect(heightOf(makeFurniture('sink', 0, 0))).toBe(3)
  })

  test('3D shapes are several boxes that stay within the piece and follow its turn', () => {
    for (const t of ['nightstand', 'dishwasher', 'sink']) {
      const it = makeFurniture(t, 10, 20, 90)
      const boxes = furnitureBoxes(it, 0, FURNITURE[t].h, (-90 * Math.PI) / 180)!
      expect(boxes.length).toBeGreaterThan(3)
      expect(boxes.every((b) => b.part === 'furniture')).toBe(true)
      // turned 90 degrees, the width runs along z
      for (const b of boxes.filter((b) => b.p[1] < FURNITURE[t].h)) {
        expect(Math.abs(b.p[0] - 10)).toBeLessThanOrEqual(it.d / 2 + 0.2)
        expect(Math.abs(b.p[2] - 20)).toBeLessThanOrEqual(it.w / 2 + 0.2)
      }
    }
    expect(furnitureBoxes(makeFurniture('queen', 0, 0), 0, 2, 0)).toBeNull()
  })
})
