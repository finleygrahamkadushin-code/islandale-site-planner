import { describe, expect, test } from 'vitest'
import { CURRENT_SCHEME_ID, ARCHIVED_SCHEME_IDS, loadSchemes, schemeById } from './schemes'

describe('scheme library extracted from the legacy planner', () => {
  const schemes = loadSchemes()
  const ids = schemes.map((s) => s.id)

  test('contains A–D with the C2–C4 prow variants', () => {
    for (const id of ['A', 'B', 'C', 'C2', 'C3', 'C4', 'D']) expect(ids).toContain(id)
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

  test('C2–C4 are variants of C with the same object count', () => {
    const c = schemeById(schemes, 'C')
    for (const id of ['C2', 'C3', 'C4']) {
      const v = schemeById(schemes, id)
      expect(v.objects).toHaveLength(c.objects.length)
      expect(v.objects.some((o) => /^Gathering prow/.test(o.name))).toBe(true)
    }
  })

  test('Scheme C is current and A, B, D are archived', () => {
    expect(CURRENT_SCHEME_ID).toBe('C')
    expect(ARCHIVED_SCHEME_IDS).toEqual(expect.arrayContaining(['A', 'B', 'D']))
    expect(ARCHIVED_SCHEME_IDS).not.toContain('C')
  })

  test('rules-off dream schemes are flagged', () => {
    expect(schemeById(schemes, 'D').rulesOff).toBe(true)
    expect(schemeById(schemes, 'C').rulesOff).toBe(false)
  })
})
