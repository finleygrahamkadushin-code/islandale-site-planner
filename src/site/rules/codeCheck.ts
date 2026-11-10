import { planRailWorld } from '../../buildings/rails/railSite'
import { groundWithCuts, type Ground } from '../earthworks/earthworks'
import { sunkCuts } from '../../scene/placement'
import { loadSchemes, type Scheme } from '../schemes'
import type { Parcel, Terrain } from '../types'
import type { PlanObject, Setbacks } from '../../store/types'
import type { CheckContext, CodeRow } from './codeCheckTypes'
import { guardsRow, handrailsRow, railClearanceRow } from './codeCheckRails'
import { stairsRow } from './codeCheckStairs'
import { levelsRow, pathPiecesRow, routeRow } from './codeCheckPaths'
import { decksInBufferRow, heightRow, lotWidthRow, shoreRow, treeZoneRow } from './codeCheckRows'

/**
 * The code check (5E, old `refreshCode` and the rows later blocks add):
 * one row per rule, in the old planner's order, each with a verdict and
 * the objects it names. Pure: plan objects, site and setbacks in, rows out.
 * Hidden objects are left out. A rules-off scheme (D, E, F) turns every
 * verdict into a note.
 */

export type { CheckContext, CodeRow, CodeVerdict, NamedObject } from './codeCheckTypes'

export interface CodeCheck {
  readonly rows: readonly CodeRow[]
  readonly rulesOff: boolean
}

export interface CodeCheckInput {
  readonly objects: readonly PlanObject[]
  readonly terrain: Terrain
  readonly parcel: Parcel
  readonly setbacks: Setbacks
  /** The plan's scheme id; a scheme with `rulesOff` sets the brief aside. */
  readonly schemeId: string | null
  /** Defaults to the site's schemes. */
  readonly schemes?: readonly Scheme[]
  /** Sunk-cut ground for the rails; worked out from the objects when left out. */
  readonly ground?: Ground
  /** The displayed ground for the route and levels rows (the panels' `useEarthworks` ground); defaults to `ground`. */
  readonly routeGround?: Ground
}

const ROWS: readonly ((c: CheckContext) => CodeRow)[] = [
  shoreRow,
  decksInBufferRow,
  lotWidthRow,
  heightRow,
  guardsRow,
  railClearanceRow,
  handrailsRow,
  stairsRow,
  treeZoneRow,
  routeRow,
  pathPiecesRow,
  levelsRow,
]

export function isRulesOff(schemeId: string | null, schemes: readonly Scheme[]): boolean {
  return !!schemeId && schemes.some((s) => s.id === schemeId && s.rulesOff)
}

/** The site's schemes, read once. */
let schemesCache: readonly Scheme[] | null = null
const siteSchemes = (): readonly Scheme[] => (schemesCache ??= loadSchemes())

export function codeCheck(input: CodeCheckInput): CodeCheck {
  const objects = input.objects.filter((o) => !o.hidden)
  const ground = input.ground ?? groundWithCuts(input.terrain, sunkCuts(objects, input.terrain))
  const world = planRailWorld(objects, input.terrain, ground)
  const ctx: CheckContext = { objects, terrain: input.terrain, parcel: input.parcel, setbacks: input.setbacks, ground, routeGround: input.routeGround ?? ground, world }
  const rows = ROWS.map((row) => row(ctx))
  const rulesOff = isRulesOff(input.schemeId, input.schemes ?? siteSchemes())
  return { rows: rulesOff ? rows.map((r) => ({ ...r, verdict: 'note' as const })) : rows, rulesOff }
}
