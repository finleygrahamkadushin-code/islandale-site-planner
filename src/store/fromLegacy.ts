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
  const position = { x: x ?? 0, n: n ?? 0 }
  return {
    id,
    type: t,
    name,
    position,
    rotation: rot ?? 0,
    params: t === 'bridge' ? withRelativeRoute(params, position) : params,
    locked: false,
    hidden: false,
    labelVisible: true,
  }
}

/**
 * Legacy bridges store their route as absolute site points [x m, n m, elevation ft].
 * Keep it relative to the object's position so moving the bridge moves the route.
 */
function withRelativeRoute(params: Record<string, unknown>, position: { x: number; n: number }): Record<string, unknown> {
  if (!Array.isArray(params.pts)) return params
  const route = params.pts
    .filter((p): p is number[] => Array.isArray(p) && p.length >= 2)
    .map((p) => [p[0] - position.x, p[1] - position.n, p[2]] as const)
  const { pts: _absolute, ...rest } = params
  return { ...rest, route }
}
