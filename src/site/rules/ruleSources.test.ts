import { describe, expect, test } from 'vitest'
import { ASSUMED, limitText, PLANNING_AID_NOTE, RULE_LIMITS } from './ruleSources'

describe('rule sources (R2.7, R2.8)', () => {
  test('every limit names its code section or says it is assumed', () => {
    for (const l of RULE_LIMITS) expect(limitText(l)).toMatch(l.source ? new RegExp(`\\(${l.source}\\)$`) : /\(assumed\)$/)
  })

  test('the county setbacks, height, tree zones, lot width and program are assumed until checked', () => {
    const assumed = RULE_LIMITS.filter((l) => !l.source).map((l) => l.id)
    expect(assumed).toEqual(['shore', 'bank', 'side', 'buffer-30in', 'height', 'lot-width', 'tree-zones', 'program'])
    expect(ASSUMED).toBe('assumed')
  })

  test('the limits read their numbers from the rules themselves', () => {
    const byId = Object.fromEntries(RULE_LIMITS.map((l) => [l.id, l.value]))
    expect(byId.shore).toBe('35 ft, 50 ft strict')
    expect(byId.height).toBe('35 ft above average grade')
    expect(byId['lot-width']).toBe('50 %, 40 ft under 80 ft')
    expect(byId.program).toBe('800 sq ft a building, 1,600 sq ft in all')
  })

  test('the planning-aid note says it is not a code review and that the county limits are assumed', () => {
    expect(PLANNING_AID_NOTE).toMatch(/^A planning aid, not a code review: the county limits here are assumed\./)
  })
})
