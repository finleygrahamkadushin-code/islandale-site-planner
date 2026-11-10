import { buildingMasses, partName } from '../../buildings/masses'
import { stairAttached, stairInfo } from '../../buildings/stairs/stairSite'
import { named, type CheckContext, type CodeRow, type NamedObject } from './codeCheckTypes'

/**
 * The stair-geometry row (deliberate addition, PLAN.md): every stair wing's
 * risers and treads against the planner's 7 in / 11 in rule (inside IRC
 * R311.7.5's 7¾ in / 10 in), every ramp against 1:12, and any stair or ramp
 * that runs into the ground at its foot or meets nothing at its top.
 */

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
        if (info.footAbove) out.push({ who, why: 'runs into the ground' })
        if (!stairAttached(o, mi)) out.push({ who, why: 'meets nothing at its top' })
        return out
      }),
    )
}

export function stairsRow(c: CheckContext): CodeRow {
  const label = 'Stair risers & treads · R311.7.5 / R311.8.1'
  const found = problems(c)
  if (!found.length) return { id: 'stairs', label, text: 'every stair and ramp fits', verdict: 'pass', names: [] }
  const names = [...new Map(found.map((p) => [p.who.name, p.who])).values()]
  const text = found.map((p) => `${p.who.name} ${p.why}`).join('; ')
  return { id: 'stairs', label, text, verdict: 'fail', names }
}
