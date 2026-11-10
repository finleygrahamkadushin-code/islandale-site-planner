import { get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval'
import { DISPLAY_TOGGLES, type DisplayOptions } from '../scene/displayOptions'
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_SETBACKS,
  DEFAULT_LAYERS,
  DISPLAY_STYLES,
  LAYER_IDS,
  type DisplayStyle,
  type Environment,
  type Setbacks,
  type LabelMode,
  type Layers,
  type Plan,
  type PlanObject,
} from './types'

export const PLAN_FILE_VERSION = 1
export const AUTOSAVE_KEY = 'islandale-plan'

export interface PlanFile {
  readonly version: typeof PLAN_FILE_VERSION
  readonly app: 'islandale-site-planner'
  readonly savedAt: string
  readonly plan: Plan
  readonly view: {
    readonly labelMode: LabelMode
    readonly layers: Layers
    readonly environment?: Environment
    readonly setbacks?: Setbacks
    readonly displayStyle?: DisplayStyle
    readonly contours?: boolean | null
    readonly displayOptions?: DisplayOptions
  }
}

export function serializePlan(plan: Plan, view: PlanFile['view'], now = new Date()): string {
  const file: PlanFile = { version: PLAN_FILE_VERSION, app: 'islandale-site-planner', savedAt: now.toISOString(), plan, view }
  return JSON.stringify(file, null, 2)
}

/** An object left out when a plan was read, because the app could not draw or edit it safely. */
export interface SkippedObject {
  readonly id: string
  readonly name: string
  readonly reason: string
}

/** A plan file as read: the plan with every readable object, and the ones left out. */
export interface ReadResult {
  readonly file: PlanFile
  /** It came from a newer app and must open read-only. */
  readonly newer: boolean
  readonly skipped: readonly SkippedObject[]
}

/** Parse and validate a plan file. Throws a readable error when the plan as a whole is malformed. */
export function parsePlanFile(text: string): PlanFile {
  return readPlanFileText(text).file
}

/** Parse a plan file for import, keeping every readable object and naming the ones left out. */
export function readPlanFileText(text: string): ReadResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This is not a JSON file.')
  }
  if (isRecord(raw) && isNum(raw.version) && raw.version > PLAN_FILE_VERSION)
    throw new Error(`Unsupported plan file version ${raw.version}.`)
  return migratePlanFile(raw)
}

export function validatePlanFile(raw: unknown): PlanFile {
  if (isRecord(raw) && isNum(raw.version) && raw.version > PLAN_FILE_VERSION)
    throw new Error(`Unsupported plan file version ${raw.version}.`)
  return migratePlanFile(raw).file
}

/**
 * Bring any readable plan file up to the current version. A file from a newer
 * version of the app is read as far as possible and flagged `newer`, so the
 * caller can open it read-only instead of rejecting it and then overwriting it.
 */
export function migratePlanFile(raw: unknown): ReadResult {
  if (!isRecord(raw)) throw new Error('Plan file must be an object.')
  if (!isNum(raw.version) || raw.version < 1) throw new Error(`Unsupported plan file version ${String(raw.version)}.`)
  const newer = raw.version > PLAN_FILE_VERSION
  const { plan, skipped } = readPlan(raw.plan)
  const view = validateView(raw.view)
  const file: PlanFile = { version: PLAN_FILE_VERSION, app: 'islandale-site-planner', savedAt: str(raw.savedAt, ''), plan, view }
  return { file, newer, skipped }
}

export function validatePlan(raw: unknown): Plan {
  return readPlan(raw).plan
}

/** Ids that would rewrite an object's prototype if used as a key. */
const UNSAFE_IDS = new Set(['__proto__'])

/**
 * Read a plan. A fault in the plan as a whole throws; a fault in one object
 * leaves that object out and names it, so the rest of the plan still opens.
 */
export function readPlan(raw: unknown): { readonly plan: Plan; readonly skipped: readonly SkippedObject[] } {
  if (!isRecord(raw)) throw new Error('Plan is missing.')
  if (raw.siteId !== 'islandale') throw new Error('Plan is not for the Islandale site.')
  if (!isRecord(raw.objects)) throw new Error('Plan has no objects.')
  if (!Array.isArray(raw.order)) throw new Error('Plan has no draw order.')
  const entries: [string, PlanObject][] = []
  const skipped: SkippedObject[] = []
  for (const [id, o] of Object.entries(raw.objects)) {
    const fault = UNSAFE_IDS.has(id) ? 'its id is not allowed' : objectFault(o)
    if (fault) skipped.push({ id, name: isRecord(o) && typeof o.name === 'string' && o.name ? o.name : id, reason: fault })
    else entries.push([id, readObject(id, o as Record<string, unknown>)])
  }
  const objects: Record<string, PlanObject> = Object.fromEntries(entries)
  const order: string[] = []
  const seen = new Set<string>()
  const place = (id: string) => {
    if (seen.has(id) || !Object.hasOwn(objects, id)) return
    seen.add(id)
    order.push(id)
  }
  for (const id of raw.order) if (typeof id === 'string') place(id)
  for (const id of Object.keys(objects)) place(id)
  return {
    plan: {
      name: str(raw.name, 'Untitled plan'),
      siteId: 'islandale',
      schemeId: typeof raw.schemeId === 'string' ? raw.schemeId : null,
      objects,
      order,
    },
    skipped,
  }
}

/** Sizes (feet) that must be above zero when present. */
const SIZE_KEYS = ['w', 'd'] as const
/** Numbers (feet) that must be finite when present; a NaN is saved as null. */
const NUMBER_KEYS = ['h', 'lift'] as const
/** Lists the drawing code walks when present. */
const LIST_KEYS = ['wings', 'cuts', 'floors', 'pts', 'route'] as const

/**
 * Why an object cannot be read, or null when it can. Only the fields the app
 * cannot survive being wrong are checked; the rest of `params` is each feature's own.
 */
function objectFault(raw: unknown): string | null {
  if (!isRecord(raw)) return 'it is not an object'
  const pos = raw.position
  if (!isRecord(pos) || !isNum(pos.x) || !isNum(pos.n)) return 'it has no position'
  if (typeof raw.type !== 'string' || !raw.type) return 'it has no type'
  if (raw.params === undefined) return null
  if (!isRecord(raw.params)) return 'its settings are not readable'
  const p = raw.params
  for (const k of SIZE_KEYS) if (k in p && !(isNum(p[k]) && p[k] > 0)) return `its size ${k} is not a number above zero`
  for (const k of NUMBER_KEYS) if (k in p && !isNum(p[k])) return `its ${k} is not a number`
  for (const k of LIST_KEYS) if (k in p && !Array.isArray(p[k])) return `its ${k} is not a list`
  return null
}

function readObject(id: string, raw: Record<string, unknown>): PlanObject {
  const pos = raw.position as { x: number; n: number }
  const type = raw.type as string
  return {
    id,
    type,
    name: str(raw.name, type),
    position: { x: pos.x, n: pos.n },
    rotation: isNum(raw.rotation) ? raw.rotation : 0,
    params: isRecord(raw.params) ? raw.params : {},
    locked: raw.locked === true,
    hidden: raw.hidden === true,
    labelVisible: raw.labelVisible !== false,
    ...(typeof raw.group === 'string' && raw.group ? { group: raw.group } : {}),
  }
}

/** One sentence naming what was left out, for a toast. */
export function describeSkipped(skipped: readonly SkippedObject[]): string {
  if (!skipped.length) return ''
  const named = skipped.slice(0, 3).map((s) => `${s.name} (${s.reason})`)
  const more = skipped.length > 3 ? ` and ${skipped.length - 3} more` : ''
  return skipped.length === 1
    ? `1 object could not be read and was left out: ${named[0]}`
    : `${skipped.length} objects could not be read and were left out: ${named.join('; ')}${more}`
}

function validateView(raw: unknown): PlanFile['view'] {
  const labelMode: LabelMode =
    isRecord(raw) && (raw.labelMode === 'all' || raw.labelMode === 'selected' || raw.labelMode === 'none')
      ? raw.labelMode
      : 'all'
  const layersRaw = isRecord(raw) && isRecord(raw.layers) ? raw.layers : {}
  const layers = Object.fromEntries(
    LAYER_IDS.map((id) => {
      const l = layersRaw[id]
      return [
        id,
        {
          visible: isRecord(l) ? l.visible !== false : DEFAULT_LAYERS[id].visible,
          locked: isRecord(l) ? l.locked === true : DEFAULT_LAYERS[id].locked,
        },
      ]
    }),
  ) as Layers
  const envRaw = isRecord(raw) && isRecord(raw.environment) ? raw.environment : {}
  const environment: Environment = {
    season: envRaw.season === 'jun' || envRaw.season === 'sep' || envRaw.season === 'dec' ? envRaw.season : DEFAULT_ENVIRONMENT.season,
    hour: isNum(envRaw.hour) ? envRaw.hour : DEFAULT_ENVIRONMENT.hour,
    tideFt: isNum(envRaw.tideFt) ? envRaw.tideFt : DEFAULT_ENVIRONMENT.tideFt,
  }
  const style = isRecord(raw) ? raw.displayStyle : undefined
  const displayStyle: DisplayStyle = DISPLAY_STYLES.some((d) => d.id === style) ? (style as DisplayStyle) : 'realistic'
  const contours = isRecord(raw) && typeof raw.contours === 'boolean' ? raw.contours : null
  const displayOptions = readDisplayOptions(isRecord(raw) ? raw.displayOptions : undefined)
  const sbRaw = isRecord(raw) && isRecord(raw.setbacks) ? raw.setbacks : {}
  const setbacks: Setbacks = {
    shoreFt: isNum(sbRaw.shoreFt) ? sbRaw.shoreFt : DEFAULT_SETBACKS.shoreFt,
    bankFt: isNum(sbRaw.bankFt) ? sbRaw.bankFt : DEFAULT_SETBACKS.bankFt,
    sideFt: isNum(sbRaw.sideFt) ? sbRaw.sideFt : DEFAULT_SETBACKS.sideFt,
    treeZones: sbRaw.treeZones !== false,
    shown: sbRaw.shown !== false,
  }
  return { labelMode, layers, environment, setbacks, displayStyle, contours, displayOptions }
}

/** A synchronous copy written as the tab closes, when an IndexedDB write may not finish. */
export const SHADOW_KEY = 'islandale-plan.shadow'
/** Prefix for a save that could not be read, kept aside so it is never overwritten. */
export const UNREADABLE_PREFIX = 'islandale-plan.unreadable-'

/** Where autosave keeps its copies; the browser one is IndexedDB plus localStorage. */
export interface SaveBackend {
  readonly read: (key: string) => Promise<unknown>
  readonly write: (key: string, value: unknown) => Promise<void>
  readonly readSync: (key: string) => string | null
  readonly writeSync: (key: string, value: string) => void
  /** Every key in the async store, to find set-aside copies; optional, since only listing needs it. */
  readonly keys?: () => Promise<readonly string[]>
}

export const browserBackend: SaveBackend = {
  read: (key) => idbGet(key),
  write: (key, value) => idbSet(key, value),
  readSync: (key) => localStorage.getItem(key),
  writeSync: (key, value) => localStorage.setItem(key, value),
  keys: async () => (await idbKeys()).map(String),
}

/** Parse saved text; `newer` means it came from a newer app and must open read-only. */
export function readSavedText(text: string): ReadResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('The save is not JSON.')
  }
  return migratePlanFile(raw)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)

/** Saved display toggles: only the known ones, and only true or false. */
export function readDisplayOptions(raw: unknown): DisplayOptions {
  if (!isRecord(raw)) return {}
  return Object.fromEntries(DISPLAY_TOGGLES.flatMap(({ id }) => (typeof raw[id] === 'boolean' ? [[id, raw[id]]] : []))) as DisplayOptions
}
