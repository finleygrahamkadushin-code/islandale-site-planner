import { hasFloorPlan } from '../../interiors/model'
import { isPathPiece } from '../../paths/pieces'
import { planFromScheme } from '../../store/fromLegacy'
import { DEFAULT_SETBACKS, type Plan, type PlanObject } from '../../store/types'
import { rebuildWalks } from '../../paths/walks/rebuildWalks'
import { routeReport } from '../../paths/route/routeVerdict'
import { groundWithCuts } from '../earthworks/earthworks'
import { sunkCuts } from '../../scene/placement'
import { codeCheck } from '../rules/codeCheck'
import { PROGRAM_CAP_SQFT, programBudget } from '../rules/program'
import { CURRENT_SCHEME_ID, CURRENT_VARIANT_IDS, type Scheme } from '../schemes'
import type { Site } from '../types'

/**
 * One scheme's card facts (5F), worked out without loading it: cabins,
 * enclosed sq ft against the 1,600 cap, the code check at the default
 * setbacks, and cabins with no floor plan. Pure; `schemeSummaries` caches
 * per scheme id, since the scheme data never changes at runtime.
 */

export type SchemeGroup = 'current' | 'brief' | 'dream'

export interface SchemeChecks {
  readonly pass: number
  readonly fail: number
  readonly note: number
  /** Labels of the failing rows, in the code check's order. */
  readonly failing: readonly string[]
}

export interface SchemeSummary {
  readonly id: string
  readonly name: string
  readonly tag: string
  readonly blurb: string
  readonly rulesOff: boolean
  readonly group: SchemeGroup
  readonly cabins: number
  readonly enclosedSqFt: number
  readonly overCap: boolean
  /** Real verdicts even for a rules-off scheme; the card greys them out. */
  readonly checks: SchemeChecks
  readonly cabinsWithoutPlan: number
  /** False while the scheme has no 5C path pieces, so the route row says nothing real. */
  readonly routeChecked: boolean
  /** Once its walks are rebuilt as path pieces: how many cabins have a step-free route from the parking. */
  readonly routeIfRebuilt: { readonly ok: number; readonly of: number }
}

const CURRENT_IDS: readonly string[] = [CURRENT_SCHEME_ID, ...CURRENT_VARIANT_IDS]

export function schemeGroup(scheme: Pick<Scheme, 'id' | 'rulesOff'>): SchemeGroup {
  if (CURRENT_IDS.includes(scheme.id)) return 'current'
  return scheme.rulesOff ? 'dream' : 'brief'
}

const isCabin = (o: PlanObject): boolean => o.type === 'house'
// a 5C path piece carries its kind; the old ribbons and pads don't
const isKindedPiece = (o: PlanObject): boolean => isPathPiece(o) && typeof o.params.kind === 'string'

/** The scheme's plan objects, in their saved order. */
export function schemeObjects(scheme: Scheme): readonly PlanObject[] {
  const plan = planFromScheme(scheme)
  return plan.order.map((id) => plan.objects[id])
}

function checksOf(objects: readonly PlanObject[], site: Site): SchemeChecks {
  // schemeId null keeps the verdicts real; rules off comes from the scheme
  const { rows } = codeCheck({ objects, terrain: site.terrain, parcel: site.parcel, setbacks: DEFAULT_SETBACKS, schemeId: null })
  const count = (v: string) => rows.filter((r) => r.verdict === v).length
  return { pass: count('pass'), fail: count('fail'), note: count('note'), failing: rows.filter((r) => r.verdict === 'fail').map((r) => r.label) }
}

/** The route verdicts the scheme would get with its walks rebuilt as path pieces (the plan's own rebuild, without saving it). */
function rebuiltRoute(objects: readonly PlanObject[], site: Site): { ok: number; of: number } {
  const ground = groundWithCuts(site.terrain, sunkCuts(objects, site.terrain))
  const order = objects.map((o) => o.id)
  const plan: Plan = { name: '', siteId: 'islandale', schemeId: null, objects: Object.fromEntries(objects.map((o) => [o.id, o])), order }
  const rebuilt = rebuildWalks(plan, site.terrain, ground).plan
  const rep = routeReport(rebuilt.order.map((id) => rebuilt.objects[id]), site.terrain, ground)
  return { ok: rep.summary.routesOk, of: rep.summary.routes }
}

export function schemeSummary(scheme: Scheme, site: Site): SchemeSummary {
  const objects = schemeObjects(scheme)
  const cabins = objects.filter(isCabin)
  const { enclosedSqFt } = programBudget(objects)
  return {
    id: scheme.id,
    name: scheme.name,
    tag: scheme.tag,
    blurb: scheme.blurb,
    rulesOff: scheme.rulesOff,
    group: schemeGroup(scheme),
    cabins: cabins.length,
    enclosedSqFt,
    overCap: enclosedSqFt > PROGRAM_CAP_SQFT,
    checks: checksOf(objects, site),
    cabinsWithoutPlan: cabins.filter((o) => !hasFloorPlan(o.params)).length,
    routeChecked: objects.some(isKindedPiece),
    routeIfRebuilt: rebuiltRoute(objects, site),
  }
}

const cache = new Map<string, SchemeSummary>()

/** One scheme's summary, worked out once per scheme id. */
export function cachedSchemeSummary(scheme: Scheme, site: Site): SchemeSummary {
  const hit = cache.get(scheme.id)
  if (hit) return hit
  const s = schemeSummary(scheme, site)
  cache.set(scheme.id, s)
  return s
}

/** Every scheme's summary, in the schemes' order, cached per scheme id. */
export function schemeSummaries(schemes: readonly Scheme[], site: Site): readonly SchemeSummary[] {
  return schemes.map((s) => cachedSchemeSummary(s, site))
}
