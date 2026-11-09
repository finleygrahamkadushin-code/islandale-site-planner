/**
 * Test fixtures for the site plan: a scheme's plan, the site, and the
 * ground as useEarthworks builds it for the app (earthCuts over the
 * objects that shape the ground, then siteEarthworks), so a test sees the
 * same ground the panels do.
 */
import { siteEarthworks } from '../../../site/earthworks/earthworks'
import { loadIslandale } from '../../../site/islandale'
import { loadSchemes, schemeById } from '../../../site/schemes'
import type { Site } from '../../../site/types'
import { earthCuts, shapesGround } from '../../../scene/placement'
import { planFromScheme } from '../../../store/fromLegacy'
import { DEFAULT_ENVIRONMENT, DEFAULT_SETBACKS, type Plan, type PlanObject, type Setbacks } from '../../../store/types'
import type { SiteModelInput } from './siteModel'

export const SITE: Site = loadIslandale()
export const SCHEMES = loadSchemes()

export const planOf = (schemeId: string): Plan => planFromScheme(schemeById(SCHEMES, schemeId))
export const objectsOf = (plan: Plan): PlanObject[] => plan.order.map((id) => plan.objects[id]).filter((o): o is PlanObject => o !== undefined)

/** The displayed ground with every earthwork, exactly as useEarthworks works it out. */
export function earthworksFor(objects: readonly PlanObject[]) {
  const shaping = objects.filter((o) => !o.hidden && shapesGround(o))
  const cuts = earthCuts(shaping, SITE.terrain)
  const works = siteEarthworks(SITE.terrain, cuts.flatMap((c) => (c.op ? [c.op] : [])))
  return { works, ground: works.ground }
}

export function modelInputFor(plan: Plan, setbacks: Setbacks = DEFAULT_SETBACKS): SiteModelInput {
  const objects = objectsOf(plan)
  return { objects, site: SITE, setbacks, environment: DEFAULT_ENVIRONMENT, ...earthworksFor(objects) }
}
