import { buildingMasses, partName } from '../../buildings/masses'
import { stairAttached, stairInfo } from '../../buildings/stairs/stairSite'
import { named, type CheckContext, type CodeRow, type NamedObject } from './codeCheckTypes'

/**
 * The stair-geometry row (deliberate addition, PLAN.md): every stair wing's
 * risers and treads against the planner's 7 in / 11 in rule (the IBC
 * 1011.5.2 numbers, stricter than the IRC's 7¾ in / 10 in) and its rise
 * against one 12 ft flight (IBC 1011.8), every ramp against 1:12 (IBC
 * 1012.2) and one 30 in run (IBC 1012.4), and any stair or ramp that runs
 * into the ground at its foot or meets nothing at its top. Handrails have
 * their own row; landings, width, headroom and guards on a stair's open
 * sides are not checked, and the row says so.
 */

export const STAIRS_LABEL = 'Stairs & ramps · IBC 1011.5, 1011.8, 1012.2, 1012.4'
/** What the row covers, and what it does not, said on every verdict. */
export const STAIRS_SCOPE = 'checks risers ≤ 7 in, treads ≥ 11 in, ≤ 12 ft per flight; ramps ≤ 1:12, ≤ 30 in per run. Not checked: landings, width, headroom, guards on open sides'

interface Problem {
  readonly who: NamedObject
  readonly why: string
}

function problems(c: CheckContext): Problem[] {
  return c.objects
    .filter((o) => o.type === 'house')
    .flatMap((o) =>
      buildingMasses(o.params).flatMap((m, mi): Problem[] => {
        const info = stairInfo(c.world, o, mi)
        if (!info) return []
        const who = named(o, partName(m, mi))
        const out: Problem[] = []
        if (info.kind === 'stair' && !info.ok) out.push({ who, why: 'too steep' })
        if (info.kind === 'ramp' && info.steep) out.push({ who, why: 'over 1:12' })
        if (info.flightOver) out.push({ who, why: info.kind === 'stair' ? 'rises over 12 ft with no landing' : 'rises over 30 in with no landing' })
        if (info.footAbove) out.push({ who, why: 'runs into the ground' })
        if (!stairAttached(o, mi)) out.push({ who, why: 'meets nothing at its top' })
        return out
      }),
    )
}

export function stairsRow(c: CheckContext): CodeRow {
  const label = STAIRS_LABEL
  const found = problems(c)
  if (!found.length) return { id: 'stairs', label, text: `every stair and ramp fits; ${STAIRS_SCOPE}`, verdict: 'pass', names: [] }
  const names = [...new Map(found.map((p) => [p.who.name, p.who])).values()]
  const text = `${found.map((p) => `${p.who.name} ${p.why}`).join('; ')}. The row ${STAIRS_SCOPE}`
  return { id: 'stairs', label, text, verdict: 'fail', names }
}
