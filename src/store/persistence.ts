import { get as idbGet, set as idbSet } from 'idb-keyval'
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_LAYERS,
  DISPLAY_STYLES,
  LAYER_IDS,
  type DisplayStyle,
  type Environment,
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
    readonly displayStyle?: DisplayStyle
    readonly contours?: boolean | null
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
  if (!isRecord(raw)) throw new Error('Plan file must be an object.')
  if (raw.version !== PLAN_FILE_VERSION) throw new Error(`Unsupported plan file version ${String(raw.version)}.`)
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
  return { labelMode, layers, environment, displayStyle, contours }
}

export async function saveToBrowser(plan: Plan, view: PlanFile['view']): Promise<void> {
  await idbSet(AUTOSAVE_KEY, serializePlan(plan, view))
}

/** The autosaved plan, or null when there is none or it cannot be read. */
export async function loadFromBrowser(): Promise<PlanFile | null> {
  const text = await idbGet<string>(AUTOSAVE_KEY)
  if (typeof text !== 'string') return null
  return parsePlanFile(text)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
