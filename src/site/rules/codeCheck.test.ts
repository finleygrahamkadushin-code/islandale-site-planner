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
      'Lot-width rule',
      'Height ≤ 35 ft',
      'Guards · IRC R312.1',
      'Rail clearance',
      'Handrails · R311.7.8 / R311.8.3',
      'Tree zone 1 (0–35 ft)',
      'Accessible route · ADA 402–405',
      'Path pieces',
      'Level floors & thresholds',
    ])
  })

  it('passes Scheme C on the site rules at the default setbacks', () => {
    const { rows } = check(C, 'C')
    expect(row(rows, 'shore')).toMatchObject({ verdict: 'pass', text: 'all buildings clear', names: [] })
    expect(row(rows, 'decks').verdict).toBe('pass')
    expect(row(rows, 'lot-width')).toMatchObject({ verdict: 'pass', text: '56 ft of 57 ft allowed (lot 115 ft wide there)' })
    expect(row(rows, 'height')).toMatchObject({ verdict: 'pass', text: 'tallest 22.7 ft (Gathering prow)' })
    expect(row(rows, 'guards').verdict).toBe('pass')
    expect(row(rows, 'handrails').verdict).toBe('pass')
    expect(row(rows, 'rail-clearance').verdict).toBe('note')
    expect(row(rows, 'tree-zone').verdict).toBe('note')
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

  it('gives only notes for a rules-off scheme', () => {
    const r = check(objectsOf('D'), 'D')
    expect(r.rulesOff).toBe(true)
    expect(r.rows).toHaveLength(11)
    expect(r.rows.every((x) => x.verdict === 'note')).toBe(true)
  })
})
