import { describe, expect, it } from 'vitest'
import { DEFAULT_SETBACKS } from '../../store/types'
import { loadIslandale } from '../islandale'
import { codeCheck } from '../rules/codeCheck'
import { programBudget } from '../rules/program'
import { loadSchemes, schemeById } from '../schemes'
import { schemeObjects, schemeSummaries, schemeSummary } from './schemeSummary'

const site = loadIslandale()
const schemes = loadSchemes()

const WITHOUT_PLAN: Record<string, number> = { C: 0 }

describe('scheme summaries', () => {
  // the first call does the work; the timing is logged for the plan
  const t0 = performance.now()
  const all = schemeSummaries(schemes, site)
  const ms = performance.now() - t0
  console.info(`scheme summaries: ${schemes.length} schemes in ${Math.round(ms)} ms`)
  const byId = (id: string) => all.find((s) => s.id === id)!

  it('matches the program budget and the code check for every scheme', () => {
    for (const scheme of schemes) {
      const objects = schemeObjects(scheme)
      const s = byId(scheme.id)
      expect(s.enclosedSqFt).toBe(programBudget(objects).enclosedSqFt)
      const rows = codeCheck({ objects, terrain: site.terrain, parcel: site.parcel, setbacks: DEFAULT_SETBACKS, schemeId: null }).rows
      expect(s.checks.fail).toBe(rows.filter((r) => r.verdict === 'fail').length)
      expect(s.checks.failing).toHaveLength(s.checks.fail)
      expect(s.checks.pass + s.checks.fail + s.checks.note).toBe(rows.length)
      expect(s.overCap).toBe(s.enclosedSqFt > 1600)
    }
  })

  it('marks none of the schemes rules off, and carries the flag when a scheme sets it', () => {
    expect(all.filter((s) => s.rulesOff).map((s) => s.id)).toEqual([])
    const dream = schemeSummary({ ...schemeById(schemes, 'C'), id: 'Z', rulesOff: true }, site)
    expect(dream).toMatchObject({ rulesOff: true, group: 'dream' })
  })

  it('counts cabins without a floor plan', () => {
    for (const [id, n] of Object.entries(WITHOUT_PLAN)) expect(byId(id).cabinsWithoutPlan, id).toBe(n)
  })

  it('groups the current scheme, the brief and the dream schemes', () => {
    const ids = (g: string) => all.filter((s) => s.group === g).map((s) => s.id)
    expect(ids('current')).toEqual(['C'])
    expect(ids('brief')).toEqual([])
    expect(ids('dream')).toEqual([])
  })

  it('says the route is not checked while walks are not path pieces', () => {
    expect(all.every((s) => !s.routeChecked)).toBe(true)
  })

  it('carries the tag and blurb and counts cabins', () => {
    const c = byId('C')
    expect(c.tag.length).toBeGreaterThan(0)
    expect(c.blurb.length).toBeGreaterThan(0)
    expect(c.cabins).toBe(programBudget(schemeObjects(schemeById(schemes, 'C'))).buildings.length)
  })

  it('returns the cached summary on a second call', () => {
    const again = schemeSummaries(schemes, site)
    again.forEach((s, i) => expect(s).toBe(all[i]))
    expect(schemeSummary(schemeById(schemes, 'C'), site)).toEqual(byId('C'))
  })

  it('route if rebuilt: counted for every scheme, never more cabins than it has', () => {
    for (const sum of schemeSummaries(loadSchemes(), site)) {
      expect(sum.routeIfRebuilt.of, sum.id).toBe(sum.cabins)
      expect(sum.routeIfRebuilt.ok, sum.id).toBeLessThanOrEqual(sum.cabins)
    }
  })
})
