import { describe, expect, test } from 'vitest'
import { loadIslandale } from '../islandale'
import { loadSchemes } from '../schemes'
import { briefLine } from './SchemeCard'
import { schemeGroup, schemeSummaries } from './schemeSummary'

describe('scheme cards (5F)', () => {
  const sums = schemeSummaries(loadSchemes(), loadIslandale())
  const byId = (id: string) => sums.find((s) => s.id === id)!

  test('the brief line gives area against the cap and the code check', () => {
    const c = byId('C')
    expect(briefLine(c)).toBe(`1,599 of 1,600 sq ft · code check: ${c.checks.pass} pass, ${c.checks.fail} fail`)
  })

  test('a rules-off scheme is not scored', () => {
    expect(briefLine({ ...byId('C'), rulesOff: true })).toBe('1,599 of 1,600 sq ft · rules off')
  })

  test('the groups hold the schemes the plan names', () => {
    const ids = (g: string) => sums.filter((s) => s.group === g).map((s) => s.id)
    expect(ids('current')).toEqual(['C'])
    expect(ids('brief')).toEqual([])
    expect(ids('dream')).toEqual([])
    // any other scheme goes by its rules
    expect(schemeGroup({ id: 'Z', rulesOff: false })).toBe('brief')
    expect(schemeGroup({ id: 'Z', rulesOff: true })).toBe('dream')
  })
})
