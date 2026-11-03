import { describe, expect, test } from 'vitest'
import { accessibleRoom, applyPreset, fixtureDefaults, fixtureNotes, heightOf, presetOf, resetToStandard, rollIn, showerOpts } from './fixtures'
import type { FurnitureBase } from './types'

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
