import type { LegacySchemeObject, Scheme } from '../site/schemes'
import type { Plan, PlanObject } from './types'

/** Convert a legacy scheme into a Plan without touching the legacy objects. */
export function planFromScheme(scheme: Scheme, name = scheme.name): Plan {
  const objects: Record<string, PlanObject> = {}
  const order: string[] = []
  scheme.objects.forEach((o, i) => {
    const id = `${scheme.id}-${i}`
    objects[id] = planObjectFromLegacy(id, o)
    order.push(id)
  })
  return { name, siteId: 'islandale', schemeId: scheme.id, objects, order }
}

export function planObjectFromLegacy(id: string, o: LegacySchemeObject): PlanObject {
  const { t, name, x, n, rot, ...params } = o
  return {
    id,
    type: t,
    name,
    position: { x: x ?? 0, n: n ?? 0 },
    rotation: rot ?? 0,
    params,
    locked: false,
    hidden: false,
    labelVisible: true,
  }
}
