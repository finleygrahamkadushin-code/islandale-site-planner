/**
 * The site plan's notes: the lot facts, the setbacks in force, the program
 * budget, each building's clearances and the code check, as rows of text.
 * Every number comes from the function the app's own panel calls with the
 * same inputs, and is written the way that panel writes it, so the sheet
 * and the app can't disagree. Pure.
 */
import type { Ground } from '../../../site/earthworks/earthworks'
import { lotFacts } from '../../../site/lotFacts'
import { codeCheck, type CodeVerdict } from '../../../site/rules/codeCheck'
import { BUILDING_CAP_SQFT, PROGRAM_CAP_SQFT, programBudget, type BuildingProgram, type ProgramBudget } from '../../../site/rules/program'
import { PLANNING_AID_NOTE } from '../../../site/rules/ruleSources'
import { TREE_ZONE_1_FT, TREE_ZONE_2_FT } from '../../../site/rules/setbacks'
import type { Site } from '../../../site/types'
import { sqFtToAcres } from '../../../site/units'
import type { Layers, Plan, PlanObject, Setbacks } from '../../../store/types'
import { clearanceRows } from '../../../ui/selectionStats'

export type NoteFlag = 'over' | 'warn' | CodeVerdict

export interface NoteRow {
  readonly label: string
  readonly value: string
  readonly flag?: NoteFlag
}

export interface NoteBlock {
  readonly id: 'lot' | 'setbacks' | 'program' | 'clearances'
  readonly title: string
  readonly rows: readonly NoteRow[]
  /** Small print under the block. */
  readonly notes: readonly string[]
}

export interface CodeNote {
  readonly id: string
  readonly label: string
  readonly verdict: CodeVerdict
  readonly text: string
  readonly names: readonly string[]
}

export interface SiteNotes {
  readonly blocks: readonly NoteBlock[]
  readonly code: { readonly title: string; readonly rulesOff: boolean; readonly rows: readonly CodeNote[]; readonly notes: readonly string[] }
}

export interface SiteNotesInput {
  readonly plan: Plan
  readonly site: Site
  readonly setbacks: Setbacks
  readonly layers?: Layers
  /** The displayed ground with every earthwork: the Code check panel's `routeGround` (useEarthworks). */
  readonly routeGround: Ground
}

// --- the panels' own wording ------------------------------------------------

/** As the Site tab's Lot facts write square feet. */
const sqft = (v: number) => `${Math.round(v).toLocaleString('en-US')} sq ft`
/** As the Program panel writes its numbers. */
const n = (v: number) => v.toLocaleString('en-US')

/** One building's enclosed area, its floor count, and its covered porches (the Program panel's row). */
export function buildingLine(b: BuildingProgram): string {
  const floors = b.floors > 1 ? ` (${b.floors} fl)` : ''
  const covered = b.coveredSqFt > 0 ? ` + ${n(b.coveredSqFt)} covered` : ''
  return `${n(b.enclosedSqFt)} sq ft${floors}${covered}`
}

/** What's over its limit, or nothing (the Program panel's warning). */
export function flagLine(budget: ProgramBudget): string | null {
  if (budget.overTotal) return `Over the ${n(PROGRAM_CAP_SQFT)} sq ft enclosed limit.`
  if (budget.overBuildings.length) return `${budget.overBuildings.join(', ')} over ${n(BUILDING_CAP_SQFT)} sq ft.`
  return null
}

/** The Code check panel's hint, a sentence a line. */
export const CODE_HINT = [
  'Guards: 36 in on any open side more than 30 in up, with openings under 4 in.',
  'Handrails: 34–38 in on stairs with 4 or more risers and on ramps rising more than 6 in.',
  'In the shoreline buffer: only paths, stairs, ramps and structures under 30 in.',
] as const

export const RULES_OFF_TEXT = 'This scheme sets the brief aside (rules off), so nothing is checked against it.'

export const VERDICT_TEXT: Readonly<Record<CodeVerdict, string>> = { pass: 'PASS', fail: 'FAIL', note: 'NOTE' }

// --- the notes -----------------------------------------------------------------

const objectsOf = (plan: Plan): PlanObject[] => plan.order.map((id) => plan.objects[id]).filter((o): o is PlanObject => o !== undefined)

function lotBlock(site: Site, objects: readonly PlanObject[]): NoteBlock {
  const facts = lotFacts(site.parcel, objects)
  return {
    id: 'lot',
    title: 'The lot',
    rows: [
      { label: 'Lot area', value: `${sqft(facts.lotSqFt)} (${sqFtToAcres(facts.lotSqFt).toFixed(2)} acres)` },
      { label: 'Shoreline', value: `${Math.round(facts.shorelineFt).toLocaleString('en-US')} ft` },
      { label: 'Lot coverage', value: `${sqft(facts.coveredSqFt)} · ${facts.coveragePct.toFixed(1)} %` },
    ],
    // kept to one line of the notes column, so Scheme C's notes still fit beside its drawing on Tabloid
    notes: ['Lot coverage: cabins’ closed walls and wings (ground area only), standalone decks, sheds and shops.'],
  }
}

function setbacksBlock(s: Setbacks): NoteBlock {
  return {
    id: 'setbacks',
    title: 'Setbacks in force',
    rows: [
      { label: 'Shoreline setback', value: `${s.shoreFt} ft from the top of bank (east shore), from the OHWM (south-west shore)` },
      { label: 'Top of bank', value: `${s.bankFt} ft in from the east OHWM` },
      { label: 'Side and rear lot lines', value: `${s.sideFt} ft` },
      ...(s.treeZones ? [{ label: 'Tree protection zones', value: `0–${TREE_ZONE_1_FT} ft from the water no removal; ${TREE_ZONE_1_FT}–${TREE_ZONE_2_FT} ft limited removal` }] : []),
    ],
    notes: [],
  }
}

function programBlock(objects: readonly PlanObject[]): NoteBlock {
  const budget = programBudget(objects)
  const flag = flagLine(budget)
  return {
    id: 'program',
    title: 'Program budget',
    rows: [
      { label: 'Enclosed total', value: `${n(budget.enclosedSqFt)} / ${n(PROGRAM_CAP_SQFT)} sq ft`, flag: budget.overTotal ? 'over' : undefined },
      { label: 'Covered outdoor', value: `${n(budget.coveredSqFt)} sq ft + ${n(budget.deckSqFt)} deck` },
      ...budget.buildings.map((b): NoteRow => ({ label: b.name, value: buildingLine(b), flag: b.over ? 'over' : undefined })),
    ],
    notes: [
      ...(flag ? [flag] : []),
      `Enclosed counts every floor of the main walls plus closed wings; porches count as covered. Each building must stay at or below ${n(BUILDING_CAP_SQFT)} sq ft.`,
    ],
  }
}

function clearancesBlock({ plan, site, setbacks, layers }: SiteNotesInput, objects: readonly PlanObject[]): NoteBlock {
  // one row per building, its inspector rows run together: to shore, to lot line, to nearest
  const rows = objects
    .filter((o) => o.type === 'house' && !o.hidden)
    .map((o): NoteRow => {
      const rs = clearanceRows(o, plan, site, setbacks, layers)
      return { label: o.name, value: rs.map((r) => r.text).join('; '), flag: rs.some((r) => r.warn) ? 'warn' : undefined }
    })
  return { id: 'clearances', title: 'Clearances', rows, notes: ['Measured wall to line, as the inspector does: no stairs, ramps or decks 30 in or lower.'] }
}

export function siteNotes(input: SiteNotesInput): SiteNotes {
  const objects = objectsOf(input.plan)
  const check = codeCheck({
    objects,
    terrain: input.site.terrain,
    parcel: input.site.parcel,
    setbacks: input.setbacks,
    schemeId: input.plan.schemeId,
    routeGround: input.routeGround,
  })
  return {
    blocks: [lotBlock(input.site, objects), setbacksBlock(input.setbacks), programBlock(objects), clearancesBlock(input, objects)],
    code: {
      title: 'Code check · SJCC 18.50.540',
      rulesOff: check.rulesOff,
      rows: check.rows.map((r) => ({ id: r.id, label: r.label, verdict: r.verdict, text: r.text, names: r.names.map((x) => x.name) })),
      // a planning aid, not a code review (R2.7), saying which limits are assumed (R2.8), as the panel says it
      notes: [PLANNING_AID_NOTE, ...CODE_HINT],
    },
  }
}
