import { describe, expect, it } from 'vitest'
import { loadIslandale } from '../islandale'
import { loadSchemes, schemeById } from '../schemes'
import { planFromScheme } from '../../store/fromLegacy'
import { DEFAULT_SETBACKS, type PlanObject, type Setbacks } from '../../store/types'
import { codeCheck, type CodeRow } from './codeCheck'

const site = loadIslandale()
const schemes = loadSchemes()

function objectsOf(id: string): PlanObject[] {
  const plan = planFromScheme(schemeById(schemes, id))
  return plan.order.map((k) => plan.objects[k])
}

function check(objects: readonly PlanObject[], schemeId: string, setbacks: Setbacks = DEFAULT_SETBACKS) {
  return codeCheck({ objects, terrain: site.terrain, parcel: site.parcel, setbacks, schemeId, schemes })
}

const row = (rows: readonly CodeRow[], id: string): CodeRow => {
  const r = rows.find((x) => x.id === id)
  if (!r) throw new Error(`no row ${id}`)
  return r
}

/** A copy of the named cabin with its first deck wing's rail switched off. */
function deckRailOff(objects: readonly PlanObject[], name: string): PlanObject[] {
  return objects.map((o) => {
    if (o.name !== name) return o
    const wings = (o.params.wings as Record<string, unknown>[]).map((w, i, all) => (i === all.findIndex((x) => x.kind === 'deck') ? { ...w, rail: false } : w))
    return { ...o, params: { ...o.params, wings } }
  })
}

describe('code check', () => {
  const C = objectsOf('C')

  it('lists every row in the old order for Scheme C', () => {
    const r = check(C, 'C')
    expect(r.rulesOff).toBe(false)
    expect(r.rows.map((x) => x.label)).toEqual([
      'Shoreline setback',
      'Decks over 30 in in buffer',
      'Side and rear setback',
      'Inside the lot',
      'Lot-width rule',
      'Height ≤ 35 ft',
      'Guards · IRC R312.1',
      'Rail clearance',
      // the 6 in ramp trigger is ADA 405.8; IRC R311.8.3 asks for a handrail on ramps steeper than 1:12 (R2.9)
      'Handrails · IRC R311.7.8 / ADA 405.8',
      'Stairs & ramps · IBC 1011, 1012',
      'Tree zone 1 (0–35 ft)',
      'Accessible route · ADA 402–405',
      'Path pieces',
      'Level floors & thresholds',
    ])
  })

  // measured wall to shore and wall to lot line (R2.3), Scheme C still passes every site row
  it('passes Scheme C on the site rules at the default setbacks', () => {
    const { rows } = check(C, 'C')
    expect(row(rows, 'shore')).toMatchObject({ verdict: 'pass', text: 'all buildings clear', names: [] })
    expect(row(rows, 'decks').verdict).toBe('pass')
    expect(row(rows, 'side')).toMatchObject({ verdict: 'pass', text: 'all buildings 10 ft or more from the lot lines' })
    expect(row(rows, 'in-lot').verdict).toBe('pass')
    expect(row(rows, 'lot-width')).toMatchObject({ verdict: 'pass', text: '56 ft of 57 ft allowed (lot 115 ft wide there)' })
    expect(row(rows, 'height')).toMatchObject({ verdict: 'pass', text: 'tallest 22.7 ft (Gathering prow)' })
    expect(row(rows, 'guards').verdict).toBe('pass')
    expect(row(rows, 'handrails').verdict).toBe('pass')
    expect(row(rows, 'rail-clearance').verdict).toBe('note')
    // its boardwalk runs through tree zone 1: named, but paths are allowed there
    expect(row(rows, 'tree-zone')).toMatchObject({ verdict: 'note', text: 'paths and low decks only: Elders’ walk · 1:21 boardwalk' })
  })

  it('fails the stair row on Scheme C: the prow stair runs into the ground, the family stairs are too steep and the twin pod meets nothing', () => {
    const stairs = row(check(C, 'C').rows, 'stairs')
    expect(stairs.verdict).toBe('fail')
    expect(stairs.text).toContain('Gathering prow · Stair 2 runs into the ground')
    expect(stairs.text).toContain('Family lantern · Stair 2 too steep')
    expect(stairs.text).toContain('Family twin pod · Stair 2 too steep')
    expect(stairs.text).toContain('Family twin pod · Stair 2 meets nothing at its top')
    expect(stairs.names.map((n) => n.id).sort()).toEqual(['C-0', 'C-1', 'C-2'])
  })

  it('fails the shoreline row at a 150 ft setback and names the cabins', () => {
    const shore = row(check(C, 'C', { ...DEFAULT_SETBACKS, shoreFt: 150 }).rows, 'shore')
    expect(shore.verdict).toBe('fail')
    expect(shore.names.length).toBeGreaterThan(0)
    expect(shore.text).toMatch(/^inside the 150 ft buffer: /)
  })

  it('fails the guards row when a deck wing’s rail is switched off', () => {
    const guards = row(check(deckRailOff(C, 'Gathering prow'), 'C').rows, 'guards')
    expect(guards.verdict).toBe('fail')
    expect(guards.names.map((n) => n.name).every((n) => n.startsWith('Gathering prow · Deck 3 '))).toBe(true)
  })

  it('leaves hidden objects out', () => {
    const hidden = C.map((o) => (o.type === 'house' ? { ...o, hidden: true } : o))
    const r = check(hidden, 'C')
    expect(row(r.rows, 'height')).toMatchObject({ verdict: 'note', text: 'no buildings yet' })
    expect(row(r.rows, 'lot-width').verdict).toBe('note')
  })

  it("measures the lot width through the outline point nearest the lot line along the water, as before the high-water line (E, F)", () => {
    // every point below the high-water line is 0 from it, so ranking by that picked whichever came first (review of c036a56)
    expect(row(check(objectsOf('E'), 'E').rows, 'lot-width').text).toBe('118 ft of 43 ft allowed (lot 85 ft wide there)')
    expect(row(check(objectsOf('F'), 'F').rows, 'lot-width').text).toBe('no buildings yet')
  })

  it('gives only notes for a rules-off scheme', () => {
    const r = check(objectsOf('D'), 'D')
    expect(r.rulesOff).toBe(true)
    expect(r.rows).toHaveLength(14)
    expect(r.rows.every((x) => x.verdict === 'note')).toBe(true)
  })
})
