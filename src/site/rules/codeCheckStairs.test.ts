import { describe, expect, it } from 'vitest'
import { loadIslandale } from '../islandale'
import { loadSchemes, schemeById } from '../schemes'
import { planFromScheme } from '../../store/fromLegacy'
import { DEFAULT_SETBACKS, type PlanObject } from '../../store/types'
import { codeCheck, type CodeRow } from './codeCheck'
import { STAIRS_SCOPE, STAIRS_UNCHECKED } from './codeCheckStairs'

const site = loadIslandale()
const schemes = loadSchemes()

function stairsRow(id: string, keep: (o: PlanObject) => boolean = () => true): CodeRow {
  const plan = planFromScheme(schemeById(schemes, id))
  const objects = plan.order.map((k) => plan.objects[k]).filter((o): o is PlanObject => !!o && keep(o))
  const rows = codeCheck({ objects, terrain: site.terrain, parcel: site.parcel, setbacks: DEFAULT_SETBACKS, schemeId: id, schemes }).rows
  const r = rows.find((x) => x.id === 'stairs')
  if (!r) throw new Error('no stairs row')
  return r
}

describe('the stair row (R3.1)', () => {
  it("names its sources and does not cite the IRC for the 11 in tread", () => {
    const r = stairsRow('C')
    expect(r.label).toContain('IBC 1011')
    expect(r.label).not.toContain('R311.7.5')
  })
  it("flags Scheme F's long stair, which rises over 12 ft with no landing (F sets the brief aside, so the row is a note)", () => {
    const r = stairsRow('F')
    expect(r.verdict).toBe('note')
    expect(r.names.map((n) => n.id)).toContain('F-1')
    expect(r.text).toMatch(/Stair 2 rises over 12 ft with no landing/)
  })
  it('says what it checks and what it does not, pass or fail', () => {
    expect(stairsRow('F').text).toContain(STAIRS_UNCHECKED)
    expect(stairsRow('C', (o) => o.type !== 'house')).toMatchObject({ verdict: 'pass', text: `every stair and ramp fits (${STAIRS_SCOPE})` })
    expect(STAIRS_SCOPE).toContain('12 ft a flight')
    expect(STAIRS_UNCHECKED).toBe('not checked: landings, width, headroom, side guards')
  })
})
