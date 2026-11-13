import { describe, expect, test } from 'vitest'
import { CURRENT_SCHEME_ID, CURRENT_VARIANT_IDS, ARCHIVED_SCHEME_IDS, hasSchemeChoice, loadSchemes, schemeById } from './schemes'

describe('scheme library extracted from the legacy planner', () => {
  const schemes = loadSchemes()
  const ids = schemes.map((s) => s.id)

  test('holds Scheme C only (the full set is on main)', () => {
    expect(ids).toEqual(['C'])
    expect(schemes[0].name).toBe('C · Prow & Lantern')
  })

  test('ids are unique and derived from the scheme names', () => {
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of schemes) expect(s.name.startsWith(`${s.id} ·`)).toBe(true)
  })

  test('every object has a type, a name and a position', () => {
    for (const s of schemes) {
      expect(s.objects.length).toBeGreaterThan(0)
      for (const o of s.objects) {
        expect(typeof o.t).toBe('string')
        expect(typeof o.name).toBe('string')
        if (o.t !== 'bridge') {
          expect(typeof o.x).toBe('number')
          expect(typeof o.n).toBe('number')
        }
      }
    }
  })

  test('Scheme C is current, with no variants or archived schemes, so there is nothing to choose', () => {
    expect(CURRENT_SCHEME_ID).toBe('C')
    expect(CURRENT_VARIANT_IDS).toEqual([])
    expect(ARCHIVED_SCHEME_IDS).toEqual([])
    expect(hasSchemeChoice(schemes)).toBe(false)
    expect(hasSchemeChoice([...schemes, { ...schemes[0], id: 'C9' }])).toBe(true)
  })

  test('Scheme C keeps the rules on', () => {
    expect(schemeById(schemes, 'C').rulesOff).toBe(false)
  })

  test('an unknown scheme id throws', () => {
    expect(() => schemeById(schemes, 'Z')).toThrow('unknown scheme "Z"')
  })
})
