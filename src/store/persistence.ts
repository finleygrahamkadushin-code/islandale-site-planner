import { get as idbGet, set as idbSet } from 'idb-keyval'
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

/** Parse and validate a plan file. Throws a readable error on anything malformed. */
export function parsePlanFile(text: string): PlanFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This is not a JSON file.')
  }
  return validatePlanFile(raw)
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
export function migratePlanFile(raw: unknown): { readonly file: PlanFile; readonly newer: boolean } {
  if (!isRecord(raw)) throw new Error('Plan file must be an object.')
  if (!isNum(raw.version) || raw.version < 1) throw new Error(`Unsupported plan file version ${String(raw.version)}.`)
  const newer = raw.version > PLAN_FILE_VERSION
  return { file: readCurrent(raw), newer }
}

function readCurrent(raw: Record<string, unknown>): PlanFile {
  const plan = validatePlan(raw.plan)
  const view = validateView(raw.view)
  return { version: PLAN_FILE_VERSION, app: 'islandale-site-planner', savedAt: str(raw.savedAt, ''), plan, view }
}

export function validatePlan(raw: unknown): Plan {
  if (!isRecord(raw)) throw new Error('Plan is missing.')
  if (raw.siteId !== 'islandale') throw new Error('Plan is not for the Islandale site.')
  if (!isRecord(raw.objects)) throw new Error('Plan has no objects.')
  if (!Array.isArray(raw.order)) throw new Error('Plan has no draw order.')
  const objects: Record<string, PlanObject> = {}
  for (const [id, o] of Object.entries(raw.objects)) objects[id] = validateObject(id, o)
  const order = raw.order.filter((id): id is string => typeof id === 'string' && id in objects)
  for (const id of Object.keys(objects)) if (!order.includes(id)) order.push(id)
  return {
    name: str(raw.name, 'Untitled plan'),
    siteId: 'islandale',
    schemeId: typeof raw.schemeId === 'string' ? raw.schemeId : null,
    objects,
    order,
  }
}

function validateObject(id: string, raw: unknown): PlanObject {
  if (!isRecord(raw)) throw new Error(`Object ${id} is malformed.`)
  const pos = raw.position
  if (!isRecord(pos) || !isNum(pos.x) || !isNum(pos.n)) throw new Error(`Object ${id} has no position.`)
  if (typeof raw.type !== 'string') throw new Error(`Object ${id} has no type.`)
  return {
    id,
    type: raw.type,
    name: str(raw.name, raw.type),
    position: { x: pos.x, n: pos.n },
    rotation: isNum(raw.rotation) ? raw.rotation : 0,
    params: isRecord(raw.params) ? raw.params : {},
    locked: raw.locked === true,
    hidden: raw.hidden === true,
    labelVisible: raw.labelVisible !== false,
    ...(typeof raw.group === 'string' && raw.group ? { group: raw.group } : {}),
  }
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
}

export const browserBackend: SaveBackend = {
  read: (key) => idbGet(key),
  write: (key, value) => idbSet(key, value),
  readSync: (key) => localStorage.getItem(key),
  writeSync: (key, value) => localStorage.setItem(key, value),
}

/** Parse saved text; `newer` means it came from a newer app and must open read-only. */
export function readSavedText(text: string): { readonly file: PlanFile; readonly newer: boolean } {
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
