import { describe, expect, test } from 'vitest'
import { effectiveSupport, SUPPORT_KINDS, supportType } from './foundation'

describe('effectiveSupport (legacy)', () => {
  test('a named support is kept as it is', () => {
    for (const k of SUPPORT_KINDS) expect(effectiveSupport(k, 0)).toBe(k)
  })
  test('auto, missing or unknown: posts once the floor is more than 1.6 m up, else a skirt', () => {
    expect(effectiveSupport('auto', 1.6)).toBe('skirt')
    expect(effectiveSupport('auto', 1.61)).toBe('posts')
    expect(effectiveSupport(undefined, 3)).toBe('posts')
    expect(effectiveSupport('caisson', 0.5)).toBe('skirt')
  })
  test('the families: standing supports, skirts, and nothing on earth', () => {
    expect(['posts', 'piers', 'pilings', 'mast', 'stilts'].map((k) => supportType(k, 0))).toEqual(['posts', 'posts', 'posts', 'posts', 'posts'])
    expect(supportType('slab', 3)).toBe('skirt')
    expect(supportType('earth', 3)).toBe('none')
  })
})
