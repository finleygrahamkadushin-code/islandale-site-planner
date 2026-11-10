import { buildingMasses, deckObjectMass, edgeName, partName, type Mass } from '../../buildings/masses'
import type { EdgeRail } from '../../buildings/rails/railRules'
import { objectRails } from '../../buildings/rails/railSite'
import { stairInfo } from '../../buildings/stairs/stairSite'
import { ftToM } from '../units'
import type { PlanObject } from '../../store/types'
import { named, type CheckContext, type CodeRow, type NamedObject } from './codeCheckTypes'

/**
 * The rail rows of the code check, read from the 5A rail rules (the same
 * answer the scene draws): guards on every edge that needs one, the
 * openings kept in them, and handrails on stairs and ramps.
 */

/** IRC R311.7.8: stairs with this many risers or more need a handrail. */
export const HANDRAIL_RISERS = 4
/** ADA 405.8: ramp runs rising more than this need handrails, metres (6 in). The old planner cited IRC R311.8.3, whose trigger is a slope over 1:12, not a rise (R2.9). */
export const HANDRAIL_RAMP_RISE_M = ftToM(0.5)

interface MassRails {
  readonly o: PlanObject
  readonly m: Mass
  readonly mi: number
  readonly edges: readonly EdgeRail[]
}

const massesOf = (o: PlanObject): readonly Mass[] => (o.type === 'deck' ? [deckObjectMass(o.params)] : buildingMasses(o.params))

/** Every railable mass of every building and standalone deck, with its edges. */
function railedMasses(c: CheckContext): MassRails[] {
  return c.objects
    .filter((o) => o.type === 'house' || o.type === 'deck')
    .flatMap((o) => {
      const masses = massesOf(o)
      return objectRails(c.world, o).flatMap((edges, mi) => (edges && masses[mi] ? [{ o, m: masses[mi], mi, edges }] : []))
    })
}

const partLabel = (r: Pick<MassRails, 'o' | 'm' | 'mi'>) => (r.o.type === 'deck' ? '' : `${partName(r.m, r.mi)} `)

export function guardsRow(c: CheckContext): CodeRow {
  const masses = railedMasses(c)
  const required = masses.reduce((s, r) => s + r.edges.filter((e) => e.required).length, 0)
  const missing: NamedObject[] = masses.flatMap((r) => {
    const open = r.edges.filter((e) => e.required && !e.drawn)
    return open.length ? [named(r.o, `${partLabel(r)}${open.map((e) => edgeName(r.m, e.i)).join(', ')}`)] : []
  })
  const label = 'Guards · IRC R312.1'
  if (missing.length) return { id: 'guards', label, text: `no guard on ${missing.map((n) => n.name).join('; ')}`, verdict: 'fail', names: missing }
  const text = required ? `all ${required} edge${required > 1 ? 's' : ''} over 30 in have one` : 'no edge over 30 in'
  return { id: 'guards', label, text, verdict: 'pass', names: [] }
}

export function railClearanceRow(c: CheckContext): CodeRow {
  const n = railedMasses(c).reduce((s, r) => s + r.edges.filter((e) => e.drawn).reduce((k, e) => k + e.openings.length, 0), 0)
  const text = n ? `${n} opening${n > 1 ? 's' : ''} kept at stairs, doors and paths` : 'no openings needed'
  return { id: 'rail-clearance', label: 'Rail clearance', text, verdict: 'note', names: [] }
}

interface Access {
  readonly o: PlanObject
  readonly name: string
  readonly needs: boolean
  readonly has: boolean
}

/** Every stair and ramp wing: whether it needs a handrail and whether it has one. */
function accesses(c: CheckContext): Access[] {
  return c.objects
    .filter((o) => o.type === 'house')
    .flatMap((o) =>
      buildingMasses(o.params).flatMap((m, mi) => {
        const info = stairInfo(c.world, o, mi)
        if (!info) return []
        const needs = info.kind === 'stair' ? info.n >= HANDRAIL_RISERS : info.drop > HANDRAIL_RAMP_RISE_M
        return [{ o, name: partName(m, mi), needs, has: info.rails.length > 0 }]
      }),
    )
}

export function handrailsRow(c: CheckContext): CodeRow {
  const needed = accesses(c).filter((a) => a.needs)
  const missing = needed.filter((a) => !a.has).map((a) => named(a.o, a.name))
  const label = 'Handrails · IRC R311.7.8 / ADA 405.8'
  if (missing.length) return { id: 'handrails', label, text: `none on ${missing.map((n) => n.name).join(', ')}`, verdict: 'fail', names: missing }
  const n = needed.length
  const text = n ? `${n} stair${n > 1 ? 's or ramps need' : ' or ramp needs'} one; ${n > 1 ? 'all have' : 'it has'} it` : 'none needed'
  return { id: 'handrails', label, text, verdict: 'pass', names: [] }
}
