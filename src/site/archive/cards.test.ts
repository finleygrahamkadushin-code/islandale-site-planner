import { describe, expect, test } from 'vitest'
import { loadIslandale } from '../islandale'
import { loadSchemes } from '../schemes'
import { briefLine } from './SchemeCard'
import { schemeSummaries } from './schemeSummary'

describe('scheme cards (5F)', () => {
  const sums = schemeSummaries(loadSchemes(), loadIslandale())
  const byId = (id: string) => sums.find((s) => s.id === id)!

  test('the brief line gives area against the cap and the code check', () => {
    const h = byId('H')
    expect(briefLine(h)).toBe(`1,505 of 1,600 sq ft · code check: ${h.checks.pass} pass, ${h.checks.fail} fail`)
  })

  test('a rules-off scheme is not scored', () => {
    expect(briefLine(byId('E'))).toBe('3,390 of 1,600 sq ft · rules off')
  })

  test('the groups hold the schemes the plan names', () => {
    const ids = (g: string) => sums.filter((s) => s.group === g).map((s) => s.id)
    expect(ids('current')).toEqual(['C', 'C2', 'C3', 'C4'])
    expect(ids('brief').sort()).toEqual(['A', 'B', 'G', 'H', 'I'])
    expect(ids('dream').sort()).toEqual(['D', 'E', 'F'])
  })
})
